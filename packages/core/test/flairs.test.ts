import { expect, it } from 'vitest';
import type { SolveEntry } from '../src/achievements.ts';
import { levelList } from '../src/levels.ts';
import { earnedFlairs, packProgress } from '../src/flairs.ts';

const EPOCH = Date.parse('2026-01-01T00:00:00+01:00');
const AFTER = '2026-06-01T12:00:00+02:00';
const BEFORE = '2025-06-01T12:00:00+02:00';

function solve(id: string, when = AFTER, hints = 0): SolveEntry {
  return { id, solvedAt: Date.parse(when), seconds: 60, hints, moves: 30 };
}

function fullPack(type: string, difficulty: string, when = AFTER): SolveEntry[] {
  const n = levelList(type as never, difficulty as never).length;
  return Array.from({ length: n }, (_, i) => solve(`${type}:level:${difficulty}:${i + 1}`, when));
}

it('earns a pack flair once every level of that type and difficulty is solved', () => {
  const easy = fullPack('zip', 'easy');
  expect(earnedFlairs(easy, EPOCH).has('basic-zipper')).toBe(true);
  expect(earnedFlairs(easy.slice(0, -1), EPOCH).has('basic-zipper')).toBe(false);
});

it('a pack complete on one difficulty does not earn the other tiers of the same type', () => {
  const easy = fullPack('zip', 'easy');
  const earned = earnedFlairs(easy, EPOCH);
  expect(earned.has('basic-zipper')).toBe(true);
  expect(earned.has('line-drawer')).toBe(false);
  expect(earned.has('zip-addict')).toBe(false);
  expect(earned.has('zipping-all-day')).toBe(false);
});

it('earns an activity flair once its achievement unlocks', () => {
  // every-type: DAILY_TYPES all solved once, unlocks the 'every-type' achievement behind 'puzzler'.
  const solves = ['zip', 'shapes', 'nonogram', 'mosaic', 'crowns', 'stars', 'killer'].map((t) => solve(`${t}:daily:2026-06-01`));
  expect(earnedFlairs(solves, EPOCH).has('puzzler')).toBe(true);
});

it('ignores solves from before the epoch for both requirement kinds', () => {
  const earlyPack = fullPack('zip', 'easy', BEFORE);
  expect(earnedFlairs(earlyPack, EPOCH).has('basic-zipper')).toBe(false);

  const earlyDaily = solve('zip:daily:2025-06-01', BEFORE);
  expect(earnedFlairs([earlyDaily], EPOCH).has('night-shift')).toBe(false);
});

it('ignores malformed solve ids rather than throwing', () => {
  const junk = [solve('zip:daily:zzz'), solve('nope'), solve('zip:level:easy:not-a-number')];
  expect(() => earnedFlairs(junk, EPOCH)).not.toThrow();
  expect(earnedFlairs(junk, EPOCH).size).toBe(0);
});

it('level numbers outside the pack do not count towards completing it', () => {
  const n = levelList('zip', 'easy').length;
  const withStray = [
    ...Array.from({ length: n - 1 }, (_, i) => solve(`zip:level:easy:${i + 1}`)),
    solve(`zip:level:easy:${n + 5}`),
  ];
  expect(earnedFlairs(withStray, EPOCH).has('basic-zipper')).toBe(false);
});

it('packProgress counts solved levels within the pack and reports the total', () => {
  const n = levelList('zip', 'easy').length;
  const half = Array.from({ length: Math.floor(n / 2) }, (_, i) => solve(`zip:level:easy:${i + 1}`));
  expect(packProgress(half, 'zip', 'easy', EPOCH)).toEqual({ solved: half.length, total: n });
  expect(packProgress([], 'zip', 'easy', EPOCH)).toEqual({ solved: 0, total: n });
});

it('packProgress does not count a level number outside the pack, or a pre-epoch solve', () => {
  const n = levelList('zip', 'easy').length;
  const solves = [solve('zip:level:easy:1'), solve(`zip:level:easy:${n + 1}`), solve('zip:level:easy:2', BEFORE)];
  expect(packProgress(solves, 'zip', 'easy', EPOCH)).toEqual({ solved: 1, total: n });
});
