import { beforeEach, expect, it } from 'vitest';
import { periodKey } from '@puzzle-hustle/core';
import { allSolves, readProgress, recordSolve, rehydrate, resetProgress, writeProgress } from '../src/lib/storage.ts';

beforeEach(() => {
  localStorage.clear();
  rehydrate();
});

const solve = { solvedAt: new Date().toISOString(), seconds: 60, hints: 0, moves: 10 };
const board = { state: [1, 2, 3], seconds: 60, moves: 10, hints: 0 };

it('keeps solves and final boards of the running periods, drops everything else', () => {
  const daily = `stars:daily:${periodKey('daily')}`;
  const weekly = `shapes:weekly:${periodKey('weekly')}`;
  const monthly = `killer:monthly:${periodKey('monthly')}`;
  const oldDaily = 'stars:daily:2026-01-01';
  const level = 'zip:level:easy:1';
  for (const id of [daily, weekly, monthly, oldDaily, level]) {
    recordSolve(id, solve);
    writeProgress(id, board);
  }

  resetProgress();

  expect(Object.keys(allSolves()).sort()).toEqual([daily, monthly, weekly].sort());
  expect(readProgress(daily)).toEqual(board);
  expect(readProgress(weekly)).toEqual(board);
  expect(readProgress(monthly)).toEqual(board);
  expect(readProgress(oldDaily)).toBeNull();
  expect(readProgress(level)).toBeNull();

  rehydrate();
  expect(Object.keys(allSolves()).sort()).toEqual([daily, monthly, weekly].sort());
});

it('removes ph:solves entirely when no running period was solved', () => {
  recordSolve('zip:level:easy:1', solve);
  resetProgress();
  expect(localStorage.getItem('ph:solves')).toBeNull();
  expect(allSolves()).toEqual({});
});
