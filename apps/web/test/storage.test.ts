import { beforeEach, expect, it } from 'vitest';
import { adapter, periodKey } from '@puzzle-hustle/core';
import { allSolves, clearUnsynced, getSolve, keepFinalBoard, onSyncedWrite, readCurrentProgress, readProgress, readSetting, recordSolve, rehydrate, replaceSolves, startedIds, writeProgress, writeSetting } from '../src/lib/storage.ts';

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

it('keeps only the latest finished board per type and period', () => {
  const board = (n: number) => ({ state: [n], seconds: 60, moves: 10, hints: 0 });
  keepFinalBoard('zip:daily:2026-09-22', board(1));
  writeProgress('crowns:daily:2026-09-22', board(2));
  writeProgress('zip:weekly:2026-W39', board(3));
  keepFinalBoard('zip:daily:2026-09-23', board(4));
  expect(readProgress('zip:daily:2026-09-22')).toBeNull();
  expect(readProgress('zip:daily:2026-09-23')!.state).toEqual([4]);
  expect(readProgress('crowns:daily:2026-09-22')!.state).toEqual([2]);
  expect(readProgress('zip:weekly:2026-W39')!.state).toEqual([3]);
});

it('does not count a board saved on another generator version as started', () => {
  const board = { state: [1], seconds: 30, moves: 3, hints: 0 };
  const version = adapter('sudoku').version;
  writeProgress('sudoku:level:easy:1', { ...board, version });
  writeProgress('sudoku:level:easy:2', { ...board, version: version + 1 });
  writeProgress('sudoku:level:easy:3', board);
  expect([...startedIds()].sort()).toEqual(['sudoku:level:easy:1', 'sudoku:level:easy:3']);
  expect(readCurrentProgress('sudoku:level:easy:2')).toBeNull();
  expect(readCurrentProgress('sudoku:level:easy:1')?.seconds).toBe(30);
});

it('replaces a pre-epoch Hustle solve with the new one, even a slower one', () => {
  recordSolve('hustle:1', record(20, '2026-09-20T10:00:00.000Z'));
  recordSolve('hustle:1', record(90, '2026-09-30T10:00:00.000Z'));
  expect(getSolve('hustle:1')).toEqual({ solvedAt: '2026-09-30T10:00:00.000Z', seconds: 90, hints: 0, moves: 20 });
});

it('tells listeners about writes to synced stores only', () => {
  let calls = 0;
  const off = onSyncedWrite(() => calls++);
  recordSolve('zip:level:easy:1', { solvedAt: new Date().toISOString(), seconds: 60, hints: 0, moves: 10 });
  writeSetting('ph:coins:spent', '[]');
  writeSetting('ph:sound', 'off');
  off();
  writeSetting('ph:cosmetics', '{}');
  expect(calls).toBe(2);
});

it('replaces all solves without telling the sync', () => {
  let calls = 0;
  const off = onSyncedWrite(() => calls++);
  replaceSolves({ 'zip:level:easy:2': { solvedAt: '2026-10-01T08:00:00.000Z', seconds: 5, hints: 0, moves: 3 } });
  off();
  expect(calls).toBe(0);
  expect(Object.keys(allSolves())).toEqual(['zip:level:easy:2']);
  rehydrate();
  expect(Object.keys(allSolves())).toEqual(['zip:level:easy:2']);
});

it('clears boards and markers but keeps boards of kept solves', () => {
  const daily = `stars:daily:${periodKey('daily')}`;
  writeProgress(daily, { state: [1], seconds: 1, moves: 1, hints: 0 });
  writeProgress('zip:level:easy:1', { state: [1], seconds: 1, moves: 1, hints: 0 });
  writeSetting('ph:howto:zip', '1');
  writeSetting('ph:difficulty:zip', 'hard');
  writeSetting('ph:achievements', '["first-solve"]');
  clearUnsynced({ [daily]: {} });
  expect(readProgress(daily)).not.toBeNull();
  expect(readProgress('zip:level:easy:1')).toBeNull();
  expect(readSetting('ph:howto:zip')).toBeNull();
  expect(readSetting('ph:difficulty:zip')).toBeNull();
  expect(readSetting('ph:achievements')).toBeNull();
});
