import { afterEach, describe, expect, it, vi } from 'vitest';
import { PUZZLE_TYPES } from '../src/types.ts';
import { levelList } from '../src/levels.ts';
import { ACHIEVEMENTS, ACHIEVEMENTS_EPOCH, unlockedAchievements, type SolveEntry } from '../src/achievements.ts';

const EPOCH = Date.parse('2026-01-01T00:00:00Z');

// Berlin noon: far from any day boundary, and outside both night windows.
function solve(id: string, day = '2026-06-01', hour = 12, hints = 0): SolveEntry {
  return { id, solvedAt: Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00`), seconds: 60, hints, moves: 30 };
}

function dailies(day: string, count: number, hints = 0): SolveEntry[] {
  return PUZZLE_TYPES.slice(0, count).map((t) => solve(`${t}:daily:${day}`, day, 12, hints));
}

// A run of `days` consecutive perfect days starting 2026-06-01, used by both the streak
// achievements and the full-reachability check below.
function streakDays(days: number): SolveEntry[] {
  const out: SolveEntry[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.parse('2026-06-01T12:00:00Z') + i * 86400000).toISOString().slice(0, 10);
    out.push(...dailies(d, PUZZLE_TYPES.length));
  }
  return out;
}

const unlocked = (s: SolveEntry[]) => unlockedAchievements(s, EPOCH);
const ids = ACHIEVEMENTS.map((a) => a.id);

describe('unlockedAchievements', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('has a definition for every id it can return, and no duplicates', () => {
    expect(new Set(ids).size).toBe(ids.length);
    expect(ACHIEVEMENTS.length).toBe(17);
    for (const a of ACHIEVEMENTS) {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.description.length).toBeGreaterThan(0);
    }
  });

  it('gives nothing for an empty history', () => {
    expect(unlocked([]).size).toBe(0);
  });

  it('ignores solves from before the epoch', () => {
    const before = PUZZLE_TYPES.map((t) => solve(`${t}:daily:2025-06-01`, '2025-06-01'));
    expect(unlocked(before).size).toBe(0);
    const after = PUZZLE_TYPES.map((t) => solve(`${t}:daily:2026-06-01`));
    expect(unlocked(after).has('every-type')).toBe(true);
  });

  it('counts a solve made at the exact epoch instant', () => {
    const atEpoch: SolveEntry = { id: 'sudoku:weekly:2026-W23', solvedAt: EPOCH, seconds: 60, hints: 0, moves: 30 };
    expect(unlockedAchievements([atEpoch], EPOCH).has('first-weekly')).toBe(true);
  });

  it('every-type wants one of each, in any mode', () => {
    const mixed = PUZZLE_TYPES.map((t, i) =>
      i % 2 === 0 ? solve(`${t}:daily:2026-06-01`) : solve(`${t}:medium:1a2b${i}`),
    );
    expect(unlocked(mixed).has('every-type')).toBe(true);
    expect(unlocked(mixed.slice(0, -1)).has('every-type')).toBe(false);
  });

  it('first-weekly, first-monthly and first-genius', () => {
    expect(unlocked([solve('sudoku:weekly:2026-W23')]).has('first-weekly')).toBe(true);
    expect(unlocked([solve('sudoku:monthly:2026-06')]).has('first-monthly')).toBe(true);
    // A monthly is genius by schedule, so a level makes the point without overlap.
    expect(unlocked([solve('shapes:level:genius:1')]).has('first-genius')).toBe(true);
    expect(unlocked([solve('shapes:level:easy:1')]).has('first-genius')).toBe(false);
  });

  it('the streak achievements', () => {
    expect(unlocked(streakDays(2)).has('streak-3')).toBe(false);
    expect(unlocked(streakDays(3)).has('streak-3')).toBe(true);
    expect(unlocked(streakDays(6)).has('streak-7')).toBe(false);
    expect(unlocked(streakDays(7)).has('streak-7')).toBe(true);
    expect(unlocked(streakDays(6)).has('perfect-week')).toBe(false);
    expect(unlocked(streakDays(7)).has('perfect-week')).toBe(true);
    expect(unlocked(streakDays(29)).has('streak-30')).toBe(false);
    expect(unlocked(streakDays(30)).has('streak-30')).toBe(true);
  });

  it('perfect-week wants seven *consecutive* perfect days, not seven perfect days total', () => {
    // Every other day is perfect, with a completely empty day between each: seven perfect
    // days across a 13-day span, but no run of them is longer than one.
    const scattered: SolveEntry[] = [];
    for (let i = 0; i <= 12; i += 2) {
      const d = new Date(Date.parse('2026-06-01T12:00:00Z') + i * 86400000).toISOString().slice(0, 10);
      scattered.push(...dailies(d, PUZZLE_TYPES.length));
    }
    expect(unlocked(scattered).has('perfect-week')).toBe(false);
  });

  it('the skill achievements', () => {
    expect(unlocked([solve('zip:daily:2026-06-01')]).has('daily-no-hint')).toBe(true);
    expect(unlocked([solve('zip:daily:2026-06-01', '2026-06-01', 12, 1)]).has('daily-no-hint')).toBe(false);

    const full = dailies('2026-06-01', PUZZLE_TYPES.length);
    expect(unlocked(full).has('perfect-day')).toBe(true);
    expect(unlocked(full).has('perfect-day-no-hint')).toBe(true);

    const hinted = dailies('2026-06-02', PUZZLE_TYPES.length, 1);
    expect(unlocked(hinted).has('perfect-day')).toBe(true);
    expect(unlocked(hinted).has('perfect-day-no-hint')).toBe(false);
  });

  it('daily-no-hint does not count a zero-hint solve that is not a daily', () => {
    const notDaily = [solve('sudoku:weekly:2026-W23'), solve('shapes:level:easy:1'), solve('zip:medium:1a2b')];
    expect(unlocked(notDaily).has('daily-no-hint')).toBe(false);
  });

  it('perfect-day wants all eight on the same day, not eight solves spread over two days', () => {
    const onOneDay = (day: string, types: readonly (typeof PUZZLE_TYPES)[number][]) =>
      types.map((t) => solve(`${t}:daily:${day}`, day));
    const split = [...onOneDay('2026-06-01', PUZZLE_TYPES.slice(0, 4)), ...onOneDay('2026-06-02', PUZZLE_TYPES.slice(4, 8))];
    expect(unlocked(split).has('perfect-day')).toBe(false);
    expect(unlocked(split).has('perfect-day-no-hint')).toBe(false);
  });

  it('pack-complete wants every level of one type at one difficulty', () => {
    const n = levelList('zip', 'easy').length;
    const all = Array.from({ length: n }, (_, i) => solve(`zip:level:easy:${i + 1}`));
    expect(unlocked(all).has('pack-complete')).toBe(true);
    expect(unlocked(all.slice(0, -1)).has('pack-complete')).toBe(false);
  });

  it('the volume achievements', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => solve(`zip:medium:seed${i}`));
    expect(unlocked(many(49)).has('solved-50')).toBe(false);
    expect(unlocked(many(50)).has('solved-50')).toBe(true);
    expect(unlocked(many(249)).has('solved-250')).toBe(false);
    expect(unlocked(many(250)).has('solved-250')).toBe(true);
    expect(unlocked(many(999)).has('solved-1000')).toBe(false);
    expect(unlocked(many(1000)).has('solved-1000')).toBe(true);
  });

  it('night-owl and early-bird only count dailies', () => {
    expect(unlocked([solve('zip:medium:1a2b', '2026-06-01', 1)]).has('night-owl')).toBe(false);
    expect(unlocked([solve('zip:medium:1a2b', '2026-06-01', 1)]).has('early-bird')).toBe(false);
  });

  it('night-owl and early-bird read the device’s local hour, not UTC, at every window boundary', () => {
    // Forces the zone the assertions are written against, rather than trusting whatever zone
    // the machine or CI runner happens to be in. Europe/Berlin is UTC+2 in June (CEST), so an
    // instant whose Berlin-local hour and UTC hour fall in different windows will disagree
    // between a correct getHours() read and a getUTCHours() mutant, wherever this actually runs.
    const originalTz = process.env.TZ;
    vi.useFakeTimers();
    process.env.TZ = 'Europe/Berlin';
    try {
      const berlinHour = (hour: number, minute = 0): number => Date.UTC(2026, 5, 2, hour, minute) - 2 * 3600_000;
      const atLocalHour = (hour: number, hints = 0): SolveEntry => ({
        id: 'zip:daily:2026-06-02',
        solvedAt: berlinHour(hour),
        seconds: 60,
        hints,
        moves: 30,
      });

      expect(unlocked([atLocalHour(1)]).has('night-owl')).toBe(true);
      expect(unlocked([atLocalHour(4)]).has('night-owl')).toBe(false); // boundary: 4 is not "before four"
      expect(unlocked([atLocalHour(5)]).has('night-owl')).toBe(false);
      expect(unlocked([atLocalHour(5)]).has('early-bird')).toBe(true);
      expect(unlocked([atLocalHour(6)]).has('early-bird')).toBe(false); // boundary: 6 is not "before six"
      expect(unlocked([atLocalHour(7)]).has('early-bird')).toBe(false);

      // Local hour 0 in Europe/Berlin is 22:00 UTC the day before: opposite sides of both
      // windows depending on which clock you read. A getUTCHours() mutant sees 22 here, which
      // is in neither window, and would report both of these as false.
      const crossesMidnightInUtc = atLocalHour(0);
      expect(new Date(crossesMidnightInUtc.solvedAt).getUTCHours()).toBe(22);
      expect(unlocked([crossesMidnightInUtc]).has('night-owl')).toBe(true);
      expect(unlocked([crossesMidnightInUtc]).has('early-bird')).toBe(true);
    } finally {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
      vi.useRealTimers();
    }
  });

  it('ships an epoch that is a real instant', () => {
    expect(Number.isFinite(ACHIEVEMENTS_EPOCH)).toBe(true);
    expect(ACHIEVEMENTS_EPOCH).toBeGreaterThan(Date.parse('2026-01-01T00:00:00Z'));
  });

  it('returns exactly the achievements a handcrafted history earns, and no others', () => {
    const oneFullDay = dailies('2026-06-01', PUZZLE_TYPES.length);
    expect([...unlocked(oneFullDay)].sort()).toEqual(
      ['daily-no-hint', 'every-type', 'perfect-day', 'perfect-day-no-hint'].sort(),
    );

    const justAWeekly = [solve('sudoku:weekly:2026-W23')];
    expect([...unlocked(justAWeekly)].sort()).toEqual(['first-weekly']);

    const n = levelList('zip', 'easy').length;
    const packAndVolume = [
      ...Array.from({ length: n }, (_, i) => solve(`zip:level:easy:${i + 1}`)),
      ...Array.from({ length: 50 }, (_, i) => solve(`zip:medium:seed${i}`)),
    ];
    expect([...unlocked(packAndVolume)].sort()).toEqual(['pack-complete', 'solved-50'].sort());
  });

  it('every achievement id is independently reachable', () => {
    // Guards against a typo'd key in the internal id-to-condition lookup: such a key reads as
    // `undefined` at every call and silently locks that one achievement forever, with no
    // compile error to catch it. A history crafted to earn exactly one achievement, for every
    // id ACHIEVEMENTS declares, is a black-box way to prove each lookup actually fires.
    const n = levelList('zip', 'easy').length;
    const fixtures: Record<string, SolveEntry[]> = {
      'every-type': PUZZLE_TYPES.map((t) => solve(`${t}:daily:2026-06-01`)),
      'first-weekly': [solve('sudoku:weekly:2026-W23')],
      'first-monthly': [solve('sudoku:monthly:2026-06')],
      'first-genius': [solve('shapes:level:genius:1')],
      'streak-3': streakDays(3),
      'streak-7': streakDays(7),
      'streak-30': streakDays(30),
      'perfect-week': streakDays(7),
      'daily-no-hint': [solve('zip:daily:2026-06-01')],
      'perfect-day': dailies('2026-06-01', PUZZLE_TYPES.length),
      'perfect-day-no-hint': dailies('2026-06-01', PUZZLE_TYPES.length),
      'pack-complete': Array.from({ length: n }, (_, i) => solve(`zip:level:easy:${i + 1}`)),
      'solved-50': Array.from({ length: 50 }, (_, i) => solve(`zip:medium:seed${i}`)),
      'solved-250': Array.from({ length: 250 }, (_, i) => solve(`zip:medium:seed${i}`)),
      'solved-1000': Array.from({ length: 1000 }, (_, i) => solve(`zip:medium:seed${i}`)),
      'night-owl': [solve('zip:daily:2026-06-01', '2026-06-01', 1)],
      'early-bird': [solve('zip:daily:2026-06-01', '2026-06-01', 5)],
    };

    expect(Object.keys(fixtures).sort()).toEqual([...ids].sort());
    for (const [id, history] of Object.entries(fixtures)) {
      expect(unlocked(history).has(id)).toBe(true);
    }
  });

  it('is independent of the wall clock, despite dailyStreaks defaulting `now` to it', () => {
    const history = streakDays(30);

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00Z')); // the day right after the streak ends
    const dayAfter = unlocked(history);

    vi.setSystemTime(new Date('2036-01-01T12:00:00Z')); // a decade away from any of it
    const decadeLater = unlocked(history);
    vi.useRealTimers();

    expect([...dayAfter].sort()).toEqual([...decadeLater].sort());
  });
});
