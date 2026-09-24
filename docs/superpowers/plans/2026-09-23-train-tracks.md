# Train Tracks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Train Tracks as the ninth puzzle type, with levels in four difficulties and a daily on medium.

**Architecture:** A new `packages/core/src/tracks/` module holds a rule-tiered logic solver (which doubles as uniqueness proof and difficulty rating), a path-first generator, and pure state/hint functions. The web gets a `TracksGame` SVG component wired into the existing type checklist. `DAILY_TYPES` derives from `PUZZLE_TYPES`, so the new type joins the daily without further changes.

**Tech Stack:** TypeScript 7, React 19 (React Compiler), Vitest 5, pnpm workspace. No new dependencies.

**Spec:** The requirements agreed in the session of 2026-09-23, restated below. There is no separate spec file.

## Requirements (from the session)

- Rules: one track from entrance A (left edge) to exit B (bottom edge). Numbers outside each row and column count the track cells there. Pieces are straight or 90° curves, no crossings, no branches, no separate loops. Some pieces are given.
- Sizes, width × height: easy 6×6, medium 8×8, hard 10×12, genius 10×15. At most 10 columns; tall boards instead of zoom and pan.
- Generator accepts only puzzles a rule-based solver finishes without guessing; difficulty comes from which rules are needed.
- Daily: Train Tracks joins the daily set on medium. Hard and genius stay out of `PERIOD_TYPES` (weekly/monthly) until tuned.
- Hints, one step each: first remove a wrong piece or a cross on a track cell; otherwise lay the next cell of the solution counted from A. (The planned third step, "place a required cross", is dropped: a board is solved when its track matches, crosses never matter, so the second step always finishes the puzzle.)
- Input: dragging from cell to cell lays track, dragging over existing track lifts it; tapping an empty cell toggles an X. A row or column number turns green when met and red when exceeded.
- Perfect days, clean sweeps and achievements of earlier days may change when the daily set grows: tester progress is wiped at the production release anyway, and `coinBalance` clamps at 0 so no balance goes negative.

## Global Constraints

- Core stays DOM-free (`packages/core`), UI lives in `apps/web`.
- Every change works in light and dark theme (`[data-theme]`), colors only via tokens in `theme.css`.
- Deterministic generation: same seed and difficulty give the same puzzle on every device, no time or `Math.random`.
- Cosmetic ids and titles are forever: add, never rename.
- Verify with `pnpm test`, `pnpm -r typecheck`, and a browser check. Vitest timeout is 60 s.
- Stage files explicitly (`git add <files>`), never `git add -A`.
- Commit body ends with the prose line `Implemented with assistance from Claude Opus 5.5.` No `Co-Authored-By` trailer.
- No em dashes in UI copy.

## Review Focus

1. A saved in-progress board that does not fit the spec (wrong length, stray bits, an edge off the board) must load as an empty board, not crash. Pinned in Task 3 (`validTracksState`).
2. A fast swipe that skips cells diagonally must walk the board in straight steps and never lay a diagonal or a jump. Pinned in Task 3 (`tracksStepToward`).
3. Dragging into a cell that already has two connections must not create a branch. Pinned in Task 3 (`tracksSetEdge`).
4. Tapping a cell that holds track, including a given piece, must not place a cross over it. Pinned in Task 3 (`tracksToggleCross`).
5. Pressing hint repeatedly from any messy board, including wrong pieces next to the path, must reach the solved board. Pinned in Task 3.

---

## File Structure

- Create `packages/core/src/tracks/solver.ts`: grid geometry, the tiered propagator, `solveTracks`, `countTracksSolutions`, difficulty report, canonical and family keys.
- Create `packages/core/src/tracks/puzzle.ts`: presets, spec type, path generator, given selection, `generateTracks`, player state operations, hints.
- Create `packages/core/test/tracks.test.ts`: solver, generator, state and hint tests.
- Modify `packages/core/src/types.ts`, `registry.ts`, `index.ts`, `cosmetics.ts`, `scripts/capacity.ts`: registration.

- Modify `packages/core/src/levels.json` (generated), `packages/core/test/levels.test.ts`.
- Create `apps/web/src/tracks/TracksGame.tsx`, `apps/web/src/tracks/tracks.css`.
- Modify `apps/web/src/pages/Play.tsx`, `apps/web/src/components/PuzzleIcon.tsx`, `apps/web/src/lib/howto.ts`.

---

### Task 1: Tiered logic solver

**Files:**
- Create: `packages/core/src/tracks/solver.ts`
- Test: `packages/core/test/tracks.test.ts`

**Interfaces:**
- Produces:
  - `TRACK_N = 1, TRACK_E = 2, TRACK_S = 4, TRACK_W = 8`
  - `interface TracksPuzzle { config: { cols: number; rows: number }; rowCounts: Uint8Array; colCounts: Uint8Array; entryRow: number; exitCol: number; given: Uint8Array }` (`given[cell]` = connection mask of a given piece, 0 if none; the A cell's mask includes `TRACK_W`, the B cell's includes `TRACK_S`)
  - `tracksOutside(p: TracksPuzzle, cell: number): number` (the fixed stub bits: `TRACK_W` on the A cell, `TRACK_S` on the B cell)
  - `solveTracks(p: TracksPuzzle, maxTier: 1 | 2 | 3): TracksSolveResult` with `{ solved: boolean; contradiction: boolean; steps: [number, number, number]; masks: Uint8Array }` (`masks[cell]` = connection mask incl. stubs, valid when `solved`)
  - `countTracksSolutions(p: TracksPuzzle, limit?: number, maxNodes?: number): { count: number; complete: boolean }`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/tracks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/rng.ts';
import {
  TRACK_E,
  TRACK_N,
  TRACK_S,
  TRACK_W,
  countTracksSolutions,
  solveTracks,
  type TracksPuzzle,
} from '../src/tracks/solver.ts';

const DIRS: [number, number, number][] = [
  [-1, 0, TRACK_N],
  [0, 1, TRACK_E],
  [1, 0, TRACK_S],
  [0, -1, TRACK_W],
];
const OPPOSITE: Record<number, number> = { [TRACK_N]: TRACK_S, [TRACK_S]: TRACK_N, [TRACK_E]: TRACK_W, [TRACK_W]: TRACK_E };

// Every simple path from the A cell to the B cell, as ordered cell lists. Only for tiny boards.
function allPaths(cols: number, rows: number, entryRow: number, exitCol: number): number[][] {
  const start = entryRow * cols;
  const goal = (rows - 1) * cols + exitCol;
  const out: number[][] = [];
  const used = new Uint8Array(cols * rows);
  const path = [start];
  used[start] = 1;
  const walk = (cur: number) => {
    if (cur === goal) {
      out.push([...path]);
      return;
    }
    const r = Math.floor(cur / cols);
    const c = cur % cols;
    for (const [dr, dc] of DIRS) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
      const next = rr * cols + cc;
      if (used[next]) continue;
      used[next] = 1;
      path.push(next);
      walk(next);
      path.pop();
      used[next] = 0;
    }
  };
  walk(start);
  return out;
}

function puzzleFromPath(cols: number, rows: number, entryRow: number, exitCol: number, path: number[]): TracksPuzzle {
  const rowCounts = new Uint8Array(rows);
  const colCounts = new Uint8Array(cols);
  for (const cell of path) {
    rowCounts[Math.floor(cell / cols)]!++;
    colCounts[cell % cols]!++;
  }
  return { config: { cols, rows }, rowCounts, colCounts, entryRow, exitCol, given: new Uint8Array(cols * rows) };
}

function countsKey(cols: number, path: number[], rows: number): string {
  const p = puzzleFromPath(cols, rows, 0, 0, path);
  return `${[...p.rowCounts].join('.')}|${[...p.colCounts].join('.')}`;
}

function masksOf(cols: number, rows: number, entryRow: number, exitCol: number, path: number[]): Uint8Array {
  const masks = new Uint8Array(cols * rows);
  masks[entryRow * cols] |= TRACK_W;
  masks[(rows - 1) * cols + exitCol] |= TRACK_S;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const d = b - a === 1 ? TRACK_E : b - a === -1 ? TRACK_W : b - a === cols ? TRACK_S : TRACK_N;
    masks[a] |= d;
    masks[b] |= OPPOSITE[d]!;
  }
  return masks;
}

describe('tracks solver', () => {
  // The propagator's rules are only useful if they are sound (never cut a real solution) and the
  // search is complete. Brute force over every A-to-B path on small boards is the ground truth.
  it('counts exactly the paths that match the clues on 4x4 boards', () => {
    const rng = new Rng(7);
    for (let t = 0; t < 12; t++) {
      const entryRow = rng.int(3);
      const exitCol = 1 + rng.int(3);
      const paths = allPaths(4, 4, entryRow, exitCol);
      const pick = paths[rng.int(paths.length)]!;
      const p = puzzleFromPath(4, 4, entryRow, exitCol, pick);
      const want = countsKey(4, pick, 4);
      const expected = paths.filter((q) => countsKey(4, q, 4) === want).length;
      const got = countTracksSolutions(p, 1000, 1_000_000);
      expect(got.complete).toBe(true);
      expect(got.count).toBe(expected);
    }
  });

  it('solves a unique puzzle to its path', () => {
    const rng = new Rng(11);
    let checked = 0;
    for (let t = 0; t < 60 && checked < 5; t++) {
      const entryRow = rng.int(4);
      const exitCol = 1 + rng.int(4);
      const paths = allPaths(5, 5, entryRow, exitCol);
      const pick = paths[rng.int(paths.length)]!;
      const p = puzzleFromPath(5, 5, entryRow, exitCol, pick);
      if (countTracksSolutions(p, 2).count !== 1) continue;
      const res = solveTracks(p, 3);
      if (!res.solved) continue;
      expect([...res.masks]).toEqual([...masksOf(5, 5, entryRow, exitCol, pick)]);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('never reports a contradiction for a puzzle that has a solution', () => {
    const rng = new Rng(3);
    for (let t = 0; t < 20; t++) {
      const entryRow = rng.int(4);
      const exitCol = 1 + rng.int(4);
      const paths = allPaths(5, 5, entryRow, exitCol);
      const p = puzzleFromPath(5, 5, entryRow, exitCol, paths[rng.int(paths.length)]!);
      expect(solveTracks(p, 3).contradiction).toBe(false);
    }
  });

  it('uses the given pieces', () => {
    // 3x3, A at row 0, B at column 2: the path runs along the top row and down the right column.
    const path = [0, 1, 2, 5, 8];
    const p = puzzleFromPath(3, 3, 0, 2, path);
    const res = solveTracks(p, 3);
    expect(res.solved).toBe(true);
    expect([...res.masks]).toEqual([...masksOf(3, 3, 0, 2, path)]);
  });

  it('reports contradictory clues', () => {
    const p = puzzleFromPath(3, 3, 0, 2, [0, 1, 2, 5, 8]);
    p.rowCounts[1] = 3;
    expect(solveTracks(p, 3).contradiction).toBe(true);
    expect(countTracksSolutions(p, 2).count).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @puzzle-hustle/core exec vitest run test/tracks.test.ts`
Expected: FAIL, cannot resolve `../src/tracks/solver.ts`.

- [ ] **Step 3: Implement the solver**

Create `packages/core/src/tracks/solver.ts`:

```ts
export const TRACK_N = 1;
export const TRACK_E = 2;
export const TRACK_S = 4;
export const TRACK_W = 8;
const DIR_BITS = [TRACK_N, TRACK_E, TRACK_S, TRACK_W] as const;

export interface TracksPuzzle {
  config: { cols: number; rows: number };
  rowCounts: Uint8Array;
  colCounts: Uint8Array;
  entryRow: number;
  exitCol: number;
  given: Uint8Array;
}

export interface TracksSolveResult {
  solved: boolean;
  contradiction: boolean;
  steps: [number, number, number];
  masks: Uint8Array;
}

const UNKNOWN = 0;
const YES = 1;
const NO = 2;
const TRACK = 1;
const EMPTY = 2;

// Horizontal edges first, (r,c)-(r,c+1) at r*(cols-1)+c, then vertical ones, (r,c)-(r+1,c) at
// base + r*cols + c. cellEdges lists each cell's edge per direction N, E, S, W, -1 at the rim.
interface Grid {
  cols: number;
  rows: number;
  cells: number;
  edgeCount: number;
  cellEdges: Int32Array;
  edgeCells: Int32Array;
  outside: Uint8Array;
}

export function tracksOutside(p: TracksPuzzle, cell: number): number {
  const { cols, rows } = p.config;
  let m = 0;
  if (cell === p.entryRow * cols) m |= TRACK_W;
  if (cell === (rows - 1) * cols + p.exitCol) m |= TRACK_S;
  return m;
}

function buildGrid(p: TracksPuzzle): Grid {
  const { cols, rows } = p.config;
  const cells = cols * rows;
  const base = rows * (cols - 1);
  const edgeCount = base + (rows - 1) * cols;
  const cellEdges = new Int32Array(cells * 4).fill(-1);
  const edgeCells = new Int32Array(edgeCount * 2);
  const outside = new Uint8Array(cells);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      outside[i] = tracksOutside(p, i);
      if (r > 0) cellEdges[i * 4] = base + (r - 1) * cols + c;
      if (c < cols - 1) cellEdges[i * 4 + 1] = r * (cols - 1) + c;
      if (r < rows - 1) cellEdges[i * 4 + 2] = base + r * cols + c;
      if (c > 0) cellEdges[i * 4 + 3] = r * (cols - 1) + c - 1;
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const e = r * (cols - 1) + c;
      edgeCells[e * 2] = r * cols + c;
      edgeCells[e * 2 + 1] = r * cols + c + 1;
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const e = base + r * cols + c;
      edgeCells[e * 2] = r * cols + c;
      edgeCells[e * 2 + 1] = (r + 1) * cols + c;
    }
  }
  return { cols, rows, cells, edgeCount, cellEdges, edgeCells, outside };
}

function popcount(m: number): number {
  let n = 0;
  for (; m; m &= m - 1) n++;
  return n;
}

class Propagator {
  assigned = 0;
  private readonly total: number;

  constructor(
    readonly g: Grid,
    readonly p: TracksPuzzle,
    readonly edges: Uint8Array,
    readonly cells: Uint8Array,
  ) {
    let t = 0;
    for (const n of p.rowCounts) t += n;
    this.total = t;
  }

  clone(): Propagator {
    return new Propagator(this.g, this.p, this.edges.slice(), this.cells.slice());
  }

  setEdge(e: number, v: number): boolean {
    const cur = this.edges[e]!;
    if (cur === v) return true;
    if (cur !== UNKNOWN) return false;
    this.edges[e] = v;
    this.assigned++;
    return true;
  }

  setCell(i: number, v: number): boolean {
    const cur = this.cells[i]!;
    if (cur === v) return true;
    if (cur !== UNKNOWN) return false;
    this.cells[i] = v;
    this.assigned++;
    return true;
  }

  // Tier 1a: a track cell has exactly two connections, an empty one none.
  private cellRule(i: number): boolean {
    const { cellEdges, outside } = this.g;
    let yes = popcount(outside[i]!);
    let unk = 0;
    for (let d = 0; d < 4; d++) {
      const e = cellEdges[i * 4 + d]!;
      if (e < 0) continue;
      const v = this.edges[e]!;
      if (v === YES) yes++;
      else if (v === UNKNOWN) unk++;
    }
    if (yes > 2) return false;
    if (yes > 0 && !this.setCell(i, TRACK)) return false;
    const state = this.cells[i]!;
    let fill = UNKNOWN;
    if (state === EMPTY) fill = NO;
    else if (state === TRACK) {
      if (yes + unk < 2) return false;
      if (yes === 2) fill = NO;
      else if (yes + unk === 2) fill = YES;
    } else if (yes + unk < 2) {
      if (!this.setCell(i, EMPTY)) return false;
      fill = NO;
    }
    if (fill === UNKNOWN || unk === 0) return true;
    for (let d = 0; d < 4; d++) {
      const e = cellEdges[i * 4 + d]!;
      if (e >= 0 && this.edges[e] === UNKNOWN && !this.setEdge(e, fill)) return false;
    }
    return true;
  }

  // Tier 1b: a row or column holds exactly its number of track cells.
  private lineRule(members: number[], clue: number): boolean {
    let track = 0;
    let unk = 0;
    for (const i of members) {
      const v = this.cells[i]!;
      if (v === TRACK) track++;
      else if (v === UNKNOWN) unk++;
    }
    if (track > clue || track + unk < clue) return false;
    if (unk === 0) return true;
    const fill = track === clue ? EMPTY : track + unk === clue ? TRACK : UNKNOWN;
    if (fill === UNKNOWN) return true;
    for (const i of members) if (this.cells[i] === UNKNOWN && !this.setCell(i, fill)) return false;
    return true;
  }

  private tier1(): boolean {
    const { cols, rows, cells } = this.g;
    for (let i = 0; i < cells; i++) if (!this.cellRule(i)) return false;
    for (let r = 0; r < rows; r++) {
      const members: number[] = [];
      for (let c = 0; c < cols; c++) members.push(r * cols + c);
      if (!this.lineRule(members, this.p.rowCounts[r]!)) return false;
    }
    for (let c = 0; c < cols; c++) {
      const members: number[] = [];
      for (let r = 0; r < rows; r++) members.push(r * cols + c);
      if (!this.lineRule(members, this.p.colCounts[c]!)) return false;
    }
    return true;
  }

  // Tier 2a: the track is one path. An edge inside one piece of track closes a loop, and an
  // edge joining the piece from A to the piece from B finishes the track, which is only
  // allowed if that uses every track cell.
  private loopRule(): boolean {
    const { cells, edgeCount, edgeCells, cols, rows } = this.g;
    const parent = new Int32Array(cells);
    const size = new Int32Array(cells).fill(1);
    for (let i = 0; i < cells; i++) parent[i] = i;
    const find = (x: number): number => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]!]!;
        x = parent[x]!;
      }
      return x;
    };
    for (let e = 0; e < edgeCount; e++) {
      if (this.edges[e] !== YES) continue;
      const a = find(edgeCells[e * 2]!);
      const b = find(edgeCells[e * 2 + 1]!);
      if (a === b) return false;
      parent[a] = b;
      size[b]! += size[a]!;
    }
    const aCell = this.p.entryRow * cols;
    const bCell = (rows - 1) * cols + this.p.exitCol;
    if (find(aCell) === find(bCell) && size[find(aCell)]! < this.total) return false;
    for (let e = 0; e < edgeCount; e++) {
      if (this.edges[e] !== UNKNOWN) continue;
      const a = find(edgeCells[e * 2]!);
      const b = find(edgeCells[e * 2 + 1]!);
      if (a === b) {
        if (!this.setEdge(e, NO)) return false;
        continue;
      }
      const ra = find(aCell);
      const rb = find(bCell);
      const joinsEnds = (a === ra && b === rb) || (a === rb && b === ra);
      if (joinsEnds && size[a]! + size[b]! < this.total && !this.setEdge(e, NO)) return false;
    }
    return true;
  }

  // Tier 2b: a cut across the board is crossed an odd number of times when A and B lie on
  // different sides of it, an even number otherwise. A sits left of every column cut and
  // above the row cuts from its own row down; B sits below every row cut.
  private parityRule(): boolean {
    const { cols, rows } = this.g;
    const base = rows * (cols - 1);
    const check = (edgeIds: number[], odd: boolean): boolean => {
      let yes = 0;
      let open = -1;
      let unk = 0;
      for (const e of edgeIds) {
        const v = this.edges[e]!;
        if (v === YES) yes++;
        else if (v === UNKNOWN) {
          unk++;
          open = e;
        }
      }
      if (unk === 0) return (yes % 2 === 1) === odd;
      if (unk === 1) return this.setEdge(open, (yes % 2 === 1) === odd ? NO : YES);
      return true;
    };
    for (let r = 0; r < rows - 1; r++) {
      const ids: number[] = [];
      for (let c = 0; c < cols; c++) ids.push(base + r * cols + c);
      if (!check(ids, this.p.entryRow <= r)) return false;
    }
    for (let c = 0; c < cols - 1; c++) {
      const ids: number[] = [];
      for (let r = 0; r < rows; r++) ids.push(r * (cols - 1) + c);
      if (!check(ids, this.p.exitCol > c)) return false;
    }
    return true;
  }

  // Tier 3: assume a value for one open edge, run tiers 1 and 2, and keep the opposite if the
  // assumption breaks. One step of lookahead, never deeper.
  private probe(): 'changed' | 'stuck' | 'contradiction' {
    for (let e = 0; e < this.g.edgeCount; e++) {
      if (this.edges[e] !== UNKNOWN) continue;
      for (const v of [YES, NO]) {
        const trial = this.clone();
        trial.setEdge(e, v);
        if (trial.propagate(2, [0, 0, 0])) continue;
        return this.setEdge(e, v === YES ? NO : YES) ? 'changed' : 'contradiction';
      }
    }
    return 'stuck';
  }

  propagate(maxTier: 1 | 2 | 3, steps: [number, number, number]): boolean {
    for (;;) {
      let before = this.assigned;
      if (!this.tier1()) return false;
      if (this.assigned !== before) {
        steps[0] += this.assigned - before;
        continue;
      }
      if (maxTier < 2) return true;
      before = this.assigned;
      if (!this.loopRule() || !this.parityRule()) return false;
      if (this.assigned !== before) {
        steps[1] += this.assigned - before;
        continue;
      }
      if (maxTier < 3) return true;
      const outcome = this.probe();
      if (outcome === 'contradiction') return false;
      if (outcome === 'stuck') return true;
      steps[2]++;
    }
  }

  open(): number {
    return this.edges.indexOf(UNKNOWN);
  }

  masks(): Uint8Array {
    const { cells, cellEdges, outside } = this.g;
    const out = new Uint8Array(cells);
    for (let i = 0; i < cells; i++) {
      let m = outside[i]!;
      for (let d = 0; d < 4; d++) {
        const e = cellEdges[i * 4 + d]!;
        if (e >= 0 && this.edges[e] === YES) m |= DIR_BITS[d]!;
      }
      out[i] = m;
    }
    return out;
  }
}

function start(p: TracksPuzzle): { prop: Propagator; ok: boolean } {
  const g = buildGrid(p);
  const prop = new Propagator(g, p, new Uint8Array(g.edgeCount), new Uint8Array(g.cells));
  let ok = true;
  for (let i = 0; i < g.cells && ok; i++) {
    const m = p.given[i]!;
    if (!m) continue;
    ok = prop.setCell(i, TRACK);
    for (let d = 0; d < 4 && ok; d++) {
      const e = g.cellEdges[i * 4 + d]!;
      if (e < 0) continue;
      ok = prop.setEdge(e, m & DIR_BITS[d]! ? YES : NO);
    }
  }
  prop.assigned = 0;
  return { prop, ok };
}

export function solveTracks(p: TracksPuzzle, maxTier: 1 | 2 | 3): TracksSolveResult {
  const steps: [number, number, number] = [0, 0, 0];
  const { prop, ok } = start(p);
  if (!ok || !prop.propagate(maxTier, steps)) return { solved: false, contradiction: true, steps, masks: prop.masks() };
  return { solved: prop.open() < 0, contradiction: false, steps, masks: prop.masks() };
}

export function countTracksSolutions(p: TracksPuzzle, limit = 2, maxNodes = 200_000): { count: number; complete: boolean } {
  const { prop, ok } = start(p);
  if (!ok) return { count: 0, complete: true };
  let count = 0;
  let nodes = 0;
  const walk = (s: Propagator): void => {
    if (count >= limit || nodes >= maxNodes) return;
    nodes++;
    if (!s.propagate(2, [0, 0, 0])) return;
    const e = s.open();
    if (e < 0) {
      count++;
      return;
    }
    for (const v of [YES, NO]) {
      const next = s.clone();
      next.setEdge(e, v);
      walk(next);
    }
  };
  walk(prop);
  return { count, complete: nodes < maxNodes };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @puzzle-hustle/core exec vitest run test/tracks.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tracks/solver.ts packages/core/test/tracks.test.ts
git commit -m "Add a rule-tiered solver for Train Tracks"
```

---

### Task 2: Generator, spec, keys and difficulty report

**Files:**
- Create: `packages/core/src/tracks/puzzle.ts`
- Modify: `packages/core/src/tracks/solver.ts` (append report and keys)
- Test: `packages/core/test/tracks.test.ts`

**Interfaces:**
- Consumes: `TracksPuzzle`, `solveTracks`, `countTracksSolutions`, `tracksOutside`, `TRACK_*` from Task 1.
- Produces:
  - `TRACKS_VERSION = 1`
  - `interface TracksConfig { cols: number; rows: number; minPath: number; maxPath: number; maxTier: 1 | 2 | 3; minTopSteps: number; maxGivens: number }`
  - `TRACKS_PRESETS: Record<Difficulty, TracksConfig>`
  - `interface TracksSpec extends TracksPuzzle { version: number; seed: number; difficulty: Difficulty; config: TracksConfig; solution: Uint8Array; path: Uint16Array }`
  - `generateTracks(seed: number, difficulty: Difficulty): TracksSpec` (throws when no puzzle is found)
  - `tracksGivenCount(spec: TracksPuzzle): number`
  - in solver.ts: `tracksDifficultyReport(spec: TracksSpec): { score: number; steps: [number, number, number]; cells: number; givens: number; length: number; turns: number }`, `tracksCanonicalKey(spec: TracksPuzzle): string`, `tracksFamilyKey(spec: TracksSpec): string`

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/test/tracks.test.ts` (add the imports to the top import block):

```ts
import { DIFFICULTIES } from '../src/types.ts';
import { TRACKS_PRESETS, generateTracks, tracksGivenCount } from '../src/tracks/puzzle.ts';
import { tracksCanonicalKey, tracksDifficultyReport } from '../src/tracks/solver.ts';

describe('tracks generator', () => {
  it('keeps every board at most ten columns wide', () => {
    for (const d of DIFFICULTIES) expect(TRACKS_PRESETS[d].cols).toBeLessThanOrEqual(10);
  });

  for (const difficulty of ['easy', 'medium'] as const) {
    it(`builds valid, unique ${difficulty} puzzles`, () => {
      const cfg = TRACKS_PRESETS[difficulty];
      for (let seed = 1; seed <= 6; seed++) {
        const spec = generateTracks(seed, difficulty);
        const { cols, rows } = spec.config;
        expect(spec.path[0]).toBe(spec.entryRow * cols);
        expect(spec.path.at(-1)).toBe((rows - 1) * cols + spec.exitCol);
        expect(new Set(spec.path).size).toBe(spec.path.length);
        expect(spec.path.length).toBeGreaterThanOrEqual(cfg.minPath);
        expect(spec.path.length).toBeLessThanOrEqual(cfg.maxPath);
        for (let i = 1; i < spec.path.length; i++) {
          const a = spec.path[i - 1]!;
          const b = spec.path[i]!;
          const adjacent = (Math.abs(a - b) === 1 && Math.floor(a / cols) === Math.floor(b / cols)) || Math.abs(a - b) === cols;
          expect(adjacent).toBe(true);
        }
        let sum = 0;
        for (const n of spec.rowCounts) sum += n;
        expect(sum).toBe(spec.path.length);
        expect(tracksGivenCount(spec)).toBeLessThanOrEqual(cfg.maxGivens);
        const res = solveTracks(spec, cfg.maxTier);
        expect(res.solved).toBe(true);
        expect([...res.masks]).toEqual([...spec.solution]);
        expect(countTracksSolutions(spec, 2).count).toBe(1);
      }
    });
  }

  it('needs the top tier on medium, not just the basic rules', () => {
    const spec = generateTracks(4, 'medium');
    expect(solveTracks(spec, 1).solved).toBe(false);
    expect(tracksDifficultyReport(spec).steps[1]).toBeGreaterThan(0);
  });

  it('is deterministic per seed and differs across seeds', () => {
    expect(tracksCanonicalKey(generateTracks(9, 'medium'))).toBe(tracksCanonicalKey(generateTracks(9, 'medium')));
    expect(tracksCanonicalKey(generateTracks(9, 'medium'))).not.toBe(tracksCanonicalKey(generateTracks(10, 'medium')));
  });

  it('builds a genius board of 10 by 15', () => {
    const spec = generateTracks(1, 'genius');
    expect([spec.config.cols, spec.config.rows]).toEqual([10, 15]);
    expect(solveTracks(spec, 3).solved).toBe(true);
  }, 60_000);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @puzzle-hustle/core exec vitest run test/tracks.test.ts`
Expected: FAIL, cannot resolve `../src/tracks/puzzle.ts`.

- [ ] **Step 3: Implement the generator**

Create `packages/core/src/tracks/puzzle.ts`:

```ts
import { Rng } from '../rng.ts';
import type { Difficulty } from '../types.ts';
import { TRACK_E, TRACK_N, TRACK_S, TRACK_W, solveTracks, tracksOutside, type TracksPuzzle } from './solver.ts';

export const TRACKS_VERSION = 1;

export interface TracksConfig {
  cols: number;
  rows: number;
  minPath: number;
  maxPath: number;
  maxTier: 1 | 2 | 3;
  // How many deductions the top allowed tier must contribute, so a medium board is not
  // secretly an easy one.
  minTopSteps: number;
  maxGivens: number;
}

// Never wider than ten columns: on a phone that is the most that stays comfortable to swipe,
// and the harder boards grow downwards instead of needing zoom and pan.
export const TRACKS_PRESETS: Record<Difficulty, TracksConfig> = {
  easy: { cols: 6, rows: 6, minPath: 12, maxPath: 22, maxTier: 1, minTopSteps: 0, maxGivens: 4 },
  medium: { cols: 8, rows: 8, minPath: 22, maxPath: 38, maxTier: 2, minTopSteps: 1, maxGivens: 4 },
  hard: { cols: 10, rows: 12, minPath: 40, maxPath: 72, maxTier: 3, minTopSteps: 1, maxGivens: 5 },
  genius: { cols: 10, rows: 15, minPath: 55, maxPath: 95, maxTier: 3, minTopSteps: 3, maxGivens: 5 },
};

export interface TracksSpec extends TracksPuzzle {
  version: number;
  seed: number;
  difficulty: Difficulty;
  config: TracksConfig;
  solution: Uint8Array;
  path: Uint16Array;
}

const STEPS: [number, number][] = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
];

function distances(cols: number, rows: number, used: Uint8Array, goal: number): Int32Array {
  const dist = new Int32Array(cols * rows).fill(-1);
  const queue = [goal];
  dist[goal] = 0;
  for (let q = 0; q < queue.length; q++) {
    const cur = queue[q]!;
    const r = Math.floor(cur / cols);
    const c = cur % cols;
    for (const [dr, dc] of STEPS) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
      const next = rr * cols + cc;
      if (used[next] || dist[next]! >= 0) continue;
      dist[next] = dist[cur]! + 1;
      queue.push(next);
    }
  }
  return dist;
}

// A random self-avoiding walk from A to B whose length lands in [minPath, target]. The goal
// cell is reserved until the walk may end there, and a branch is cut as soon as B can no
// longer be reached within the target length through the cells still free.
function randomPath(rng: Rng, cfg: TracksConfig, entryRow: number, exitCol: number): number[] | null {
  const { cols, rows } = cfg;
  const startCell = entryRow * cols;
  const goal = (rows - 1) * cols + exitCol;
  const target = cfg.minPath + rng.int(cfg.maxPath - cfg.minPath + 1);
  const used = new Uint8Array(cols * rows);
  used[startCell] = 1;
  const path = [startCell];
  let nodes = 0;
  const walk = (): boolean => {
    if (++nodes > 20_000) return false;
    const cur = path[path.length - 1]!;
    if (cur === goal) return path.length >= cfg.minPath;
    const dist = distances(cols, rows, used, goal);
    const r = Math.floor(cur / cols);
    const c = cur % cols;
    const options: number[] = [];
    for (const [dr, dc] of STEPS) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
      const next = rr * cols + cc;
      if (used[next]) continue;
      if (next === goal && path.length + 1 < cfg.minPath) continue;
      if (dist[next]! < 0 || path.length + 1 + dist[next]! > target) continue;
      options.push(next);
    }
    for (const next of rng.shuffle(options)) {
      used[next] = 1;
      path.push(next);
      if (walk()) return true;
      path.pop();
      used[next] = 0;
    }
    return false;
  };
  return walk() ? path : null;
}

function solutionMasks(cols: number, rows: number, entryRow: number, exitCol: number, path: number[]): Uint8Array {
  const masks = new Uint8Array(cols * rows);
  masks[entryRow * cols]! |= TRACK_W;
  masks[(rows - 1) * cols + exitCol]! |= TRACK_S;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    if (b === a + 1) {
      masks[a]! |= TRACK_E;
      masks[b]! |= TRACK_W;
    } else if (b === a - 1) {
      masks[a]! |= TRACK_W;
      masks[b]! |= TRACK_E;
    } else if (b === a + cols) {
      masks[a]! |= TRACK_S;
      masks[b]! |= TRACK_N;
    } else {
      masks[a]! |= TRACK_N;
      masks[b]! |= TRACK_S;
    }
  }
  return masks;
}

export function tracksGivenCount(spec: TracksPuzzle): number {
  let n = 0;
  for (const m of spec.given) if (m) n++;
  return n;
}

// Adds given pieces where the solver is still unsure until it finishes, then drops every given
// it can do without. What is left is a minimal set for this rule tier.
function chooseGivens(rng: Rng, puzzle: TracksPuzzle, solution: Uint8Array, path: number[], cfg: TracksConfig): boolean {
  const order = rng.shuffle([...path]);
  for (;;) {
    const res = solveTracks(puzzle, cfg.maxTier);
    if (res.contradiction) return false;
    if (res.solved) break;
    const cell = order.find((i) => !puzzle.given[i] && res.masks[i] !== solution[i]);
    if (cell === undefined || tracksGivenCount(puzzle) >= cfg.maxGivens) return false;
    puzzle.given[cell] = solution[cell]!;
  }
  for (const cell of order) {
    if (!puzzle.given[cell]) continue;
    const kept = puzzle.given[cell]!;
    puzzle.given[cell] = 0;
    if (!solveTracks(puzzle, cfg.maxTier).solved) puzzle.given[cell] = kept;
  }
  if (cfg.maxTier === 1) return true;
  return solveTracks(puzzle, cfg.maxTier).steps[cfg.maxTier - 1]! >= cfg.minTopSteps;
}

export function generateTracks(seed: number, difficulty: Difficulty): TracksSpec {
  const cfg = TRACKS_PRESETS[difficulty];
  const { cols, rows } = cfg;
  const rng = new Rng(seed);
  for (let attempt = 0; attempt < 40; attempt++) {
    const entryRow = rng.int(rows - 1);
    const exitCol = 1 + rng.int(cols - 1);
    const path = randomPath(rng, cfg, entryRow, exitCol);
    if (!path) continue;
    const rowCounts = new Uint8Array(rows);
    const colCounts = new Uint8Array(cols);
    for (const cell of path) {
      rowCounts[Math.floor(cell / cols)]!++;
      colCounts[cell % cols]!++;
    }
    const solution = solutionMasks(cols, rows, entryRow, exitCol, path);
    const puzzle: TracksPuzzle = { config: { cols, rows }, rowCounts, colCounts, entryRow, exitCol, given: new Uint8Array(cols * rows) };
    if (!chooseGivens(rng, puzzle, solution, path, cfg)) continue;
    return { ...puzzle, version: TRACKS_VERSION, seed, difficulty, config: cfg, solution, path: Uint16Array.from(path) };
  }
  throw new Error(`could not generate tracks puzzle for seed ${seed} / ${cols}x${rows}`);
}

export { tracksOutside };
```

Append to `packages/core/src/tracks/solver.ts`:

```ts
import type { TracksSpec } from './puzzle.ts';

export interface TracksDifficultyReport {
  score: number;
  steps: [number, number, number];
  cells: number;
  givens: number;
  length: number;
  turns: number;
}

function pathTurns(path: ArrayLike<number>): number {
  let turns = 0;
  for (let i = 2; i < path.length; i++) if (path[i]! - path[i - 1]! !== path[i - 1]! - path[i - 2]!) turns++;
  return turns;
}

export function tracksDifficultyReport(spec: TracksSpec): TracksDifficultyReport {
  const res = solveTracks(spec, 3);
  const [t1, t2, t3] = res.steps;
  const cells = spec.config.cols * spec.config.rows;
  let givens = 0;
  for (const m of spec.given) if (m) givens++;
  const turns = pathTurns(spec.path);
  const score = t1 * 0.2 + t2 * 1.5 + t3 * 6 + Math.log2(cells) * 2 + spec.path.length * 0.3 + turns * 0.2 - givens * 2;
  return { score: Math.round(score * 10) / 10, steps: res.steps, cells, givens, length: spec.path.length, turns };
}

// A and B pin the orientation, so no board has a mirror twin to fold onto.
export function tracksCanonicalKey(spec: TracksPuzzle): string {
  const { cols, rows } = spec.config;
  const given = [...spec.given].map((m) => m.toString(16)).join('');
  return `tracks${cols}x${rows}|${spec.entryRow}|${spec.exitCol}|${[...spec.rowCounts].join('.')}|${[...spec.colCounts].join('.')}|${given}`;
}

// Vocabulary: how winding the track is, how long it runs, how many pieces are handed over.
export function tracksFamilyKey(spec: TracksSpec): string {
  const r = tracksDifficultyReport(spec);
  return `t${Math.round(r.turns / 3)}/l${Math.round(r.length / 4)}/g${r.givens}`;
}
```

(Move the `import type { TracksSpec }` line to the top of solver.ts with the other imports; a type-only import does not create a runtime cycle.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @puzzle-hustle/core exec vitest run test/tracks.test.ts`
Expected: PASS. If the genius test exceeds 60 s or throws, lower `genius.minTopSteps` to 2 and `maxPath` to 90, rerun, and note the change in the commit message.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tracks/puzzle.ts packages/core/src/tracks/solver.ts packages/core/test/tracks.test.ts
git commit -m "Generate Train Tracks puzzles that the tiered solver finishes"
```

---

### Task 3: Player state, drag steps and hints

**Files:**
- Modify: `packages/core/src/tracks/puzzle.ts` (append)
- Test: `packages/core/test/tracks.test.ts`

**Interfaces:**
- Consumes: `TracksSpec`, `generateTracks`, `TRACK_*`, `tracksOutside`.
- Produces:
  - `type TracksState = number[]` (per cell: bit `TRACKS_STATE_E = 1` edge to the east neighbour, `TRACKS_STATE_S = 2` edge to the south neighbour, `TRACKS_STATE_X = 4` cross)
  - `emptyTracksState(spec: TracksSpec): TracksState`
  - `validTracksState(spec: TracksSpec, initial: number[] | undefined): TracksState`
  - `tracksMask(spec: TracksSpec, state: TracksState, cell: number): number`
  - `tracksHasEdge(spec: TracksSpec, state: TracksState, a: number, b: number): boolean`
  - `tracksSetEdge(spec: TracksSpec, state: TracksState, a: number, b: number, on: boolean): TracksState | null`
  - `tracksToggleCross(spec: TracksSpec, state: TracksState, cell: number): TracksState | null`
  - `tracksStepToward(cols: number, from: number, to: number): number`
  - `isTracksSolved(spec: TracksSpec, state: TracksState): boolean`
  - `tracksLineCounts(spec: TracksSpec, state: TracksState): { rows: number[]; cols: number[] }`
  - `type TracksHint = { kind: 'remove-edge'; a: number; b: number } | { kind: 'remove-cross'; cell: number } | { kind: 'place'; cell: number }`
  - `tracksHint(spec: TracksSpec, state: TracksState): TracksHint | null`, `applyTracksHint(spec: TracksSpec, state: TracksState, hint: TracksHint): TracksState`

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/test/tracks.test.ts` and extend the puzzle.ts import with the names used:

```ts
import {
  applyTracksHint,
  emptyTracksState,
  isTracksSolved,
  tracksHasEdge,
  tracksHint,
  tracksLineCounts,
  tracksMask,
  tracksSetEdge,
  tracksStepToward,
  tracksToggleCross,
  validTracksState,
} from '../src/tracks/puzzle.ts';

describe('tracks state', () => {
  const spec = generateTracks(2, 'easy');
  const cols = spec.config.cols;
  const free = (() => {
    // Two horizontally adjacent cells with no given piece and no stub, for edit tests.
    for (let i = 0; i < spec.solution.length - 2; i++) {
      if (i % cols >= cols - 2) continue;
      if (!spec.given[i] && !spec.given[i + 1] && !spec.given[i + 2] && !tracksMask(spec, emptyTracksState(spec), i) && !tracksMask(spec, emptyTracksState(spec), i + 1) && !tracksMask(spec, emptyTracksState(spec), i + 2)) return i;
    }
    throw new Error('no free cells');
  })();

  it('lays and lifts an edge', () => {
    const s1 = tracksSetEdge(spec, emptyTracksState(spec), free, free + 1, true)!;
    expect(tracksHasEdge(spec, s1, free, free + 1)).toBe(true);
    expect(tracksHasEdge(spec, s1, free + 1, free)).toBe(true);
    const s2 = tracksSetEdge(spec, s1, free + 1, free, false)!;
    expect(tracksHasEdge(spec, s2, free, free + 1)).toBe(false);
  });

  it('refuses a third connection, a diagonal and a given edge', () => {
    let s = emptyTracksState(spec);
    s = tracksSetEdge(spec, s, free, free + 1, true)!;
    s = tracksSetEdge(spec, s, free + 1, free + 2, true)!;
    const below = free + 1 + cols < spec.solution.length ? free + 1 + cols : free + 1 - cols;
    expect(tracksSetEdge(spec, s, free + 1, below, true)).toBeNull();
    expect(tracksSetEdge(spec, s, free, free + 1 + cols, true)).toBeNull();
    const g = spec.given.findIndex((m) => m !== 0 && (m & TRACK_E) !== 0);
    if (g >= 0) expect(tracksSetEdge(spec, s, g, g + 1, false)).toBeNull();
  });

  it('clears a cross when track is laid through it, and only crosses empty cells', () => {
    let s = tracksToggleCross(spec, emptyTracksState(spec), free)!;
    expect(s[free]! & 4).toBe(4);
    s = tracksSetEdge(spec, s, free, free + 1, true)!;
    expect(s[free]! & 4).toBe(0);
    expect(tracksToggleCross(spec, s, free)).toBeNull();
  });

  it('steps straight toward a target, never diagonally', () => {
    expect(tracksStepToward(8, 0, 2)).toBe(1);
    expect(tracksStepToward(8, 0, 16)).toBe(8);
    expect(tracksStepToward(8, 0, 17)).toBe(8);
    expect(tracksStepToward(8, 0, 10)).toBe(1);
    expect(tracksStepToward(8, 9, 9)).toBe(9);
  });

  it('drops a saved state that does not fit the board', () => {
    const n = spec.solution.length;
    expect(validTracksState(spec, undefined)).toEqual(emptyTracksState(spec));
    expect(validTracksState(spec, [1, 2])).toEqual(emptyTracksState(spec));
    expect(validTracksState(spec, new Array(n).fill(9))).toEqual(emptyTracksState(spec));
    const eastOffBoard = new Array(n).fill(0);
    eastOffBoard[cols - 1] = 1;
    expect(validTracksState(spec, eastOffBoard)).toEqual(emptyTracksState(spec));
    const ok = tracksSetEdge(spec, emptyTracksState(spec), free, free + 1, true)!;
    expect(validTracksState(spec, ok)).toEqual(ok);
  });

  it('is solved exactly when the track matches, and counts lines', () => {
    let s = emptyTracksState(spec);
    expect(isTracksSolved(spec, s)).toBe(false);
    for (let hint = tracksHint(spec, s); hint; hint = tracksHint(spec, s)) s = applyTracksHint(spec, s, hint);
    expect(isTracksSolved(spec, s)).toBe(true);
    const counts = tracksLineCounts(spec, s);
    expect(counts.rows).toEqual([...spec.rowCounts]);
    expect(counts.cols).toEqual([...spec.colCounts]);
  });

  it('removes a wrong piece before laying anything', () => {
    let s = emptyTracksState(spec);
    let wrong: [number, number] | null = null;
    for (let i = 0; i < spec.solution.length && !wrong; i++) {
      if (i % cols === cols - 1) continue;
      if (spec.solution[i]! & TRACK_E) continue;
      const next = tracksSetEdge(spec, s, i, i + 1, true);
      if (next) {
        s = next;
        wrong = [i, i + 1];
      }
    }
    expect(tracksHint(spec, s)).toEqual({ kind: 'remove-edge', a: wrong![0], b: wrong![1] });
  });

  it('reaches the solution from a messy board by hints alone', () => {
    const m = generateTracks(3, 'medium');
    const mc = m.config.cols;
    let s = emptyTracksState(m);
    const rng = new Rng(5);
    for (let k = 0; k < 40; k++) {
      const a = rng.int(m.solution.length);
      const b = a % mc < mc - 1 && rng.int(2) ? a + 1 : a + mc;
      if (b >= m.solution.length) continue;
      s = tracksSetEdge(m, s, a, b, true) ?? s;
      if (rng.int(4) === 0) s = tracksToggleCross(m, s, rng.int(m.solution.length)) ?? s;
    }
    let guard = 0;
    for (let hint = tracksHint(m, s); hint && guard < 500; hint = tracksHint(m, s), guard++) s = applyTracksHint(m, s, hint);
    expect(isTracksSolved(m, s)).toBe(true);
    expect(tracksHint(m, s)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @puzzle-hustle/core exec vitest run test/tracks.test.ts`
Expected: FAIL, the new names are not exported.

- [ ] **Step 3: Implement state and hints**

Append to `packages/core/src/tracks/puzzle.ts`:

```ts
export const TRACKS_STATE_E = 1;
export const TRACKS_STATE_S = 2;
export const TRACKS_STATE_X = 4;

export type TracksState = number[];

export function emptyTracksState(spec: TracksSpec): TracksState {
  return new Array<number>(spec.config.cols * spec.config.rows).fill(0);
}

export function validTracksState(spec: TracksSpec, initial: number[] | undefined): TracksState {
  const { cols, rows } = spec.config;
  if (!initial || initial.length !== cols * rows) return emptyTracksState(spec);
  for (let i = 0; i < initial.length; i++) {
    const v = initial[i]!;
    if (!Number.isInteger(v) || v < 0 || v > 7) return emptyTracksState(spec);
    if (v & TRACKS_STATE_E && i % cols === cols - 1) return emptyTracksState(spec);
    if (v & TRACKS_STATE_S && Math.floor(i / cols) === rows - 1) return emptyTracksState(spec);
  }
  return [...initial];
}

// The edge between a and its neighbour in direction bit d, as the pair (lower cell, own bit).
function edgeSlot(cols: number, a: number, b: number): [number, number] | null {
  if (b === a + 1 && a % cols !== cols - 1) return [a, TRACKS_STATE_E];
  if (b === a - 1 && b % cols !== cols - 1) return [b, TRACKS_STATE_E];
  if (b === a + cols) return [a, TRACKS_STATE_S];
  if (b === a - cols) return [b, TRACKS_STATE_S];
  return null;
}

function givenEdge(spec: TracksSpec, low: number, bit: number): boolean {
  const cols = spec.config.cols;
  if (bit === TRACKS_STATE_E) return (spec.given[low]! & TRACK_E) !== 0 || (spec.given[low + 1]! & TRACK_W) !== 0;
  return (spec.given[low]! & TRACK_S) !== 0 || (spec.given[low + cols]! & TRACK_N) !== 0;
}

export function tracksHasEdge(spec: TracksSpec, state: TracksState, a: number, b: number): boolean {
  const slot = edgeSlot(spec.config.cols, a, b);
  if (!slot) return false;
  return (state[slot[0]]! & slot[1]) !== 0 || givenEdge(spec, slot[0], slot[1]);
}

export function tracksMask(spec: TracksSpec, state: TracksState, cell: number): number {
  const { cols, rows } = spec.config;
  const r = Math.floor(cell / cols);
  const c = cell % cols;
  let m = tracksOutside(spec, cell);
  if (r > 0 && tracksHasEdge(spec, state, cell, cell - cols)) m |= TRACK_N;
  if (c < cols - 1 && tracksHasEdge(spec, state, cell, cell + 1)) m |= TRACK_E;
  if (r < rows - 1 && tracksHasEdge(spec, state, cell, cell + cols)) m |= TRACK_S;
  if (c > 0 && tracksHasEdge(spec, state, cell, cell - 1)) m |= TRACK_W;
  return m;
}

function bits(m: number): number {
  let n = 0;
  for (; m; m &= m - 1) n++;
  return n;
}

export function tracksSetEdge(spec: TracksSpec, state: TracksState, a: number, b: number, on: boolean): TracksState | null {
  const total = spec.config.cols * spec.config.rows;
  if (a < 0 || b < 0 || a >= total || b >= total) return null;
  const slot = edgeSlot(spec.config.cols, a, b);
  if (!slot) return null;
  const [low, bit] = slot;
  if (givenEdge(spec, low, bit)) return null;
  const has = (state[low]! & bit) !== 0;
  if (has === on) return null;
  if (on && (bits(tracksMask(spec, state, a)) >= 2 || bits(tracksMask(spec, state, b)) >= 2)) return null;
  const next = [...state];
  next[low] = on ? next[low]! | bit : next[low]! & ~bit;
  if (on) {
    next[a] = next[a]! & ~TRACKS_STATE_X;
    next[b] = next[b]! & ~TRACKS_STATE_X;
  }
  return next;
}

export function tracksToggleCross(spec: TracksSpec, state: TracksState, cell: number): TracksState | null {
  if (cell < 0 || cell >= state.length || tracksMask(spec, state, cell) !== 0) return null;
  const next = [...state];
  next[cell] = next[cell]! ^ TRACKS_STATE_X;
  return next;
}

// One straight step from `from` toward `to`. A swipe that jumped diagonally between two
// pointer events walks the longer axis first, so no diagonal or skipping edge ever appears.
export function tracksStepToward(cols: number, from: number, to: number): number {
  const dr = Math.floor(to / cols) - Math.floor(from / cols);
  const dc = (to % cols) - (from % cols);
  if (dr === 0 && dc === 0) return from;
  if (Math.abs(dc) >= Math.abs(dr)) return from + Math.sign(dc);
  return from + cols * Math.sign(dr);
}

export function isTracksSolved(spec: TracksSpec, state: TracksState): boolean {
  for (let i = 0; i < spec.solution.length; i++) if (tracksMask(spec, state, i) !== spec.solution[i]) return false;
  return true;
}

export function tracksLineCounts(spec: TracksSpec, state: TracksState): { rows: number[]; cols: number[] } {
  const { cols, rows } = spec.config;
  const out = { rows: new Array<number>(rows).fill(0), cols: new Array<number>(cols).fill(0) };
  for (let i = 0; i < cols * rows; i++) {
    if (!tracksMask(spec, state, i)) continue;
    out.rows[Math.floor(i / cols)]!++;
    out.cols[i % cols]!++;
  }
  return out;
}

export type TracksHint = { kind: 'remove-edge'; a: number; b: number } | { kind: 'remove-cross'; cell: number } | { kind: 'place'; cell: number };

export function tracksHint(spec: TracksSpec, state: TracksState): TracksHint | null {
  const cols = spec.config.cols;
  for (let i = 0; i < state.length; i++) {
    if (state[i]! & TRACKS_STATE_E && !(spec.solution[i]! & TRACK_E)) return { kind: 'remove-edge', a: i, b: i + 1 };
    if (state[i]! & TRACKS_STATE_S && !(spec.solution[i]! & TRACK_S)) return { kind: 'remove-edge', a: i, b: i + cols };
  }
  for (let i = 0; i < state.length; i++) if (state[i]! & TRACKS_STATE_X && spec.solution[i]) return { kind: 'remove-cross', cell: i };
  for (const cell of spec.path) if (tracksMask(spec, state, cell) !== spec.solution[cell]) return { kind: 'place', cell };
  return null;
}

export function applyTracksHint(spec: TracksSpec, state: TracksState, hint: TracksHint): TracksState {
  const cols = spec.config.cols;
  const next = [...state];
  if (hint.kind === 'remove-edge') {
    const slot = edgeSlot(cols, hint.a, hint.b)!;
    next[slot[0]] = next[slot[0]]! & ~slot[1];
    return next;
  }
  if (hint.kind === 'remove-cross') {
    next[hint.cell] = next[hint.cell]! & ~TRACKS_STATE_X;
    return next;
  }
  const cell = hint.cell;
  const want = spec.solution[cell]!;
  const neighbours: [number, number][] = [
    [TRACK_N, cell - cols],
    [TRACK_E, cell + 1],
    [TRACK_S, cell + cols],
    [TRACK_W, cell - 1],
  ];
  for (const [dir, other] of neighbours) {
    if (!(want & dir)) continue;
    const slot = edgeSlot(cols, cell, other);
    if (!slot || givenEdge(spec, slot[0], slot[1])) continue;
    next[slot[0]] = next[slot[0]]! | slot[1];
    next[other] = next[other]! & ~TRACKS_STATE_X;
  }
  next[cell] = next[cell]! & ~TRACKS_STATE_X;
  return next;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @puzzle-hustle/core exec vitest run test/tracks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tracks/puzzle.ts packages/core/test/tracks.test.ts
git commit -m "Add Train Tracks board state, swipe steps and hints"
```

---

### Task 4: Register the type in core

**Files:**
- Modify: `packages/core/src/types.ts`, `packages/core/src/registry.ts`, `packages/core/src/index.ts`, `packages/core/src/cosmetics.ts`, `packages/core/scripts/capacity.ts`

**Interfaces:**
- Consumes: `generateTracks`, `TRACKS_VERSION`, `tracksCanonicalKey`, `tracksDifficultyReport`, `tracksFamilyKey`.
- Produces: `'tracks'` in `PUZZLE_TYPES`, `PUZZLE_META.tracks`, `tracksAdapter: PuzzleAdapter<Record<string, never>>`, exports of both tracks modules from `@puzzle-hustle/core`.

- [ ] **Step 1: Add the type**

In `packages/core/src/types.ts` change the list and add the meta entry:

```ts
export const PUZZLE_TYPES = ['zip', 'shapes', 'nonogram', 'mosaic', 'crowns', 'stars', 'sudoku', 'killer', 'tracks'] as const;
```

```ts
  tracks: {
    id: 'tracks',
    name: 'Train Tracks',
    tagline: 'Lay one track from A to B. The numbers count the track cells in each row and column.',
  },
```

- [ ] **Step 2: Add the adapter**

In `packages/core/src/registry.ts` add the imports and, below `zipAdapter`:

```ts
import { generateTracks, TRACKS_VERSION } from './tracks/puzzle.ts';
import { tracksCanonicalKey, tracksDifficultyReport, tracksFamilyKey } from './tracks/solver.ts';
```

```ts
const tracks = reuse(generateTracks);

// No period options yet: hard and genius are not in the weekly/monthly rotation.
export const tracksAdapter: PuzzleAdapter<Record<string, never>> = {
  version: TRACKS_VERSION,
  options() {
    return {};
  },
  accepts(seed, difficulty) {
    try {
      tracks(seed, difficulty);
      return true;
    } catch {
      return false;
    }
  },
  key(seed, difficulty) {
    return tracksCanonicalKey(tracks(seed, difficulty));
  },
  score(seed, difficulty) {
    return tracksDifficultyReport(tracks(seed, difficulty)).score;
  },
  family(seed, difficulty) {
    return tracksFamilyKey(tracks(seed, difficulty));
  },
};
```

and `tracks: tracksAdapter as PuzzleAdapter<never>,` in `ADAPTERS`.

- [ ] **Step 3: Export and cosmetics**

In `packages/core/src/index.ts` append:

```ts
export * from './tracks/puzzle.ts';
export * from './tracks/solver.ts';
```

Remove the trailing `export { tracksOutside };` from puzzle.ts if the index re-export reports a duplicate export.

In `packages/core/src/cosmetics.ts` add to `PACK_FLAIRS`:

```ts
  tracks: {
    easy: { id: 'track-layer', title: 'Track Layer' },
    medium: { id: 'signal-keeper', title: 'Signal Keeper' },
    hard: { id: 'switchman', title: 'Switchman' },
    genius: { id: 'railway-baron', title: 'Railway Baron' },
  },
```

- [ ] **Step 4: Capacity probe**

In `packages/core/scripts/capacity.ts` import `generateTracks`, `tracksCanonicalKey`, `tracksFamilyKey` and add to `probes`:

```ts
  // Vocabulary = turns, length and handed-over pieces, same as the level generator's family.
  tracks: {
    build: (seed, difficulty) => generateTracks(seed, difficulty),
    key: (spec: ReturnType<typeof generateTracks>) => tracksCanonicalKey(spec),
    family: (spec: ReturnType<typeof generateTracks>) => tracksFamilyKey(spec),
  },
```

- [ ] **Step 5: Typecheck and test**

Run: `pnpm -r typecheck` then `pnpm --filter @puzzle-hustle/core test`
Expected: typecheck fails only in `apps/web` (`HOW_TO` misses `tracks`) and the level pack test fails for `tracks` (no levels yet). Both are fixed in Tasks 5 and 6. Core typecheck passes.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/registry.ts packages/core/src/index.ts packages/core/src/cosmetics.ts packages/core/scripts/capacity.ts packages/core/src/tracks/puzzle.ts
git commit -m "Register Train Tracks as a puzzle type"
```

---

### Task 5: Level pack

**Files:**
- Modify: `packages/core/src/levels.json` (generated), `packages/core/test/levels.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/core/test/levels.test.ts` add imports and assertions:

```ts
import { TRACKS_PRESETS, TRACKS_VERSION, generateTracks } from '../src/tracks/puzzle.ts';
import { solveTracks, tracksCanonicalKey } from '../src/tracks/solver.ts';
```

In `'matches the current generator version'`: `expect(LEVEL_PACK.versions.tracks).toBe(TRACKS_VERSION);`

New test next to the zip one:

```ts
  // Hard and genius probe with lookahead and are too slow to re-verify in CI, like zip.
  it('has 50 distinct tracks levels for easy and medium that the solver finishes', () => {
    for (const difficulty of ['easy', 'medium'] as const) {
      const list = levelList('tracks', difficulty);
      expect(list.length).toBe(50);
      const keys = new Set<string>();
      for (const entry of list) {
        const spec = generateTracks(entry.seed, difficulty);
        expect(solveTracks(spec, TRACKS_PRESETS[difficulty].maxTier).solved).toBe(true);
        keys.add(tracksCanonicalKey(spec));
      }
      expect(keys.size).toBe(list.length);
    }
  }, 120_000);
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @puzzle-hustle/core exec vitest run test/levels.test.ts`
Expected: FAIL, no `tracks` versions or levels.

- [ ] **Step 3: Generate the levels**

Run in `packages/core`: `pnpm levels 50 tracks easy,medium`, then `pnpm levels 50 tracks hard,genius` (the second run can take many minutes; run it in the background and note the time per difficulty from the script's output).
Expected: `tracks/<difficulty>: 50 levels from 150 candidates ...` for each difficulty and `wrote .../levels.json`. Other types' entries are unchanged: `git diff --stat packages/core/src/levels.json` shows only additions.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @puzzle-hustle/core test`
Expected: PASS for all core tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/levels.json packages/core/test/levels.test.ts
git commit -m "Ship 50 Train Tracks levels per difficulty"
```

---

### Task 6: Web game component and wiring

**Files:**
- Create: `apps/web/src/tracks/TracksGame.tsx`, `apps/web/src/tracks/tracks.css`
- Modify: `apps/web/src/pages/Play.tsx`, `apps/web/src/components/PuzzleIcon.tsx`, `apps/web/src/lib/howto.ts`

**Interfaces:**
- Consumes: everything from Tasks 3 and 4 via `@puzzle-hustle/core`.
- Produces: `TracksGame` with the shared props (`spec, onMove, onSolved, onHintUsed, requestHint, hintAd, locked, initialState, onStateChange`).

- [ ] **Step 1: How-to text**

In `apps/web/src/lib/howto.ts` add:

```ts
  tracks: [
    'Lay one track from A on the left edge to B on the bottom edge.',
    'The numbers count the track cells in each row and column. A number turns green when its line is right.',
    'Pieces are straight or curved. The track never branches, never crosses itself and forms no separate loops. Given pieces stay put.',
    'Drag across cells to lay track, drag along it again to lift it. Tap an empty cell to mark it with an X.',
  ],
```

- [ ] **Step 2: The component**

Create `apps/web/src/tracks/TracksGame.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import {
  TRACK_E,
  TRACK_N,
  TRACK_S,
  TRACK_W,
  applyTracksHint,
  emptyTracksState,
  isTracksSolved,
  tracksHasEdge,
  tracksHint,
  tracksLineCounts,
  tracksMask,
  tracksSetEdge,
  tracksStepToward,
  tracksToggleCross,
  validTracksState,
  type TracksSpec,
  type TracksState,
} from '@puzzle-hustle/core';
import { useHistory } from '../lib/useHistory.ts';
import { ResetButton } from '../components/ResetButton.tsx';
import { AdBadge, ToolButton } from '../components/ToolButton.tsx';
import './tracks.css';

export interface TracksGameProps {
  spec: TracksSpec;
  onMove(): void;
  onSolved(): void;
  onHintUsed(): void;
  requestHint(): Promise<boolean>;
  hintAd?: boolean;
  locked: boolean;
  initialState?: number[] | undefined;
  onStateChange?(state: number[]): void;
}

interface Drag {
  pointerId: number;
  start: number;
  last: number;
  mode: 'lay' | 'lift' | null;
  moved: boolean;
  remembered: boolean;
}

// Room around the grid: A's stub on the left, the column numbers on top, the row numbers on the
// right, B's stub below. In cell units, matching the viewBox.
const PAD_L = 0.6;
const PAD_T = 1;
const PAD_R = 1;
const PAD_B = 0.6;

function edgePoint(c: number, r: number, dir: number): [number, number] {
  if (dir === TRACK_N) return [c + 0.5, r];
  if (dir === TRACK_E) return [c + 1, r + 0.5];
  if (dir === TRACK_S) return [c + 0.5, r + 1];
  return [c, r + 0.5];
}

// Straight pieces are lines, curves a quadratic bend through the cell centre, a dangling end a
// stub from the centre to the edge.
function piecePath(c: number, r: number, mask: number): string {
  const dirs = [TRACK_N, TRACK_E, TRACK_S, TRACK_W].filter((d) => mask & d);
  const cx = c + 0.5;
  const cy = r + 0.5;
  if (dirs.length === 1) {
    const [x, y] = edgePoint(c, r, dirs[0]!);
    return `M${cx} ${cy}L${x} ${y}`;
  }
  const [x1, y1] = edgePoint(c, r, dirs[0]!);
  const [x2, y2] = edgePoint(c, r, dirs[1]!);
  const straight = (dirs[0]! | dirs[1]!) === (TRACK_N | TRACK_S) || (dirs[0]! | dirs[1]!) === (TRACK_E | TRACK_W);
  return straight ? `M${x1} ${y1}L${x2} ${y2}` : `M${x1} ${y1}Q${cx} ${cy} ${x2} ${y2}`;
}

export function TracksGame({ spec, onMove, onSolved, onHintUsed, requestHint, hintAd, locked, initialState, onStateChange }: TracksGameProps) {
  const { cols, rows } = spec.config;
  const [state, setState] = useState<TracksState>(() => validTracksState(spec, initialState));
  const [flash, setFlash] = useState<number | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const stateRef = useRef(state);
  const drag = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const history = useHistory<TracksState>();
  const solved = isTracksSolved(spec, state);

  useEffect(() => {
    if (solved) onSolved();
  }, [solved, onSolved]);

  function commit(next: TracksState) {
    stateRef.current = next;
    setState(next);
    onMove();
    onStateChange?.([...next]);
  }

  function rememberOnce(d: Drag) {
    if (d.remembered) return;
    d.remembered = true;
    history.remember(stateRef.current);
  }

  function cellAt(e: React.PointerEvent): number | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * (cols + PAD_L + PAD_R) - PAD_L;
    const y = ((e.clientY - rect.top) / rect.height) * (rows + PAD_T + PAD_B) - PAD_T;
    const c = Math.floor(x);
    const r = Math.floor(y);
    if (r < 0 || c < 0 || r >= rows || c >= cols) return null;
    return r * cols + c;
  }

  function startDrag(e: React.PointerEvent<SVGSVGElement>) {
    if (locked || solved || drag.current) return;
    const cell = cellAt(e);
    if (cell === null) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { pointerId: e.pointerId, start: cell, last: cell, mode: null, moved: false, remembered: false };
  }

  function moveDrag(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const cell = cellAt(e);
    if (cell === null || cell === d.last) return;
    // The drag that completed the track must not keep going and lift a piece of it again.
    if (isTracksSolved(spec, stateRef.current)) {
      drag.current = null;
      return;
    }
    while (d.last !== cell) {
      const step = tracksStepToward(cols, d.last, cell);
      const cur = stateRef.current;
      d.mode ??= tracksHasEdge(spec, cur, d.last, step) ? 'lift' : 'lay';
      const next = tracksSetEdge(spec, cur, d.last, step, d.mode === 'lay');
      if (next) {
        rememberOnce(d);
        commit(next);
      }
      d.last = step;
      d.moved = true;
    }
  }

  function endDrag(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (d.moved) return;
    const next = tracksToggleCross(spec, stateRef.current, d.start);
    if (!next) return;
    rememberOnce(d);
    commit(next);
  }

  async function useHint() {
    if (hintBusy || locked || solved) return;
    const h = tracksHint(spec, stateRef.current);
    if (!h) return;
    setHintBusy(true);
    const ok = await requestHint();
    setHintBusy(false);
    if (!ok) return;
    onHintUsed();
    history.remember(stateRef.current);
    commit(applyTracksHint(spec, stateRef.current, h));
    const at = h.kind === 'remove-edge' ? h.a : h.cell;
    setFlash(at);
    setTimeout(() => setFlash(null), 3000);
  }

  function reset() {
    if (locked || solved) return;
    if (stateRef.current.every((v) => v === 0)) return;
    history.remember(stateRef.current);
    commit(emptyTracksState(spec));
  }

  function undo() {
    if (locked || solved) return;
    const prev = history.undo(stateRef.current);
    if (prev) commit(prev);
  }

  function redo() {
    if (locked || solved) return;
    const next = history.redo(stateRef.current);
    if (next) commit(next);
  }

  const counts = tracksLineCounts(spec, state);
  const cells: React.ReactNode[] = [];
  const pieces: React.ReactNode[] = [];
  const crosses: React.ReactNode[] = [];
  for (let i = 0; i < cols * rows; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    cells.push(<rect key={i} className={flash === i ? 'tracks-cell flash' : 'tracks-cell'} x={c} y={r} width={1} height={1} />);
    const m = tracksMask(spec, state, i);
    if (m) pieces.push(<path key={`p${i}`} className={spec.given[i] ? 'tracks-piece given' : 'tracks-piece'} d={piecePath(c, r, m)} />);
    if (state[i]! & 4) {
      crosses.push(
        <g key={`x${i}`} className="tracks-cross">
          <line x1={c + 0.35} y1={r + 0.35} x2={c + 0.65} y2={r + 0.65} />
          <line x1={c + 0.65} y1={r + 0.35} x2={c + 0.35} y2={r + 0.65} />
        </g>,
      );
    }
  }
  const lineClass = (have: number, want: number) => (have === want ? 'tracks-count done' : have > want ? 'tracks-count over' : 'tracks-count');
  const entryY = spec.entryRow + 0.5;
  const exitX = spec.exitCol + 0.5;

  return (
    <div className="tracks-wrap" style={{ '--cols': cols, '--rows': rows } as React.CSSProperties}>
      <div className={solved ? 'tracks-board board-frame solved' : 'tracks-board board-frame'}>
        <svg
          ref={svgRef}
          className="tracks-svg"
          viewBox={`${-PAD_L} ${-PAD_T} ${cols + PAD_L + PAD_R} ${rows + PAD_T + PAD_B}`}
          role="application"
          aria-label="Train Tracks board"
          tabIndex={locked ? -1 : 0}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onContextMenu={(e) => e.preventDefault()}
        >
          <g className="tracks-cells">{cells}</g>
          <g className="tracks-crosses">{crosses}</g>
          <line className="tracks-piece given" x1={-PAD_L} y1={entryY} x2={0} y2={entryY} />
          <line className="tracks-piece given" x1={exitX} y1={rows} x2={exitX} y2={rows + PAD_B} />
          <g className="tracks-pieces">{pieces}</g>
          <text className="tracks-end" x={-PAD_L / 2} y={entryY - 0.28}>
            A
          </text>
          <text className="tracks-end" x={exitX + 0.3} y={rows + PAD_B / 2}>
            B
          </text>
          {[...spec.colCounts].map((want, c) => (
            <text key={`c${c}`} className={lineClass(counts.cols[c]!, want)} x={c + 0.5} y={-0.5}>
              {want}
            </text>
          ))}
          {[...spec.rowCounts].map((want, r) => (
            <text key={`r${r}`} className={lineClass(counts.rows[r]!, want)} x={cols + 0.5} y={r + 0.5}>
              {want}
            </text>
          ))}
        </svg>
      </div>

      {!solved && (
        <div className="tools">
          <ResetButton onReset={reset} disabled={locked} />
          <ToolButton icon="undo" label="Undo" onClick={undo} disabled={locked || !history.canUndo} />
          <ToolButton icon="redo" label="Redo" onClick={redo} disabled={locked || !history.canRedo(state)} />
          <ToolButton icon="hint" label="Hint" onClick={useHint} disabled={locked || hintBusy} badge={hintAd ? <AdBadge /> : null} />
        </div>
      )}
    </div>
  );
}
```

Create `apps/web/src/tracks/tracks.css`:

```css
/* The board is (cols + 1.6) cells wide and (rows + 1.6) cells tall including the numbers and
   the A and B stubs. Width decides the cell size; at ten columns on a phone that leaves the
   15 rows of genius room below, so no zoom is needed. */
.tracks-wrap {
  --cell: min(calc(180px / var(--cols) + 22px), calc((100cqw - 4px) / (var(--cols) + 1.6)));
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  container-type: inline-size;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.tracks-board { max-width: 100%; touch-action: none; line-height: 0; }
.tracks-wrap .tools { width: calc((var(--cols) + 1.6) * var(--cell) + 4px); max-width: 100%; }
.tracks-svg {
  width: calc((var(--cols) + 1.6) * var(--cell));
  height: calc((var(--rows) + 1.6) * var(--cell));
  display: block;
  touch-action: none;
  outline: none;
}
.tracks-svg:focus-visible { box-shadow: inset 0 0 0 2px var(--accent); }
.tracks-cell { fill: var(--board-cell); stroke: var(--board-line); stroke-width: 0.03; }
.tracks-cell.flash { animation: tracks-flash 0.75s ease-out 4; }
@keyframes tracks-flash {
  0%, 45% { fill: color-mix(in srgb, var(--success) 22%, transparent); stroke: var(--success); stroke-width: 0.12; }
  100% { fill: var(--board-cell); stroke: var(--board-line); stroke-width: 0.03; }
}
.tracks-piece { fill: none; stroke: var(--accent); stroke-width: 0.2; stroke-linecap: round; }
.tracks-piece.given { stroke: var(--text); }
.tracks-cross line { stroke: var(--muted, var(--text)); stroke-width: 0.07; stroke-linecap: round; opacity: 0.55; }
.tracks-count, .tracks-end {
  font-family: var(--font-num);
  font-size: 0.5px;
  font-weight: 700;
  text-anchor: middle;
  dominant-baseline: central;
  fill: var(--text);
}
.tracks-count.done { fill: var(--success); }
.tracks-count.over { fill: var(--danger); }
.tracks-end { font-size: 0.42px; fill: var(--accent-text, var(--accent)); }
.board-frame.solved .tracks-piece { stroke: var(--success); }
```

(Check `theme.css` for `--muted`, `--accent-text` and `--font-num` before relying on the fallbacks; use the zip board's tokens where they exist.)

- [ ] **Step 3: Wire Play.tsx**

In `apps/web/src/pages/Play.tsx`:
- import `generateTracks` from `@puzzle-hustle/core` and `TracksGame` from `../tracks/TracksGame.tsx`;
- put `puzzleRef.type === 'tracks' ? generateTracks(puzzleRef.seed, puzzleRef.difficulty) : ` at the front of the `spec` chain;
- put `'entryRow' in spec ? \`${spec.config.cols}×${spec.config.rows}\` : ` at the front of the `sizeLabel` chain;
- put this branch first in the board chain, directly after `{!showBoard ? null : `:

```tsx
'entryRow' in spec ? (
        <TracksGame
          spec={spec}
          onMove={onMove}
          onSolved={onSolved}
          onHintUsed={onHintUsed}
          requestHint={() => hintProvider.request()}
          hintAd={hintProvider !== freeHints}
          locked={false}
          initialState={saved?.state}
          onStateChange={onStateChange}
        />
      ) : 
```


- [ ] **Step 4: Icon and daily set in the pages**

In `apps/web/src/components/PuzzleIcon.tsx` add a branch before the `zip` one:

```tsx
      ) : type === 'tracks' ? (
        <svg viewBox="0 0 40 40">
          <g className="ic-grid">
            {[1, 2].map((i) => (
              <line key={`h${i}`} x1="6" y1={6 + i * 9.33} x2="34" y2={6 + i * 9.33} />
            ))}
            {[1, 2].map((i) => (
              <line key={`v${i}`} x1={6 + i * 9.33} y1="6" x2={6 + i * 9.33} y2="34" />
            ))}
          </g>
          <path d="M2 10.7H20Q24.7 10.7 24.7 15.3V24.7Q24.7 29.3 29.3 29.3H34" className="ic-path" />
        </svg>
```


- [ ] **Step 5: Typecheck, test, browser check**

Run: `pnpm -r typecheck` and `pnpm test`
Expected: both pass.

Run `pnpm dev`, open `/play?...` for a tracks level via Puzzles → Train Tracks, and take screenshots at 360×780 (S23) for easy #1, medium #1, genius #1 in light and dark. Expected: the genius board (10×15) plus timer bar and tools fits without scrolling the board off screen and without zoom; numbers readable; A and B labels visible. If genius does not fit, change `TRACKS_PRESETS.genius.rows` to 14, bump `TRACKS_VERSION` to 2, regenerate levels (Task 5 Step 3), rerun tests.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/tracks/TracksGame.tsx apps/web/src/tracks/tracks.css apps/web/src/pages/Play.tsx apps/web/src/components/PuzzleIcon.tsx apps/web/src/lib/howto.ts 
git commit -m "Play Train Tracks in the app"
```

---

### Task 7: On the device

- [ ] Build and install the debug APK on the S23: `pnpm build` in `apps/web`, `npx cap sync android`, `./gradlew.bat assembleDebug` in `apps/web/android`, `adb install -r app/build/outputs/apk/debug/app-debug.apk`.
- [ ] Play medium #1 and genius #1 by hand: swipe laying, lifting, tapping crosses, hint from a wrong piece, solved state. Time the medium: if it takes longer than about four minutes, set `DAILY_DIFFICULTY.tracks = 'easy'` in `schedule.ts` like Stars and Killer.
