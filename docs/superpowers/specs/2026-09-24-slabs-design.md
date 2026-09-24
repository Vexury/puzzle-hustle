# Slabs

Design, 2026-09-24. The tenth puzzle type: place dominoes on a board so that every coloured region follows its rule. Modelled on NYT Pips, which Daniela wants in the app, with a rotation model that fixes Pips' weakest part.

## Goal

Add Slabs to Levels in four difficulties and to the Daily on medium. It is the second placement puzzle after Shapes and the first where pieces carry values, so it should feel different from both Shapes and Sumdoku.

## Non-goals

- **Not in the weekly/monthly rotation yet.** Slabs stays out of `PERIOD_TYPES` until hard and genius are tuned, like Zip and Tracks.
- **No German UI**, no undo beyond the existing `useHistory`.
- **Not called Pips.** The name is NYT's; the mechanic is free. Internal id `slabs`.

## Rules

- The board is a rectangle. Some cells are blocked; the rest form the playable area, which may be irregular.
- The tray holds exactly the slabs the board needs, drawn from a double-six set (pips 0 to 6) without duplicates. Every slab must be placed and every free cell covered.
- A region is a connected group of free cells with one rule: `=N` (sum is N), `<N` (sum below N), `>N` (sum above N), `=` (all equal), `≠` (all different). Cells outside every region are unconstrained.
- Solved means all slabs placed and every rule holds. The check evaluates the rules, not a stored solution; by construction there is only one valid placement.

## Decisions

- **Rectangle with blocked cells**, not a free-form board. It matches the other types' look while keeping an irregular playable area. Blocked cells show as background without grid lines.
- **Uniqueness means the placement of every slab**, position and orientation, not only the pip value per cell. That way a hint can always name one concrete slab.
- **Tiered logic solver, not exact counting alone.** The generator only accepts puzzles the propagator finishes without guessing. The highest tier needed drives the difficulty score. An exact counter confirms uniqueness independently, as with Tracks.
- **Flick to orient.** NYT only cycles orientations on tap, with an unclear pivot and pieces that jump. Here the half you press is always the pivot and stays under the finger, and one flick reaches any of the four orientations directly.
- **A slab dropped on another sends that one back to the tray**, so rearranging stays fast instead of refusing the drop.

## Sizes

First draft, tuned against measured scores during implementation.

| Difficulty | Board | Slabs | Max tier |
|---|---|---|---|
| Easy | 4×5 | 6 | 1 |
| Medium (Daily) | 6×6 | 10 | 2 |
| Hard | 7×7 | 14 | 3 |
| Genius | 8×8 | 20 | 3 |

At most 8 columns, so no zoom is needed on a phone.

## Core: `packages/core/src/slabs/`

### `solver.ts`

- Model: `SlabsPuzzle { config: { cols, rows }; blocked: Uint8Array; slabs: [number, number][]; regionOf: Int16Array (-1 = none); rules: SlabsRule[] }`, with `SlabsRule = { kind: 'sum' | 'lt' | 'gt' | 'eq' | 'neq'; target?: number }`.
- Propagator state: candidate placements per slab (anchor cell plus one of four orientations) and candidate values per cell.
- Tiers (the same for every rule kind, so difficulty comes from reasoning depth, not from which symbols appear):
  1. Placement logic (a slab with one placement is fixed, a cell only one slab can cover pulls that slab, a cell with one possible partner pins the pair) plus bounds per rule: min/max for `=N`, `<N`, `>N`, intersection for `=`, fixed values removed for `≠`.
  2. Full region consistency: every value combination of a region's cells is enumerated against its rule, values without support are dropped.
  3. One-step lookahead: a placement whose tier-2 propagation ends in a contradiction is removed.
- Exports: `solveSlabs(p, maxTier)` returning `{ solved, contradiction, steps, placement }`, `countSlabsSolutions(p, limit?, maxNodes?)`, `slabsDifficultyReport`, `slabsCanonicalKey` (every symmetry that keeps the rectangle, 8 on square boards, 4 otherwise), `slabsFamilyKey` (slab multiset plus rule mix).

### `puzzle.ts`

- Presets per difficulty, `SLABS_VERSION = 1`.
- Generator, deterministic from `Rng(seed)`:
  1. Carve a connected playable area inside the rectangle with exactly 2 × slabs cells.
  2. Random domino tiling of that area; draw slabs without replacement from the double-six set.
  3. Grow regions over the solution and assign rules, rule kinds weighted per difficulty.
  4. Loop: if the propagator does not solve within the preset's max tier, tighten a rule or add a region; give up on the seed after a fixed budget.
- Player state: per slab either in the tray or `{ anchor, orientation }`. A saved state that does not fit the spec (wrong length, overlap, blocked or off-board cell) loads as all slabs in the tray.
- State operations as pure functions: place, rotate around a half, flick to an orientation, return to tray. None of them can leave an overlap.
- Hints, one step each: first return a wrongly placed slab (position or orientation differs from the solution) to the tray; otherwise place the next slab the logic solver deduces, in solver order. Repeated hints from any board reach the solved board.

## Web: `apps/web/src/slabs/`

`SlabsGame.tsx` and `slabs.css`, SVG like Tracks, shared game props.

### Look

- Regions: light tint from the Cats region palette (light and dark variants), dashed outline. The rule badge sits on the region's top-left cell: `8`, `<4`, `>9`, `=`, `≠`.
- Slabs: rounded rectangles, classic dot patterns 0 to 6, thin divider line.
- Tray below the board, slabs wrap into rows. A placed slab leaves a faint ghost in its slot so the layout never jumps.
- Live feedback: a badge turns green when its region is full and the rule holds, red as soon as the rule cannot hold any more (sum exceeded, `=` with two different values, and so on).
- Colors only via tokens in `theme.css`; works in light and dark.

### Input

Pointer events with `setPointerCapture`, as in Shapes. Pressing a slab picks the half under the finger as the pivot.

- **Tap** (release after less than 0.2 cell of movement): rotate 90° clockwise around the pivot, skipping orientations that are blocked or occupied; if none fits, the slab shakes.
- **Flick** (release within 250 ms, at least 0.35 cell and less than 1.5 cells of movement): the other half turns toward the flick direction; the pivot stays in place. Blocked target: shake. Works in the tray as well, to set the orientation before placing.
- **Drag** (everything else): the slab follows the finger, a ghost shows the landing spot. On release the pivot half snaps to the nearest cell. Both cells free: it stays. Covers another slab: that one returns to the tray. Blocked or off the board: it slides back. Dropped over the tray: back to the tray.
- All turns and snaps animate over 150 ms via `transform` and respect `prefers-reduced-motion`. Light haptic on snap (`lib/haptics.ts`).

## Registration

- `types.ts`: `slabs` in `PUZZLE_TYPES` (appended, positions matter for nothing but order of display), `PUZZLE_META` with name "Slabs" and tagline "Place every slab. Each coloured region follows its rule."
- `registry.ts` adapter without period options, `index.ts` exports, `scripts/capacity.ts` entry.
- `cosmetics.ts`: `stone-setter` "Stone Setter", `slab-stacker` "Slab Stacker", `mason` "Mason", `master-builder` "Master Builder".
- `pages/Play.tsx` branch, `components/PuzzleIcon.tsx` icon (two stacked slabs with dots), `lib/howto.ts` text, store descriptions (`store/paste/full-description.txt` and `-de.txt`).

## Daily

- Joins through `DAILY_TYPES`, which derives from `PUZZLE_TYPES`. Difficulty medium via `PERIOD_DIFFICULTY`, no entry in `DAILY_DIFFICULTY`.
- The daily set grows from 8 to 9. Streak, perfect days and clean sweeps follow automatically. Past days may change, accepted as with Tracks: tester progress is wiped at the production release, and the coin balance clamps at 0.

## Levels

- `pnpm levels 50 slabs` for all four difficulties.
- If hard or genius generation is too slow for the runtime budget, those two start empty (like Zip did) and that is reported; sizes are adjusted to measured scores.

## Testing

- `packages/core/test/slabs.test.ts`: solver on hand-built puzzles including contradictions; generator determinism and uniqueness per difficulty; score rising from easy to genius; invalid saved state loads as an empty tray; place, tap-rotate, flick and swap never overlap; repeated hints from messy boards reach the solved board.
- `test/levels.test.ts` check for the new pack.
- `pnpm test`, `pnpm -r typecheck`, browser check at phone width in both themes.

## Review focus

1. A fast flick must never be read as a drag that moves the slab, and a slow short drag must never rotate it.
2. Dropping a slab so it half-covers another slab must return exactly the covered one to the tray and leave no overlap.
3. Rotating near blocked cells and the board edge must skip invalid orientations, never place a half outside the playable area.
4. The generator must stay deterministic across devices: no `Math.random`, no time, no iteration over unordered structures.
