# Achievements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seventeen private achievements, derived from the solve history the app already keeps, announced when earned and listed on their own page.

**Architecture:** Definitions and evaluation live in `packages/core` as a pure function of the solve history and an epoch, so a later Play Games or Game Center integration reports the same unlocks rather than becoming a second source of truth. The web app stores only which achievements have already been announced; the unlocked set is always recomputed.

**Tech Stack:** TypeScript 7.0.2, Vitest 5 (core) / Vitest 5 with jsdom (web), React 19.

**Spec:** `docs/superpowers/specs/2026-09-22-achievements-design.md`

## Global Constraints

- `packages/core` stays DOM-free and dependency-free, and must not learn the web app's storage shapes.
- Every achievement is derivable from the solve history alone. No new tracking, no new stored shape beyond the announced list.
- Nothing in the post-solve path may throw. A player must never lose their finished-puzzle screen over a collectible, the same rule the score queue follows.
- Achievements require no account and no network. They work signed out.
- All user-visible strings are English. Light and dark both work, tokens from `theme.css`, nothing hardcoded that bypasses `[data-accent]`.
- `apps/web` and `apps/api` typecheck under `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. Under the last one an optional property must be omitted, not set to `undefined`.
- Stage files explicitly with `git add <paths>`, never `git add -A`.
- Commit subject: imperative, plain English, no `feat:`/`fix:` prefix. Blank line, then exactly `Implemented with assistance from Claude Opus 5.` No `Co-Authored-By` trailer.
- Verify with `pnpm -r test` and `pnpm -r typecheck`. The suite is at 220 tests and must stay green.

---

### Task 1: Read any solve id

`refId` produces three shapes and `parsePuzzleId` deliberately understands only one of them. Achievements need the type and difficulty of every solve, and need to recognise level solves.

**Files:**
- Create: `packages/core/src/solveId.ts`
- Modify: `packages/core/src/index.ts` (one export line)
- Test: `packages/core/test/solveId.test.ts`

**Interfaces:**
- Consumes: `isDifficulty`, `isPeriod`, `isPuzzleTypeId`, `Difficulty`, `Period`, `PuzzleTypeId` from `./types.ts`; `periodDifficulty` from `./schedule.ts`; `parsePuzzleId` from `./puzzleId.ts`.
- Produces:
  - `type SolveMode = 'period' | 'level' | 'random'`
  - `interface ParsedSolveId { type: PuzzleTypeId; mode: SolveMode; difficulty: Difficulty; period?: Period; key?: string; level?: number }`
  - `parseSolveId(id: string): ParsedSolveId | null`

- [ ] **Step 1: Write the failing test**

`packages/core/test/solveId.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseSolveId } from '../src/solveId.ts';

describe('parseSolveId', () => {
  it('reads a period solve and resolves its difficulty', () => {
    expect(parseSolveId('sudoku:daily:2026-09-22')).toEqual({
      type: 'sudoku',
      mode: 'period',
      difficulty: 'easy',
      period: 'daily',
      key: '2026-09-22',
    });
    expect(parseSolveId('nonogram:weekly:2026-W39')?.difficulty).toBe('hard');
    expect(parseSolveId('nonogram:monthly:2026-09')?.difficulty).toBe('genius');
  });

  it('reads a level solve', () => {
    expect(parseSolveId('shapes:level:genius:12')).toEqual({
      type: 'shapes',
      mode: 'level',
      difficulty: 'genius',
      level: 12,
    });
  });

  it('reads a random solve', () => {
    expect(parseSolveId('zip:medium:1a2b3c')).toEqual({
      type: 'zip',
      mode: 'random',
      difficulty: 'medium',
    });
  });

  it('rejects ids it cannot account for', () => {
    expect(parseSolveId('')).toBeNull();
    expect(parseSolveId('kakuro:daily:2026-09-22')).toBeNull();
    expect(parseSolveId('sudoku:daily:2026-02-30')).toBeNull();
    expect(parseSolveId('sudoku:level:easy:0')).toBeNull();
    expect(parseSolveId('sudoku:level:easy:x')).toBeNull();
    expect(parseSolveId('sudoku:nonsense:1a2b')).toBeNull();
    expect(parseSolveId('sudoku:easy:1a2b:extra')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @puzzle-hustle/core test solveId`
Expected: FAIL, cannot resolve `../src/solveId.ts`.

- [ ] **Step 3: Implement**

`packages/core/src/solveId.ts`:

```ts
import { parsePuzzleId } from './puzzleId.ts';
import { isDifficulty, isPuzzleTypeId, type Difficulty, type Period, type PuzzleTypeId } from './types.ts';

export type SolveMode = 'period' | 'level' | 'random';

export interface ParsedSolveId {
  type: PuzzleTypeId;
  mode: SolveMode;
  difficulty: Difficulty;
  period?: Period;
  key?: string;
  level?: number;
}

// `refId` writes three shapes and nothing records which one it used:
//   type:period:key              a daily, weekly or monthly
//   type:level:difficulty:n      a level from a pack
//   type:difficulty:seed36       a random puzzle
// The first and third both have three segments, so the middle one decides.
export function parseSolveId(id: string): ParsedSolveId | null {
  const parts = id.split(':');

  if (parts.length === 4) {
    const [type, marker, difficulty, level] = parts;
    if (!isPuzzleTypeId(type) || marker !== 'level' || !isDifficulty(difficulty)) return null;
    const n = Number(level);
    if (!Number.isInteger(n) || n < 1) return null;
    return { type, mode: 'level', difficulty, level: n };
  }

  if (parts.length !== 3) return null;

  const period = parsePuzzleId(id);
  if (period) {
    return {
      type: period.type,
      mode: 'period',
      difficulty: period.difficulty,
      period: period.period,
      key: period.key,
    };
  }

  const [type, difficulty] = parts;
  if (!isPuzzleTypeId(type) || !isDifficulty(difficulty)) return null;
  return { type, mode: 'random', difficulty };
}
```

Note for the implementer: `exactOptionalPropertyTypes` is on, so the level and random branches omit `period`, `key` and `level` entirely rather than setting them to `undefined`. That is why each branch builds its own object literal instead of one shared one.

- [ ] **Step 4: Export it**

Add to `packages/core/src/index.ts`, next to the existing `export * from './puzzleId.ts';`:

```ts
export * from './solveId.ts';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @puzzle-hustle/core test` then `pnpm -r typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/solveId.ts packages/core/src/index.ts packages/core/test/solveId.test.ts
git commit -m "Read the type and difficulty of any solved puzzle id" -m "Implemented with assistance from Claude Opus 5."
```

---

### Task 2: Move the streak calculation into core

Achievements need streaks, and a second copy would eventually disagree with the profile. The function is already pure and, despite its signature, reads only the keys of the solve record — never the values — so it can take a plain list of ids and stop knowing about the web app's storage shape at all.

**Files:**
- Create: `packages/core/src/streaks.ts`
- Modify: `packages/core/src/index.ts`, `apps/web/src/lib/stats.ts`
- Test: `packages/core/test/streaks.test.ts`

**Interfaces:**
- Consumes: `PUZZLE_TYPES`, `PuzzleTypeId` from `./types.ts`; `periodKey` from `./schedule.ts`.
- Produces:
  - `LAUNCH_DAY: string` (`'2026-09-18'`)
  - `STREAK_MIN: number`
  - `interface DailyStreaks { today: number; current: number; best: number; perfect: number; bestPerfect: number; daysPlayed: number }`
  - `dailyStreaks(ids: Iterable<string>, now?: Date): DailyStreaks`
- `apps/web/src/lib/stats.ts` keeps exporting `LAUNCH_DAY`, `STREAK_MIN` and a `dailyStreaks(solves: Record<string, SolveRecord>, now?: Date)` wrapper, so `Daily.tsx` and `Profile.tsx` need no change.

- [ ] **Step 1: Write the failing test**

`packages/core/test/streaks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PUZZLE_TYPES } from '../src/types.ts';
import { STREAK_MIN, dailyStreaks } from '../src/streaks.ts';

// Berlin noon, so no time zone can move a solve into a neighbouring day.
const at = (day: string) => new Date(`${day}T10:00:00Z`);
const day = (key: string, count: number) => PUZZLE_TYPES.slice(0, count).map((t) => `${t}:daily:${key}`);

describe('dailyStreaks', () => {
  it('counts a day only once it reaches the minimum', () => {
    const one = dailyStreaks(day('2026-09-22', STREAK_MIN - 1), at('2026-09-22'));
    expect(one.current).toBe(0);
    const enough = dailyStreaks(day('2026-09-22', STREAK_MIN), at('2026-09-22'));
    expect(enough.current).toBe(1);
  });

  it('counts consecutive days and remembers the best run', () => {
    const ids = [...day('2026-09-20', 8), ...day('2026-09-21', 8), ...day('2026-09-22', 8)];
    const s = dailyStreaks(ids, at('2026-09-22'));
    expect(s.current).toBe(3);
    expect(s.best).toBe(3);
    expect(s.daysPlayed).toBe(3);
  });

  it('breaks a run on a missed day but keeps the best', () => {
    const ids = [...day('2026-09-18', 8), ...day('2026-09-19', 8), ...day('2026-09-22', 8)];
    const s = dailyStreaks(ids, at('2026-09-22'));
    expect(s.current).toBe(1);
    expect(s.best).toBe(2);
  });

  it('counts a perfect day only when every type is solved', () => {
    const short = dailyStreaks(day('2026-09-22', PUZZLE_TYPES.length - 1), at('2026-09-22'));
    expect(short.perfect).toBe(0);
    const full = dailyStreaks(day('2026-09-22', PUZZLE_TYPES.length), at('2026-09-22'));
    expect(full.perfect).toBe(1);
    expect(full.bestPerfect).toBe(1);
  });

  it('ignores anything that is not a daily', () => {
    const s = dailyStreaks(['sudoku:weekly:2026-W39', 'shapes:level:easy:3', 'zip:medium:1a2b'], at('2026-09-22'));
    expect(s.daysPlayed).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @puzzle-hustle/core test streaks`
Expected: FAIL, cannot resolve `../src/streaks.ts`.

- [ ] **Step 3: Move the implementation**

Create `packages/core/src/streaks.ts` holding what is today in `apps/web/src/lib/stats.ts` lines 4 to 95 — `LAUNCH_DAY`, `STREAK_MIN`, `dayIndex`, `keyOfDayIndex`, `DailyStreaks` and `dailyStreaks` — with two changes:

- the imports become `import { PUZZLE_TYPES, type PuzzleTypeId } from './types.ts';` and `import { periodKey } from './schedule.ts';`, and the `SolveRecord` import disappears;
- the signature becomes `dailyStreaks(ids: Iterable<string>, now: Date = new Date()): DailyStreaks`, and its first loop reads `for (const id of ids)` instead of `for (const id of Object.keys(solves))`.

Everything else, including `dayIndex`, `keyOfDayIndex` and the `run`/`best` helpers, moves across unchanged. Leave `dailyNumber`, `weeklyNumber`, `monthlyNumber`, `typeStats`, `totalSolved` and `formatDateLong` where they are; they are display helpers and belong with the web app.

- [ ] **Step 4: Point the web app at it**

In `apps/web/src/lib/stats.ts`: delete the moved code, and add

```ts
import { dailyStreaks as coreDailyStreaks, type DailyStreaks } from '@puzzle-hustle/core';

export { LAUNCH_DAY, STREAK_MIN, type DailyStreaks } from '@puzzle-hustle/core';

// The record's values were never read here — only its keys, which are refIds.
export function dailyStreaks(solves: Record<string, SolveRecord>, now: Date = new Date()): DailyStreaks {
  return coreDailyStreaks(Object.keys(solves), now);
}
```

`dayIndex` is still used by `dailyNumber` in this file, so keep a local copy of it there.

- [ ] **Step 5: Export from core and verify**

Add `export * from './streaks.ts';` to `packages/core/src/index.ts`.

Run: `pnpm -r test` and `pnpm -r typecheck`
Expected: PASS everywhere, no type errors. `Daily.tsx` and `Profile.tsx` must compile untouched — if either needs a change, stop and report it, because the wrapper is supposed to make them invisible to this move.

- [ ] **Step 6: Check the profile in a browser**

Run `pnpm dev`, open the Profile tab and the Daily tab, and confirm the streak numbers and the daily progress bar read the same as before the move.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/streaks.ts packages/core/src/index.ts packages/core/test/streaks.test.ts apps/web/src/lib/stats.ts
git commit -m "Move the streak calculation into core" -m "Achievements need it too, and a second copy would eventually give the profile and the achievements page different answers about the same run. It only ever read the keys of the solve record, so it now takes a plain list of ids.

Implemented with assistance from Claude Opus 5."
```

---

### Task 3: The achievements themselves

**Files:**
- Create: `packages/core/src/achievements.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/achievements.test.ts`

**Interfaces:**
- Consumes: `parseSolveId` (Task 1), `dailyStreaks` (Task 2), `PUZZLE_TYPES`, `DIFFICULTIES`, `levelList`.
- Produces:
  - `interface SolveEntry { id: string; solvedAt: number; seconds: number; hints: number; moves: number }`
  - `type AchievementGroup = 'arrival' | 'habit' | 'skill' | 'volume' | 'oddity'`
  - `interface Achievement { id: string; title: string; description: string; group: AchievementGroup }`
  - `ACHIEVEMENTS: readonly Achievement[]` — seventeen, in display order
  - `ACHIEVEMENTS_EPOCH: number`
  - `unlockedAchievements(solves: readonly SolveEntry[], epoch?: number): Set<string>`

- [ ] **Step 1: Write the failing test**

`packages/core/test/achievements.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
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

const unlocked = (s: SolveEntry[]) => unlockedAchievements(s, EPOCH);

describe('unlockedAchievements', () => {
  it('has a definition for every id it can return, and no duplicates', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
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
    const run = (days: number) => {
      const out: SolveEntry[] = [];
      for (let i = 0; i < days; i++) {
        const d = new Date(Date.parse('2026-06-01T12:00:00Z') + i * 86400000).toISOString().slice(0, 10);
        out.push(...dailies(d, PUZZLE_TYPES.length));
      }
      return out;
    };
    expect(unlocked(run(2)).has('streak-3')).toBe(false);
    expect(unlocked(run(3)).has('streak-3')).toBe(true);
    expect(unlocked(run(7)).has('streak-7')).toBe(true);
    expect(unlocked(run(7)).has('perfect-week')).toBe(true);
    expect(unlocked(run(29)).has('streak-30')).toBe(false);
    expect(unlocked(run(30)).has('streak-30')).toBe(true);
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
    expect(unlocked(many(250)).has('solved-250')).toBe(true);
    expect(unlocked(many(1000)).has('solved-1000')).toBe(true);
  });

  it('night-owl and early-bird read the device clock, and only count dailies', () => {
    expect(unlocked([solve('zip:daily:2026-06-01', '2026-06-01', 1)]).has('night-owl')).toBe(true);
    expect(unlocked([solve('zip:daily:2026-06-01', '2026-06-01', 5)]).has('night-owl')).toBe(false);
    expect(unlocked([solve('zip:daily:2026-06-01', '2026-06-01', 5)]).has('early-bird')).toBe(true);
    expect(unlocked([solve('zip:daily:2026-06-01', '2026-06-01', 7)]).has('early-bird')).toBe(false);
    expect(unlocked([solve('zip:medium:1a2b', '2026-06-01', 1)]).has('night-owl')).toBe(false);
  });

  it('ships an epoch that is a real instant', () => {
    expect(Number.isFinite(ACHIEVEMENTS_EPOCH)).toBe(true);
    expect(ACHIEVEMENTS_EPOCH).toBeGreaterThan(Date.parse('2026-01-01T00:00:00Z'));
  });
});
```

Note on the two clock tests: `solve` builds its timestamp without a `Z`, so it is parsed in the runner's local zone — which is the zone `night-owl` and `early-bird` are specified to use. That is deliberate; do not "fix" it by adding a `Z`.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @puzzle-hustle/core test achievements`
Expected: FAIL, cannot resolve `../src/achievements.ts`.

- [ ] **Step 3: Implement**

`packages/core/src/achievements.ts`:

```ts
import { levelList } from './levels.ts';
import { parseSolveId } from './solveId.ts';
import { dailyStreaks } from './streaks.ts';
import { DIFFICULTIES, PUZZLE_TYPES, type PuzzleTypeId } from './types.ts';

export interface SolveEntry {
  id: string;
  solvedAt: number;
  seconds: number;
  hints: number;
  moves: number;
}

export type AchievementGroup = 'arrival' | 'habit' | 'skill' | 'volume' | 'oddity';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  group: AchievementGroup;
}

// Nothing solved before this instant counts for anything. The test phase is not meant to
// carry into the release: a player who solved everything while testing starts the official
// release at zero like everyone else. Move this to the production release date when that
// happens; achievements earned before then re-lock, which is intended and belongs in the
// release notes.
export const ACHIEVEMENTS_EPOCH = Date.parse('2026-09-22T00:00:00Z');

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'every-type', title: 'One of each', description: 'Solve at least one puzzle of every type.', group: 'arrival' },
  { id: 'first-weekly', title: 'Weekly done', description: 'Solve a Weekly.', group: 'arrival' },
  { id: 'first-monthly', title: 'Monthly done', description: 'Solve a Monthly.', group: 'arrival' },
  { id: 'first-genius', title: 'Genius', description: 'Solve a puzzle on Genius.', group: 'arrival' },

  { id: 'streak-3', title: 'Three in a row', description: 'Keep a daily streak for 3 days.', group: 'habit' },
  { id: 'streak-7', title: 'A week in a row', description: 'Keep a daily streak for 7 days.', group: 'habit' },
  { id: 'streak-30', title: 'A month in a row', description: 'Keep a daily streak for 30 days.', group: 'habit' },
  { id: 'perfect-week', title: 'Perfect week', description: 'Solve every daily, seven days running.', group: 'habit' },

  { id: 'daily-no-hint', title: 'Unaided', description: 'Solve a daily without a hint.', group: 'skill' },
  { id: 'perfect-day', title: 'Perfect day', description: 'Solve every daily in one day.', group: 'skill' },
  { id: 'perfect-day-no-hint', title: 'Perfect and unaided', description: 'Solve every daily in one day, none with a hint.', group: 'skill' },
  { id: 'pack-complete', title: 'Pack cleared', description: 'Finish every level of one puzzle at one difficulty.', group: 'skill' },

  { id: 'solved-50', title: 'Fifty', description: 'Solve 50 puzzles.', group: 'volume' },
  { id: 'solved-250', title: 'Two hundred and fifty', description: 'Solve 250 puzzles.', group: 'volume' },
  { id: 'solved-1000', title: 'A thousand', description: 'Solve 1000 puzzles.', group: 'volume' },

  { id: 'night-owl', title: 'Night owl', description: 'Solve a daily between midnight and four.', group: 'oddity' },
  { id: 'early-bird', title: 'Early bird', description: 'Solve a daily before six in the morning.', group: 'oddity' },
];

interface Facts {
  types: Set<PuzzleTypeId>;
  weekly: boolean;
  monthly: boolean;
  genius: boolean;
  bestStreak: number;
  bestPerfect: number;
  dailyNoHint: boolean;
  perfectDay: boolean;
  perfectDayNoHint: boolean;
  packComplete: boolean;
  total: number;
  nightOwl: boolean;
  earlyBird: boolean;
}

function gather(solves: readonly SolveEntry[]): Facts {
  const types = new Set<PuzzleTypeId>();
  const levels = new Map<string, Set<number>>();
  const dailiesByDay = new Map<string, { types: Set<PuzzleTypeId>; hinted: boolean }>();
  const facts: Facts = {
    types,
    weekly: false,
    monthly: false,
    genius: false,
    bestStreak: 0,
    bestPerfect: 0,
    dailyNoHint: false,
    perfectDay: false,
    perfectDayNoHint: false,
    packComplete: false,
    total: 0,
    nightOwl: false,
    earlyBird: false,
  };

  for (const entry of solves) {
    const parsed = parseSolveId(entry.id);
    if (!parsed) continue;
    facts.total++;
    types.add(parsed.type);
    if (parsed.difficulty === 'genius') facts.genius = true;

    if (parsed.mode === 'level' && parsed.level !== undefined) {
      const key = `${parsed.type}:${parsed.difficulty}`;
      const seen = levels.get(key) ?? new Set<number>();
      seen.add(parsed.level);
      levels.set(key, seen);
    }

    if (parsed.mode !== 'period' || !parsed.key) continue;
    if (parsed.period === 'weekly') facts.weekly = true;
    if (parsed.period === 'monthly') facts.monthly = true;
    if (parsed.period !== 'daily') continue;

    if (entry.hints === 0) facts.dailyNoHint = true;

    // The player's own night, not Berlin's: unlike a period key, which must put the same
    // puzzle on the same day everywhere, "solved at one in the morning" is about them.
    const hour = new Date(entry.solvedAt).getHours();
    if (hour < 4) facts.nightOwl = true;
    if (hour < 6) facts.earlyBird = true;

    const day = dailiesByDay.get(parsed.key) ?? { types: new Set<PuzzleTypeId>(), hinted: false };
    day.types.add(parsed.type);
    if (entry.hints > 0) day.hinted = true;
    dailiesByDay.set(parsed.key, day);
  }

  for (const day of dailiesByDay.values()) {
    if (day.types.size < PUZZLE_TYPES.length) continue;
    facts.perfectDay = true;
    if (!day.hinted) facts.perfectDayNoHint = true;
  }

  for (const type of PUZZLE_TYPES) {
    for (const difficulty of DIFFICULTIES) {
      const total = levelList(type, difficulty).length;
      if (total === 0) continue;
      if ((levels.get(`${type}:${difficulty}`)?.size ?? 0) >= total) facts.packComplete = true;
    }
  }

  const streaks = dailyStreaks(solves.map((s) => s.id));
  facts.bestStreak = streaks.best;
  facts.bestPerfect = streaks.bestPerfect;

  return facts;
}

const CONDITIONS: Record<string, (f: Facts) => boolean> = {
  'every-type': (f) => f.types.size >= PUZZLE_TYPES.length,
  'first-weekly': (f) => f.weekly,
  'first-monthly': (f) => f.monthly,
  'first-genius': (f) => f.genius,
  'streak-3': (f) => f.bestStreak >= 3,
  'streak-7': (f) => f.bestStreak >= 7,
  'streak-30': (f) => f.bestStreak >= 30,
  'perfect-week': (f) => f.bestPerfect >= 7,
  'daily-no-hint': (f) => f.dailyNoHint,
  'perfect-day': (f) => f.perfectDay,
  'perfect-day-no-hint': (f) => f.perfectDayNoHint,
  'pack-complete': (f) => f.packComplete,
  'solved-50': (f) => f.total >= 50,
  'solved-250': (f) => f.total >= 250,
  'solved-1000': (f) => f.total >= 1000,
  'night-owl': (f) => f.nightOwl,
  'early-bird': (f) => f.earlyBird,
};

export function unlockedAchievements(
  solves: readonly SolveEntry[],
  epoch: number = ACHIEVEMENTS_EPOCH,
): Set<string> {
  const facts = gather(solves.filter((s) => s.solvedAt >= epoch));
  const out = new Set<string>();
  for (const achievement of ACHIEVEMENTS) {
    if (CONDITIONS[achievement.id]?.(facts)) out.add(achievement.id);
  }
  return out;
}
```

One thing to be careful about while typing this: `dailyStreaks` is called with the ids of the *already filtered* list, inside `gather`, so pre-epoch solves cannot contribute to a streak either.

- [ ] **Step 4: Export from core**

Add `export * from './achievements.ts';` to `packages/core/src/index.ts`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @puzzle-hustle/core test` and `pnpm -r typecheck`
Expected: PASS.

If `pack-complete` fails, check what `levelList` actually returns for the type you picked: Shapes ships 50 levels per difficulty and the others 20, and Zip ships only easy and medium. The test uses `levelList` itself rather than a hardcoded count for exactly that reason.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/achievements.ts packages/core/src/index.ts packages/core/test/achievements.test.ts
git commit -m "Define seventeen achievements and work out which are earned" -m "A pure function of the solve history and an epoch: same history in, same set out, nothing stored.

Implemented with assistance from Claude Opus 5."
```

---

### Task 4: Announce newly earned achievements

**Files:**
- Create: `apps/web/src/lib/achievements.ts`
- Modify: `apps/web/src/pages/Play.tsx`, `apps/web/src/main.tsx`
- Test: `apps/web/test/achievements.test.ts`

**Interfaces:**
- Consumes: `ACHIEVEMENTS`, `unlockedAchievements`, `SolveEntry` from `@puzzle-hustle/core`; `readSetting`, `writeSetting` from `./storage.ts`; `toast` from `../components/Toast.tsx`.
- Produces:
  - `currentUnlocked(): Set<string>` — evaluates the stored solve history
  - `pendingAnnouncements(unlocked: Set<string>, announced: readonly string[]): { toAnnounce: string[]; nextAnnounced: string[] }` — pure, exported for its own test
  - `syncAchievements(): void` — evaluates, toasts what is new, writes the announced list; never throws

- [ ] **Step 1: Write the failing test**

`apps/web/test/achievements.test.ts`:

```ts
import { beforeEach, expect, it, vi } from 'vitest';
import { currentUnlocked, pendingAnnouncements, syncAchievements } from '../src/lib/achievements.ts';
import { ACHIEVEMENTS_EPOCH } from '@puzzle-hustle/core';

beforeEach(() => {
  localStorage.clear();
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
  syncAchievements();
  expect(JSON.parse(localStorage.getItem('ph:achievements') ?? '[]')).toEqual([]);
});

it('reads the stored solve history', () => {
  localStorage.setItem(
    'ph:solves',
    JSON.stringify({ 'zip:weekly:2026-W39': { solvedAt: new Date(after).toISOString(), seconds: 60, hints: 0, moves: 10 } }),
  );
  expect(currentUnlocked().has('first-weekly')).toBe(true);
});

it('ignores a stored history it cannot make sense of instead of throwing', () => {
  localStorage.setItem('ph:solves', 'not json');
  expect(() => currentUnlocked()).not.toThrow();
  expect(currentUnlocked().size).toBe(0);

  localStorage.setItem('ph:solves', JSON.stringify({ 'zip:weekly:2026-W39': null, bad: 42 }));
  expect(() => currentUnlocked()).not.toThrow();
});

it('toasts once per achievement and not again on a second run', () => {
  localStorage.setItem(
    'ph:solves',
    JSON.stringify({ 'zip:weekly:2026-W39': { solvedAt: new Date(after).toISOString(), seconds: 60, hints: 0, moves: 10 } }),
  );
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @puzzle-hustle/web test achievements`
Expected: FAIL, cannot resolve `../src/lib/achievements.ts`.

- [ ] **Step 3: Implement**

`apps/web/src/lib/achievements.ts`:

```ts
import { ACHIEVEMENTS, unlockedAchievements, type SolveEntry } from '@puzzle-hustle/core';
import { toast } from '../components/Toast.tsx';
import { readSetting, writeSetting } from './storage.ts';

const KEY = 'ph:achievements';

function storedSolves(): SolveEntry[] {
  try {
    const raw = localStorage.getItem('ph:solves');
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    if (!parsed || typeof parsed !== 'object') return [];
    const out: SolveEntry[] = [];
    for (const [id, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object') continue;
      const record = value as { solvedAt?: unknown; seconds?: unknown; hints?: unknown; moves?: unknown };
      if (typeof record.solvedAt !== 'string') continue;
      const solvedAt = Date.parse(record.solvedAt);
      if (!Number.isFinite(solvedAt)) continue;
      out.push({
        id,
        solvedAt,
        seconds: typeof record.seconds === 'number' ? record.seconds : 0,
        hints: typeof record.hints === 'number' ? record.hints : 0,
        moves: typeof record.moves === 'number' ? record.moves : 0,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function announced(): string[] {
  try {
    const raw = readSetting(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function currentUnlocked(): Set<string> {
  return unlockedAchievements(storedSolves());
}

// Pure, so the one piece of real reasoning here can be tested on its own. An id in the
// announced list that is no longer unlocked is dropped rather than kept: the epoch moves
// forward once, at the production release, and an achievement that re-locks has to be
// earnable — and celebrated — a second time.
export function pendingAnnouncements(
  unlocked: Set<string>,
  announcedIds: readonly string[],
): { toAnnounce: string[]; nextAnnounced: string[] } {
  const known = new Set(announcedIds.filter((id) => unlocked.has(id)));
  const toAnnounce = ACHIEVEMENTS.filter((a) => unlocked.has(a.id) && !known.has(a.id)).map((a) => a.id);
  return { toAnnounce, nextAnnounced: [...known, ...toAnnounce] };
}

// Called after a solve and on start. Must never throw: a player does not lose their finished
// puzzle screen over a collectible.
export function syncAchievements(): void {
  try {
    const unlocked = currentUnlocked();
    const { toAnnounce, nextAnnounced } = pendingAnnouncements(unlocked, announced());
    // Written even when nothing is being announced. When the epoch moves forward an
    // achievement re-locks, and its id has to leave the stored list right then — otherwise it
    // is still in there when the player earns it again, and the second unlock passes silently.
    writeSetting(KEY, JSON.stringify(nextAnnounced));
    for (const id of toAnnounce) {
      const achievement = ACHIEVEMENTS.find((a) => a.id === id);
      if (achievement) toast(`Achievement unlocked: ${achievement.title}`);
    }
  } catch {
    /* a collectible is never worth interrupting anything */
  }
}
```

- [ ] **Step 4: Call it after a solve**

In `apps/web/src/pages/Play.tsx`, inside `onSolved`, directly after the block that enqueues the score, add:

```ts
syncAchievements();
```

with `import { syncAchievements } from '../lib/achievements.ts';` added to the imports. Re-read the file before editing; it has changed several times.

- [ ] **Step 5: Call it on start**

In `apps/web/src/main.tsx`, add `syncAchievements();` after `initQueue();`, with the matching import. Re-read the file first.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @puzzle-hustle/web test` and `pnpm -r typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/achievements.ts apps/web/test/achievements.test.ts apps/web/src/pages/Play.tsx apps/web/src/main.tsx
git commit -m "Announce an achievement the first time it is earned" -m "Implemented with assistance from Claude Opus 5."
```

---

### Task 5: The achievements page

**Files:**
- Create: `apps/web/src/pages/Achievements.tsx`
- Modify: `apps/web/src/App.tsx`, `apps/web/src/pages/Profile.tsx`, `apps/web/src/theme.css`
- Test: in the browser; the page is a list with no logic of its own beyond what Task 3 and 4 already test.

**Interfaces:**
- Consumes: `ACHIEVEMENTS`, `Achievement`, `AchievementGroup` from `@puzzle-hustle/core`; `currentUnlocked` from `../lib/achievements.ts`; `href`, `onLinkClick` from `../lib/router.ts`.
- Produces: the route `/achievements`.

- [ ] **Step 1: Write the page**

`apps/web/src/pages/Achievements.tsx`:

```tsx
import { ACHIEVEMENTS, type AchievementGroup } from '@puzzle-hustle/core';
import { currentUnlocked } from '../lib/achievements.ts';

const GROUPS: { id: AchievementGroup; title: string }[] = [
  { id: 'arrival', title: 'Getting started' },
  { id: 'habit', title: 'Habit' },
  { id: 'skill', title: 'Skill' },
  { id: 'volume', title: 'Volume' },
  { id: 'oddity', title: 'Odd hours' },
];

export function Achievements() {
  const unlocked = currentUnlocked();
  return (
    <>
      <section className="page-head">
        <h1>Achievements</h1>
        <p className="muted small">
          {unlocked.size} of {ACHIEVEMENTS.length} earned
        </p>
      </section>

      {GROUPS.map((group) => (
        <section key={group.id} className="card-lg">
          <h2>{group.title}</h2>
          {ACHIEVEMENTS.filter((a) => a.group === group.id).map((a) => (
            <div key={a.id} className={unlocked.has(a.id) ? 'achievement earned' : 'achievement'}>
              <span className="achievement-mark" aria-hidden="true">
                {unlocked.has(a.id) ? '★' : '☆'}
              </span>
              <span className="achievement-text">
                <span className="achievement-title">{a.title}</span>
                <span className="row-sub">{a.description}</span>
              </span>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
```

- [ ] **Step 2: Style it**

In `apps/web/src/theme.css`, next to the other row styles:

```css
.achievement { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 12px; padding: 6px 0; }
.achievement-mark { font-size: var(--fs-lg); color: var(--border-mid); }
.achievement.earned .achievement-mark { color: var(--accent); }
.achievement-text { display: flex; flex-direction: column; }
.achievement-title { font-weight: 700; }
.achievement:not(.earned) .achievement-title { color: var(--text-muted); }
```

Re-read `theme.css` before editing and confirm `--fs-lg`, `--border-mid`, `--accent` and `--text-muted` all exist in both themes. If one does not, use the nearest token that does rather than inventing a value.

- [ ] **Step 3: Add the route**

In `apps/web/src/App.tsx`, next to the `/friends` branch:

```tsx
else if (route.path === '/achievements') page = <Achievements />;
```

with the matching import. Check how `tabIndex` treats unknown routes in that file: `/friends` and `/join` are handled explicitly, and this route wants the same treatment so it does not trigger a slide animation meant for tab changes.

- [ ] **Step 4: Add the card to the Profile tab**

In `apps/web/src/pages/Profile.tsx`, add a card following the shape of the Friends card, above it:

```tsx
<div className="card-lg">
  <h2>Achievements</h2>
  <span className="muted small">
    {earned} of {ACHIEVEMENTS.length} earned
  </span>
  <div className="friends-actions">
    <a href={href('/achievements')} className="pill outline" onClick={onLinkClick}>
      Show ›
    </a>
  </div>
</div>
```

with `const earned = currentUnlocked().size;` in the component and the matching imports. The `friends-actions` wrapper is there for the same reason as on the Friends card: the card is a flex column, so a bare link would stretch the full width.

- [ ] **Step 5: Check it in the browser**

Run `pnpm dev`. With an empty history the page lists all seventeen as unearned; solve a daily and confirm a toast appears once, that the page then shows it earned, and that a reload does not toast again. Check both themes and phone width — the app keeps a 16px side gutter and no horizontal scroll.

- [ ] **Step 6: Run the checks and commit**

Run: `pnpm -r test` and `pnpm -r typecheck`

```bash
git add apps/web/src/pages/Achievements.tsx apps/web/src/App.tsx apps/web/src/pages/Profile.tsx apps/web/src/theme.css
git commit -m "Show the achievements and what is left to earn" -m "Implemented with assistance from Claude Opus 5."
```

---

## After this plan

- Set `ACHIEVEMENTS_EPOCH` to the production release date when that release goes out, and say in the release notes that achievements earned during the test phase re-lock. The plan ships it at the date the feature reaches the test track so testers exercise it for real.
- Play Games Services and Game Center can now report the same unlocks. Both need their own console setup, their own icons and, for Android, a Capacitor plugin. The unlock logic does not change.
- Hidden achievements, if they are ever wanted, need a flag on `Achievement` and a rule for what the page shows before they are earned.
