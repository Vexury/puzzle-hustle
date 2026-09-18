# Zip: integration notes

Files: `packages/core/src/zip/puzzle.ts`, `packages/core/src/zip/solver.ts`, `packages/core/test/zip.test.ts`, `apps/web/src/zip/ZipGame.tsx`, `apps/web/src/zip/zip.css`.

## index.ts

```ts
export * from './zip/puzzle.ts';
export * from './zip/solver.ts';
```

Exported names: `ZIP_VERSION`, `ZIP_PRESETS`, `ZipConfig`, `ZipOptions`, `ZipSpec`, `ZipState`, `ZipHint`, `zipConfig`, `generateZip`, `emptyZipState`, `zipStart`, `zipStepAllowed`, `zipPathValid`, `isZipSolved`, `zipProgress`, `zipHint`, `zipNumberCount`, `zipNeighbors`; from solver: `ZIP_DIRS`, `ZipPuzzle`, `ZipCount`, `ZipDifficultyReport`, `zipNeighborTable`, `enumerateZipSolutions`, `countZipSolutions`, `isZipUnique`, `zipWallCount`, `zipDifficultyReport`, `zipCanonicalKey`. No name collides with the other modules (all prefixed `zip`/`Zip`/`ZIP_`).

## registry.ts adapter

```ts
import { ZIP_VERSION, generateZip, type ZipOptions } from './zip/puzzle.ts';
import { zipCanonicalKey, zipDifficultyReport } from './zip/solver.ts';

export const zipAdapter: PuzzleAdapter<ZipOptions> = {
  version: ZIP_VERSION,
  options(period) {
    switch (period) {
      case 'weekly': return { sizeDelta: 1 };
      case 'monthly': return { sizeDelta: 2 };
      default: return {};
    }
  },
  accepts(seed, difficulty, opts) {
    try { generateZip(seed, difficulty, opts); return true; } catch { return false; }
  },
  key(seed, difficulty) { return zipCanonicalKey(generateZip(seed, difficulty)); },
  score(seed, difficulty) { return zipDifficultyReport(generateZip(seed, difficulty)).score; },
};
```

`zipConfig` adds `sizeDelta` to the size and also to the number count, so weekly/monthly boards keep a similar segment length.

## types.ts

Add `'zip'` to `PUZZLE_TYPES` and a `PUZZLE_META` entry, e.g. `{ id: 'zip', name: 'Zip', tagline: 'One path from 1 to the last number through every cell. Walls block the way.' }`.

## ZipGame props and state

`ZipGame` has the shared props (`spec, onMove, onSolved, onHintUsed, requestHint, locked, initialState, onStateChange`). State is `number[]`: the drawn path as cell indices in order, `[]` when empty. `initialState` is validated (must start at cell 1, adjacent steps, no walls, no repeats) and dropped otherwise. It uses `lib/useHistory.ts` and renders the action bar Clear / Undo / Hint.

The component currently imports core via `../../../../packages/core/src/zip/puzzle.ts` with a `// TODO(wire)` comment; switch that line to `@puzzle-hustle/core` once index.ts exports the module.

## howto.ts

```
Draw one path that starts at 1 and ends at the highest number.
Pass the numbers in ascending order.
The path must visit every cell exactly once.
Thick lines are walls: the path cannot cross them.
```

## sizeLabel

`${spec.config.size}×${spec.config.size}, ${zipNumberCount(spec)} numbers` (the generator may add numbers beyond `config.numbers` to reach uniqueness, so use `zipNumberCount`, not the config).

## Presets

| difficulty | size | target numbers | walls | typical numbers after refine |
|---|---|---|---|---|
| easy | 6x6 | 8 | 1 | ~9.4 |
| medium | 7x7 | 8 | 4 | ~10.5 |
| hard | 8x8 | 8 | 8 | ~15 |
| genius | 9x9 | 9 | 12 | ~17 |

Generation: backbite-randomised Hamiltonian path (with a minimum-turn requirement), numbers spread along the path with jitter, then a loop: place walls against the first alternative solution (up to the target), coordinate-descent over interior number positions (shifts of up to 3 along the path, first improvement in solution count), then add a number on the alternative solution if still ambiguous. Spare random walls fill the wall target afterwards. Deterministic node budgets per difficulty (`SOLVE_NODES`), no time-based cutoffs. 6 path attempts per seed, then throw.

## Measured timings (20 seeds each, Node 24, laptop, other work running in parallel)

| difficulty | avg | max | rejected | avg score |
|---|---|---|---|---|
| easy | 40 ms | 157 ms | 0 | 53 |
| medium | 281 ms | 882 ms | 0 | 62 |
| hard | 1.3 s | 7.4 s | 0 | 68 |
| genius | 4.6 s | 11.1 s | 0 | 78 |

Score = `log2(nodes+1)*4 + cells/(numbers-1)*1.5 + walls*0.6 + log2(cells)*2 + turns/cells*5` over the full uniqueness search (limit 2), so easy < medium < hard < genius on average.

Test file runs in ~25 s (30 easy, 15 medium, 2 hard, 1 genius seed).

## TODO tune (hard / genius)

- Hard and genius are usable but slow (1.3 s / 4.6 s average, worst seeds 7 s / 11 s). The cost is the uniqueness probe on 64/81 cells with long free segments; every descent step re-runs it. Ideas, in order of expected payoff: skip the connectivity BFS in `feasible()` when the last step did not change the unvisited-cell degree structure; raise the wall targets (walls are far cheaper than numbers at shrinking the search); lower `PROBE_LIMIT`/`SOLVE_NODES` for hard and genius further; try fewer `SHIFTS`.
- The number count for hard/genius drifts well above the target (15-17 instead of 8-9). If LinkedIn-like sparse numbering matters there, the descent needs a better objective (e.g. count of alternative solutions among the first 16 instead of the first improvement) or a path generator biased toward corridors.
- `zipDifficultyReport` re-runs the full search with a 5M node budget; for level generation on hard/genius this doubles the cost of `score()` relative to `accepts()`.
