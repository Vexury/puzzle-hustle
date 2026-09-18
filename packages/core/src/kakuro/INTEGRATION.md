# Kakuro integration notes

Files: `src/kakuro/puzzle.ts`, `src/kakuro/solver.ts`, `test/kakuro.test.ts`, `apps/web/src/kakuro/KakuroGame.tsx` + `kakuro.css`.
The game component imports core via relative paths marked `// TODO(wire)`; switch them to `@puzzle-hustle/core` once the exports exist.

## Exports for `index.ts`

From `./kakuro/puzzle.ts`:
`KAKURO_VERSION, KAKURO_PRESETS, kakuroConfig, generateKakuro, emptyKakuroState, kakuroStateToArray, kakuroStateFromArray, isKakuroSolved, kakuroProgress, kakuroRunSatisfied, kakuroConflicts, kakuroClues, kakuroHint`
and types `KakuroConfig, KakuroRun, KakuroSpec, KakuroState, KakuroOptions, KakuroClue, KakuroHint`.

From `./kakuro/solver.ts`:
`KAKURO_TECHNIQUES, KAKURO_TECHNIQUE_WEIGHT, kakuroRunMap, kakuroComboDigits, kakuroCombinations, countKakuroSolutions, isKakuroUnique, kakuroSolveByLogic, isKakuroLogicSolvable, kakuroDifficultyReport, kakuroCanonicalKey`
and types `KakuroTechnique, KakuroPuzzle, KakuroRunMap, KakuroCountResult, KakuroPlacement, KakuroLogicResult, KakuroDifficultyReport`.

Note `kakuroStateFromArray(spec, arr)` takes the spec first (needs the cell count).

## Adapter (registry.ts)

```ts
export const kakuroAdapter: PuzzleAdapter<KakuroOptions> = {
  version: KAKURO_VERSION,
  options(period) {
    switch (period) {
      case 'weekly': return { sizeDelta: 2 };
      case 'monthly': return { sizeDelta: 4 };
      default: return {};
    }
  },
  accepts(seed, difficulty, options) {
    try { generateKakuro(seed, difficulty, options); return true; } catch { return false; }
  },
  key(seed, difficulty) { return kakuroCanonicalKey(generateKakuro(seed, difficulty)); },
  score(seed, difficulty) { return kakuroDifficultyReport(generateKakuro(seed, difficulty)).score; },
};
```

`PUZZLE_META` suggestion: name `Kakuro`, tagline `Cross sums. Each run adds up to its clue, digits never repeat within a run.`

## How-to text (`lib/howto.ts`)

```ts
kakuro: [
  'Fill every white cell with a digit from 1 to 9.',
  'A clue above the diagonal is the sum of the cells to its right, a clue below it is the sum of the cells beneath.',
  'Digits never repeat inside one sum. Tap a cell, then a number; a completed sum fades its clue.',
  'Every puzzle can be solved by logic alone, no guessing needed.',
],
```

## sizeLabel (Play.tsx)

`'runs' in spec ? \`${spec.config.rows - 1}×${spec.config.cols - 1}, ${spec.runs.length} sums\` : ...` (grid size without the black border row/column).

## State persistence

`KakuroState` is a `Uint8Array` with one digit per cell (0 = empty, black cells stay 0), same indexing as `spec.cells`. `initialState` is `kakuroStateToArray(state)`.

## Generation timings (this laptop, Node 24, 20 seeds each, seeds 1..20)

| preset | grid | avg | max | rejected |
| --- | --- | --- | --- | --- |
| easy | 6x6 | 26 ms | 173 ms | 0/20 |
| medium | 8x8 | 104 ms | 380 ms | 0/20 |
| easy weekly (+2) | 8x8 | 27 ms | 118 ms | 0/20 |
| medium weekly (+2) | 10x10 | 562 ms | 1276 ms | 0/20 |
| easy monthly (+4) | 10x10 | 89 ms | 451 ms | 0/20 |
| medium monthly (+4) | 12x12 | 2881 ms | 10088 ms | 0/20 |
| hard | 10x10 | ~7 s | 13 s | 0/3 (only 3 seeds measured) |
| genius | 12x12 | ~150 s per seed | | 2/2 rejected |

Every accepted puzzle (all presets measured) is solvable by the logic solver; easy averages score ~72, medium ~139, hard ~240.

## TODO tune (hard, genius, large monthly grids)

The generator fills digits randomly (biased to extreme digits), then walks toward uniqueness by re-randomising cells the logic solver leaves unresolved. This converges quickly for grids up to about 10x10 but stalls on 12x12 with `maxRun 7`: hard takes seconds and genius rejects every seed after ~2.5 minutes. Do not enable genius (or monthly medium) for daily seeds until this is tuned; candidates are a lower `maxRun` or `blackRatio` for genius, a smarter repair (evaluate all unresolved cells, or grow the puzzle region by region), or a fast-fail budget so rejected seeds cost less. `test/kakuro.test.ts` runs hard with one seed and skips genius generation for that reason.
