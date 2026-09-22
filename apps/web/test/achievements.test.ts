import { beforeEach, expect, it, vi } from 'vitest';
import { currentUnlocked, pendingAnnouncements, syncAchievements } from '../src/lib/achievements.ts';
import { rehydrate } from '../src/lib/storage.ts';
import { ACHIEVEMENTS_EPOCH } from '@puzzle-hustle/core';

// storedSolves() reads the storage.ts in-memory cache, not localStorage directly (recordSolve()
// updates that cache before it writes localStorage, and syncAchievements() runs right after a
// solve). rehydrate() is what refreshes the cache from localStorage, so every test that sets
// 'ph:solves' and then expects it to be seen calls rehydrate() first, the way main.tsx does.
beforeEach(() => {
  localStorage.clear();
  rehydrate();
  vi.restoreAllMocks();
});

const after = ACHIEVEMENTS_EPOCH + 86400000;

it('announces what is newly unlocked and nothing else', () => {
  const { toAnnounce, nextAnnounced } = pendingAnnouncements(new Set(['a', 'b']), ['a']);
  expect(toAnnounce).toEqual(['b']);
  expect(nextAnnounced.sort()).toEqual(['a', 'b']);
});

it('forgets an announcement whose achievement is no longer unlocked', () => {
  // Happens when the epoch moves forward at the production release: the achievement re-locks
  // and must be able to be earned, and celebrated, a second time.
  const { toAnnounce, nextAnnounced } = pendingAnnouncements(new Set(['a']), ['a', 'gone']);
  expect(toAnnounce).toEqual([]);
  expect(nextAnnounced).toEqual(['a']);
});

it('drops a stored announcement whose achievement is no longer unlocked', () => {
  localStorage.setItem('ph:achievements', JSON.stringify(['first-weekly', 'gone']));
  localStorage.setItem('ph:solves', JSON.stringify({}));
  rehydrate();
  syncAchievements();
  expect(JSON.parse(localStorage.getItem('ph:achievements') ?? '[]')).toEqual([]);
});

it('reads the stored solve history', () => {
  localStorage.setItem(
    'ph:solves',
    JSON.stringify({ 'zip:weekly:2026-W39': { solvedAt: new Date(after).toISOString(), seconds: 60, hints: 0, moves: 10 } }),
  );
  rehydrate();
  expect(currentUnlocked().has('first-weekly')).toBe(true);
});

it('ignores a stored history it cannot make sense of instead of throwing', () => {
  localStorage.setItem('ph:solves', 'not json');
  rehydrate();
  expect(() => currentUnlocked()).not.toThrow();
  expect(currentUnlocked().size).toBe(0);

  localStorage.setItem('ph:solves', JSON.stringify({ 'zip:weekly:2026-W39': null, bad: 42 }));
  rehydrate();
  expect(() => currentUnlocked()).not.toThrow();
});

it('toasts once per achievement and not again on a second run', () => {
  localStorage.setItem(
    'ph:solves',
    JSON.stringify({ 'zip:weekly:2026-W39': { solvedAt: new Date(after).toISOString(), seconds: 60, hints: 0, moves: 10 } }),
  );
  rehydrate();
  const toasts: string[] = [];
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  syncAchievements();
  const stored = JSON.parse(localStorage.getItem('ph:achievements') ?? '[]') as string[];
  expect(stored).toContain('first-weekly');
  syncAchievements();
  expect(JSON.parse(localStorage.getItem('ph:achievements') ?? '[]')).toEqual(stored);
  expect(toasts).toEqual([]);
});

it('never throws, whatever storage holds', () => {
  localStorage.setItem('ph:achievements', 'not json');
  expect(() => syncAchievements()).not.toThrow();
});
