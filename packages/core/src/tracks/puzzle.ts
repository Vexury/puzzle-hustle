import { Rng } from '../rng.ts';
import type { Difficulty } from '../types.ts';
import { TRACK_E, TRACK_N, TRACK_S, TRACK_W, solveTracks, tracksGivenCount, type TracksPuzzle } from './solver.ts';

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
