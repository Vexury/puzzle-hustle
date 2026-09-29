# Hustle Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An endless "Hustle" mode: one fixed, slowly harder sequence of puzzles across all types, a Hustle level per player with milestone rewards (coins, badges, flairs), a Hustle tab, and the level shown as a chip in the player card.

**Architecture:** The sequence lives in `packages/core` (pure, deterministic, offline): a cheap `hustleSlot(n)` gives type and difficulty, `hustleRef(n)` gives a ref whose seed is resolved in the board worker (or taken from the Zip pool). Progress is derived from `ph:solves` (`hustle:<n>` ids), like coins and flairs. The API stores the level in a new `players.hustle` column, pushed like cosmetics.

**Tech Stack:** TypeScript, React 19 + React Compiler, Vite 8, Vitest 5, Cloudflare Workers + D1 (apps/api), pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-09-30-hustle-mode-design.md`

## Global Constraints

- Tiers: Easy for n <= 40, Medium <= 120, Hard <= 300, Genius from 301; Genius is the plateau.
- Stage N is the same puzzle for every player.
- No skipping; hints as everywhere. Hustle solves give no per-solve coins.
- Milestone every 10 stages: coins `min(100, 20 + 5 * n / 10)`.
- Flairs: 40 Hustle Starter (`hustle-starter`), 120 Hustle Addict (`hustle-addict`), 300 Hustle Grinder (`hustle-grinder`), 500 Hustle Pro (`hustle-pro`), 1000 Hustle Legend (`hustle-legend`).
- Badges (earned only, never bought): 50 `hustle-mountain` Mountain, 100 `hustle-ladder` Ladder, 200 `hustle-arrow` Flame Arrow, 400 `hustle-crown` Crown, 750 `hustle-summit` Summit.
- Only solves at or after `ACHIEVEMENTS_EPOCH` count.
- Hustle level = highest solved stage (0 before the first); the stage to play is level + 1. Tab, chip and profile all show the same number.
- Player card: amber chip "Lv <n>" after name and badge, only when n >= 1.
- Server: `players.hustle INTEGER NOT NULL DEFAULT 0`, `POST /hustle { level }` accepts integers 0..100000 and stores `max(old, new)`.
- Cosmetic ids are forever (see comment in `cosmetics.ts`): add, never rename.
- Every UI change must work in light, dark and all six theme packs; English UI strings.
- Commits end with the body line `Implemented with assistance from Claude Opus 5.5.` and no Co-Authored-By trailer.

## Review Focus

- A link to a stage above the player's level (`?h=999`) opens the player's current stage, not the linked one.
- Right after solving stage n the board stays on n with "Next ›"; it must not jump or reload because the level just moved to n+1.
- Solves with a gap (1..10 and 12 solved, e.g. after a partial restore) give level 10 and stage 11 next, not 12 and 13.
- A device with an older, lower level must not lower the server value (`max`), and a sign-in after offline play pushes the current level.
- Before-epoch Hustle solves count for nothing: level 0, stage 1 next, no rewards.

---

### Task 1: Hustle sequence in the core

**Files:**
- Create: `packages/core/src/hustle.ts`
- Modify: `packages/core/src/index.ts` (export)
- Test: `packages/core/test/hustle.test.ts`

**Interfaces:**
- Produces: `HUSTLE_ROUND: number` (= `PUZZLE_TYPES.length`), `hustleDifficulty(n: number): Difficulty`, `hustleType(n: number): PuzzleTypeId`, `hustleSlot(n: number): { type: PuzzleTypeId; difficulty: Difficulty }`, `hustleMilestoneCoins(n: number): number` (0 if not a milestone).

- [ ] **Step 1: Write the failing test** `packages/core/test/hustle.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { hustleDifficulty, hustleMilestoneCoins, hustleSlot, hustleType, HUSTLE_ROUND } from '../src/hustle.ts';
import { PUZZLE_TYPES } from '../src/types.ts';

describe('hustle sequence', () => {
  it('climbs through the tiers at 40, 120 and 300', () => {
    expect([1, 40, 41, 120, 121, 300, 301, 5000].map(hustleDifficulty)).toEqual(['easy', 'easy', 'medium', 'medium', 'hard', 'hard', 'genius', 'genius']);
  });

  it('plays every type once per round and never the same type twice in a row', () => {
    for (let round = 0; round < 100; round++) {
      const types = Array.from({ length: HUSTLE_ROUND }, (_, i) => hustleType(round * HUSTLE_ROUND + i + 1));
      expect(new Set(types).size).toBe(PUZZLE_TYPES.length);
    }
    for (let n = 2; n <= 1000; n++) expect(hustleType(n), `stage ${n}`).not.toBe(hustleType(n - 1));
  });

  it('is the same for everyone', () => {
    expect(Array.from({ length: 30 }, (_, i) => hustleSlot(i + 1))).toEqual(Array.from({ length: 30 }, (_, i) => hustleSlot(i + 1)));
  });

  it('pays coins every ten stages, growing to 100', () => {
    expect(hustleMilestoneCoins(9)).toBe(0);
    expect(hustleMilestoneCoins(10)).toBe(25);
    expect(hustleMilestoneCoins(50)).toBe(45);
    expect(hustleMilestoneCoins(100)).toBe(70);
    expect(hustleMilestoneCoins(160)).toBe(100);
    expect(hustleMilestoneCoins(1000)).toBe(100);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/core && pnpm vitest run test/hustle.test.ts`
Expected: FAIL, cannot resolve `../src/hustle.ts`.

- [ ] **Step 3: Implement** `packages/core/src/hustle.ts`

```ts
import { hashString, Rng } from './rng.ts';
import { PUZZLE_TYPES, type Difficulty, type PuzzleTypeId } from './types.ts';

// Hustle: one endless sequence, the same for every player. Stage n (from 1) has a fixed type
// and difficulty; the seed is found where the board is built (see hustleRef in ref.ts).
export const HUSTLE_ROUND = PUZZLE_TYPES.length;

const TIERS: readonly { upTo: number; difficulty: Difficulty }[] = [
  { upTo: 40, difficulty: 'easy' },
  { upTo: 120, difficulty: 'medium' },
  { upTo: 300, difficulty: 'hard' },
  { upTo: Number.POSITIVE_INFINITY, difficulty: 'genius' },
];

export function hustleDifficulty(n: number): Difficulty {
  return TIERS.find((t) => n <= t.upTo)!.difficulty;
}

// Each round of ten plays every type once in its own shuffled order. A round never opens with
// the type the previous one closed on, so no type comes twice in a row.
function roundOrder(round: number): PuzzleTypeId[] {
  const order = new Rng(hashString(`hustle-round|${round}`)).shuffle([...PUZZLE_TYPES]);
  if (round > 0) {
    const before = new Rng(hashString(`hustle-round|${round - 1}`)).shuffle([...PUZZLE_TYPES]);
    if (order[0] === before[before.length - 1]) [order[0], order[1]] = [order[1]!, order[0]!];
  }
  return order;
}

export function hustleType(n: number): PuzzleTypeId {
  return roundOrder(Math.floor((n - 1) / HUSTLE_ROUND))[(n - 1) % HUSTLE_ROUND]!;
}

export function hustleSlot(n: number): { type: PuzzleTypeId; difficulty: Difficulty } {
  return { type: hustleType(n), difficulty: hustleDifficulty(n) };
}

export const HUSTLE_MILESTONE = 10;

export function hustleMilestoneCoins(n: number): number {
  return n % HUSTLE_MILESTONE === 0 ? Math.min(100, 20 + 5 * (n / HUSTLE_MILESTONE)) : 0;
}
```

Note: the swap only looks at the previous round's unswapped last element; a swap touches positions 0 and 1 only, so the last element never changes. The test above over 1000 stages guards this.

- [ ] **Step 4: Export and run the test**

Add `export * from './hustle.ts';` to `packages/core/src/index.ts` after the `ref.ts` line.
Run: `cd packages/core && pnpm vitest run test/hustle.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/hustle.ts packages/core/src/index.ts packages/core/test/hustle.test.ts
git commit -m "Hustle: fixed sequence of types and tiers in the core" -m "Implemented with assistance from Claude Opus 5.5."
```

---

### Task 2: Hustle refs, ids and board seeds

**Files:**
- Create: `packages/core/src/boards/pools.ts` (generated)
- Modify: `packages/core/scripts/generate-boards.ts` (write `pools.ts`)
- Modify: `packages/core/src/ref.ts` (`PuzzleRef.hustle`, `hustleRef`, `refId`, `encodeRef`, `decodeRef`)
- Modify: `packages/core/src/solveId.ts` (mode `hustle`)
- Modify: `packages/core/src/boards.ts` (`BoardRef.hustle`, seed resolution in `generateBoard`)
- Test: `packages/core/test/hustle.test.ts` (extend), `packages/core/test/boards.test.ts` (pool constant)

**Interfaces:**
- Consumes: `hustleSlot(n)` from Task 1.
- Produces: `PuzzleRef.hustle?: number`; `hustleRef(n: number): PuzzleRef` (cheap: `seed` is the pool seed for Zip hard/genius, else `0`); `hustleSeed(n: number): number` (runs the adapter, expensive); `refId` returns `hustle:<n>`; `encodeRef` returns `h=<n>`; `decodeRef` reads `h`; `parseSolveId('hustle:47')` returns `{ type, mode: 'hustle', difficulty, level: 47 }`; `POOL_SEEDS: Partial<Record<PuzzleTypeId, Partial<Record<Difficulty, readonly number[]>>>>` in `boards/pools.ts`.

- [ ] **Step 1: Write the failing tests** (append to `packages/core/test/hustle.test.ts`)

```ts
import { decodeRef, encodeRef, hustleRef, refId } from '../src/ref.ts';
import { parseSolveId } from '../src/solveId.ts';
import { POOL_SEEDS } from '../src/boards/pools.ts';
import { generateBoard } from '../src/boards.ts';

describe('hustle refs', () => {
  it('names a stage by its number alone', () => {
    const ref = hustleRef(47);
    expect(ref).toMatchObject({ hustle: 47, ...{ type: ref.type, difficulty: 'medium' } });
    expect(refId(ref)).toBe('hustle:47');
    expect(encodeRef(ref)).toBe('h=47');
    expect(decodeRef('h=47')).toEqual(ref);
    expect(decodeRef('h=47&t=zip&d=genius&s=abc')).toEqual(ref);
    expect(decodeRef('h=0')).toBeNull();
    expect(decodeRef('h=x')).toBeNull();
  });

  it('parses a hustle solve with its slot', () => {
    const ref = hustleRef(301);
    expect(parseSolveId('hustle:301')).toEqual({ type: ref.type, mode: 'hustle', difficulty: 'genius', level: 301 });
    expect(parseSolveId('hustle:0')).toBeNull();
  });

  it('takes Zip hard and genius from the pool, one after another', () => {
    const zipStages: number[] = [];
    for (let n = 121; zipStages.length < 3; n++) if (hustleRef(n).type === 'zip') zipStages.push(n);
    const pool = POOL_SEEDS.zip!.hard!;
    expect(zipStages.map((n) => hustleRef(n).seed)).toEqual(pool.slice(0, 3));
  });

  it('builds the same board for a stage everywhere', () => {
    const ref = hustleRef(3);
    expect(generateBoard(ref)).toEqual(generateBoard({ ...ref }));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/core && pnpm vitest run test/hustle.test.ts`
Expected: FAIL (missing exports / module `boards/pools.ts`).

- [ ] **Step 3: Generate the pool constant**

In `packages/core/scripts/generate-boards.ts`, collect every written pack's `pool` and write `src/boards/pools.ts` after the loop (only when no type filter was given, so a partial run cannot drop other pools):

```ts
const pools: Record<string, unknown> = {};
// inside the per-type loop, after building `pack`:
if (pack.pool) pools[type] = pack.pool;
// after the loop:
if (!ONLY) {
  const out = fileURLToPath(new URL('../src/boards/pools.ts', import.meta.url));
  writeFileSync(
    out,
    `// Written by \`pnpm boards\`, do not edit. The Random pools' seeds, needed synchronously\n// (Hustle maps stages onto them) while the board packs load lazily.\nimport type { Difficulty, PuzzleTypeId } from '../types.ts';\n\nexport const POOL_SEEDS: Partial<Record<PuzzleTypeId, Partial<Record<Difficulty, readonly number[]>>>> = ${JSON.stringify(pools)};\n`,
  );
}
```

The existing pack already holds the pools, so instead of rerunning the six-minute generator, write the file once from `boards/zip.ts`:

```bash
cd packages/core && node --experimental-strip-types -e "import('./src/boards/zip.ts').then(m => { const fs = require('fs'); fs.writeFileSync('src/boards/pools.ts', '// Written by \`pnpm boards\`, do not edit. The Random pools\\' seeds, needed synchronously\\n// (Hustle maps stages onto them) while the board packs load lazily.\\nimport type { Difficulty, PuzzleTypeId } from \\'../types.ts\\';\\n\\nexport const POOL_SEEDS: Partial<Record<PuzzleTypeId, Partial<Record<Difficulty, readonly number[]>>>> = ' + JSON.stringify({ zip: m.default.pool }) + ';\\n'); })"
```

Add to `packages/core/test/boards.test.ts`:

```ts
import { POOL_SEEDS } from '../src/boards/pools.ts';

it('keeps the pool constant in step with the packs', () => {
  for (const type of PUZZLE_TYPES) expect(POOL_SEEDS[type] ?? undefined, type).toEqual(read(type).pool ?? undefined);
});
```

- [ ] **Step 4: Solve ids** — in `packages/core/src/solveId.ts`

Change `export type SolveMode = 'period' | 'level' | 'random';` to `'period' | 'level' | 'random' | 'hustle'`, add `import { hustleSlot } from './hustle.ts';`, and at the top of `parseSolveId` (before the 4-part case):

```ts
  if (parts.length === 2 && parts[0] === 'hustle') {
    const n = Number(parts[1]);
    if (!Number.isInteger(n) || n < 1) return null;
    return { ...hustleSlot(n), mode: 'hustle', level: n };
  }
```

Update the shape comment above the function with `hustle:n  a Hustle stage`.

- [ ] **Step 5: Refs** — in `packages/core/src/ref.ts`

Add `hustle?: number;` to `PuzzleRef`. Add imports `import { hustleSlot } from './hustle.ts';` and `import { POOL_SEEDS } from './boards/pools.ts';`. Add:

```ts
// Cheap: type, difficulty and, where a Random pool exists, the pooled seed. Every other seed is
// found where the board is built (hustleSeed), because finding it runs the generator.
export function hustleRef(n: number): PuzzleRef {
  const { type, difficulty } = hustleSlot(n);
  const pool = POOL_SEEDS[type]?.[difficulty];
  let seed = 0;
  if (pool?.length) {
    let before = 0;
    for (let k = 1; k < n; k++) {
      const slot = hustleSlot(k);
      if (slot.type === type && slot.difficulty === difficulty) before++;
    }
    seed = pool[before % pool.length]!;
  }
  return { type, difficulty, seed, hustle: n };
}

// The first seed the adapter accepts for stage n, like a period's seed.
export function hustleSeed(n: number): number {
  const { type, difficulty } = hustleSlot(n);
  const a = adapter(type);
  let seed = 0;
  for (let attempt = 0; attempt < PERIOD_ATTEMPTS; attempt++) {
    seed = hashString(`hustle|${n}|${attempt}`) % 0xffffffff;
    if (a.accepts(seed, difficulty, a.options(undefined))) break;
  }
  return seed;
}
```

In `refId`, first line: `if (ref.hustle) return \`hustle:${ref.hustle}\`;`. In `encodeRef`, first line: `if (ref.hustle) return new URLSearchParams({ h: String(ref.hustle) }).toString();`. In `decodeRef`, right after `const params = ...`:

```ts
  const hustle = params.get('h');
  if (hustle !== null) {
    const n = Number(hustle);
    return Number.isInteger(n) && n >= 1 ? hustleRef(n) : null;
  }
```

- [ ] **Step 6: Boards** — in `packages/core/src/boards.ts`

Change `export type BoardRef = Pick<PuzzleRef, 'type' | 'seed' | 'difficulty' | 'period'>;` to include `'hustle'`. Import `hustleSeed` from `./ref.ts`. At the top of `generateBoard`:

```ts
  const seed = ref.hustle && ref.seed === 0 ? hustleSeed(ref.hustle) : ref.seed;
  const { difficulty, period } = ref;
```

and remove `seed` from the destructuring that follows. In `apps/web/src/lib/boards.ts` `loadBoard`, carry `hustle` into the posted `board` object: `...(ref.hustle ? { hustle: ref.hustle } : {})`.

- [ ] **Step 7: Run tests and typecheck**

Run: `cd packages/core && pnpm vitest run test/hustle.test.ts test/boards.test.ts` then `cd ../.. && pnpm -r typecheck`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add packages/core apps/web/src/lib/boards.ts
git commit -m "Hustle refs: ids, links and seeds, Zip from the pool" -m "Implemented with assistance from Claude Opus 5.5."
```

---

### Task 3: Level, coins and rewards in the core

**Files:**
- Create: `packages/core/src/hustleProgress.ts`
- Modify: `packages/core/src/coins.ts` (reason `hustle`)
- Modify: `packages/core/src/cosmetics.ts` (earned badges, hustle flairs)
- Modify: `packages/core/src/flairs.ts` (`earnedFlairs` handles `{ hustle }`)
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/hustleProgress.test.ts`

**Interfaces:**
- Consumes: `hustleMilestoneCoins(n)` (Task 1), `parseSolveId` mode `hustle` (Task 2).
- Produces: `hustleSolved(solves: readonly SolveEntry[], epoch?: number): number` (the Hustle level: highest n with 1..n all solved, 0 before the first), `hustleNext(...)` (= solved + 1, the stage to play), `earnedHustleBadges(solves, epoch?): Set<string>`, `HUSTLE_BADGES`, `HUSTLE_FLAIRS`, `BadgeCosmetic.requires?: { hustle: number }`, `FlairRequirement` gains `{ hustle: number }`, `CoinReason` gains `'hustle'`.

- [ ] **Step 1: Write the failing test** `packages/core/test/hustleProgress.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { coinsEarned, coinsForSolve } from '../src/coins.ts';
import { earnedFlairs } from '../src/flairs.ts';
import { earnedHustleBadges, hustleNext, hustleSolved } from '../src/hustleProgress.ts';

const EPOCH = 1_000;
const solve = (n: number, at = 2_000) => ({ id: `hustle:${n}`, solvedAt: at, seconds: 60, hints: 0 });
const upTo = (n: number) => Array.from({ length: n }, (_, i) => solve(i + 1, 2_000 + i));

describe('hustle progress', () => {
  it('counts the unbroken run from stage 1', () => {
    expect(hustleSolved([], EPOCH)).toBe(0);
    expect(hustleNext([], EPOCH)).toBe(1);
    expect(hustleSolved(upTo(46), EPOCH)).toBe(46);
    expect(hustleNext(upTo(46), EPOCH)).toBe(47);
    expect(hustleSolved([...upTo(10), solve(12)], EPOCH)).toBe(10);
  });

  it('ignores solves from before the epoch', () => {
    expect(hustleSolved([solve(1, 500), solve(2, 500)], EPOCH)).toBe(0);
  });

  it('pays coins only on milestones, and nothing per stage', () => {
    const solves = upTo(20);
    expect(coinsForSolve('hustle:9', solves, EPOCH)).toEqual([]);
    expect(coinsForSolve('hustle:10', solves, EPOCH)).toEqual([{ reason: 'hustle', coins: 25 }]);
    expect(coinsForSolve('hustle:20', solves, EPOCH)).toEqual([{ reason: 'hustle', coins: 30 }]);
  });

  it('earns badges and flairs at their stages', () => {
    expect(earnedHustleBadges(upTo(49), EPOCH).has('hustle-mountain')).toBe(false);
    expect(earnedHustleBadges(upTo(50), EPOCH)).toEqual(new Set(['hustle-mountain']));
    expect(earnedFlairs(upTo(39), EPOCH).has('hustle-starter')).toBe(false);
    expect(earnedFlairs(upTo(40), EPOCH).has('hustle-starter')).toBe(true);
    expect(coinsEarned(upTo(40), EPOCH)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/core && pnpm vitest run test/hustleProgress.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `packages/core/src/hustleProgress.ts`

```ts
import { ACHIEVEMENTS_EPOCH, type SolveEntry } from './achievements.ts';
import { COSMETICS, type BadgeCosmetic } from './cosmetics.ts';

// Hustle progress is derived from the solves, like coins and flairs: `hustle:n` ids solved at or
// after the epoch. The Hustle level is the highest stage of the unbroken run from 1 (a gap stops
// the count there); the stage to play next is one above it.
export function hustleSolved(solves: readonly SolveEntry[], epoch: number = ACHIEVEMENTS_EPOCH): number {
  const done = new Set<number>();
  for (const entry of solves) {
    if (entry.solvedAt < epoch) continue;
    const m = /^hustle:(\d+)$/.exec(entry.id);
    if (m) done.add(Number(m[1]));
  }
  let n = 0;
  while (done.has(n + 1)) n++;
  return n;
}

export function hustleNext(solves: readonly SolveEntry[], epoch: number = ACHIEVEMENTS_EPOCH): number {
  return hustleSolved(solves, epoch) + 1;
}

export function earnedHustleBadges(solves: readonly SolveEntry[], epoch: number = ACHIEVEMENTS_EPOCH): Set<string> {
  const solved = hustleSolved(solves, epoch);
  const out = new Set<string>();
  for (const c of COSMETICS) if (c.kind === 'badge' && (c as BadgeCosmetic).requires && solved >= (c as BadgeCosmetic).requires!.hustle) out.add(c.id);
  return out;
}
```

Export from `index.ts`: `export * from './hustleProgress.ts';`.

- [ ] **Step 4: Catalogue** — in `packages/core/src/cosmetics.ts`

Change the badge member of `Cosmetic` to `{ id: string; kind: 'badge'; title: string; price: number; requires?: { hustle: number } }` and `FlairRequirement` to add `| { hustle: number }`. Add after `ACTIVITY_FLAIRS`:

```ts
// Earned only by climbing Hustle, never bought: price 0 and a stage to reach.
export const HUSTLE_BADGES: readonly BadgeCosmetic[] = [
  { id: 'hustle-mountain', kind: 'badge', title: 'Mountain', price: 0, requires: { hustle: 50 } },
  { id: 'hustle-ladder', kind: 'badge', title: 'Ladder', price: 0, requires: { hustle: 100 } },
  { id: 'hustle-arrow', kind: 'badge', title: 'Flame Arrow', price: 0, requires: { hustle: 200 } },
  { id: 'hustle-crown', kind: 'badge', title: 'Crown', price: 0, requires: { hustle: 400 } },
  { id: 'hustle-summit', kind: 'badge', title: 'Summit', price: 0, requires: { hustle: 750 } },
];

export const HUSTLE_FLAIRS: readonly FlairCosmetic[] = [
  { id: 'hustle-starter', kind: 'flair', title: 'Hustle Starter', requires: { hustle: 40 } },
  { id: 'hustle-addict', kind: 'flair', title: 'Hustle Addict', requires: { hustle: 120 } },
  { id: 'hustle-grinder', kind: 'flair', title: 'Hustle Grinder', requires: { hustle: 300 } },
  { id: 'hustle-pro', kind: 'flair', title: 'Hustle Pro', requires: { hustle: 500 } },
  { id: 'hustle-legend', kind: 'flair', title: 'Hustle Legend', requires: { hustle: 1000 } },
];
```

The badge comment above `BADGES` says "No crown (place 1 wears one)": `hustle-crown` shows in the shop and board next to the name, not on place 1; keep it but draw it clearly different from the podium crown (Task 5). Add both lists to `COSMETICS`: `[...BADGES, ...HUSTLE_BADGES, ...flairs, ...ACTIVITY_FLAIRS, ...HUSTLE_FLAIRS, ...THEMES]`.

- [ ] **Step 5: Coins** — in `packages/core/src/coins.ts`

Add `'hustle'` to `CoinReason`, import `hustleMilestoneCoins` from `./hustle.ts`, and in `awardsBySolve` add a branch before the final `else` (the random branch):

```ts
    } else if (parsed.mode === 'hustle' && parsed.level !== undefined) {
      const coins = hustleMilestoneCoins(parsed.level);
      if (coins > 0) awards.push({ reason: 'hustle', coins });
```

- [ ] **Step 6: Flairs** — in `packages/core/src/flairs.ts` `earnedFlairs`

Import `hustleSolved` from `./hustleProgress.ts`; compute `const hustle = hustleSolved(solves, epoch);` once, and before the pack branch:

```ts
    if ('hustle' in req) {
      if (hustle >= req.hustle) out.add(cosmetic.id);
      continue;
    }
```

Also guard `solvedLevelsByPack`'s consumers: `parsed.mode !== 'level'` already excludes hustle.

- [ ] **Step 7: Run all core tests and typecheck**

Run: `cd packages/core && pnpm vitest run` then `cd ../.. && pnpm -r typecheck`
Expected: PASS. Fix any exhaustive switch over `FlairRequirement` or `CoinReason` the typecheck finds (for example `requirementText` in `apps/web/src/lib/flairs.ts`: add `if ('hustle' in req) return \`Reach Hustle level ${req.hustle}.\`;`).

- [ ] **Step 8: Commit**

```bash
git add packages/core apps/web/src/lib/flairs.ts
git commit -m "Hustle progress: level from solves, milestone coins, badges and flairs" -m "Implemented with assistance from Claude Opus 5.5."
```

---

### Task 4: Playing a Hustle stage

**Files:**
- Modify: `apps/web/src/pages/Play.tsx`
- Modify: `apps/web/src/lib/boards.ts` (prefetch)
- Test: `apps/web/test/play.test.ts`

**Interfaces:**
- Consumes: `hustleRef`, `hustleNext`, `refId`, `encodeRef` (Tasks 2, 3); `storedSolves()` from `lib/achievements.ts`.
- Produces: `prefetchBoard(ref: BoardRef): void` in `lib/boards.ts`; `loadBoard` returns a prefetched promise when one exists.

- [ ] **Step 1: Write the failing tests** (append to `apps/web/test/play.test.ts`)

```ts
import { hustleRef } from '@puzzle-hustle/core';

it('opens the current Hustle stage when a link points higher', async () => {
  await mount('h=999');
  expect(container.querySelector('.play-bar h1')?.textContent).toContain('Hustle 1');
});

it('names a Hustle stage in the title', async () => {
  await mount(`h=1`);
  expect(container.querySelector('.play-bar h1')?.textContent).toContain(`Hustle 1`);
  expect(hustleRef(1).hustle).toBe(1);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm vitest run test/play.test.ts`
Expected: FAIL (title shows "Random", level not clamped).

- [ ] **Step 3: Implement in `Play.tsx`**

In `Play()`, after `const ref = decodeRef(params);` and before the `!ref` check, clamp Hustle to the player's stage (checked once per navigation, so a solve on this page does not move it):

```ts
  const stage = ref?.hustle ? Math.min(ref.hustle, hustleNext(storedSolves())) : null;
  const puzzle = ref && stage && stage !== ref.hustle ? hustleRef(stage) : ref;
```

and use `puzzle` instead of `ref` below (the `!ref` check and the `PlayPuzzle` props/key). In `subtitle`: first line `if (ref.hustle) return \`Hustle ${ref.hustle}\`;`. In `backTarget`: first line `if (ref.hustle) return { url: href('/hustle'), label: 'Hustle' };`. In `PlayBoard`: `const replayable = !puzzleRef.period && !puzzleRef.hustle;`. Next to `nextLevel`:

```ts
  const nextHustle = puzzleRef.hustle ? hustleRef(puzzleRef.hustle + 1) : null;
```

and in the solved-card actions, before the `nextLevel` link:

```tsx
          {nextHustle && (
            <a href={href(`/play?${encodeRef(nextHustle)}`)} className="pill" onClick={onNextClick}>
              Next ›
            </a>
          )}
```

Hide the `another` (Random) button for Hustle the same way it is hidden for levels and periods (check the condition around the `Another …` button and add `&& !puzzleRef.hustle`). Prefetch the next stage while this one is open, in `PlayBoard`:

```ts
  useEffect(() => {
    if (puzzleRef.hustle) prefetchBoard(hustleRef(puzzleRef.hustle + 1));
  }, []);
```

Imports: `hustleNext`, `hustleRef` from core, `prefetchBoard` from `../lib/boards.ts`, `storedSolves` is already imported.

- [ ] **Step 4: Prefetch in `lib/boards.ts`**

```ts
// A Hustle stage built ahead while the one before is played, so "Next ›" opens at once. Only
// the latest one is kept.
let ahead: { key: string; spec: Promise<PuzzleSpec> } | null = null;
const keyOf = (ref: BoardRef) => `${ref.type}|${ref.difficulty}|${ref.seed}|${ref.period ?? ''}|${ref.hustle ?? ''}`;

export function prefetchBoard(ref: BoardRef): void {
  const key = keyOf(ref);
  if (ahead?.key === key) return;
  const spec = buildBoard(ref);
  spec.catch(() => {});
  ahead = { key, spec };
}
```

Rename the body of the current `loadBoard` to `async function buildBoard(ref: BoardRef)`, and make `loadBoard` check the prefetch first:

```ts
export function loadBoard(ref: BoardRef): Promise<PuzzleSpec> {
  if (ahead?.key === keyOf(ref)) {
    const { spec } = ahead;
    ahead = null;
    return spec;
  }
  return buildBoard(ref);
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `cd apps/web && pnpm vitest run test/play.test.ts` then `cd ../.. && pnpm -r typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/Play.tsx apps/web/src/lib/boards.ts apps/web/test/play.test.ts
git commit -m "Hustle stages in the player: title, Next, clamp, prefetch" -m "Implemented with assistance from Claude Opus 5.5."
```

---

### Task 5: Hustle badges, shop and unlock card

**Files:**
- Modify: `apps/web/src/components/BadgeIcon.tsx` (five shapes and motions)
- Modify: `apps/web/src/lib/coins.ts` (`owned()`, no buying earned badges)
- Create: `apps/web/src/lib/hustle.ts` (`syncHustleBadges`)
- Modify: `apps/web/src/components/UnlockModal.tsx` (row kind `badge`)
- Modify: `apps/web/src/pages/Shop.tsx` (sort and labels)
- Modify: `apps/web/src/main.tsx` and `apps/web/src/pages/Play.tsx` (call `syncHustleBadges` next to `syncFlairs`)
- Test: `apps/web/test/shop.test.ts`, `apps/web/test/unlockModal.test.ts`

**Interfaces:**
- Consumes: `HUSTLE_BADGES`, `earnedHustleBadges` (Task 3).
- Produces: `syncHustleBadges(): void`; `UnlockItem` gains `{ kind: 'badge'; id: string }`; `itemState` returns `'owned' | 'locked'` for earned-only badges regardless of balance.

- [ ] **Step 1: Write the failing tests**

In `apps/web/test/shop.test.ts`:

```ts
it('never offers an earned-only badge for coins', () => {
  expect(itemState('hustle-mountain', new Set(), none, 1_000_000)).toBe('locked');
  expect(itemState('hustle-mountain', new Set(['hustle-mountain']), none, 0)).toBe('owned');
});
```

In `apps/web/test/unlockModal.test.ts` (use the file's existing `buildUnlockRows` import):

```ts
it('shows an earned badge as its own row', () => {
  const rows = buildUnlockRows([{ kind: 'badge', id: 'hustle-mountain' }], null);
  expect(rows).toMatchObject([{ kind: 'badge', id: 'hustle-mountain', title: 'Mountain', description: 'Reach Hustle level 50.' }]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm vitest run test/shop.test.ts test/unlockModal.test.ts`
Expected: FAIL (`buyable` returned; unknown kind `badge`).

- [ ] **Step 3: Shop state** — in `apps/web/src/pages/Shop.tsx` `itemState`

After the owned check: `if (item.kind === 'badge' && item.requires) return 'locked';` (move the `const item = …` lookup above it). In the `BADGES` constant, sort earned-only badges last: `.sort((a, b) => (a.requires ? 1 : 0) - (b.requires ? 1 : 0) || a.price - b.price)`. In `badgeLabel`, for a locked earned-only badge return `Hustle ${item.requires.hustle}`; in `tapBadge`, a locked earned-only badge shows `toast(\`Reach Hustle level ${item.requires.hustle}\`)` instead of the coins toast. In `apps/web/src/lib/coins.ts` `buyItem`, refuse `item.kind === 'badge' && item.requires`.

- [ ] **Step 4: Ownership** — in `apps/web/src/lib/coins.ts` `owned()`

```ts
  return new Set([...ownedItems(readSpent()), ...earnedFlairs(storedSolves()), ...earnedHustleBadges(storedSolves())]);
```

- [ ] **Step 5: Unlock card** — in `UnlockModal.tsx`

Extend `UnlockItem` with `| { kind: 'badge'; id: string }`, `isUnlockItem` with `v.kind === 'badge'`, `UnlockRow['kind']` with `'badge'`. In `buildUnlockRows`, add a branch:

```ts
    } else if (item.kind === 'badge') {
      const badge = findCosmetic(item.id);
      if (badge?.kind !== 'badge' || !badge.requires) continue;
      rows.push({ key: `badge:${item.id}`, kind: 'badge', id: item.id, title: badge.title, description: `Reach Hustle level ${badge.requires.hustle}.`, coinsText: null, equipped: false, flair: null });
```

`EYEBROW.badge = 'New badge'`; in `UnlockRowBody` render `<BadgeIcon id={row.id} />` as the mark for badge rows and the description branch like flairs without the wear line. Tapping a badge row equips it: in the list, for `row.kind === 'badge'` render the button variant with `onClick={() => equip('badge', row.id)}`.

- [ ] **Step 6: Announcements** — create `apps/web/src/lib/hustle.ts`

```ts
import { earnedHustleBadges, HUSTLE_BADGES } from '@puzzle-hustle/core';
import { announceUnlock } from '../components/UnlockModal.tsx';
import { storedSolves } from './achievements.ts';
import { syncAnnouncements } from './announce.ts';

const BADGES_KEY = 'ph:hustle-badges';
const ORDER = HUSTLE_BADGES.map((b) => b.id);

// Like syncFlairs: after a solve and on app start, never throws.
export function syncHustleBadges(): void {
  syncAnnouncements(BADGES_KEY, () => earnedHustleBadges(storedSolves()), ORDER, (id) => announceUnlock({ kind: 'badge', id }));
}
```

Call `syncHustleBadges()` in `main.tsx` after `syncFlairs();` and in `Play.tsx` wherever `syncFlairs()` is called after a solve.

- [ ] **Step 7: Icons** — in `BadgeIcon.tsx` `SHAPES` (24x24, single colour, filled like the rest)

```tsx
  'hustle-mountain': <path d="M2 20 9 7l3.5 5.5L15 9l7 11Z" />,
  'hustle-ladder': <path fillRule="evenodd" d="M6 2h2.5v3h7V2H18v20h-2.5v-3h-7v3H6Zm2.5 5.5v3h7v-3Zm0 5.5v3.5h7V13Z" />,
  'hustle-arrow': <path d="M12 2 19 10h-4.5v6.5c0 3-1.2 5.5-2.5 5.5s-2.5-2.5-2.5-5.5V10H5Z" />,
  'hustle-crown': <path d="M3 18 2 7l5.5 4.5L12 4l4.5 7.5L22 7l-1 11Zm0 2h18v2H3Z" />,
  'hustle-summit': (
    <>
      <path d="M2 21 10 8l4 6 2-3 6 10Z" />
      <path d="M10 8V2l5 2-5 2" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" fill="none" />
    </>
  ),
```

`MOTIONS`: `'hustle-mountain': 'hop', 'hustle-ladder': 'hop', 'hustle-arrow': 'flicker', 'hustle-crown': 'wiggle', 'hustle-summit': 'wiggle'`. Check each icon in light and dark in the shop grid in the browser (`pnpm dev`, `/shop`, open Badges) and adjust a path if it reads badly at 16 px in the board.

- [ ] **Step 8: Run tests and typecheck**

Run: `cd apps/web && pnpm vitest run` then `cd ../.. && pnpm -r typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web
git commit -m "Hustle rewards: five earned badges, shop labels, unlock card" -m "Implemented with assistance from Claude Opus 5.5."
```

---

### Task 6: The Hustle tab

**Files:**
- Create: `apps/web/src/pages/Hustle.tsx`
- Modify: `apps/web/src/components/TabBar.tsx` (tab and icon)
- Modify: `apps/web/src/App.tsx` (route, `tabIndex`)
- Modify: `apps/web/src/theme.css` (styles)
- Test: `apps/web/test/hustle.test.ts`

**Interfaces:**
- Consumes: `hustleSolved`, `hustleSlot`, `hustleRef`, `hustleMilestoneCoins`, `HUSTLE_BADGES`, `HUSTLE_FLAIRS`, `HUSTLE_MILESTONE`, `PUZZLE_META`, `encodeRef`; `useSolves()` from `lib/storage.ts`; `PuzzleIcon` component.
- Produces: `Hustle` page; `nextMilestones(level: number, count: number): Array<{ n: number; coins: number; badge?: string; flair?: string }>` exported from `Hustle.tsx` for tests.

- [ ] **Step 1: Write the failing test** `apps/web/test/hustle.test.ts`

```ts
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { Hustle, nextMilestones } from '../src/pages/Hustle.tsx';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('lists the next milestones with their rewards', () => {
  expect(nextMilestones(46, 3)).toEqual([
    { n: 50, coins: 45, badge: 'hustle-mountain' },
    { n: 60, coins: 50 },
    { n: 70, coins: 55 },
  ]);
  expect(nextMilestones(35, 1)).toEqual([{ n: 40, coins: 40, flair: 'hustle-starter' }]);
});

it('shows the level, the progress to the next milestone and the next puzzle', () => {
  localStorage.clear();
  const solves: Record<string, unknown> = {};
  for (let n = 1; n <= 46; n++) solves[`hustle:${n}`] = { solvedAt: new Date().toISOString(), seconds: 60, hints: 0, moves: 10 };
  localStorage.setItem('ph:solves', JSON.stringify(solves));
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(createElement(Hustle)));
  expect(container.querySelector('.hustle-level')?.textContent).toBe('46');
  expect(container.querySelectorAll('.hustle-bar .on').length).toBe(6);
  expect(container.textContent).toContain('4 more to Lv 50');
  expect(container.querySelector('a.pill')?.getAttribute('href')).toContain('h=47');
  act(() => root.unmount());
});
```

Note: `ACHIEVEMENTS_EPOCH` must lie before "now" for this test; if it lies in the future in the test environment, stub `solvedAt` after the epoch instead (read `ACHIEVEMENTS_EPOCH` from core and use `new Date(ACHIEVEMENTS_EPOCH + 1000).toISOString()`).

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm vitest run test/hustle.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `apps/web/src/pages/Hustle.tsx`

```tsx
import {
  encodeRef,
  hustleSolved,
  hustleMilestoneCoins,
  hustleRef,
  hustleSlot,
  HUSTLE_BADGES,
  HUSTLE_FLAIRS,
  HUSTLE_MILESTONE,
  PUZZLE_META,
} from '@puzzle-hustle/core';
import { BadgeIcon } from '../components/BadgeIcon.tsx';
import { PuzzleIcon } from '../components/PuzzleIcon.tsx';
import { storedSolves } from '../lib/achievements.ts';
import { href, onLinkClick } from '../lib/router.ts';
import { capitalize } from '../lib/share.ts';
import { useSolves } from '../lib/storage.ts';

const TIER_END: Record<string, number | null> = { easy: 40, medium: 120, hard: 300, genius: null };
const NEXT_TIER: Record<string, string> = { easy: 'Medium', medium: 'Hard', hard: 'Genius' };

// The milestones above the highest solved stage.
export function nextMilestones(solved: number, count: number): Array<{ n: number; coins: number; badge?: string; flair?: string }> {
  const out: Array<{ n: number; coins: number; badge?: string; flair?: string }> = [];
  for (let n = (Math.floor(solved / HUSTLE_MILESTONE) + 1) * HUSTLE_MILESTONE; out.length < count; n += HUSTLE_MILESTONE) {
    const badge = HUSTLE_BADGES.find((b) => b.requires!.hustle === n)?.id;
    const flair = HUSTLE_FLAIRS.find((f) => 'hustle' in f.requires && f.requires.hustle === n)?.id;
    out.push({ n, coins: hustleMilestoneCoins(n), ...(badge ? { badge } : {}), ...(flair ? { flair } : {}) });
  }
  return out;
}

export function Hustle() {
  useSolves();
  // The level is the highest solved stage; the one to play is above it.
  const level = hustleSolved(storedSolves());
  const stage = level + 1;
  const { type, difficulty } = hustleSlot(stage);
  const [next, ...later] = nextMilestones(level, 5);
  const toGo = next!.n - level;
  const tierEnd = TIER_END[difficulty];
  const reward = (m: { coins: number; badge?: string; flair?: string }) =>
    m.badge ? 'new badge' : m.flair ? HUSTLE_FLAIRS.find((f) => f.id === m.flair)!.title : `${m.coins} coins`;
  const filled = level % HUSTLE_MILESTONE;

  return (
    <>
      <section className="page-head">
        <h1>Hustle</h1>
      </section>
      <div className="stack">
        <section className="card-lg hustle-card">
          <span className="muted small">Your Hustle level</span>
          <b className="hustle-level">{level}</b>
          <span className="chip">
            {capitalize(difficulty)}
            {tierEnd ? ` · ${tierEnd - level} to ${NEXT_TIER[difficulty]}` : ''}
          </span>
          <div className="hustle-bar" aria-hidden="true">
            {Array.from({ length: HUSTLE_MILESTONE }, (_, i) => (
              <i key={i} className={i < filled ? 'on' : undefined} />
            ))}
            <span className="hustle-node">{next!.badge ? <BadgeIcon id={next!.badge} /> : '🎁'}</span>
          </div>
          <span className="muted small">
            {toGo} more to Lv {next!.n} · {reward(next!)}
          </span>
        </section>

        <section className="card-lg hustle-next">
          <PuzzleIcon type={type} />
          <span className="hustle-next-text">
            <b>Next: {PUZZLE_META[type].name}</b>
            <span className="muted small">
              Stage {stage} · {capitalize(difficulty)}
            </span>
          </span>
          <a className="pill" href={href(`/play?${encodeRef(hustleRef(stage))}`)} onClick={onLinkClick}>
            Play
          </a>
        </section>

        <section className="card-lg">
          <h2>Next milestones</h2>
          <ul className="hustle-milestones">
            {[next!, ...later].map((m) => (
              <li key={m.n} className={m.badge || m.flair ? 'special' : undefined}>
                <span className="hustle-node">{m.badge ? <BadgeIcon id={m.badge} /> : m.flair ? '♦' : '🎁'}</span>
                <span className="small">{m.n}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
```

Check `PuzzleIcon`'s prop name in `components/PuzzleIcon.tsx` and use it.

- [ ] **Step 4: Styles** — append to `apps/web/src/theme.css`

```css
.hustle-card { align-items: center; text-align: center; }
.hustle-level { font-family: var(--font-num); font-size: 3.2rem; font-weight: 800; line-height: 1; color: var(--accent-text); }
.hustle-bar { display: flex; align-items: center; gap: 4px; width: 100%; margin-top: 8px; }
.hustle-bar i { flex: 1; height: 10px; border-radius: 5px; background: var(--border); }
.hustle-bar i.on { background: var(--accent); }
.hustle-node { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; border: 2px solid var(--accent); color: var(--accent-text); flex: none; }
.hustle-next { flex-direction: row; align-items: center; gap: 12px; }
.hustle-next-text { flex: 1; display: flex; flex-direction: column; }
.hustle-milestones { display: flex; gap: 10px; list-style: none; margin: 0; padding: 0; }
.hustle-milestones li { display: flex; flex-direction: column; align-items: center; gap: 4px; font-family: var(--font-num); }
.hustle-milestones li:not(.special) .hustle-node { border-style: dashed; border-color: var(--border-mid); color: var(--text-muted); }
```

- [ ] **Step 5: Tab and route**

`TabBar.tsx` `TABS`: insert after Daily `{ path: '/hustle', label: 'Hustle', match: (p: string) => p === '/hustle' },`. `Icon`: extend the union with `'Hustle'` and add a case:

```tsx
    case 'Hustle':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 20h4v-5h4v-5h4V5h6" />
          <path d="M17 5h4v4" className="fill" />
        </svg>
      );
```

`App.tsx`: import `Hustle`; route `else if (route.path === '/hustle') page = <Hustle />;`; `tabIndex`: `/hustle` returns 1, `/levels` 2, `/profile` 3, `/friends`/`/join` 4.

- [ ] **Step 6: Run tests, typecheck, look at it**

Run: `cd apps/web && pnpm vitest run` and `cd ../.. && pnpm -r typecheck`. Then `pnpm dev` and check `/hustle` at 360 px and 390 px width in light, dark and one pack: five tabs fit, the level card matches mockup B.
Expected: PASS; no tab label clipped at 360 px (shorten labels to icons-only below 360 px only if they clip).

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "Hustle tab: level, progress to the next milestone, next puzzle" -m "Implemented with assistance from Claude Opus 5.5."
```

---

### Task 7: Hustle level on the server and in the player card

**Files:**
- Create: `apps/api/migrations/0005_hustle.sql`
- Modify: `apps/api/src/index.ts` (route `POST /hustle`)
- Modify: `apps/api/src/board.ts` (`hustle` in rows)
- Test: `apps/api/test/hustle.test.ts`, `apps/api/test/board.test.ts` (row carries `hustle`)
- Modify: `apps/web/src/components/Board.tsx` (`BoardData` entry, `NameCell` chip)
- Modify: `apps/web/src/lib/hustle.ts` (`pushHustle`), `apps/web/src/lib/auth.ts` (push on sign-in), `apps/web/src/pages/Play.tsx` (push after a Hustle solve)
- Modify: `apps/web/src/pages/Friends.tsx`, `apps/web/src/pages/Shop.tsx` (pass own level to `NameCell`), `apps/web/src/pages/Profile.tsx` (stat)
- Test: `apps/web/test/board.test.ts`

**Interfaces:**
- Consumes: `hustleSolved` (Task 3).
- Produces: API `POST /hustle` body `{ level: number }` → `{ hustle: number }`; board rows `hustle: number`; `NameCell` prop `entry.hustle?: number`; `pushHustle(): Promise<void>`.

- [ ] **Step 1: Write the failing API test** `apps/api/test/hustle.test.ts`

```ts
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import worker from '../src/index.ts';
import * as google from '../src/google.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await env.DB.exec('DELETE FROM reports; DELETE FROM scores; DELETE FROM members; DELETE FROM groups; DELETE FROM players;');
  vi.restoreAllMocks();
});

async function signIn(subject: string, name: string) {
  vi.spyOn(google, 'verifyGoogleIdToken').mockResolvedValue(subject);
  const response = await worker.fetch(new Request('https://api.test/session', { method: 'POST', body: JSON.stringify({ provider: 'google', idToken: 'x', name }) }), env);
  return (await response.json()) as { token: string; player: { id: string } };
}

const post = (token: string, payload: unknown) =>
  worker.fetch(new Request('https://api.test/hustle', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) }), env);

const stored = (id: string) => env.DB.prepare('SELECT hustle FROM players WHERE id = ?').bind(id).first<{ hustle: number }>();

it('starts at 0 and stores a level', async () => {
  const me = await signIn('s1', 'Moritz');
  expect(await stored(me.player.id)).toEqual({ hustle: 0 });
  const response = await post(me.token, { level: 47 });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ hustle: 47 });
});

it('never lowers the level', async () => {
  const me = await signIn('s1', 'Moritz');
  await post(me.token, { level: 47 });
  expect(await (await post(me.token, { level: 12 })).json()).toEqual({ hustle: 47 });
  expect(await stored(me.player.id)).toEqual({ hustle: 47 });
});

it('refuses anything but a whole number from 0 to 100000', async () => {
  const me = await signIn('s1', 'Moritz');
  for (const level of [-1, 1.5, 100001, '5', null]) expect((await post(me.token, { level })).status, String(level)).toBe(400);
});

it('needs a session', async () => {
  expect((await worker.fetch(new Request('https://api.test/hustle', { method: 'POST', body: '{}' }), env)).status).toBe(401);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && pnpm vitest run test/hustle.test.ts`
Expected: FAIL (column missing, route 404).

- [ ] **Step 3: Migration and route**

`apps/api/migrations/0005_hustle.sql`:

```sql
-- Highest Hustle stage the player reported, 0 before the first. Shown in the player card.
ALTER TABLE players ADD COLUMN hustle INTEGER NOT NULL DEFAULT 0;
```

In `apps/api/src/index.ts`, next to `postCosmetics`:

```ts
// The level comes from the device, like badge and flair. MAX keeps a stale device from lowering it.
async function postHustle(request: Request, env: Env, playerId: string): Promise<Response> {
  const { level } = await body(request);
  if (typeof level !== 'number' || !Number.isInteger(level) || level < 0 || level > 100_000) return error(400, 'bad_level');
  const row = await env.DB.prepare('UPDATE players SET hustle = MAX(hustle, ?) WHERE id = ? RETURNING hustle')
    .bind(level, playerId)
    .first<{ hustle: number }>();
  return json({ hustle: row?.hustle ?? level });
}
```

Route: `if (method === 'POST' && path === '/hustle') return postHustle(request, env, playerId);` after the `/cosmetics` line.

- [ ] **Step 4: Board rows**

In `apps/api/src/board.ts` add `hustle: number;` to `BoardEntry` and `p.hustle` to the select list. In `apps/api/test/board.test.ts`, extend the existing expectation of a row to include `hustle: 0`.

Run: `cd apps/api && pnpm vitest run`
Expected: PASS.

- [ ] **Step 5: Player card chip** — `apps/web/src/components/Board.tsx`

`BoardData` entry: add `hustle?: number`. `NameCell` entry type: add `hustle?: number`; after the badge inside `.leaderboard-name`:

```tsx
        {entry.hustle ? <span className="hustle-chip">Lv {entry.hustle}</span> : null}
```

CSS in `theme.css`:

```css
.hustle-chip { font-family: var(--font-num); font-size: var(--fs-xs); font-weight: 800; color: var(--accent-text); background: var(--accent-soft); border-radius: 999px; padding: 1px 7px; white-space: nowrap; }
```

Test in `apps/web/test/board.test.ts` (render `NameCell` like the existing tests in that file do, or add):

```ts
it('shows the Hustle chip only from level 1', () => {
  const html = (hustle?: number) => renderToStaticMarkup(createElement(NameCell, { entry: { name: 'A', hustle } }));
  expect(html(47)).toContain('Lv 47');
  expect(html(0)).not.toContain('Lv');
  expect(html(undefined)).not.toContain('Lv');
});
```

(import `renderToStaticMarkup` from `react-dom/server` and `createElement` from `react`).

- [ ] **Step 6: Push the level** — `apps/web/src/lib/hustle.ts`

```ts
import { hustleSolved } from '@puzzle-hustle/core';
import { apiFetch, readSession } from './api.ts';

// Same path as the cosmetics: no queue. The server keeps the highest value it saw, so a failed
// push is simply repeated after the next Hustle solve or sign-in.
export async function pushHustle(): Promise<void> {
  if (!readSession()) return;
  const level = hustleSolved(storedSolves());
  if (level === 0) return;
  try {
    await apiFetch('/hustle', { method: 'POST', body: JSON.stringify({ level }), auth: true });
  } catch {
    /* next solve or sign-in sends it again */
  }
}
```

(add `storedSolves` to the existing import from `./achievements.ts`). Call `void pushHustle()` in `lib/auth.ts` next to `void pushCosmetics()`, and in `Play.tsx` after recording a solve when `puzzleRef.hustle` is set.

Server, chip, tab and profile all carry the same number, `hustleSolved` (the highest solved stage).

- [ ] **Step 7: Own chip and profile**

In `Friends.tsx` and `Shop.tsx`, pass `hustle: hustleSolved(storedSolves())` into the `NameCell` entry. In `Profile.tsx`, add `<Stat value={hustleSolved(storedSolves())} label="Hustle level" />` to the stat grid next to "puzzles solved".

- [ ] **Step 8: Run tests, typecheck, check the board**

Run: `pnpm test` and `pnpm -r typecheck` from the repo root; `pnpm dev`, open a group board (or the Shop preview) and check the chip in light, dark and one pack.
Expected: PASS.

- [ ] **Step 9: Deploy note and commit**

The API deploys through GitHub Actions on push (`Deploy API`), which applies D1 migrations; check `apps/api/wrangler.toml` / the workflow that `wrangler d1 migrations apply` runs, else run `pnpm wrangler d1 migrations apply <db> --remote` once from `apps/api`.

```bash
git add apps/api apps/web
git commit -m "Hustle level on the server and as a chip in the player card" -m "Implemented with assistance from Claude Opus 5.5."
```

---

### Task 8: Docs, privacy and a full-sequence check

**Files:**
- Create: `packages/core/scripts/hustle-check.ts` (one-off, not in CI)
- Modify: `packages/core/package.json` (script `hustle-check`)
- Modify: `docs/design.md`, `docs/decisions.md`, `CLAUDE.md` (one line on Hustle)
- Modify: `C:/GameDev/Website/vexury.github.io/src/puzzle-hustle-privacy.md` (other repo)
- Modify: `store/listing.md` (data safety note)

- [ ] **Step 1: Full-sequence check script** `packages/core/scripts/hustle-check.ts`

```ts
// Builds stages 1..N (default 1000) and reports time per tier, the slowest stages and failures.
//   pnpm hustle-check [N]
import { generateBoard } from '../src/boards.ts';
import { hustleRef } from '../src/ref.ts';

const N = Number(process.argv[2] ?? 1000);
const slow: [number, number][] = [];
const byTier = new Map<string, number[]>();
for (let n = 1; n <= N; n++) {
  const ref = hustleRef(n);
  const t = performance.now();
  try {
    generateBoard(ref);
  } catch (e) {
    console.log(`stage ${n} (${ref.type} ${ref.difficulty}) failed: ${String(e)}`);
    continue;
  }
  const ms = performance.now() - t;
  byTier.set(ref.difficulty, [...(byTier.get(ref.difficulty) ?? []), ms]);
  slow.push([n, ms]);
}
for (const [tier, times] of byTier) {
  const sorted = [...times].sort((a, b) => a - b);
  console.log(`${tier}: ${times.length} stages, median ${sorted[sorted.length >> 1]!.toFixed(0)} ms, max ${sorted.at(-1)!.toFixed(0)} ms`);
}
console.log('slowest', slow.sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, ms]) => `${n}:${(ms / 1000).toFixed(1)}s`).join(' '));
```

Add `"hustle-check": "node --experimental-strip-types scripts/hustle-check.ts"` to `packages/core/package.json`. Run `cd packages/core && pnpm hustle-check 1000` and put the result (medians, slowest) into `docs/design.md`. If any non-Zip stage takes over 3 s on the desktop (roughly 25 s on a phone), note the type and tier in `docs/backlog.md` as a candidate for a pool.

- [ ] **Step 2: Docs**

`docs/design.md`: a "Hustle" bullet with sequence, tiers, rewards, where the level lives (solves, `players.hustle`), what the chip shows. `docs/decisions.md`: a dated entry pointing to the spec. `CLAUDE.md`: one line: "Hustle (endless mode): sequence in `packages/core/src/hustle.ts`, progress from `hustle:<n>` solves, level pushed to `players.hustle`; spec in docs/superpowers/specs."

- [ ] **Step 3: Privacy page** (repo `vexury.github.io`)

In `src/puzzle-hustle-privacy.md`, where the server data is listed ("display name, the badge and flair you show, your groups and the times you submit"), add the Hustle level: "…, the badge and flair you show, your Hustle level, your groups and the times you submit." In the list of what group members see, add "Hustle level". Commit there with its own message and push (the site deploys itself).

- [ ] **Step 4: Store note**

In `store/listing.md`, data safety table row "App activity: Other actions", add "Hustle level (highest stage reached)". Updating the declaration in the Play Console is a manual step at the next production submission; note it in `docs/backlog.md`.

- [ ] **Step 5: Final verification and commit**

Run: `pnpm test` and `pnpm -r typecheck` from the repo root.
Expected: all green.

```bash
git add packages/core/scripts/hustle-check.ts packages/core/package.json docs CLAUDE.md store/listing.md
git commit -m "Hustle: docs, data safety note and a full-sequence check" -m "Implemented with assistance from Claude Opus 5.5."
```
