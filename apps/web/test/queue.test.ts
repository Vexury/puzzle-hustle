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

it('drops entries the server has answered and keeps the rest', async () => {
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
