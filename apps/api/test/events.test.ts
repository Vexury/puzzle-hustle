import { applyD1Migrations, env } from 'cloudflare:test';
import { periodKey } from '@puzzle-hustle/core';
import { beforeAll, beforeEach, expect, it } from 'vitest';
import worker from '../src/index.ts';
import { pruneEvents } from '../src/events.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await env.DB.exec('DELETE FROM events');
});

const today = periodKey('daily');
const base = { day: today, platform: 'ios', build: 'abc1234', age: 1 };

function post(events: unknown) {
  return worker.fetch(new Request('https://api.test/events', { method: 'POST', body: JSON.stringify({ events }) }), env);
}

it('stores valid events without a token and skips invalid ones', async () => {
  const response = await post([
    { ...base, kind: 'launch' },
    { ...base, kind: 'intro', step: 1, outcome: 'skipped' },
    {
      ...base,
      kind: 'attempt',
      type: 'zip',
      difficulty: 'medium',
      mode: 'level',
      level: 3,
      outcome: 'solved',
      seconds: 61,
      moves: 12,
      hints: 0,
      resumed: true,
      first: false,
    },
    { ...base, kind: 'launch', age: 4 },
    { ...base, kind: 'launch', day: '2020-01-01' },
  ]);
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ stored: 3 });
  const { results } = await env.DB.prepare('SELECT kind, outcome, level, resumed, step FROM events ORDER BY kind').all();
  expect(results).toEqual([
    { kind: 'attempt', outcome: 'solved', level: 3, resumed: 1, step: null },
    { kind: 'intro', outcome: 'skipped', level: null, resumed: null, step: 1 },
    { kind: 'launch', outcome: null, level: null, resumed: null, step: null },
  ]);
});

it('refuses an empty or oversized batch', async () => {
  expect((await post([])).status).toBe(400);
  expect((await post(Array.from({ length: 51 }, () => ({ ...base, kind: 'launch' })))).status).toBe(400);
});

it('prunes events past the retention window', async () => {
  await env.DB.prepare("INSERT INTO events (day, kind, platform, build, age) VALUES ('2020-01-01', 'launch', 'web', 'x', 0)").run();
  await post([{ ...base, kind: 'launch' }]);
  await pruneEvents(env.DB);
  const { results } = await env.DB.prepare('SELECT day FROM events').all();
  expect(results).toEqual([{ day: today }]);
});
