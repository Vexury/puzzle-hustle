import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS_EPOCH, emptySave, type SaveData } from '@puzzle-hustle/core';
import worker from '../src/index.ts';
import * as google from '../src/google.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await env.DB.exec('DELETE FROM saves; DELETE FROM reports; DELETE FROM scores; DELETE FROM members; DELETE FROM groups; DELETE FROM players;');
  vi.restoreAllMocks();
});

async function signIn(subject: string, name: string) {
  vi.spyOn(google, 'verifyGoogleIdToken').mockResolvedValue(subject);
  const response = await worker.fetch(new Request('https://api.test/session', { method: 'POST', body: JSON.stringify({ provider: 'google', idToken: 'x', name }) }), env);
  return (await response.json()) as { token: string; player: { id: string } };
}

const sync = (token: string, body: string) =>
  worker.fetch(new Request('https://api.test/sync', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body }), env);

const after = (minutes: number) => new Date(Math.max(Date.now(), ACHIEVEMENTS_EPOCH) + minutes * 60_000).toISOString();
const rec = (solvedAt: string) => ({ solvedAt, seconds: 60, hints: 0, moves: 20 });
const hustle = (from: number, to: number, solvedAt: string) =>
  Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [`hustle:${from + i}`, rec(solvedAt)]));
const save = (patch: Partial<SaveData>): SaveData => ({ ...emptySave(), ...patch });
const hustleOf = async (id: string) => (await env.DB.prepare('SELECT hustle FROM players WHERE id = ?').bind(id).first<{ hustle: number }>())?.hustle;

it('stores the first save and answers with it', async () => {
  const me = await signIn('s1', 'Moritz');
  const mine = save({ solves: hustle(1, 3, after(1)) });
  const response = await sync(me.token, JSON.stringify(mine));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(mine);
  expect(await hustleOf(me.player.id)).toBe(3);
});

it('merges a second device into what is stored', async () => {
  const me = await signIn('s1', 'Moritz');
  await sync(me.token, JSON.stringify(save({ solves: hustle(1, 49, after(1)) })));
  const response = await sync(me.token, JSON.stringify(save({ solves: hustle(1, 4, after(2)) })));
  const merged = (await response.json()) as SaveData;
  expect(Object.keys(merged.solves)).toHaveLength(49);
  expect(await hustleOf(me.player.id)).toBe(49);
});

it('keeps a higher level that an app without sync pushed through /hustle', async () => {
  const me = await signIn('s1', 'Moritz');
  await worker.fetch(new Request('https://api.test/hustle', { method: 'POST', headers: { Authorization: `Bearer ${me.token}` }, body: JSON.stringify({ level: 49 }) }), env);
  await sync(me.token, JSON.stringify(save({ solves: hustle(1, 4, after(1)) })));
  expect(await hustleOf(me.player.id)).toBe(49);
});

it('lowers the Hustle level after an account-wide reset', async () => {
  const me = await signIn('s1', 'Moritz');
  await sync(me.token, JSON.stringify(save({ solves: hustle(1, 49, after(1)) })));
  const resetAt = Date.parse(after(5));
  const response = await sync(me.token, JSON.stringify(save({ resetAt })));
  expect(((await response.json()) as SaveData).solves).toEqual({});
  expect(await hustleOf(me.player.id)).toBe(0);
});

it('keeps players apart', async () => {
  const me = await signIn('s1', 'Moritz');
  const other = await signIn('s2', 'Dani');
  await sync(me.token, JSON.stringify(save({ solves: hustle(1, 2, after(1)) })));
  const response = await sync(other.token, JSON.stringify(emptySave()));
  expect(((await response.json()) as SaveData).solves).toEqual({});
});

it('survives two devices syncing at once', async () => {
  const me = await signIn('s1', 'Moritz');
  await Promise.all([
    sync(me.token, JSON.stringify(save({ solves: hustle(1, 2, after(1)) }))),
    sync(me.token, JSON.stringify(save({ solves: hustle(3, 4, after(1)) }))),
  ]);
  const response = await sync(me.token, JSON.stringify(emptySave()));
  const keys = Object.keys(((await response.json()) as SaveData).solves);
  // Both writes land, or one reports a conflict and its device simply sends again; never a mix.
  expect(keys.length === 4 || keys.length === 2).toBe(true);
});

it('refuses junk and oversized bodies', async () => {
  const me = await signIn('s1', 'Moritz');
  expect((await sync(me.token, 'not json')).status).toBe(400);
  expect((await sync(me.token, '[]')).status).toBe(400);
  expect((await sync(me.token, JSON.stringify({ pad: 'x'.repeat(1_000_001) }))).status).toBe(413);
});

const hints = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ kind: 'hint' as const, puzzle: 'zip:level:easy:1', coins: 20, at: from + i }));
const storedData = async (id: string) =>
  JSON.parse((await env.DB.prepare('SELECT data FROM saves WHERE player_id = ?').bind(id).first<{ data: string }>())!.data) as SaveData;

it('keeps a stored save that is over the limits instead of overwriting it', async () => {
  const me = await signIn('s1', 'Moritz');
  const big = save({ solves: hustle(1, 2, after(1)), spent: hints(1, 5_001) });
  await env.DB.prepare('INSERT INTO saves (player_id, data, updated_at) VALUES (?, ?, ?)').bind(me.player.id, JSON.stringify(big), 1).run();
  const response = await sync(me.token, JSON.stringify(save({ solves: hustle(3, 3, after(2)) })));
  expect(response.status).toBe(413);
  expect(await response.json()).toEqual({ error: 'too_large' });
  const stored = await storedData(me.player.id);
  expect(stored.spent).toHaveLength(5_001);
  expect(Object.keys(stored.solves)).toEqual(['hustle:1', 'hustle:2']);
});

it('refuses a merge that would go over the limits, without writing', async () => {
  const me = await signIn('s1', 'Moritz');
  await sync(me.token, JSON.stringify(save({ spent: hints(1, 4_000) })));
  const response = await sync(me.token, JSON.stringify(save({ spent: hints(10_000, 1_500) })));
  expect(response.status).toBe(413);
  expect((await storedData(me.player.id)).spent).toHaveLength(4_000);
});

it('needs a session', async () => {
  expect((await worker.fetch(new Request('https://api.test/sync', { method: 'POST', body: '{}' }), env)).status).toBe(401);
});

it('is deleted with the account', async () => {
  const me = await signIn('s1', 'Moritz');
  await sync(me.token, JSON.stringify(save({ solves: hustle(1, 2, after(1)) })));
  const response = await worker.fetch(new Request('https://api.test/account', { method: 'DELETE', headers: { Authorization: `Bearer ${me.token}` } }), env);
  expect(response.status).toBe(200);
  expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM saves').first<{ n: number }>()).toEqual({ n: 0 });
});
