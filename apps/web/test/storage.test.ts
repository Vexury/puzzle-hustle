import { beforeEach, expect, it } from 'vitest';
import { getSolve, recordSolve, rehydrate } from '../src/lib/storage.ts';

beforeEach(() => {
  localStorage.clear();
  rehydrate();
});

const record = (seconds: number, solvedAt: string) => ({ solvedAt, seconds, hints: 0, moves: 20 });

it('replaces a level solve with a faster run but keeps the first solve date', () => {
  recordSolve('sudoku:level:easy:3', record(120, '2026-09-20T10:00:00.000Z'));
  recordSolve('sudoku:level:easy:3', record(90, '2026-09-22T10:00:00.000Z'));
  expect(getSolve('sudoku:level:easy:3')).toEqual({ solvedAt: '2026-09-20T10:00:00.000Z', seconds: 90, hints: 0, moves: 20 });
});

it('keeps the better time when a level is solved more slowly again', () => {
  recordSolve('sudoku:level:easy:3', record(90, '2026-09-20T10:00:00.000Z'));
  recordSolve('sudoku:level:easy:3', record(150, '2026-09-22T10:00:00.000Z'));
  expect(getSolve('sudoku:level:easy:3')!.seconds).toBe(90);
});

it('leaves a daily, weekly and monthly solve at its first run', () => {
  for (const id of ['zip:daily:2026-09-22', 'zip:weekly:2026-W39', 'zip:monthly:2026-09']) {
    recordSolve(id, record(120, '2026-09-22T10:00:00.000Z'));
    recordSolve(id, record(60, '2026-09-22T11:00:00.000Z'));
    expect(getSolve(id)!.seconds).toBe(120);
  }
});

it('improves a seeded practice puzzle like a level', () => {
  recordSolve('zip:medium:1a2b', record(80, '2026-09-22T10:00:00.000Z'));
  recordSolve('zip:medium:1a2b', record(70, '2026-09-22T11:00:00.000Z'));
  expect(getSolve('zip:medium:1a2b')!.seconds).toBe(70);
});
