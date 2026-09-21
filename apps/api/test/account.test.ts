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
    new Request('https://api.test/session', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken: 'x', name }),
    }),
    env,
  );
  return (await response.json()) as { token: string; player: { id: string } };
}

const call = (path: string, token: string, init: RequestInit = {}) =>
  worker.fetch(
    new Request(`https://api.test${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } }),
    env,
  );

it('records a report once per pair', async () => {
  const me = await signIn('s1', 'Moritz');
  const other = await signIn('s2', 'Rude');
  const send = () =>
    call('/report', me.token, { method: 'POST', body: JSON.stringify({ playerId: other.player.id, reason: 'name' }) });
  expect((await send()).status).toBe(200);
  expect((await send()).status).toBe(200);
  const rows = await env.DB.prepare('SELECT COUNT(*) AS n FROM reports').first<{ n: number }>();
  expect(rows?.n).toBe(1);
});

it('deletes the player, their scores and their memberships', async () => {
  const me = await signIn('s1', 'Moritz');
  await call('/groups', me.token, { method: 'POST', body: JSON.stringify({ name: 'Family' }) });
  await call('/scores', me.token, {
    method: 'POST',
    body: JSON.stringify({
      entries: [
        {
          puzzle: `sudoku:daily:${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())}`,
          seconds: 200,
          hints: 0,
          moves: 40,
          solvedAt: Date.now(),
        },
      ],
    }),
  });

  expect((await call('/account', me.token, { method: 'DELETE' })).status).toBe(200);

  for (const table of ['players', 'scores', 'members', 'groups']) {
    const rows = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
    expect(rows?.n, table).toBe(0);
  }
  expect((await call('/groups', me.token)).status).toBe(401);
});
