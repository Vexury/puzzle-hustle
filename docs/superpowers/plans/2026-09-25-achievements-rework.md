# Achievements Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 18 achievements with a final catalog of 40 (progress for counters, flairs for milestones) and rebuild the Achievements page as a badge cabinet with an "Almost there" strip and type filter chips.

**Architecture:** Everything stays derived from `ph:solves`. `packages/core/src/achievements.ts` owns the catalog, one `gather()` pass over the solves, and two readers of its result: `unlockedAchievements()` (unchanged signature) and the new `achievementProgress()`. `apps/web` renders them; flairs stay defined in `cosmetics.ts`.

**Tech Stack:** TypeScript 7, React 19 (React Compiler), Vitest 5 with jsdom in `apps/web`, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-09-25-achievements-rework-design.md`

## Global Constraints

- Exactly 40 achievements: 20 general, 2 per type in `PUZZLE_TYPES` order.
- Ids, titles, groups, targets and flair names exactly as in the spec tables; no achievement title equals any flair title.
- `SPEED_TARGETS`: zip 25, shapes 10, crowns 30, stars 30, tracks 45 seconds, strictly under, hint-free dailies only.
- Achievements never read anything but `ph:solves`; no new `ph:` key.
- Flair ids and titles are forever: the five existing achievement flairs keep id, title and achievement id.
- `ACHIEVEMENT_COINS` stays 25; `ACHIEVEMENTS_EPOCH` does not move.
- Every UI change works in light and dark and at phone width, and respects `prefers-reduced-motion`.
- Verify with `pnpm test` and `pnpm -r typecheck` from the repo root. Stage files explicitly, never `git add -A`.
- Commit bodies end with the line `Implemented with assistance from Claude Opus 5.5.` after a blank line. No `Co-Authored-By` trailer.

## Review Focus

- A solve record with a missing `seconds` field is read as `seconds: 0` by `storedSolves()`; it must not unlock a speed achievement (Task 1 test "a zero or missing time never counts as fast").
- A ladder (streak 3/7/30/100/365) must not fill the "Almost there" strip with its own rungs (Task 3 test "keeps one rung per ladder").
- A second weekly solved in the same week (one weekly per week, but a replay writes the same id) must not count twice towards `weekly-10` (Task 1 test "weekly-10 counts distinct weeks").
- The detail card must close on the Android back key and hand the back button back afterwards (Task 5 test "closes the detail card on back").
- A fresh install (nothing solved) must render the page without the "Almost there" strip and without errors (Task 5 test "fresh profile").

---

### Task 1: Core catalog, facts and progress

**Files:**
- Modify: `packages/core/src/achievements.ts` (full rewrite below)
- Test: `packages/core/test/achievements.test.ts` (full rewrite below)

**Interfaces:**
- Produces:
  - `type AchievementGroup = 'start' | 'streak' | 'perfect' | 'volume' | 'oddity' | 'type'`
  - `interface Achievement { id: string; title: string; description: string; group: AchievementGroup; type?: PuzzleTypeId; target?: number }`
  - `const SPEED_TARGETS: { zip: 25; shapes: 10; crowns: 30; stars: 30; tracks: 45 }`
  - `const ACHIEVEMENTS: readonly Achievement[]` (40, general first, then per type in `PUZZLE_TYPES` order, volume before signature)
  - `interface AchievementProgress { id: string; counter: string; current: number; target: number }`
  - `function unlockedAchievements(solves: readonly SolveEntry[], epoch?: number): Set<string>`
  - `function achievementProgress(solves: readonly SolveEntry[], epoch?: number): AchievementProgress[]` (catalog order, one entry per achievement with a `target`)
  - `ACHIEVEMENTS_EPOCH`, `SolveEntry` unchanged

- [ ] **Step 1: Write the failing tests**

Replace `packages/core/test/achievements.test.ts` with:

```ts
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
    expect(ids.filter((id) => id.endsWith('-genius'))).toHaveLength(5);
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @puzzle-hustle/core exec vitest run test/achievements.test.ts`
Expected: FAIL, `SPEED_TARGETS` and `achievementProgress` are not exported, and the catalog has 18 entries.

- [ ] **Step 3: Rewrite `packages/core/src/achievements.ts`**

Keep the file's imports of `parseSolveId`, `DAILY_TYPES`, `dailyStreaks`, `PUZZLE_TYPES`, `PUZZLE_META`, `type PuzzleTypeId`; drop `levelList` and `DIFFICULTIES`. Keep the `ACHIEVEMENTS_EPOCH` block and its comment verbatim. Full file:

```ts
import { parseSolveId } from './solveId.ts';
import { DAILY_TYPES } from './schedule.ts';
import { dailyStreaks } from './streaks.ts';
import { PUZZLE_META, PUZZLE_TYPES, type PuzzleTypeId } from './types.ts';

export interface SolveEntry {
  id: string;
  solvedAt: number;
  seconds: number;
  hints: number;
  moves: number;
}

export type AchievementGroup = 'start' | 'streak' | 'perfect' | 'volume' | 'oddity' | 'type';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  group: AchievementGroup;
  type?: PuzzleTypeId;
  target?: number;
}

export interface AchievementProgress {
  id: string;
  counter: string;
  current: number;
  target: number;
}

// <keep the existing ACHIEVEMENTS_EPOCH comment block here, unchanged>
export const ACHIEVEMENTS_EPOCH = Date.parse('2026-09-22T00:00:00+02:00');

// Seconds, strictly under, hint-free dailies only. Calibrated 2026-09-25 from the leaderboard's
// hint-free daily times near the fastest quarter; see the 2026-09-25 rework spec.
export const SPEED_TARGETS = { zip: 25, shapes: 10, crowns: 30, stars: 30, tracks: 45 } as const;
type SpeedType = keyof typeof SPEED_TARGETS;

const isSpeedType = (type: PuzzleTypeId): type is SpeedType => type in SPEED_TARGETS;

const TYPE_VOLUME = 100;

const TYPE_TITLES: Record<PuzzleTypeId, { volume: string; signature: string }> = {
  zip: { volume: 'Zip Fan', signature: 'Lightning' },
  shapes: { volume: 'In Good Shape', signature: 'Quick Fit' },
  nonogram: { volume: 'Pixel Pusher', signature: 'Picture Perfect' },
  mosaic: { volume: 'Piece by Piece', signature: 'Fine Art' },
  crowns: { volume: 'Cat Person', signature: 'Fast Paws' },
  stars: { volume: 'Big Heart', signature: 'Swift Heart' },
  sudoku: { volume: 'Nine by Nine', signature: 'Pure Logic' },
  killer: { volume: 'Sum of All', signature: 'Cold Calculation' },
  tracks: { volume: 'Railway Worker', signature: 'Express' },
  slabs: { volume: 'Rock Collector', signature: 'Rock Solid' },
};

const GENERAL: readonly Achievement[] = [
  { id: 'first-solve', title: 'Hello, Hustler', description: 'Solve your first puzzle.', group: 'start' },
  { id: 'every-type', title: 'Sampler', description: 'Solve at least one puzzle of every daily type.', group: 'start', target: DAILY_TYPES.length },
  { id: 'daily-no-hint', title: 'No Help Needed', description: 'Solve a daily without a hint.', group: 'start' },
  { id: 'first-weekly', title: 'Weekender', description: 'Solve a Weekly.', group: 'start' },
  { id: 'first-monthly', title: "Month's Finest", description: 'Solve a Monthly.', group: 'start' },
  { id: 'first-genius', title: 'Big Brain', description: 'Solve a puzzle on Genius.', group: 'start' },

  { id: 'streak-3', title: 'Warming Up', description: 'Keep a daily streak for 3 days.', group: 'streak', target: 3 },
  { id: 'streak-7', title: 'Week Warrior', description: 'Keep a daily streak for 7 days.', group: 'streak', target: 7 },
  { id: 'streak-30', title: 'Creature of Habit', description: 'Keep a daily streak for 30 days.', group: 'streak', target: 30 },
  { id: 'streak-100', title: 'Unstoppable', description: 'Keep a daily streak for 100 days.', group: 'streak', target: 100 },
  { id: 'streak-365', title: 'Year of Puzzles', description: 'Keep a daily streak for 365 days.', group: 'streak', target: 365 },

  { id: 'perfect-day', title: 'Clean Sweep', description: 'Solve every daily in one day.', group: 'perfect' },
  { id: 'perfect-10', title: 'Spotless', description: 'Solve every daily on ten days.', group: 'perfect', target: 10 },
  { id: 'perfect-day-no-hint', title: 'Flawless', description: 'Solve every daily in one day, none with a hint.', group: 'perfect' },

  { id: 'solved-50', title: 'Getting Hooked', description: 'Solve 50 puzzles.', group: 'volume', target: 50 },
  { id: 'solved-250', title: 'Puzzle Addict', description: 'Solve 250 puzzles.', group: 'volume', target: 250 },
  { id: 'solved-1000', title: 'Thousand Club', description: 'Solve 1000 puzzles.', group: 'volume', target: 1000 },
  { id: 'weekly-10', title: 'Weekly Regular', description: 'Solve the Weekly in ten different weeks.', group: 'volume', target: 10 },

  { id: 'night-owl', title: 'Night Owl', description: 'Solve a daily between midnight and four.', group: 'oddity' },
  { id: 'early-bird', title: 'Early Bird', description: 'Solve a daily between four and six in the morning.', group: 'oddity' },
];

function typeAchievements(type: PuzzleTypeId): Achievement[] {
  const name = PUZZLE_META[type].name;
  const titles = TYPE_TITLES[type];
  const volume: Achievement = {
    id: `${type}-100`,
    title: titles.volume,
    description: `Solve ${TYPE_VOLUME} ${name} puzzles.`,
    group: 'type',
    type,
    target: TYPE_VOLUME,
  };
  const signature: Achievement = isSpeedType(type)
    ? {
        id: `${type}-speed`,
        title: titles.signature,
        description: `Solve the ${name} daily in under ${SPEED_TARGETS[type]} seconds without a hint.`,
        group: 'type',
        type,
      }
    : {
        id: `${type}-genius`,
        title: titles.signature,
        description: `Solve a ${name} puzzle on Genius without a hint.`,
        group: 'type',
        type,
      };
  return [volume, signature];
}

export const ACHIEVEMENTS: readonly Achievement[] = [...GENERAL, ...PUZZLE_TYPES.flatMap(typeAchievements)];

interface Facts {
  total: number;
  types: Set<PuzzleTypeId>;
  perType: Map<PuzzleTypeId, number>;
  weeks: Set<string>;
  monthly: boolean;
  genius: boolean;
  geniusNoHint: Set<PuzzleTypeId>;
  fastestDaily: Map<PuzzleTypeId, number>;
  bestStreak: number;
  perfectDays: number;
  dailyNoHint: boolean;
  perfectDayNoHint: boolean;
  nightOwl: boolean;
  earlyBird: boolean;
}

function gather(solves: readonly SolveEntry[]): Facts {
  const dailiesByDay = new Map<string, { types: Set<PuzzleTypeId>; hinted: boolean }>();
  const facts: Facts = {
    total: 0,
    types: new Set(),
    perType: new Map(),
    weeks: new Set(),
    monthly: false,
    genius: false,
    geniusNoHint: new Set(),
    fastestDaily: new Map(),
    bestStreak: 0,
    perfectDays: 0,
    dailyNoHint: false,
    perfectDayNoHint: false,
    nightOwl: false,
    earlyBird: false,
  };

  for (const entry of solves) {
    const parsed = parseSolveId(entry.id);
    if (!parsed) continue;
    facts.total++;
    facts.types.add(parsed.type);
    facts.perType.set(parsed.type, (facts.perType.get(parsed.type) ?? 0) + 1);
    if (parsed.difficulty === 'genius') {
      facts.genius = true;
      if (entry.hints === 0) facts.geniusNoHint.add(parsed.type);
    }

    if (parsed.mode !== 'period' || !parsed.key) continue;
    if (parsed.period === 'weekly') facts.weeks.add(parsed.key);
    if (parsed.period === 'monthly') facts.monthly = true;
    if (parsed.period !== 'daily') continue;

    if (entry.hints === 0) {
      facts.dailyNoHint = true;
      // A record without a usable time reads as 0 seconds (storedSolves' default); that is a
      // missing value, not a fast solve.
      if (entry.seconds > 0) {
        const best = facts.fastestDaily.get(parsed.type);
        if (best === undefined || entry.seconds < best) facts.fastestDaily.set(parsed.type, entry.seconds);
      }
    }

    // The player's own night, not Berlin's: unlike a period key, which must put the same
    // puzzle on the same day everywhere, "solved at one in the morning" is about them.
    const hour = new Date(entry.solvedAt).getHours();
    if (hour < 4) facts.nightOwl = true;
    if (hour >= 4 && hour < 6) facts.earlyBird = true;

    const day = dailiesByDay.get(parsed.key) ?? { types: new Set<PuzzleTypeId>(), hinted: false };
    day.types.add(parsed.type);
    if (entry.hints > 0) day.hinted = true;
    dailiesByDay.set(parsed.key, day);
  }

  for (const day of dailiesByDay.values()) {
    if (!DAILY_TYPES.every((type) => day.types.has(type))) continue;
    facts.perfectDays++;
    if (!day.hinted) facts.perfectDayNoHint = true;
  }

  facts.bestStreak = dailyStreaks(solves.map((s) => s.id)).best;
  return facts;
}

// Counter achievements: the name of the counter they read (shared along a ladder) and its value.
function counterOf(a: Achievement, f: Facts): { counter: string; value: number } | null {
  if (a.target === undefined) return null;
  if (a.type) return { counter: `type:${a.type}`, value: f.perType.get(a.type) ?? 0 };
  switch (a.group) {
    case 'streak':
      return { counter: 'streak', value: f.bestStreak };
    case 'perfect':
      return { counter: 'perfect', value: f.perfectDays };
    case 'volume':
      return a.id === 'weekly-10' ? { counter: 'weekly', value: f.weeks.size } : { counter: 'solved', value: f.total };
    case 'start':
      // every-type, the only counter in its group.
      return { counter: 'daily-types', value: DAILY_TYPES.filter((t) => f.types.has(t)).length };
    default:
      return null;
  }
}

// Yes/no achievements, by id. The per-type signatures are filled in below.
const FLAGS: Record<string, (f: Facts) => boolean> = {
  'first-solve': (f) => f.total > 0,
  'daily-no-hint': (f) => f.dailyNoHint,
  'first-weekly': (f) => f.weeks.size > 0,
  'first-monthly': (f) => f.monthly,
  'first-genius': (f) => f.genius,
  'perfect-day': (f) => f.perfectDays > 0,
  'perfect-day-no-hint': (f) => f.perfectDayNoHint,
  'night-owl': (f) => f.nightOwl,
  'early-bird': (f) => f.earlyBird,
};
for (const type of PUZZLE_TYPES) {
  if (isSpeedType(type)) FLAGS[`${type}-speed`] = (f) => (f.fastestDaily.get(type) ?? Infinity) < SPEED_TARGETS[type];
  else FLAGS[`${type}-genius`] = (f) => f.geniusNoHint.has(type);
}

function earned(a: Achievement, f: Facts): boolean {
  const c = counterOf(a, f);
  if (c) return c.value >= a.target!;
  return FLAGS[a.id]?.(f) ?? false;
}

export function unlockedAchievements(solves: readonly SolveEntry[], epoch: number = ACHIEVEMENTS_EPOCH): Set<string> {
  const facts = gather(solves.filter((s) => s.solvedAt >= epoch));
  const out = new Set<string>();
  for (const a of ACHIEVEMENTS) if (earned(a, facts)) out.add(a.id);
  return out;
}

export function achievementProgress(solves: readonly SolveEntry[], epoch: number = ACHIEVEMENTS_EPOCH): AchievementProgress[] {
  const facts = gather(solves.filter((s) => s.solvedAt >= epoch));
  const out: AchievementProgress[] = [];
  for (const a of ACHIEVEMENTS) {
    const c = counterOf(a, facts);
    if (c) out.push({ id: a.id, counter: c.counter, current: Math.min(c.value, a.target!), target: a.target! });
  }
  return out;
}
```

Check `PUZZLE_META[type].name` exists for all ten types (it does in `types.ts`); the descriptions read e.g. "Solve 100 Cats puzzles." because `crowns` displays as Cats.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @puzzle-hustle/core exec vitest run test/achievements.test.ts`
Expected: PASS. Then `pnpm --filter @puzzle-hustle/core test` (coins and cosmetics tests may fail on counts; cosmetics is fixed in Task 2, coins does not pin a count and must pass).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/achievements.ts packages/core/test/achievements.test.ts
git commit -F - <<'EOF'
Rework the achievement catalog to forty with progress

Twenty general achievements and two per puzzle type, with counters that
report how far along a player is. Speed counts hint-free dailies under a
threshold calibrated from the leaderboard.

Implemented with assistance from Claude Opus 5.5.
EOF
```

---

### Task 2: Milestone flairs

**Files:**
- Modify: `packages/core/src/cosmetics.ts` (the `ACTIVITY_FLAIRS` array)
- Test: `packages/core/test/cosmetics.test.ts`

**Interfaces:**
- Consumes: `ACHIEVEMENTS` from Task 1.
- Produces: five new flair ids `relentless`, `puzzle-legend`, `immaculate`, `veteran`, `regular` in `COSMETICS`, `kind: 'flair'`, `requires: { achievement }`.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/cosmetics.test.ts`, change the count test to fifty flairs:

```ts
it('has eight badges, unchanged, and fifty flairs, all with unique ids', () => {
  expect(badges).toHaveLength(8);
  expect(flairs).toHaveLength(50);
  expect(new Set(COSMETICS.map((c) => c.id)).size).toBe(COSMETICS.length);
});
```

and append:

```ts
it('grants exactly the ten milestone flairs from achievements', () => {
  const byAchievement = Object.fromEntries(
    flairs.filter((f) => 'achievement' in f.requires).map((f) => [(f.requires as { achievement: string }).achievement, f.id]),
  );
  expect(byAchievement).toEqual({
    'every-type': 'puzzler',
    'night-owl': 'night-shift',
    'early-bird': 'morning-person',
    'perfect-10': 'sweeper',
    'streak-30': 'hustler',
    'streak-100': 'relentless',
    'streak-365': 'puzzle-legend',
    'perfect-day-no-hint': 'immaculate',
    'solved-1000': 'veteran',
    'weekly-10': 'regular',
  });
  for (const id of Object.keys(byAchievement)) expect(achievementIds.has(id)).toBe(true);
});

it('never gives an achievement and a flair the same title', () => {
  const flairTitles = new Set(flairs.map((f) => f.title));
  for (const a of ACHIEVEMENTS) expect(flairTitles.has(a.title), a.title).toBe(false);
});
```

If the file already has a test asserting every achievement requirement names an existing id, keep it.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @puzzle-hustle/core exec vitest run test/cosmetics.test.ts`
Expected: FAIL on the count (45) and the missing five flairs.

- [ ] **Step 3: Add the flairs**

In `packages/core/src/cosmetics.ts`, extend `ACTIVITY_FLAIRS` after `hustler`:

```ts
  { id: 'relentless', kind: 'flair', title: 'Relentless', requires: { achievement: 'streak-100' } },
  { id: 'puzzle-legend', kind: 'flair', title: 'Puzzle Legend', requires: { achievement: 'streak-365' } },
  { id: 'immaculate', kind: 'flair', title: 'Immaculate', requires: { achievement: 'perfect-day-no-hint' } },
  { id: 'veteran', kind: 'flair', title: 'Veteran', requires: { achievement: 'solved-1000' } },
  { id: 'regular', kind: 'flair', title: 'Regular', requires: { achievement: 'weekly-10' } },
```

- [ ] **Step 4: Run the core suite**

Run: `pnpm --filter @puzzle-hustle/core test`
Expected: PASS (all core tests, including `coins.test.ts` and `flairs` tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/cosmetics.ts packages/core/test/cosmetics.test.ts
git commit -F - <<'EOF'
Add five milestone flairs for the new achievements

Relentless, Puzzle Legend, Immaculate, Veteran and Regular, each named
apart from the achievement that grants it.

Implemented with assistance from Claude Opus 5.5.
EOF
```

---

### Task 3: Web progress helpers

**Files:**
- Modify: `apps/web/src/lib/achievements.ts`
- Test: `apps/web/test/achievements.test.ts`

**Interfaces:**
- Consumes: `achievementProgress`, `AchievementProgress` from Task 1.
- Produces:
  - `currentProgress(): AchievementProgress[]` (from `storedSolves()`)
  - `almostThere(progress: readonly AchievementProgress[], unlocked: ReadonlySet<string>, limit?: number): AchievementProgress[]`

- [ ] **Step 1: Write the failing tests**

In `apps/web/test/achievements.test.ts`:

1. The test "announces once per achievement and not again on a second run" now sees `first-solve` too. Change its expectations to:

```ts
  expect(announceUnlock).toHaveBeenCalledTimes(2);
  expect(announceUnlock).toHaveBeenCalledWith({ kind: 'achievement', id: 'first-solve' });
  expect(announceUnlock).toHaveBeenCalledWith({ kind: 'achievement', id: 'first-weekly' });
```

and the second-run check to `toHaveBeenCalledTimes(2)`.

2. Append (add `almostThere` and `currentProgress` to the import from `../src/lib/achievements.ts`, and `type AchievementProgress` from `@puzzle-hustle/core`):

```ts
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
```

(`after` and `rehydrate` already exist in that file; if `rehydrate` is not imported there, import it from `../src/lib/storage.ts`.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @puzzle-hustle/web exec vitest run test/achievements.test.ts`
Expected: FAIL, `almostThere` and `currentProgress` are not exported.

- [ ] **Step 3: Implement**

In `apps/web/src/lib/achievements.ts`, extend the core import with `achievementProgress, type AchievementProgress` and add after `currentUnlocked`:

```ts
export function currentProgress(): AchievementProgress[] {
  return achievementProgress(storedSolves());
}

// The "Almost there" strip: unearned counters already started, closest first. Only the lowest
// locked rung of a ladder counts, so three streak rungs never fill the strip together; progress
// comes in catalog order, which is lowest rung first and also breaks ties.
export function almostThere(
  progress: readonly AchievementProgress[],
  unlocked: ReadonlySet<string>,
  limit = 3,
): AchievementProgress[] {
  const seen = new Set<string>();
  const open: { entry: AchievementProgress; order: number }[] = [];
  progress.forEach((entry, order) => {
    if (unlocked.has(entry.id) || seen.has(entry.counter)) return;
    seen.add(entry.counter);
    if (entry.current > 0) open.push({ entry, order });
  });
  open.sort((a, b) => b.entry.current / b.entry.target - a.entry.current / a.entry.target || a.order - b.order);
  return open.slice(0, limit).map((o) => o.entry);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @puzzle-hustle/web exec vitest run test/achievements.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/achievements.ts apps/web/test/achievements.test.ts
git commit -F - <<'EOF'
Pick the next achievement goals from progress

Implemented with assistance from Claude Opus 5.5.
EOF
```

---

### Task 4: Achievement icons

**Files:**
- Create: `apps/web/src/components/AchievementIcon.tsx`
- Modify: `apps/web/src/theme.css` (new `.ach-*` rules next to the old `.achievement` rules, which stay until Task 5)
- Test: `apps/web/test/achievementIcon.test.ts`

**Interfaces:**
- Consumes: `Achievement` from Task 1, `PuzzleIcon` (`components/PuzzleIcon.tsx`, props `{ type, size }`).
- Produces: `AchievementIcon({ achievement, earned, share, size }: { achievement: Achievement; earned: boolean; share?: number; size?: number })`. `share` in 0..1 draws the progress ring on a locked badge; default size 52.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/achievementIcon.test.ts`:

```ts
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ACHIEVEMENTS } from '@puzzle-hustle/core';
import { AchievementIcon, GENERAL_ICONS } from '../src/components/AchievementIcon.tsx';

it('has a drawn icon for every general achievement', () => {
  for (const a of ACHIEVEMENTS.filter((x) => !x.type)) expect(GENERAL_ICONS[a.id], a.id).toBeTruthy();
});

it('marks earned badges, and draws a ring only on locked ones with progress', () => {
  const a = ACHIEVEMENTS.find((x) => x.id === 'streak-30')!;
  const earned = renderToStaticMarkup(createElement(AchievementIcon, { achievement: a, earned: true, share: 1 }));
  const locked = renderToStaticMarkup(createElement(AchievementIcon, { achievement: a, earned: false, share: 0.4 }));
  const bare = renderToStaticMarkup(createElement(AchievementIcon, { achievement: a, earned: false }));
  expect(earned).toContain('ach-disc earned');
  expect(earned).not.toContain('ach-ring');
  expect(locked).toContain('ach-ring');
  expect(locked).toContain('--share:40%');
  expect(bare).not.toContain('ach-ring');
});

it('uses the puzzle icon plus a corner mark for type achievements', () => {
  const speed = renderToStaticMarkup(createElement(AchievementIcon, { achievement: ACHIEVEMENTS.find((x) => x.id === 'zip-speed')!, earned: false }));
  const genius = renderToStaticMarkup(createElement(AchievementIcon, { achievement: ACHIEVEMENTS.find((x) => x.id === 'sudoku-genius')!, earned: false }));
  const volume = renderToStaticMarkup(createElement(AchievementIcon, { achievement: ACHIEVEMENTS.find((x) => x.id === 'zip-100')!, earned: false }));
  expect(speed).toContain('puzzle-icon');
  expect(speed).toContain('ach-corner speed');
  expect(genius).toContain('ach-corner genius');
  expect(volume).not.toContain('ach-corner');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @puzzle-hustle/web exec vitest run test/achievementIcon.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/AchievementIcon.tsx`:

```tsx
import type { CSSProperties, ReactNode } from 'react';
import type { Achievement } from '@puzzle-hustle/core';
import { PuzzleIcon } from './PuzzleIcon.tsx';

const calendar = 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4';
const flame = 'M12 3c.5 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.6 1.4-4 2.4-5.6.6 1.3 1.5 2 2.6 2.3-.4-2.2-.4-4.4 0-6.7z';
const star = 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z';
const layers = 'M4 8l8-4 8 4-8 4zM4 12l8 4 8-4M4 16l8 4 8-4';

// 24-unit line drawings in currentColor, so they follow theme and accent. The store icons are
// rendered from the same paths later.
export const GENERAL_ICONS: Record<string, string> = {
  'first-solve': 'M5 12.5l4.5 4.5L19 7.5',
  'every-type': 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  'daily-no-hint': 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3zM4 4l16 16',
  'first-weekly': `${calendar}M8 14h8`,
  'first-monthly': `${calendar}M9 15l2 2 4-4`,
  'first-genius': 'M3 18h18L19 7l-4 4-3-6-3 6-4-4z',
  'streak-3': flame,
  'streak-7': flame,
  'streak-30': flame,
  'streak-100': flame,
  'streak-365': flame,
  'perfect-day': star,
  'perfect-10': `${star}M12 9v4`,
  'perfect-day-no-hint': 'M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z',
  'solved-50': layers,
  'solved-250': layers,
  'solved-1000': layers,
  'weekly-10': `${calendar}M8 14h2M11 14h2M14 14h2M8 17h2`,
  'night-owl': 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  'early-bird': 'M4 18h16M7 18a5 5 0 0 1 10 0M12 7v3M5.6 10.6l1.8 1.8M18.4 10.6l-1.8 1.8',
};

const CORNER_PATHS = {
  speed: 'M12 8v4l2.5 2.5M9 3h6M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  genius: 'M3 18h18L19 7l-4 4-3-6-3 6-4-4z',
};

function Line({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="ach-glyph" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function AchievementIcon({
  achievement,
  earned,
  share,
  size = 52,
}: {
  achievement: Achievement;
  earned: boolean;
  share?: number;
  size?: number;
}) {
  const corner = achievement.id.endsWith('-speed') ? 'speed' : achievement.id.endsWith('-genius') ? 'genius' : null;
  let inner: ReactNode;
  if (achievement.type) inner = <PuzzleIcon type={achievement.type} size={Math.round(size * 0.62)} />;
  else inner = <Line d={GENERAL_ICONS[achievement.id] ?? GENERAL_ICONS['first-solve']!} />;

  const ring = !earned && share !== undefined && share > 0;
  const style = { width: size, height: size, ...(ring ? { '--share': `${Math.round(share * 100)}%` } : {}) } as CSSProperties;

  return (
    <span className={earned ? 'ach-disc earned' : 'ach-disc'} style={style} aria-hidden="true">
      {ring && <span className="ach-ring" />}
      <span className="ach-inner">{inner}</span>
      {corner && (
        <span className={`ach-corner ${corner}`}>
          <Line d={CORNER_PATHS[corner]} />
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 4: Add the styles**

Append to `apps/web/src/theme.css` (after the unlock-modal block):

```css
/* Achievement badges: a round disc, filled with the accent when earned, muted when locked. A
   locked counter shows how far along it is as a ring (conic gradient in --share). */
.ach-disc {
  position: relative;
  display: inline-grid;
  place-items: center;
  flex: none;
  border-radius: 50%;
  background: var(--board-cell);
  border: 1px solid var(--border);
  color: var(--text-muted);
}
.ach-disc.earned {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
  box-shadow: 0 2px 8px var(--accent-strong);
}
.ach-ring {
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  background: conic-gradient(var(--accent) var(--share), transparent 0);
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));
}
.ach-inner { display: grid; place-items: center; width: 56%; height: 56%; }
.ach-disc:not(.earned) .ach-inner { opacity: 0.55; }
.ach-inner .puzzle-icon { background: none; border: none; }
.ach-glyph { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.ach-corner {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 38%;
  height: 38%;
  padding: 3px;
  border-radius: 50%;
  background: var(--card-bg);
  border: 1px solid var(--border);
  color: var(--accent-deep);
}
```

Check that `--on-accent` and `--board-cell` exist in `theme.css` (both are used by existing components; `grep -n "on-accent\|board-cell" apps/web/src/theme.css`). If `--on-accent` is missing, use `#fff`.

- [ ] **Step 5: Run to verify pass, then commit**

Run: `pnpm --filter @puzzle-hustle/web exec vitest run test/achievementIcon.test.ts`
Expected: PASS.

```bash
git add apps/web/src/components/AchievementIcon.tsx apps/web/src/theme.css apps/web/test/achievementIcon.test.ts
git commit -F - <<'EOF'
Draw a round badge for every achievement

General achievements get line icons in currentColor, type achievements the
puzzle icon with a stopwatch or crown for their signature, and locked
counters a progress ring.

Implemented with assistance from Claude Opus 5.5.
EOF
```

---

### Task 5: Achievements page, layout C

**Files:**
- Modify: `apps/web/src/pages/Achievements.tsx` (full rewrite)
- Modify: `apps/web/src/theme.css` (remove the six `.achievement*` rules at the old lines 267-272, add `.ach-*` page rules)
- Test: `apps/web/test/achievementsPage.test.ts` (full rewrite)

**Interfaces:**
- Consumes: `ACHIEVEMENTS`, `ACHIEVEMENT_COINS`, `PUZZLE_TYPES`, `PUZZLE_META`, `ACTIVITY_FLAIRS` from core; `currentUnlocked`, `currentProgress`, `almostThere` (Task 3); `AchievementIcon` (Task 4); `pushBackGuard`, `handleBackPress` (`lib/back.ts`); `CoinPill`.
- Produces: `Achievements()` page component, route unchanged (`/achievements`).

- [ ] **Step 1: Write the failing tests**

Replace `apps/web/test/achievementsPage.test.ts` with:

```ts
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { ACHIEVEMENTS, ACHIEVEMENTS_EPOCH } from '@puzzle-hustle/core';
import { Achievements } from '../src/pages/Achievements.tsx';
import { handleBackPress } from '../src/lib/back.ts';
import { rehydrate } from '../src/lib/storage.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const at = new Date(ACHIEVEMENTS_EPOCH + 86400000).toISOString();

function seed(solves: Record<string, { seconds?: number; hints?: number }>) {
  const out: Record<string, unknown> = {};
  for (const [id, s] of Object.entries(solves)) out[id] = { solvedAt: at, seconds: s.seconds ?? 600, hints: s.hints ?? 0, moves: 10 };
  localStorage.setItem('ph:solves', JSON.stringify(out));
  rehydrate();
}

function render() {
  act(() => root.render(createElement(Achievements)));
}

const badges = () => [...container.querySelectorAll('.ach-cabinet .ach-badge')];
const chip = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('.ach-chip')].find((c) => c.textContent === label)!;

beforeEach(() => {
  localStorage.clear();
  rehydrate();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it('fresh profile: all forty badges, none earned, no Almost there strip', () => {
  render();
  expect(badges()).toHaveLength(40);
  expect(container.querySelectorAll('.ach-disc.earned')).toHaveLength(0);
  expect(container.querySelector('.ach-next')).toBeNull();
  expect(container.textContent).toContain('0 of 40 earned');
});

it('marks earned badges and counts them in the head', () => {
  seed({ 'zip:weekly:2026-W39': {} });
  render();
  expect(container.textContent).toContain('2 of 40 earned');
  const earned = badges().filter((b) => b.querySelector('.ach-disc.earned'));
  expect(earned.map((b) => b.textContent).sort()).toEqual(['Hello, Hustler', 'Weekender']);
});

it('shows the closest started counters under Almost there', () => {
  seed(Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`zip:medium:s${i}`, {}])));
  render();
  const next = [...container.querySelectorAll('.ach-next .ach-next-card')].map((c) => c.textContent);
  // solved 40/50 (0.8), Zip 40/100 (0.4), daily types 1/9 (0.11); streaks and weeklies untouched.
  expect(next).toHaveLength(3);
  expect(next[0]).toContain('Getting Hooked');
  expect(next[0]).toContain('40/50');
  expect(next[1]).toContain('Zip Fan');
  expect(next[1]).toContain('40/100');
  expect(next[2]).toContain('Sampler');
});

it('filters by chip: General shows twenty, a type shows its two', () => {
  render();
  act(() => chip('General').click());
  expect(badges()).toHaveLength(20);
  act(() => chip('Zip').click());
  expect(badges().map((b) => b.textContent)).toEqual(['Zip Fan', 'Lightning']);
  act(() => chip('All').click());
  expect(badges()).toHaveLength(ACHIEVEMENTS.length);
});

it('opens a detail card with description, progress, coins and flair', () => {
  seed(Object.fromEntries(Array.from({ length: 3 }, (_, i) => [`zip:medium:s${i}`, {}])));
  render();
  const thousand = badges().find((b) => b.textContent === 'Thousand Club')!;
  act(() => (thousand as HTMLButtonElement).click());
  const card = container.querySelector('[role="dialog"]')!;
  expect(card.textContent).toContain('Solve 1000 puzzles.');
  expect(card.textContent).toContain('3/1000');
  expect(card.textContent).toContain('+25 coins');
  expect(card.textContent).toContain('Veteran');
});

it('closes the detail card on back and hands the back button back', () => {
  render();
  act(() => (badges()[0] as HTMLButtonElement).click());
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  let outcome = '';
  act(() => {
    outcome = handleBackPress(true);
  });
  expect(outcome).toBe('guarded');
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(handleBackPress(true)).toBe('back');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @puzzle-hustle/web exec vitest run test/achievementsPage.test.ts`
Expected: FAIL, no `.ach-badge` elements.

- [ ] **Step 3: Rewrite the page**

Replace `apps/web/src/pages/Achievements.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import {
  ACHIEVEMENT_COINS,
  ACHIEVEMENTS,
  ACTIVITY_FLAIRS,
  PUZZLE_META,
  PUZZLE_TYPES,
  type Achievement,
  type AchievementProgress,
  type PuzzleTypeId,
} from '@puzzle-hustle/core';
import { almostThere, currentProgress, currentUnlocked } from '../lib/achievements.ts';
import { pushBackGuard } from '../lib/back.ts';
import { AchievementIcon } from '../components/AchievementIcon.tsx';
import { CoinPill } from '../components/CoinPill.tsx';

type Filter = 'all' | 'general' | PuzzleTypeId;

const FLAIR_OF = new Map(
  ACTIVITY_FLAIRS.flatMap((f) => ('achievement' in f.requires ? [[f.requires.achievement, f.title] as const] : [])),
);

function matches(a: Achievement, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'general') return !a.type;
  return a.type === filter;
}

export function Achievements() {
  const unlocked = currentUnlocked();
  const progress = currentProgress();
  const byId = new Map(progress.map((p) => [p.id, p]));
  const next = almostThere(progress, unlocked);
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Achievement | null>(null);

  const share = (p: AchievementProgress | undefined) => (p ? p.current / p.target : undefined);
  const chips: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'general', label: 'General' },
    ...PUZZLE_TYPES.map((t) => ({ id: t, label: PUZZLE_META[t].name })),
  ];

  return (
    <>
      <section className="page-head">
        <h1>Achievements</h1>
        <p className="muted small">
          {unlocked.size} of {ACHIEVEMENTS.length} earned
        </p>
        <CoinPill />
      </section>
      <div className="ach-total" aria-hidden="true">
        <i style={{ width: `${(unlocked.size / ACHIEVEMENTS.length) * 100}%` }} />
      </div>

      {next.length > 0 && (
        <section className="ach-next">
          <h2>Almost there</h2>
          <div className="ach-next-row">
            {next.map((p) => {
              const a = ACHIEVEMENTS.find((x) => x.id === p.id)!;
              return (
                <button key={p.id} type="button" className="card-lg ach-next-card" onClick={() => setOpen(a)}>
                  <AchievementIcon achievement={a} earned={false} share={share(p)} size={40} />
                  <b>{a.title}</b>
                  <span className="muted small">
                    {p.current}/{p.target}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="ach-chips" role="tablist" aria-label="Filter achievements">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={filter === c.id}
            className={filter === c.id ? 'ach-chip active' : 'ach-chip'}
            onClick={() => setFilter(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <section className="card-lg ach-cabinet">
        {ACHIEVEMENTS.filter((a) => matches(a, filter)).map((a) => (
          <button key={a.id} type="button" className="ach-badge" onClick={() => setOpen(a)}>
            <AchievementIcon achievement={a} earned={unlocked.has(a.id)} share={share(byId.get(a.id))} />
            <span className="ach-badge-title">{a.title}</span>
          </button>
        ))}
      </section>

      {open && (
        <AchievementCard
          achievement={open}
          earned={unlocked.has(open.id)}
          progress={byId.get(open.id)}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function AchievementCard({
  achievement,
  earned,
  progress,
  onClose,
}: {
  achievement: Achievement;
  earned: boolean;
  progress: AchievementProgress | undefined;
  onClose: () => void;
}) {
  useEffect(
    () =>
      pushBackGuard(() => {
        onClose();
        return true;
      }),
    [onClose],
  );
  const flair = FLAIR_OF.get(achievement.id);

  return (
    <div className="ad-ask" role="dialog" aria-modal="true" aria-label={achievement.title} onClick={onClose}>
      <div className="card-lg ach-card" onClick={(e) => e.stopPropagation()}>
        <AchievementIcon
          achievement={achievement}
          earned={earned}
          share={progress ? progress.current / progress.target : undefined}
          size={72}
        />
        <span className="unlock-eyebrow">{earned ? 'Earned' : 'Locked'}</span>
        <b className="unlock-title">{achievement.title}</b>
        <span className="muted unlock-desc">{achievement.description}</span>
        {!earned && progress && (
          <span className="small">
            {progress.current}/{progress.target}
          </span>
        )}
        <span className="coin-line">+{ACHIEVEMENT_COINS} coins</span>
        {flair && <span className="unlock-flair-action">Flair: {flair}</span>}
        <div className="ad-ask-row">
          <button type="button" className="pill" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
```

Note: `onClose` is a new arrow each render, so the effect re-pushes the guard on every render of the card. That is harmless here (the card is the top overlay and re-pushing keeps it on top), but if the React Compiler does not memoize it, prefer a ref as `lib/back.ts` describes: keep `onClose` in a `useRef`, push once with `[]`, and read `ref.current()` inside the guard.

- [ ] **Step 4: Styles**

In `apps/web/src/theme.css`, delete the six old rules starting `.achievement {`, `.achievement-mark`, `.achievement.earned .achievement-mark`, `.achievement-text`, `.achievement-title`, `.achievement:not(.earned) .achievement-title` (confirm with `grep -rn "achievement-\|\"achievement\b" apps/web/src` that nothing else uses them). Append:

```css
.ach-total { height: 6px; margin: -4px 0 16px; border-radius: 3px; background: var(--border); overflow: hidden; }
.ach-total i { display: block; height: 100%; background: var(--accent); border-radius: 3px; }

.ach-next h2 { margin: 0 0 8px; }
.ach-next-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 16px; }
.ach-next-card {
  display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 6px;
  text-align: center; font: inherit; color: inherit; cursor: pointer; min-width: 0;
}
.ach-next-card b { font-size: var(--fs-sm); overflow-wrap: anywhere; }

.ach-chips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; margin-bottom: 12px; scrollbar-width: none; }
.ach-chips::-webkit-scrollbar { display: none; }
.ach-chip {
  flex: none; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--border);
  background: var(--card-bg); color: var(--text); font: inherit; font-size: var(--fs-sm); cursor: pointer;
}
.ach-chip.active { background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 700; }

.ach-cabinet { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 14px 8px; }
.ach-badge {
  display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 4px 0;
  background: none; border: none; font: inherit; color: inherit; cursor: pointer; min-width: 0;
}
.ach-badge-title { font-size: var(--fs-xs); line-height: 1.2; text-align: center; overflow-wrap: anywhere; }

.ach-card { max-width: 20rem; padding: 22px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; }
```

- [ ] **Step 5: Run the web suite and typecheck**

Run: `pnpm --filter @puzzle-hustle/web test` then `pnpm -r typecheck`
Expected: PASS. If `profile` tests pin "of 18", change them to `of ${ACHIEVEMENTS.length}`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/Achievements.tsx apps/web/src/theme.css apps/web/test/achievementsPage.test.ts
git commit -F - <<'EOF'
Rebuild the achievements page as a badge cabinet

Next goals on top, filter chips for general and each puzzle type, round
badges with progress rings, and a detail card with progress, coins and
the flair an achievement grants.

Implemented with assistance from Claude Opus 5.5.
EOF
```

---

### Task 6: Verify in the browser

**Files:** none unless a defect turns up (fix it in the file it belongs to, with a test where one can pin it).

- [ ] **Step 1: Full suite**

Run from the repo root: `pnpm test` and `pnpm -r typecheck`
Expected: all PASS.

- [ ] **Step 2: Browser check**

Run `pnpm dev`, open `/achievements` at 390 px width. Check with three profiles, each set via DevTools `localStorage.setItem('ph:solves', …)` and a reload:
1. empty: no strip, 40 grey badges, chips scroll sideways without the page scrolling sideways;
2. mid-progress (a few dailies and ~40 random solves): strip shows up to three cards, rings visible on locked counters;
3. many unlocks: earned badges in the accent colour, text readable on them.

Do each in light and dark and with two accent colours from Profile. Tap a badge, close with the button, with a tap outside, and (on Android, or via `handleBackPress` in tests) with back. Emulate `prefers-reduced-motion` and confirm nothing animates.

- [ ] **Step 3: Report**

Report what was checked and any defect found and fixed. Do not bump the Android `versionCode` or build a release; that is a separate step Moritz starts.
