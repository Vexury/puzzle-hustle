import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import worker from '../src/index.ts';
import * as google from '../src/google.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await env.DB.exec('DELETE FROM reports; DELETE FROM scores; DELETE FROM members; DELETE FROM groups; DELETE FROM players;');
  vi.restoreAllMocks();
});

async function signIn(subject: string, name: string) {
  vi.spyOn(google, 'verifyGoogleIdToken').mockResolvedValue(subject);
  const response = await worker.fetch(
    new Request('https://api.test/session', { method: 'POST', body: JSON.stringify({ provider: 'google', idToken: 'x', name }) }),
    env,
  );
  return (await response.json()) as { token: string; player: { id: string } };
}

const post = (token: string, payload: unknown) =>
  worker.fetch(
    new Request('https://api.test/cosmetics', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) }),
    env,
  );

const stored = (id: string) =>
  env.DB.prepare('SELECT badge, flair FROM players WHERE id = ?').bind(id).first<{ badge: string | null; flair: string | null }>();

it('stores a valid badge and flair', async () => {
  const me = await signIn('s1', 'Moritz');
  const response = await post(me.token, { badge: 'bolt', flair: 'hustler' });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ badge: 'bolt', flair: 'hustler' });
  expect(await stored(me.player.id)).toEqual({ badge: 'bolt', flair: 'hustler' });
});

it('clears both with null or when left out', async () => {
  const me = await signIn('s1', 'Moritz');
  await post(me.token, { badge: 'bolt', flair: 'hustler' });
  expect((await post(me.token, { badge: null })).status).toBe(200);
  expect(await stored(me.player.id)).toEqual({ badge: null, flair: null });
});

it('refuses an unknown id and a flair sent as a badge, and writes nothing', async () => {
  const me = await signIn('s1', 'Moritz');
  await post(me.token, { badge: 'bolt', flair: null });
  const unknown = await post(me.token, { badge: 'crown', flair: null });
  expect(unknown.status).toBe(400);
  expect(await unknown.json()).toEqual({ error: 'unknown_badge' });
  const wrongKind = await post(me.token, { badge: null, flair: 'bolt' });
  expect(wrongKind.status).toBe(400);
  expect(await wrongKind.json()).toEqual({ error: 'unknown_flair' });
  expect(await stored(me.player.id)).toEqual({ badge: 'bolt', flair: null });
});

it('needs a session', async () => {
  const response = await worker.fetch(new Request('https://api.test/cosmetics', { method: 'POST', body: '{}' }), env);
  expect(response.status).toBe(401);
});
