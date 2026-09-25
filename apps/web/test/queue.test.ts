import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { writeSession } from '../src/lib/api.ts';
import { enqueue, flush, readQueue, resetBackoff } from '../src/lib/queue.ts';

const record = { seconds: 200, hints: 0, moves: 40, solvedAt: new Date().toISOString() };

beforeEach(() => {
  localStorage.clear();
  resetBackoff();
  writeSession({ token: 't', player: { id: 'p', name: 'Moritz' } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('keeps only period puzzles and only the first entry per puzzle', () => {
  enqueue('sudoku:daily:2026-09-21', record);
  enqueue('sudoku:daily:2026-09-21', { ...record, seconds: 5 });
  enqueue('sudoku:level:easy:3', record);
  expect(readQueue().map((e) => e.puzzle)).toEqual(['sudoku:daily:2026-09-21']);
  expect(readQueue()[0]?.seconds).toBe(200);
});

it('clears the queue once the server has given every entry a terminal status', async () => {
  enqueue('sudoku:daily:2026-09-21', record);
  enqueue('crowns:daily:2026-09-21', record);
  vi.stubGlobal('fetch', async () =>
    new Response(
      JSON.stringify({
        results: [
          { puzzle: 'sudoku:daily:2026-09-21', status: 'stored' },
          { puzzle: 'crowns:daily:2026-09-21', status: 'rejected' },
        ],
      }),
      { status: 200 },
    ),
  );
  await flush();
  expect(readQueue()).toEqual([]);
});

it('keeps a throttled entry and stops instead of retrying immediately, while a terminal one in the same batch is dropped', async () => {
  enqueue('sudoku:daily:2026-09-21', record);
  enqueue('crowns:daily:2026-09-21', record);
  const fetchMock = vi.fn(async () =>
    new Response(
      JSON.stringify({
        results: [
          { puzzle: 'sudoku:daily:2026-09-21', status: 'stored' },
          { puzzle: 'crowns:daily:2026-09-21', status: 'throttled' },
        ],
      }),
      { status: 200 },
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  await flush();
  expect(readQueue().map((e) => e.puzzle)).toEqual(['crowns:daily:2026-09-21']);
  await flush();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('keeps an entry whose status it does not know as final and backs off', async () => {
  enqueue('sudoku:daily:2026-09-21', record);
  enqueue('crowns:daily:2026-09-21', record);
  const fetchMock = vi.fn(async () =>
    new Response(
      JSON.stringify({
        results: [
          { puzzle: 'sudoku:daily:2026-09-21', status: 'expired' },
          { puzzle: 'crowns:daily:2026-09-21', status: 'retry' },
        ],
      }),
      { status: 200 },
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  await flush();
  expect(readQueue().map((e) => e.puzzle)).toEqual(['crowns:daily:2026-09-21']);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await flush();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('keeps everything when the network fails', async () => {
  enqueue('sudoku:daily:2026-09-21', record);
  vi.stubGlobal('fetch', async () => {
    throw new TypeError('Failed to fetch');
  });
  await flush();
  expect(readQueue()).toHaveLength(1);
});

it('does nothing without a session', async () => {
  writeSession(null);
  enqueue('sudoku:daily:2026-09-21', record);
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  await flush();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(readQueue()).toHaveLength(1);
});

it('caps the queue and drops the oldest', () => {
  for (let i = 0; i < 105; i++) enqueue(`sudoku:daily:2026-01-${String((i % 28) + 1).padStart(2, '0')}`, record);
  expect(readQueue().length).toBeLessThanOrEqual(100);
});

it('waits after a failure instead of hammering the server', async () => {
  enqueue('sudoku:daily:2026-09-21', record);
  const fetchMock = vi.fn(async () => {
    throw new TypeError('Failed to fetch');
  });
  vi.stubGlobal('fetch', fetchMock);
  await flush();
  await flush();
  await flush();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("never submits another player's queued entry, but does once they sign back in", async () => {
  writeSession({ token: 'a', player: { id: 'a', name: 'Alice' } });
  enqueue('sudoku:daily:2026-09-21', record);

  writeSession({ token: 'b', player: { id: 'b', name: 'Bob' } });
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ results: [] }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  await flush();
  expect(readQueue()).toHaveLength(1);
  const sent = fetchMock.mock.calls[0]
    ? (JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as { entries: Array<{ puzzle: string }> })
    : { entries: [] };
  expect(sent.entries.some((e) => e.puzzle === 'sudoku:daily:2026-09-21')).toBe(false);

  writeSession({ token: 'a', player: { id: 'a', name: 'Alice' } });
  resetBackoff();
  vi.stubGlobal('fetch', async () =>
    new Response(JSON.stringify({ results: [{ puzzle: 'sudoku:daily:2026-09-21', status: 'stored' }] }), { status: 200 }),
  );
  await flush();
  expect(readQueue()).toHaveLength(0);
});

// Regression coverage for the two "Important" fixes, beyond what was explicitly asked for: a
// crash in the solve path and a cap that could evict the wrong player's real score are both bad
// enough to want a test pinning the fix, not just the reasoning behind it.

it('drops a stored queue entry it cannot make sense of instead of throwing', () => {
  localStorage.setItem(
    'ph:queue',
    JSON.stringify([
      null,
      'not an object',
      { puzzle: 'sudoku:daily:2026-01-01' }, // missing the numeric fields
      { puzzle: 'crowns:daily:2026-01-01', seconds: 200, hints: 0, moves: 40, solvedAt: 1700000000000 },
    ]),
  );
  expect(() => enqueue('sudoku:daily:2026-09-21', record)).not.toThrow();
  expect(readQueue().map((e) => e.puzzle)).toEqual(['crowns:daily:2026-01-01', 'sudoku:daily:2026-09-21']);
});

it('evicts other players before evicting the one currently signed in when the cap is hit', () => {
  const dailyId = (offsetDays: number) => {
    const d = new Date(Date.UTC(2026, 0, 1) + offsetDays * 86400000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `sudoku:daily:${y}-${m}-${day}`;
  };

  writeSession({ token: 'a', player: { id: 'a', name: 'Alice' } });
  enqueue(dailyId(0), record); // Alice's own real score, queued first

  writeSession({ token: 'b', player: { id: 'b', name: 'Bob' } });
  for (let i = 1; i <= 99; i++) enqueue(dailyId(i), record); // Bob fills the queue while offline

  writeSession({ token: 'a', player: { id: 'a', name: 'Alice' } });
  enqueue(dailyId(100), record); // Alice signs back in and solves one more: 101 entries, 1 over cap

  const queue = readQueue();
  expect(queue).toHaveLength(100);
  expect(queue.some((e) => e.puzzle === dailyId(0))).toBe(true); // Alice's own entry survives
  expect(queue.some((e) => e.puzzle === dailyId(100))).toBe(true); // and her new one
  expect(queue.some((e) => e.puzzle === dailyId(1))).toBe(false); // Bob's oldest is the one dropped
  expect(queue.filter((e) => e.playerId === 'b')).toHaveLength(98);
});
