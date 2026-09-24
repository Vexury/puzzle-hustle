import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import worker from '../src/index.ts';
import * as apple from '../src/apple.ts';
import * as google from '../src/google.ts';
import { upsertPlayer } from '../src/players.ts';
import { signSession } from '../src/token.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await env.DB.exec('DELETE FROM scores; DELETE FROM members; DELETE FROM groups; DELETE FROM players;');
  vi.restoreAllMocks();
});

function post(path: string, body: unknown, token?: string) {
  return worker.fetch(
    new Request(`https://api.test${path}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(body),
    }),
    env,
  );
}

it('creates a player on the first sign-in and reuses it on the second', async () => {
  vi.spyOn(google, 'verifyGoogleIdToken').mockResolvedValue('subject-1');

  const first = await post('/session', { provider: 'google', idToken: 'x', name: 'Moritz' });
  expect(first.status).toBe(200);
  const a = (await first.json()) as { token: string; player: { id: string; name: string } };
  expect(a.player.name).toBe('Moritz');

  const second = await post('/session', { provider: 'google', idToken: 'x' });
  const b = (await second.json()) as { player: { id: string } };
  expect(b.player.id).toBe(a.player.id);

  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM players').first<{ n: number }>();
  expect(count?.n).toBe(1);
});

it('never stores the e-mail address', async () => {
  vi.spyOn(google, 'verifyGoogleIdToken').mockResolvedValue('subject-1');
  await post('/session', { provider: 'google', idToken: 'x', name: 'Moritz' });
  const row = await env.DB.prepare('SELECT * FROM players').first<Record<string, unknown>>();
  expect(JSON.stringify(row)).not.toContain('@');
});

it('refuses an invalid id token', async () => {
  vi.spyOn(google, 'verifyGoogleIdToken').mockResolvedValue(null);
  const response = await post('/session', { provider: 'google', idToken: 'x' });
  expect(response.status).toBe(401);
});

it('signs in with Apple and keeps it apart from a Google account with the same subject', async () => {
  vi.spyOn(google, 'verifyGoogleIdToken').mockResolvedValue('same-subject');
  vi.spyOn(apple, 'verifyAppleIdToken').mockResolvedValue('same-subject');

  const viaGoogle = (await (await post('/session', { provider: 'google', idToken: 'x' })).json()) as {
    player: { id: string };
  };
  const response = await post('/session', { provider: 'apple', idToken: 'y' });
  expect(response.status).toBe(200);
  const viaApple = (await response.json()) as { player: { id: string } };
  expect(viaApple.player.id).not.toBe(viaGoogle.player.id);
});

it('refuses an invalid Apple token', async () => {
  vi.spyOn(apple, 'verifyAppleIdToken').mockResolvedValue(null);
  const response = await post('/session', { provider: 'apple', idToken: 'x' });
  expect(response.status).toBe(401);
});

it('refuses an unsupported provider', async () => {
  const response = await post('/session', { provider: 'facebook', idToken: 'x' });
  expect(response.status).toBe(400);
});

it('falls back to a generated name when none is offered', async () => {
  vi.spyOn(google, 'verifyGoogleIdToken').mockResolvedValue('subject-2');
  const response = await post('/session', { provider: 'google', idToken: 'x' });
  const body = (await response.json()) as { player: { name: string } };
  expect(body.player.name).toMatch(/^Player \d{4}$/);
});

it('changes a name and refuses a bad one', async () => {
  vi.spyOn(google, 'verifyGoogleIdToken').mockResolvedValue('subject-3');
  const created = (await (await post('/session', { provider: 'google', idToken: 'x' })).json()) as {
    token: string;
  };

  const ok = await post('/name', { name: 'Danny' }, created.token);
  expect(ok.status).toBe(200);
  await expect(ok.json()).resolves.toEqual({ name: 'Danny' });

  const bad = await post('/name', { name: 'http://x.example' }, created.token);
  expect(bad.status).toBe(400);
});

it('resolves a duplicate sign-in for the same subject to the existing player instead of racing a second row', async () => {
  // First call walks the INSERT ... RETURNING branch and creates the row.
  const first = await upsertPlayer(env.DB, 'google', 'subject-4', 'Moritz');
  expect(first.name).toBe('Moritz');

  // Second call, same provider/subject, different offered name: the unique index makes the
  // insert a no-op, so this walks the ON CONFLICT branch and must resolve to the row the
  // first call created rather than throw or create a second row.
  const second = await upsertPlayer(env.DB, 'google', 'subject-4', 'SomeoneElse');
  expect(second).toEqual({ id: first.id, name: 'Moritz' });

  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM players').first<{ n: number }>();
  expect(count?.n).toBe(1);
});

it('refuses a request without or with a broken token', async () => {
  expect((await post('/name', { name: 'Danny' })).status).toBe(401);
  expect((await post('/name', { name: 'Danny' }, 'garbage')).status).toBe(401);
  const stale = await signSession('nobody', env.SESSION_SECRET);
  expect((await post('/name', { name: 'Danny' }, stale)).status).toBe(401);
});

it('hands a renewed token back on a request made with an older one', async () => {
  const player = await upsertPlayer(env.DB, 'google', 'subject-renew', 'Moritz');
  const old = await signSession(player.id, env.SESSION_SECRET, Date.now() - 8 * 86400000);
  const response = await post('/name', { name: 'Moritz' }, old);
  expect(response.status).toBe(200);
  const renewed = response.headers.get('X-Session-Token');
  expect(renewed).toBeTruthy();
  expect(renewed).not.toBe(old);

  const fresh = await post('/name', { name: 'Moritz' }, renewed!);
  expect(fresh.status).toBe(200);
  expect(fresh.headers.get('X-Session-Token')).toBeNull();
});
