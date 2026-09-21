import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import worker from '../src/index.ts';
import * as google from '../src/google.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await env.DB.exec('DELETE FROM scores; DELETE FROM members; DELETE FROM groups; DELETE FROM players;');
  vi.restoreAllMocks();
});

async function signIn(subject: string): Promise<string> {
  vi.spyOn(google, 'verifyGoogleIdToken').mockResolvedValue(subject);
  const response = await worker.fetch(
    new Request('https://api.test/session', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken: 'x', name: 'Moritz' }),
    }),
    env,
  );
  return ((await response.json()) as { token: string }).token;
}

function todayKey(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
}

async function submit(token: string, entries: unknown[]) {
  const response = await worker.fetch(
    new Request('https://api.test/scores', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ entries }),
    }),
    env,
  );
  return { status: response.status, body: (await response.json()) as { results: Array<{ puzzle: string; status: string }> } };
}

const entry = (overrides: Record<string, unknown> = {}) => ({
  puzzle: `sudoku:daily:${todayKey()}`,
  seconds: 180,
  hints: 0,
  moves: 45,
  solvedAt: Date.now(),
  ...overrides,
});

it('stores a plausible solve once and calls the second a duplicate', async () => {
  const token = await signIn('s1');
  expect((await submit(token, [entry()])).body.results[0]?.status).toBe('stored');
  expect((await submit(token, [entry({ seconds: 5 })])).body.results[0]?.status).toBe('duplicate');

  const row = await env.DB.prepare('SELECT seconds FROM scores').first<{ seconds: number }>();
  expect(row?.seconds).toBe(180);
});

it('rejects a time below the floor and a zero move solve', async () => {
  const token = await signIn('s1');
  expect((await submit(token, [entry({ seconds: 2 })])).body.results[0]?.status).toBe('rejected');
  expect((await submit(token, [entry({ moves: 0 })])).body.results[0]?.status).toBe('rejected');
  const rows = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores').first<{ n: number }>();
  expect(rows?.n).toBe(0);
});

it('rejects an id that is not a period puzzle', async () => {
  const token = await signIn('s1');
  const results = (await submit(token, [entry({ puzzle: 'sudoku:level:easy:3' }), entry({ puzzle: 'nope' })])).body.results;
  expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
});

it('calls an old period expired and any future one rejected', async () => {
  const token = await signIn('s1');
  expect((await submit(token, [entry({ puzzle: 'sudoku:daily:2026-01-01' })])).body.results[0]?.status).toBe('expired');
  expect((await submit(token, [entry({ puzzle: 'sudoku:daily:2099-01-01' })])).body.results[0]?.status).toBe('rejected');

  // Two days out, not one: adding 24 hours during the night the clocks go back lands on the
  // same Berlin day and would make this test fail once a year.
  const soon = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date(Date.now() + 2 * 86400000));
  expect((await submit(token, [entry({ puzzle: `sudoku:daily:${soon}` })])).body.results[0]?.status).toBe('rejected');
});

it('answers every entry of a batch independently', async () => {
  const token = await signIn('s1');
  const results = (
    await submit(token, [
      entry({ puzzle: `sudoku:daily:${todayKey()}` }),
      entry({ puzzle: `nonogram:daily:${todayKey()}`, seconds: 1 }),
      entry({ puzzle: `crowns:daily:${todayKey()}`, seconds: 90, moves: 20 }),
    ])
  ).body.results;
  expect(results.map((r) => r.status)).toEqual(['stored', 'rejected', 'stored']);
});

it('refuses an oversized batch and malformed entries', async () => {
  const token = await signIn('s1');
  expect((await submit(token, new Array(21).fill(entry()))).status).toBe(400);
  expect((await submit(token, [{ puzzle: 42 }])).body.results[0]?.status).toBe('rejected');
});

it('throttles a player past the daily limit', async () => {
  const token = await signIn('s1');
  const player = await env.DB.prepare('SELECT id FROM players').first<{ id: string }>();
  const filler = Array.from({ length: 40 }, (_, i) =>
    env.DB.prepare(
      'INSERT INTO scores (player_id, puzzle, seconds, hints, moves, solved_at, created_at) VALUES (?, ?, 100, 0, 30, ?, ?)',
    ).bind(player!.id, `filler-${i}`, Date.now(), Date.now()),
  );
  await env.DB.batch(filler);
  expect((await submit(token, [entry()])).body.results[0]?.status).toBe('throttled');
});
