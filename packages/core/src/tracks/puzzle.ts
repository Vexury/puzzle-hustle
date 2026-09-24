import { Rng } from '../rng.ts';
import type { Difficulty } from '../types.ts';
import { TRACK_E, TRACK_N, TRACK_S, TRACK_W, solveTracks, tracksGivenCount, tracksOutside, type TracksPuzzle } from './solver.ts';

export const TRACKS_VERSION = 3;

export interface TracksConfig {
  cols: number;
  rows: number;
  minPath: number;
  maxPath: number;
  maxTier: 1 | 2 | 3;
  // How many deductions the top allowed tier must contribute, so a medium board is not
  // secretly an easy one.
  minTopSteps: number;
  // Softeners on top of the minimal set: extra given pieces, and a cap on the top tier's
  // deductions, so a hard rule shows up a few times instead of carrying the whole board.
  minGivens: number;
  maxTopSteps: number;
  maxGivens: number;
}

// Never wider than ten columns: on a phone that is the most that stays comfortable to swipe,
// and the harder boards grow downwards instead of needing zoom and pan.
export const TRACKS_PRESETS: Record<Difficulty, TracksConfig> = {
  easy: { cols: 6, rows: 6, minPath: 12, maxPath: 22, maxTier: 1, minTopSteps: 0, minGivens: 2, maxTopSteps: 0, maxGivens: 4 },
  medium: { cols: 8, rows: 8, minPath: 22, maxPath: 38, maxTier: 1, minTopSteps: 0, minGivens: 2, maxTopSteps: 0, maxGivens: 4 },
  hard: { cols: 10, rows: 10, minPath: 34, maxPath: 60, maxTier: 2, minTopSteps: 2, minGivens: 2, maxTopSteps: 8, maxGivens: 5 },
  genius: { cols: 10, rows: 12, minPath: 45, maxPath: 75, maxTier: 3, minTopSteps: 1, minGivens: 2, maxTopSteps: 6, maxGivens: 5 },
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

// A random self-avoiding walk from A to B whose length lands in [minPath, target] and that
// (R7) touches every row and every column at least once, so a tall or wide board never leaves
// a whole line without track. The goal cell is reserved until the walk may end there, and a
// branch is cut as soon as B can no longer be reached within the target length through the
// cells still free, or as soon as too few steps remain to still reach every uncovered row and
// column (each new cell can close out at most one missing row and one missing column, so that
// is the exact, cheap lower bound). Candidates are tried in an order biased toward opening a
// new row or column first: the walk still backtracks like a plain random walk, it is just far
// more likely to find a covering path on the first few branches it tries.
function randomPath(rng: Rng, cfg: TracksConfig, entryRow: number, exitCol: number): number[] | null {
  const { cols, rows } = cfg;
  const startCell = entryRow * cols;
  const goal = (rows - 1) * cols + exitCol;
  const target = cfg.minPath + rng.int(cfg.maxPath - cfg.minPath + 1);
  const used = new Uint8Array(cols * rows);
  used[startCell] = 1;
  const path = [startCell];
  const rowSeen = new Uint8Array(rows);
  const colSeen = new Uint8Array(cols);
  rowSeen[entryRow] = 1;
  colSeen[0] = 1;
  let rowsLeft = rows - 1;
  let colsLeft = cols - 1;
  let nodes = 0;
  const walk = (): boolean => {
    if (++nodes > 60_000) return false;
    const cur = path[path.length - 1]!;
    if (cur === goal) return path.length >= cfg.minPath && rowsLeft === 0 && colsLeft === 0;
    if (Math.max(rowsLeft, colsLeft) > target - path.length) return false;
    const dist = distances(cols, rows, used, goal);
    const r = Math.floor(cur / cols);
    const c = cur % cols;
    const options: { next: number; novel: number }[] = [];
    for (const [dr, dc] of STEPS) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
      const next = rr * cols + cc;
      if (used[next]) continue;
      if (next === goal && path.length + 1 < cfg.minPath) continue;
      if (dist[next]! < 0 || path.length + 1 + dist[next]! > target) continue;
      options.push({ next, novel: (rowSeen[rr] ? 0 : 1) + (colSeen[cc] ? 0 : 1) });
    }
    const order = rng.shuffle(options);
    order.sort((a, b) => b.novel - a.novel);
    for (const { next } of order) {
      const rr = Math.floor(next / cols);
      const cc = next % cols;
      const newRow = !rowSeen[rr];
      const newCol = !colSeen[cc];
      used[next] = 1;
      path.push(next);
      if (newRow) {
        rowSeen[rr] = 1;
        rowsLeft--;
      }
      if (newCol) {
        colSeen[cc] = 1;
        colsLeft--;
      }
      if (walk()) return true;
      path.pop();
      used[next] = 0;
      if (newRow) {
        rowSeen[rr] = 0;
        rowsLeft++;
      }
      if (newCol) {
        colSeen[cc] = 0;
        colsLeft++;
      }
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
  const top = () => solveTracks(puzzle, cfg.maxTier).steps[cfg.maxTier - 1]!;
  while (tracksGivenCount(puzzle) < cfg.minGivens || (cfg.maxTier > 1 && top() > cfg.maxTopSteps)) {
    const cell = order.find((i) => !puzzle.given[i]);
    if (cell === undefined || tracksGivenCount(puzzle) >= cfg.maxGivens) return false;
    puzzle.given[cell] = solution[cell]!;
  }
  return cfg.maxTier === 1 || top() >= cfg.minTopSteps;
}

export function generateTracks(seed: number, difficulty: Difficulty): TracksSpec {
  const cfg = TRACKS_PRESETS[difficulty];
  const { cols, rows } = cfg;
  const rng = new Rng(seed);
  for (let attempt = 0; attempt < 60; attempt++) {
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

export const TRACKS_STATE_E = 1;
export const TRACKS_STATE_S = 2;
export const TRACKS_STATE_X = 4;
export const TRACKS_STATE_T = 8;

export type TracksState = number[];

export function emptyTracksState(spec: TracksSpec): TracksState {
  return new Array<number>(spec.config.cols * spec.config.rows).fill(0);
}

export function validTracksState(spec: TracksSpec, initial: number[] | undefined): TracksState {
  const { cols, rows } = spec.config;
  if (!initial || initial.length !== cols * rows) return emptyTracksState(spec);
  for (let i = 0; i < initial.length; i++) {
    const v = initial[i]!;
    if (!Number.isInteger(v) || v < 0 || v > 15) return emptyTracksState(spec);
    if (v & TRACKS_STATE_X && v & TRACKS_STATE_T) return emptyTracksState(spec);
    if (v & TRACKS_STATE_E && i % cols === cols - 1) return emptyTracksState(spec);
    if (v & TRACKS_STATE_S && Math.floor(i / cols) === rows - 1) return emptyTracksState(spec);
  }
  // Laying never gives a cell a third connection, so a board that has one was saved on another puzzle.
  for (let i = 0; i < initial.length; i++) if (bits(tracksMask(spec, initial, i)) > 2) return emptyTracksState(spec);
  return [...initial];
}

// The edge between a and its neighbour in direction bit d, as the pair (lower cell, own bit).
// Both cells must land on the board: a stub neighbour (A's west, B's south) sits outside it and
// is never a real edge, and JS's `%` keeps the sign of a negative left operand, so a neighbour
// index of -1 must be rejected explicitly rather than trusted to fail the column-wrap check.
function edgeSlot(cols: number, total: number, a: number, b: number): [number, number] | null {
  if (a < 0 || b < 0 || a >= total || b >= total) return null;
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
  const slot = edgeSlot(spec.config.cols, spec.config.cols * spec.config.rows, a, b);
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
  const slot = edgeSlot(spec.config.cols, total, a, b);
  if (!slot) return null;
  const [low, bit] = slot;
  if (givenEdge(spec, low, bit)) return null;
  const has = (state[low]! & bit) !== 0;
  if (has === on) return null;
  if (on && (bits(tracksMask(spec, state, a)) >= 2 || bits(tracksMask(spec, state, b)) >= 2)) return null;
  const next = [...state];
  next[low] = on ? next[low]! | bit : next[low]! & ~bit;
  if (on) {
    next[a] = next[a]! & ~(TRACKS_STATE_X | TRACKS_STATE_T);
    next[b] = next[b]! & ~(TRACKS_STATE_X | TRACKS_STATE_T);
  }
  return next;
}

// A cell with no track connection cycles empty -> cross -> track-mark (direction still unknown)
// -> empty. A cell the track must enter (A/B, or a single given edge) but whose way on is still
// open toggles only the track mark, since a cross there could never be right. Tapping drawn
// track lifts the cell's drawn connections and starts the cycle at the cross (track mark for a
// forced cell). A given cell, or one with both ends fixed, never takes a mark.
export function tracksCycleMark(spec: TracksSpec, state: TracksState, cell: number): TracksState | null {
  if (cell < 0 || cell >= state.length) return null;
  const { cols } = spec.config;
  const m = tracksMask(spec, state, cell);
  const fixed = tracksMask(spec, emptyTracksState(spec), cell);
  const next = [...state];
  if (m !== fixed) {
    next[cell] = next[cell]! & ~(TRACKS_STATE_E | TRACKS_STATE_S);
    if (cell % cols > 0) next[cell - 1] = next[cell - 1]! & ~TRACKS_STATE_E;
    if (cell >= cols) next[cell - cols] = next[cell - cols]! & ~TRACKS_STATE_S;
    next[cell] = next[cell]! | (fixed ? TRACKS_STATE_T : TRACKS_STATE_X);
    return next;
  }
  const v = next[cell]!;
  if (m) {
    if (spec.given[cell] || bits(m) >= 2) return null;
    next[cell] = v ^ TRACKS_STATE_T;
    return next;
  }
  if (v & TRACKS_STATE_X) next[cell] = (v & ~TRACKS_STATE_X) | TRACKS_STATE_T;
  else if (v & TRACKS_STATE_T) next[cell] = v & ~TRACKS_STATE_T;
  else next[cell] = v | TRACKS_STATE_X;
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

// Counts the cells the board shows as track: given, closed by two given edges, drawn into by the
// player, or marked. A cell the track merely must enter (A/B, one given edge) waits for the player.
export function tracksLineCounts(spec: TracksSpec, state: TracksState): { rows: number[]; cols: number[] } {
  const { cols, rows } = spec.config;
  const out = { rows: new Array<number>(rows).fill(0), cols: new Array<number>(cols).fill(0) };
  const empty = emptyTracksState(spec);
  for (let i = 0; i < cols * rows; i++) {
    const m = tracksMask(spec, state, i);
    const shown = spec.given[i] || bits(m) >= 2 || m !== tracksMask(spec, empty, i);
    if (!shown && !(state[i]! & TRACKS_STATE_T)) continue;
    out.rows[Math.floor(i / cols)]!++;
    out.cols[i % cols]!++;
  }
  return out;
}

export type TracksHint = { kind: 'remove-edge'; a: number; b: number } | { kind: 'remove-mark'; cell: number } | { kind: 'place'; cell: number };

export function tracksHint(spec: TracksSpec, state: TracksState): TracksHint | null {
  const cols = spec.config.cols;
  for (let i = 0; i < state.length; i++) {
    if (state[i]! & TRACKS_STATE_E && !(spec.solution[i]! & TRACK_E)) return { kind: 'remove-edge', a: i, b: i + 1 };
    if (state[i]! & TRACKS_STATE_S && !(spec.solution[i]! & TRACK_S)) return { kind: 'remove-edge', a: i, b: i + cols };
  }
  for (let i = 0; i < state.length; i++) {
    if (state[i]! & TRACKS_STATE_X && spec.solution[i]) return { kind: 'remove-mark', cell: i };
    if (state[i]! & TRACKS_STATE_T && !spec.solution[i]) return { kind: 'remove-mark', cell: i };
  }
  for (const cell of spec.path) if (tracksMask(spec, state, cell) !== spec.solution[cell]) return { kind: 'place', cell };
  return null;
}

export function applyTracksHint(spec: TracksSpec, state: TracksState, hint: TracksHint): TracksState {
  const { cols, rows } = spec.config;
  const total = cols * rows;
  const next = [...state];
  if (hint.kind === 'remove-edge') {
    const slot = edgeSlot(cols, total, hint.a, hint.b)!;
    next[slot[0]] = next[slot[0]]! & ~slot[1];
    return next;
  }
  if (hint.kind === 'remove-mark') {
    next[hint.cell] = next[hint.cell]! & ~(TRACKS_STATE_X | TRACKS_STATE_T);
    return next;
  }
  const cell = hint.cell;
  // Exclude the outside A/B stub bits: they are not real neighbour edges, and for a cell on the
  // rim (entryRow 0, or exitCol at the last row) the "neighbour" in that direction sits off the
  // board entirely.
  const want = spec.solution[cell]! & ~tracksOutside(spec, cell);
  const neighbours: [number, number][] = [
    [TRACK_N, cell - cols],
    [TRACK_E, cell + 1],
    [TRACK_S, cell + cols],
    [TRACK_W, cell - 1],
  ];
  for (const [dir, other] of neighbours) {
    if (!(want & dir)) continue;
    const slot = edgeSlot(cols, total, cell, other);
    if (!slot || givenEdge(spec, slot[0], slot[1])) continue;
    next[slot[0]] = next[slot[0]]! | slot[1];
    next[other] = next[other]! & ~(TRACKS_STATE_X | TRACKS_STATE_T);
  }
  next[cell] = next[cell]! & ~(TRACKS_STATE_X | TRACKS_STATE_T);
  return next;
}
