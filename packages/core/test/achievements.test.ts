import { afterEach, describe, expect, it, vi } from 'vitest';
import { PUZZLE_TYPES } from '../src/types.ts';
import { DAILY_TYPES } from '../src/schedule.ts';
import {
  ACHIEVEMENTS,
  ACHIEVEMENTS_EPOCH,
  SPEED_TARGETS,
  achievementProgress,
  unlockedAchievements,
  type SolveEntry,
} from '../src/achievements.ts';

const EPOCH = Date.parse('2026-01-01T00:00:00Z');

// Berlin noon: far from any day boundary, and outside both night windows.
function solve(id: string, day = '2026-06-01', hour = 12, hints = 0, seconds = 600): SolveEntry {
  return { id, solvedAt: Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00`), seconds, hints, moves: 30 };
}

function dailies(day: string, count: number, hints = 0): SolveEntry[] {
  return DAILY_TYPES.slice(0, count).map((t) => solve(`${t}:daily:${day}`, day, 12, hints));
}

function dayKey(offset: number): string {
  return new Date(Date.parse('2026-06-01T12:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
}

// A run of `days` consecutive perfect days starting 2026-06-01.
function streakDays(days: number): SolveEntry[] {
  const out: SolveEntry[] = [];
  for (let i = 0; i < days; i++) out.push(...dailies(dayKey(i), DAILY_TYPES.length));
  return out;
}

// A run of `days` consecutive days with just enough dailies for the streak, never a perfect day.
function thinStreak(days: number): SolveEntry[] {
  const out: SolveEntry[] = [];
  for (let i = 0; i < days; i++) out.push(...dailies(dayKey(i), 3));
  return out;
}

function randoms(type: string, n: number): SolveEntry[] {
  return Array.from({ length: n }, (_, i) => solve(`${type}:medium:seed${i}`));
}

function weeklies(n: number): SolveEntry[] {
  return Array.from({ length: n }, (_, i) => solve(`sudoku:weekly:2026-W${String(i + 1).padStart(2, '0')}`));
}

const unlocked = (s: SolveEntry[]) => unlockedAchievements(s, EPOCH);
const progress = (s: SolveEntry[]) => achievementProgress(s, EPOCH);
const ids = ACHIEVEMENTS.map((a) => a.id);

describe('the catalog', () => {
  it('has forty unique achievements, twenty general and two per type', () => {
    expect(ACHIEVEMENTS).toHaveLength(40);
    expect(new Set(ids).size).toBe(40);
    expect(ACHIEVEMENTS.filter((a) => a.group !== 'type')).toHaveLength(20);
    for (const type of PUZZLE_TYPES) {
      const own = ACHIEVEMENTS.filter((a) => a.type === type);
      expect(own.map((a) => a.id)).toEqual([`${type}-100`, expect.stringMatching(new RegExp(`^${type}-(speed|genius)$`))]);
      expect(own.every((a) => a.group === 'type')).toBe(true);
    }
    for (const a of ACHIEVEMENTS) {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.description.length).toBeGreaterThan(0);
    }
  });

  it('speed signatures are exactly the five speed types, genius signatures the other five', () => {
    const speed = ids.filter((id) => id.endsWith('-speed')).map((id) => id.replace('-speed', ''));
    expect(speed.sort()).toEqual(Object.keys(SPEED_TARGETS).sort());
    expect(ACHIEVEMENTS.filter((a) => a.type && a.id.endsWith('-genius'))).toHaveLength(5);
  });

  it('ships an epoch that is a real instant', () => {
    expect(Number.isFinite(ACHIEVEMENTS_EPOCH)).toBe(true);
    expect(ACHIEVEMENTS_EPOCH).toBeGreaterThan(Date.parse('2026-01-01T00:00:00Z'));
  });
});

describe('unlockedAchievements', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives nothing for an empty history', () => {
    expect(unlocked([]).size).toBe(0);
  });

  it('ignores solves from before the epoch, and counts one at the exact epoch instant', () => {
    expect(unlocked([solve('zip:daily:2025-06-01', '2025-06-01')]).size).toBe(0);
    const atEpoch: SolveEntry = { id: 'sudoku:weekly:2026-W23', solvedAt: EPOCH, seconds: 60, hints: 0, moves: 30 };
    expect(unlocked([atEpoch]).has('first-weekly')).toBe(true);
  });

  it('first-solve unlocks on any solve', () => {
    expect(unlocked([solve('shapes:level:easy:1')]).has('first-solve')).toBe(true);
  });

  it('every-type wants one of each daily type, in any mode, and never asks for plain Sudoku', () => {
    const mixed = DAILY_TYPES.map((t, i) => (i % 2 === 0 ? solve(`${t}:daily:2026-06-01`) : solve(`${t}:medium:1a2b${i}`)));
    expect(unlocked(mixed).has('every-type')).toBe(true);
    expect(unlocked(mixed.slice(0, -1)).has('every-type')).toBe(false);
    const sudokuInstead = [...mixed.slice(0, -1), solve('sudoku:daily:2026-06-01')];
    expect(unlocked(sudokuInstead).has('every-type')).toBe(false);
  });

  it('first-weekly, first-monthly and first-genius', () => {
    expect(unlocked([solve('sudoku:weekly:2026-W23')]).has('first-weekly')).toBe(true);
    expect(unlocked([solve('sudoku:monthly:2026-06')]).has('first-monthly')).toBe(true);
    expect(unlocked([solve('shapes:level:genius:1')]).has('first-genius')).toBe(true);
    expect(unlocked([solve('shapes:level:easy:1')]).has('first-genius')).toBe(false);
  });

  it('the streak ladder, each rung exactly at its target', () => {
    for (const n of [3, 7, 30, 100, 365]) {
      expect(unlocked(thinStreak(n - 1)).has(`streak-${n}`)).toBe(false);
      expect(unlocked(thinStreak(n)).has(`streak-${n}`)).toBe(true);
    }
  });

  it('perfect days: one, ten, and ten scattered with gaps', () => {
    expect(unlocked(dailies('2026-06-01', DAILY_TYPES.length)).has('perfect-day')).toBe(true);
    expect(unlocked(dailies('2026-06-01', DAILY_TYPES.length - 1)).has('perfect-day')).toBe(false);
    expect(unlocked(streakDays(9)).has('perfect-10')).toBe(false);
    expect(unlocked(streakDays(10)).has('perfect-10')).toBe(true);
    const scattered: SolveEntry[] = [];
    for (let i = 0; i <= 18; i += 2) scattered.push(...dailies(dayKey(i), DAILY_TYPES.length));
    expect(unlocked(scattered).has('perfect-10')).toBe(true);
  });

  it('perfect-day wants every daily on the same day and skips plain Sudoku', () => {
    const split = [
      ...DAILY_TYPES.slice(0, 4).map((t) => solve(`${t}:daily:2026-06-01`)),
      ...DAILY_TYPES.slice(4).map((t) => solve(`${t}:daily:2026-06-02`, '2026-06-02')),
    ];
    expect(unlocked(split).has('perfect-day')).toBe(false);
    const sudokuInstead = [...dailies('2026-06-02', DAILY_TYPES.length - 1), solve('sudoku:daily:2026-06-02', '2026-06-02')];
    expect(unlocked(sudokuInstead).has('perfect-day')).toBe(false);
  });

  it('daily-no-hint and perfect-day-no-hint', () => {
    expect(unlocked([solve('zip:daily:2026-06-01')]).has('daily-no-hint')).toBe(true);
    expect(unlocked([solve('zip:daily:2026-06-01', '2026-06-01', 12, 1)]).has('daily-no-hint')).toBe(false);
    expect(unlocked([solve('sudoku:weekly:2026-W23'), solve('zip:medium:1a2b')]).has('daily-no-hint')).toBe(false);
    expect(unlocked(dailies('2026-06-01', DAILY_TYPES.length)).has('perfect-day-no-hint')).toBe(true);
    const hinted = dailies('2026-06-02', DAILY_TYPES.length, 1);
    expect(unlocked(hinted).has('perfect-day')).toBe(true);
    expect(unlocked(hinted).has('perfect-day-no-hint')).toBe(false);
  });

  it('the solve counts, exactly at each target', () => {
    for (const n of [50, 250, 1000]) {
      expect(unlocked(randoms('zip', n - 1)).has(`solved-${n}`)).toBe(false);
      expect(unlocked(randoms('zip', n)).has(`solved-${n}`)).toBe(true);
    }
  });

  it('weekly-10 counts distinct weeks, not solves', () => {
    expect(unlocked(weeklies(9)).has('weekly-10')).toBe(false);
    expect(unlocked(weeklies(10)).has('weekly-10')).toBe(true);
    const sameWeekTwice = [...weeklies(9), solve('sudoku:weekly:2026-W01', '2026-06-02')];
    expect(unlocked(sameWeekTwice).has('weekly-10')).toBe(false);
  });

  it('per-type volume counts that type in any mode and nothing else', () => {
    const zips = [...randoms('zip', 98), solve('zip:daily:2026-06-01'), solve('zip:level:easy:1')];
    expect(unlocked(zips).has('zip-100')).toBe(true);
    expect(unlocked(zips.slice(1)).has('zip-100')).toBe(false);
    expect(unlocked([...randoms('zip', 99), solve('shapes:level:easy:1')]).has('zip-100')).toBe(false);
  });

  it('speed wants a hint-free daily strictly under the target', () => {
    const target = SPEED_TARGETS.zip;
    const daily = (seconds: number, hints = 0) => [solve('zip:daily:2026-06-01', '2026-06-01', 12, hints, seconds)];
    expect(unlocked(daily(target - 1)).has('zip-speed')).toBe(true);
    expect(unlocked(daily(target)).has('zip-speed')).toBe(false);
    expect(unlocked(daily(target - 1, 1)).has('zip-speed')).toBe(false);
    expect(unlocked([solve('zip:medium:seed', '2026-06-01', 12, 0, 1)]).has('zip-speed')).toBe(false);
    expect(unlocked([solve('zip:level:hard:1', '2026-06-01', 12, 0, 1)]).has('zip-speed')).toBe(false);
  });

  it('a zero or missing time never counts as fast', () => {
    expect(unlocked([solve('zip:daily:2026-06-01', '2026-06-01', 12, 0, 0)]).has('zip-speed')).toBe(false);
  });

  it('genius signatures want Genius and no hint, in any mode', () => {
    expect(unlocked([solve('sudoku:level:genius:1')]).has('sudoku-genius')).toBe(true);
    expect(unlocked([solve('sudoku:monthly:2026-06')]).has('sudoku-genius')).toBe(true);
    expect(unlocked([solve('sudoku:level:genius:1', '2026-06-01', 12, 1)]).has('sudoku-genius')).toBe(false);
    expect(unlocked([solve('sudoku:level:hard:1')]).has('sudoku-genius')).toBe(false);
    expect(unlocked([solve('killer:level:genius:1')]).has('sudoku-genius')).toBe(false);
  });

  it('night-owl and early-bird only count dailies', () => {
    expect(unlocked([solve('zip:medium:1a2b', '2026-06-01', 1)]).has('night-owl')).toBe(false);
    expect(unlocked([solve('zip:medium:1a2b', '2026-06-01', 5)]).has('early-bird')).toBe(false);
  });

  it('night-owl and early-bird read the device’s local hour, not UTC, at every window boundary', () => {
    const originalTz = process.env.TZ;
    vi.useFakeTimers();
    process.env.TZ = 'Europe/Berlin';
    try {
      const berlinHour = (hour: number): number => Date.UTC(2026, 5, 2, hour, 0) - 2 * 3600_000;
      const at = (hour: number): SolveEntry => ({ id: 'zip:daily:2026-06-02', solvedAt: berlinHour(hour), seconds: 600, hints: 0, moves: 30 });
      expect(unlocked([at(1)]).has('night-owl')).toBe(true);
      expect(unlocked([at(1)]).has('early-bird')).toBe(false);
      expect(unlocked([at(4)]).has('night-owl')).toBe(false);
      expect(unlocked([at(4)]).has('early-bird')).toBe(true);
      expect(unlocked([at(6)]).has('early-bird')).toBe(false);
      const crossesMidnightInUtc = at(0);
      expect(new Date(crossesMidnightInUtc.solvedAt).getUTCHours()).toBe(22);
      expect(unlocked([crossesMidnightInUtc]).has('night-owl')).toBe(true);
    } finally {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
      vi.useRealTimers();
    }
  });

  it('a malformed daily id does not crash and leaves other facts intact', () => {
    const junk = [solve('shapes:daily:zzz'), solve('shapes:daily:2026-09')];
    expect(() => unlocked(junk)).not.toThrow();
    expect(unlocked(junk).size).toBe(0);
    const real = dailies('2026-06-01', DAILY_TYPES.length);
    expect(unlocked([...real, ...junk])).toEqual(unlocked(real));
  });

  it('returns exactly what a handcrafted history earns', () => {
    expect([...unlocked(dailies('2026-06-01', DAILY_TYPES.length))].sort()).toEqual(
      ['daily-no-hint', 'every-type', 'first-solve', 'perfect-day', 'perfect-day-no-hint'].sort(),
    );
    expect([...unlocked([solve('sudoku:weekly:2026-W23')])].sort()).toEqual(['first-solve', 'first-weekly']);
  });

  it('every achievement id is independently reachable', () => {
    // Guards against a lookup keyed by a typo'd id, which would lock that achievement forever.
    const fixtures: Record<string, SolveEntry[]> = {
      'first-solve': [solve('shapes:level:easy:1')],
      'every-type': DAILY_TYPES.map((t) => solve(`${t}:daily:2026-06-01`)),
      'daily-no-hint': [solve('zip:daily:2026-06-01')],
      'first-weekly': [solve('sudoku:weekly:2026-W23')],
      'first-monthly': [solve('sudoku:monthly:2026-06')],
      'first-genius': [solve('shapes:level:genius:1')],
      'streak-3': thinStreak(3),
      'streak-7': thinStreak(7),
      'streak-30': thinStreak(30),
      'streak-100': thinStreak(100),
      'streak-365': thinStreak(365),
      'perfect-day': dailies('2026-06-01', DAILY_TYPES.length),
      'perfect-10': streakDays(10),
      'perfect-day-no-hint': dailies('2026-06-01', DAILY_TYPES.length),
      'solved-50': randoms('zip', 50),
      'solved-250': randoms('zip', 250),
      'solved-1000': randoms('zip', 1000),
      'weekly-10': weeklies(10),
      'night-owl': [solve('zip:daily:2026-06-01', '2026-06-01', 1)],
      'early-bird': [solve('zip:daily:2026-06-01', '2026-06-01', 5)],
    };
    for (const type of PUZZLE_TYPES) {
      fixtures[`${type}-100`] = randoms(type, 100);
      if (type in SPEED_TARGETS) fixtures[`${type}-speed`] = [solve(`${type}:daily:2026-06-01`, '2026-06-01', 12, 0, 1)];
      else fixtures[`${type}-genius`] = [solve(`${type}:level:genius:1`)];
    }
    expect(Object.keys(fixtures).sort()).toEqual([...ids].sort());
    for (const [id, history] of Object.entries(fixtures)) expect(unlocked(history).has(id), id).toBe(true);
  });

  it('is independent of the wall clock', () => {
    const history = thinStreak(30);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00Z'));
    const dayAfter = unlocked(history);
    vi.setSystemTime(new Date('2036-01-01T12:00:00Z'));
    const decadeLater = unlocked(history);
    vi.useRealTimers();
    expect([...dayAfter].sort()).toEqual([...decadeLater].sort());
  });
});

describe('achievementProgress', () => {
  it('has one entry per counter achievement, in catalog order', () => {
    const withTarget = ACHIEVEMENTS.filter((a) => a.target !== undefined).map((a) => a.id);
    expect(progress([]).map((p) => p.id)).toEqual(withTarget);
    expect(progress([]).every((p) => p.current === 0)).toBe(true);
  });

  it('names the counter each entry reads, shared along a ladder', () => {
    const byId = new Map(progress([]).map((p) => [p.id, p.counter]));
    expect(byId.get('streak-3')).toBe('streak');
    expect(byId.get('streak-365')).toBe('streak');
    expect(byId.get('solved-50')).toBe(byId.get('solved-1000'));
    expect(byId.get('zip-100')).toBe('type:zip');
    expect(byId.get('zip-100')).not.toBe(byId.get('shapes-100'));
  });

  it('reports the counter and caps it at the target', () => {
    const byId = new Map(progress(thinStreak(12)).map((p) => [p.id, p]));
    expect(byId.get('streak-3')).toMatchObject({ current: 3, target: 3 });
    expect(byId.get('streak-30')).toMatchObject({ current: 12, target: 30 });
    expect(byId.get('solved-50')).toMatchObject({ current: 36, target: 50 });
  });

  it('agrees with unlockedAchievements on every counter', () => {
    const history = [...thinStreak(8), ...randoms('zip', 100), ...weeklies(10), ...streakDays(10)];
    const earned = unlocked(history);
    for (const p of progress(history)) expect(p.current >= p.target, p.id).toBe(earned.has(p.id));
  });
});
