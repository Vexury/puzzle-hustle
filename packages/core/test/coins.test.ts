import { expect, it } from 'vitest';
import { unlockedAchievements, type SolveEntry } from '../src/achievements.ts';
import { DAILY_TYPES } from '../src/schedule.ts';
import {
  ACHIEVEMENT_COINS,
  coinBalance,
  coinsEarned,
  coinsForSolve,
  ownedItems,
  RANDOM_DAILY_CAP,
  type CoinAward,
  type SpendEntry,
} from '../src/coins.ts';

const EPOCH = Date.parse('2026-01-01T00:00:00+01:00');

function solve(id: string, when = '2026-06-01T12:00:00+02:00', hints = 0): SolveEntry {
  return { id, solvedAt: Date.parse(when), seconds: 60, hints, moves: 30 };
}

const total = (awards: CoinAward[]) => awards.reduce((n, a) => n + a.coins, 0);

it('pays a daily 10 and 5 more without hints', () => {
  const clean = solve('zip:daily:2026-06-01');
  expect(coinsForSolve(clean.id, [clean], EPOCH)).toEqual([
    { reason: 'daily', coins: 10 },
    { reason: 'no-hints', coins: 5 },
  ]);
  const hinted = solve('zip:daily:2026-06-01', undefined, 1);
  expect(coinsForSolve(hinted.id, [hinted], EPOCH)).toEqual([{ reason: 'daily', coins: 10 }]);
});

it('pays weekly 30+10 and monthly 75+25', () => {
  const weekly = solve('shapes:weekly:2026-W23');
  const monthly = solve('shapes:monthly:2026-06');
  expect(total(coinsForSolve(weekly.id, [weekly], EPOCH))).toBe(40);
  expect(total(coinsForSolve(monthly.id, [monthly], EPOCH))).toBe(100);
});

it('pays levels by difficulty', () => {
  const ids = ['zip:level:easy:1', 'zip:level:medium:1', 'zip:level:hard:1', 'zip:level:genius:1'];
  const solves = ids.map((id) => solve(id));
  expect(ids.map((id) => total(coinsForSolve(id, solves, EPOCH)))).toEqual([2, 3, 5, 8]);
});

it('caps randoms at ten per Berlin day and starts again the next one', () => {
  const day1 = Array.from({ length: RANDOM_DAILY_CAP + 1 }, (_, i) =>
    solve(`zip:easy:r${i}`, `2026-06-01T${String(8 + i).padStart(2, '0')}:00:00+02:00`),
  );
  // 23:30 UTC on 1 June is 01:30 on 2 June in Berlin, so it opens a fresh day.
  const nextDay = solve('zip:easy:late', '2026-06-01T23:30:00Z');
  const all = [...day1, nextDay];
  expect(day1.slice(0, RANDOM_DAILY_CAP).every((s) => total(coinsForSolve(s.id, all, EPOCH)) === 1)).toBe(true);
  expect(coinsForSolve(day1[RANDOM_DAILY_CAP]!.id, all, EPOCH)).toEqual([]);
  expect(total(coinsForSolve(nextDay.id, all, EPOCH))).toBe(1);
});

it('puts the clean sweep on the daily that completes the day, once', () => {
  const day = DAILY_TYPES.map((type, i) => solve(`${type}:daily:2026-06-01`, `2026-06-01T${String(8 + i).padStart(2, '0')}:00:00+02:00`, 1));
  const last = day[day.length - 1]!;
  expect(coinsForSolve(last.id, day, EPOCH)).toContainEqual({ reason: 'clean-sweep', coins: 20 });
  for (const s of day.slice(0, -1)) expect(coinsForSolve(s.id, day, EPOCH)).not.toContainEqual({ reason: 'clean-sweep', coins: 20 });
});

it('gives no sweep when one daily type is missing', () => {
  const day = DAILY_TYPES.slice(1).map((type) => solve(`${type}:daily:2026-06-01`));
  for (const s of day) expect(coinsForSolve(s.id, day, EPOCH).some((a) => a.reason === 'clean-sweep')).toBe(false);
});

it('pays nothing for a solve before the epoch or a malformed id', () => {
  const early = solve('zip:daily:2025-12-01', '2025-12-01T12:00:00+01:00');
  const junk = solve('zip:daily:not-a-date');
  expect(coinsForSolve(early.id, [early, junk], EPOCH)).toEqual([]);
  expect(coinsForSolve(junk.id, [early, junk], EPOCH)).toEqual([]);
  expect(coinsEarned([early, junk], EPOCH)).toBe(0);
});

it('adds 25 per unlocked achievement to the solve awards', () => {
  const solves = [solve('zip:daily:2026-06-01'), solve('zip:level:genius:1')];
  const fromSolves = 15 + 8;
  const unlocked = unlockedAchievements(solves, EPOCH).size;
  expect(unlocked).toBeGreaterThan(0);
  expect(coinsEarned(solves, EPOCH)).toBe(fromSolves + unlocked * ACHIEVEMENT_COINS);
});

it('subtracts spending after the epoch and never goes below zero', () => {
  const after = Date.parse('2026-06-01T12:00:00+02:00');
  const before = Date.parse('2025-06-01T12:00:00+02:00');
  const spent: SpendEntry[] = [
    { kind: 'hint', puzzle: 'zip:daily:2026-06-01', coins: 20, at: after },
    { kind: 'item', item: 'bolt', coins: 100, at: before },
  ];
  expect(coinBalance(100, spent, EPOCH)).toBe(80);
  expect(coinBalance(10, spent, EPOCH)).toBe(0);
});

it('owns the items bought after the epoch, whatever the balance says', () => {
  const after = Date.parse('2026-06-01T12:00:00+02:00');
  const before = Date.parse('2025-06-01T12:00:00+02:00');
  const owned = ownedItems(
    [
      { kind: 'item', item: 'bolt', coins: 100, at: after },
      { kind: 'item', item: 'moon', coins: 150, at: before },
      { kind: 'hint', puzzle: 'x', coins: 20, at: after },
    ],
    EPOCH,
  );
  expect([...owned]).toEqual(['bolt']);
});
