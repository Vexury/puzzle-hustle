import { beforeEach, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS, ACHIEVEMENTS_EPOCH } from '@puzzle-hustle/core';

vi.mock('../src/components/Toast.tsx', () => ({ toast: vi.fn() }));

import { currentUnlocked, pendingAnnouncements, syncAchievements } from '../src/lib/achievements.ts';
import { toast } from '../src/components/Toast.tsx';
import { recordSolve, rehydrate } from '../src/lib/storage.ts';

// storedSolves() reads the storage.ts in-memory cache, not localStorage directly (recordSolve()
// updates that cache before it writes localStorage, and syncAchievements() runs right after a
// solve). rehydrate() is what refreshes the cache from localStorage, so every test that sets
// 'ph:solves' and then expects it to be seen calls rehydrate() first, the way main.tsx does.
beforeEach(() => {
  localStorage.clear();
  rehydrate();
  vi.restoreAllMocks();
  vi.mocked(toast).mockClear();
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

it('toasts once per achievement and not again on a second run', () => {
  localStorage.setItem(
    'ph:solves',
    JSON.stringify({ 'zip:weekly:2026-W39': { solvedAt: new Date(after).toISOString(), seconds: 60, hints: 0, moves: 10 } }),
  );
  rehydrate();
  syncAchievements();
  expect(toast).toHaveBeenCalledTimes(1);
  expect(toast).toHaveBeenCalledWith('Achievement unlocked: Weekly done');
  const stored = JSON.parse(localStorage.getItem('ph:achievements') ?? '[]') as string[];
  expect(stored).toContain('first-weekly');
  syncAchievements();
  expect(toast).toHaveBeenCalledTimes(1);
  expect(JSON.parse(localStorage.getItem('ph:achievements') ?? '[]')).toEqual(stored);
});

it('toasts several simultaneous unlocks in catalog order', () => {
  // Deliberately does not hardcode which ids unlock: night-owl/early-bird depend on the test
  // runner's local timezone (parsed.solvedAt's local hour), so the set of what fires alongside
  // first-weekly/first-monthly/first-genius/daily-no-hint can vary. What must not vary is that,
  // whatever unlocks, the toasts fire in ACHIEVEMENTS catalog order.
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
  const toastedTitles = vi.mocked(toast).mock.calls.map(([message]) => message);
  const expectedTitles = catalogOrder.map((id) => `Achievement unlocked: ${ACHIEVEMENTS.find((a) => a.id === id)!.title}`);
  expect(toastedTitles).toEqual(expectedTitles);
});

it('never throws, whatever storage holds', () => {
  localStorage.setItem('ph:achievements', 'not json');
  expect(() => syncAchievements()).not.toThrow();
});
