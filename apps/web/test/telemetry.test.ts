import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { periodKey } from '@puzzle-hustle/core';
import { recordSolve, rehydrate } from '../src/lib/storage.ts';
import { EVENTS_KEY, flushEvents, setTelemetryEnabled, track } from '../src/lib/telemetry.ts';

const queued = () => JSON.parse(localStorage.getItem(EVENTS_KEY) ?? '[]') as Array<Record<string, unknown>>;

beforeEach(() => {
  localStorage.clear();
  rehydrate();
  vi.stubEnv('DEV', false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('stamps day, platform, build and install age, and nothing else', () => {
  track({ kind: 'launch' });
  expect(queued()).toEqual([{ kind: 'launch', day: periodKey('daily'), platform: 'web', build: 'dev', age: 0 }]);
});

it('dates an existing player from their first solve', () => {
  const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
  recordSolve('zip:level:easy:1', { solvedAt: tenDaysAgo, seconds: 30, hints: 0, moves: 5 });
  track({ kind: 'launch' });
  expect(queued()[0]?.age).toBe(7);
});

it('records nothing and drops the queue once switched off', () => {
  track({ kind: 'launch' });
  setTelemetryEnabled(false);
  track({ kind: 'launch' });
  expect(queued()).toEqual([]);
});

it('sends the queue and clears it, but keeps it while offline', async () => {
  track({ kind: 'launch' });
  vi.stubGlobal('fetch', async () => {
    throw new TypeError('offline');
  });
  await flushEvents();
  expect(queued()).toHaveLength(1);

  // The failure above set a backoff; a fresh module state is not needed, only time.
  vi.useFakeTimers({ now: Date.now() + 3_600_000 });
  const sent: unknown[] = [];
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(init.body as string));
    return new Response(JSON.stringify({ stored: 1 }), { status: 200 });
  });
  await flushEvents();
  vi.useRealTimers();
  expect(sent).toHaveLength(1);
  expect(queued()).toEqual([]);
});
