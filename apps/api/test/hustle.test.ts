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
  const response = await worker.fetch(new Request('https://api.test/session', { method: 'POST', body: JSON.stringify({ provider: 'google', idToken: 'x', name }) }), env);
  return (await response.json()) as { token: string; player: { id: string } };
}

const post = (token: string, payload: unknown) =>
  worker.fetch(new Request('https://api.test/hustle', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) }), env);

const stored = (id: string) => env.DB.prepare('SELECT hustle FROM players WHERE id = ?').bind(id).first<{ hustle: number }>();

it('starts at 0 and stores a level', async () => {
  const me = await signIn('s1', 'Moritz');
  expect(await stored(me.player.id)).toEqual({ hustle: 0 });
  const response = await post(me.token, { level: 47 });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ hustle: 47 });
});

it('never lowers the level', async () => {
  const me = await signIn('s1', 'Moritz');
  await post(me.token, { level: 47 });
  expect(await (await post(me.token, { level: 12 })).json()).toEqual({ hustle: 47 });
  expect(await stored(me.player.id)).toEqual({ hustle: 47 });
});

it('refuses anything but a whole number from 0 to 100000', async () => {
  const me = await signIn('s1', 'Moritz');
  for (const level of [-1, 1.5, 100001, '5', null]) expect((await post(me.token, { level })).status, String(level)).toBe(400);
});

it('needs a session', async () => {
  expect((await worker.fetch(new Request('https://api.test/hustle', { method: 'POST', body: '{}' }), env)).status).toBe(401);
});
