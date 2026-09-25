import { beforeEach, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS, ACHIEVEMENTS_EPOCH, type AchievementProgress } from '@puzzle-hustle/core';

vi.mock('../src/components/UnlockModal.tsx', () => ({ announceUnlock: vi.fn() }));

import { almostThere, currentProgress, currentUnlocked, pendingAnnouncements, syncAchievements } from '../src/lib/achievements.ts';
import { announceUnlock } from '../src/components/UnlockModal.tsx';
import { recordSolve, rehydrate, resetProgress } from '../src/lib/storage.ts';

// storedSolves() reads the storage.ts in-memory cache, not localStorage directly (recordSolve()
// updates that cache before it writes localStorage, and syncAchievements() runs right after a
// solve). rehydrate() is what refreshes the cache from localStorage, so every test that sets
// 'ph:solves' and then expects it to be seen calls rehydrate() first, the way main.tsx does.
beforeEach(() => {
  localStorage.clear();
  rehydrate();
  vi.restoreAllMocks();
  vi.mocked(announceUnlock).mockClear();
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

it('sees a solve recorded via recordSolve() even when localStorage.setItem is failing', () => {
  // Pins correction (a): storedSolves() must read the storage.ts cache, not localStorage. No
  // rehydrate() here on purpose — recordSolve() updates the cache directly, and if
  // storedSolves() read localStorage instead, this solve would be invisible: the write below
  // never lands (setItem throws, caught inside recordSolve()'s own try/catch), so localStorage
  // stays empty while the cache does not.
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('storage unavailable');
  });
  recordSolve('zip:weekly:2026-W39', { solvedAt: new Date(after).toISOString(), seconds: 60, hints: 0, moves: 10 });
  expect(localStorage.getItem('ph:solves')).toBeNull();
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

it('announces once per achievement and not again on a second run', () => {
  localStorage.setItem(
    'ph:solves',
    JSON.stringify({ 'zip:weekly:2026-W39': { solvedAt: new Date(after).toISOString(), seconds: 60, hints: 0, moves: 10 } }),
  );
  rehydrate();
  syncAchievements();
  expect(announceUnlock).toHaveBeenCalledTimes(2);
  expect(announceUnlock).toHaveBeenCalledWith({ kind: 'achievement', id: 'first-solve' });
  expect(announceUnlock).toHaveBeenCalledWith({ kind: 'achievement', id: 'first-weekly' });
  const stored = JSON.parse(localStorage.getItem('ph:achievements') ?? '[]') as string[];
  expect(stored).toContain('first-weekly');
  syncAchievements();
  expect(announceUnlock).toHaveBeenCalledTimes(2);
  expect(JSON.parse(localStorage.getItem('ph:achievements') ?? '[]')).toEqual(stored);
});

it('announces several simultaneous unlocks in catalog order', () => {
  // Deliberately does not hardcode which ids unlock: night-owl/early-bird depend on the test
  // runner's local timezone (parsed.solvedAt's local hour), so the set of what fires alongside
  // first-weekly/first-monthly/first-genius/daily-no-hint can vary. What must not vary is that,
  // whatever unlocks, the banner announcements fire in ACHIEVEMENTS catalog order.
  const solvedAt = new Date(after).toISOString();
  localStorage.setItem(
    'ph:solves',
    JSON.stringify({
      'zip:weekly:2026-W39': { solvedAt, seconds: 60, hints: 0, moves: 10 },
      'sudoku:monthly:2026-09': { solvedAt, seconds: 90, hints: 0, moves: 20 },
      'crowns:daily:2026-09-23': { solvedAt, seconds: 30, hints: 0, moves: 5 },
    }),
  );
  rehydrate();
  const unlocked = currentUnlocked();
  expect(unlocked.size).toBeGreaterThanOrEqual(3); // several at once, not just one
  const catalogOrder = ACHIEVEMENTS.map((a) => a.id).filter((id) => unlocked.has(id));
  syncAchievements();
  const announcedIds = vi.mocked(announceUnlock).mock.calls.map(([item]) => item.id);
  expect(announcedIds).toEqual(catalogOrder);
});

it('does not write ph:achievements on a sync that changes nothing, notably a clean install', () => {
  // A clean install with no solves has nothing unlocked and nothing previously announced: the
  // sync is a true no-op. Writing the key anyway would make isBackedUp() see it as already
  // present, and restoreBackup() then refuses forever to restore a native backup, because it
  // only restores when none of the backed-up keys exist yet.
  expect(localStorage.getItem('ph:achievements')).toBeNull();
  syncAchievements();
  expect(localStorage.getItem('ph:achievements')).toBeNull();

  const setItem = vi.spyOn(Storage.prototype, 'setItem');
  syncAchievements();
  expect(setItem).not.toHaveBeenCalledWith('ph:achievements', expect.anything());
});

it('resetProgress also clears the announced-achievements list', () => {
  // Otherwise: reset progress, then re-earn the same achievement in the same session, and no
  // toast fires, because the stale announced list (only pruned by the next sync) still lists it.
  localStorage.setItem('ph:achievements', JSON.stringify(['first-weekly']));
  resetProgress();
  expect(localStorage.getItem('ph:achievements')).toBeNull();
});

it('never throws, whatever storage holds', () => {
  localStorage.setItem('ph:achievements', 'not json');
  expect(() => syncAchievements()).not.toThrow();
});

const p = (id: string, counter: string, current: number, target: number): AchievementProgress => ({ id, counter, current, target });

it('almostThere picks the closest unearned counters, highest share first', () => {
  const list = [p('a', 'x', 1, 10), p('b', 'y', 8, 10), p('c', 'z', 5, 10), p('d', 'w', 9, 10)];
  expect(almostThere(list, new Set(['d'])).map((e) => e.id)).toEqual(['b', 'c', 'a']);
});

it('almostThere leaves out untouched counters and keeps catalog order on ties', () => {
  const list = [p('a', 'x', 0, 10), p('b', 'y', 5, 10), p('c', 'z', 5, 10)];
  expect(almostThere(list, new Set()).map((e) => e.id)).toEqual(['b', 'c']);
});

it('almostThere keeps one rung per ladder', () => {
  const list = [p('streak-3', 'streak', 3, 3), p('streak-7', 'streak', 6, 7), p('streak-30', 'streak', 6, 30), p('solved-50', 'solved', 20, 50)];
  expect(almostThere(list, new Set(['streak-3'])).map((e) => e.id)).toEqual(['streak-7', 'solved-50']);
});

it('currentProgress reads the stored history', () => {
  localStorage.setItem(
    'ph:solves',
    JSON.stringify({ 'zip:weekly:2026-W39': { solvedAt: new Date(after).toISOString(), seconds: 60, hints: 0, moves: 10 } }),
  );
  rehydrate();
  const byId = new Map(currentProgress().map((e) => [e.id, e]));
  expect(byId.get('solved-50')?.current).toBe(1);
  expect(byId.get('weekly-10')?.current).toBe(1);
});
