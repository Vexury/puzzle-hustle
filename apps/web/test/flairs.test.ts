import { beforeEach, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS_EPOCH, levelList } from '@puzzle-hustle/core';

vi.mock('../src/components/AchievementBanner.tsx', () => ({ announceAchievement: vi.fn() }));

import { syncFlairs } from '../src/lib/flairs.ts';
import { announceAchievement } from '../src/components/AchievementBanner.tsx';
import { recordSolve, rehydrate, resetProgress } from '../src/lib/storage.ts';

beforeEach(() => {
  localStorage.clear();
  rehydrate();
  vi.restoreAllMocks();
  vi.mocked(announceAchievement).mockClear();
});

const after = ACHIEVEMENTS_EPOCH + 86400000;

function earnBasicZipper() {
  const n = levelList('zip', 'easy').length;
  for (let i = 1; i <= n; i++) {
    recordSolve(`zip:level:easy:${i}`, { solvedAt: new Date(after).toISOString(), seconds: 60, hints: 0, moves: 10 });
  }
}

it('announces a newly earned flair and remembers it in ph:flairs', () => {
  earnBasicZipper();
  syncFlairs();
  expect(announceAchievement).toHaveBeenCalledTimes(1);
  expect(announceAchievement).toHaveBeenCalledWith('Flair unlocked: Basic Zipper');
  const stored = JSON.parse(localStorage.getItem('ph:flairs') ?? '[]') as string[];
  expect(stored).toContain('basic-zipper');
});

it('announces once per flair and not again on a second run', () => {
  earnBasicZipper();
  syncFlairs();
  expect(announceAchievement).toHaveBeenCalledTimes(1);
  syncFlairs();
  expect(announceAchievement).toHaveBeenCalledTimes(1);
});

it('does not write ph:flairs on a sync that changes nothing, notably a clean install', () => {
  expect(localStorage.getItem('ph:flairs')).toBeNull();
  syncFlairs();
  expect(localStorage.getItem('ph:flairs')).toBeNull();

  const setItem = vi.spyOn(Storage.prototype, 'setItem');
  syncFlairs();
  expect(setItem).not.toHaveBeenCalledWith('ph:flairs', expect.anything());
});

it('resetProgress also clears the announced-flairs list', () => {
  localStorage.setItem('ph:flairs', JSON.stringify(['basic-zipper']));
  resetProgress();
  expect(localStorage.getItem('ph:flairs')).toBeNull();
});

it('never throws, whatever storage holds', () => {
  localStorage.setItem('ph:flairs', 'not json');
  expect(() => syncFlairs()).not.toThrow();
});
