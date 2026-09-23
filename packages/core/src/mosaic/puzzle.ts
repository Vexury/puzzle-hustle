import { Rng } from '../rng.ts';
import type { Difficulty } from '../types.ts';
import { MOSAIC_MARKED_EMPTY, mosaicBlockCells, mosaicPropagate, mosaicSolveByLogic } from './solver.ts';

export { MOSAIC_MARKED_EMPTY } from './solver.ts';

export const MOSAIC_VERSION = 1;

export interface MosaicConfig {
  rows: number;
  cols: number;
  density: number;
  clueRatio: number;
}

export interface MosaicSpec {
  version: number;
  seed: number;
  difficulty: Difficulty;
  config: MosaicConfig;
  solution: Uint8Array;
  clues: Int8Array;
}

export type MosaicState = Uint8Array;

export const MOSAIC_PRESETS: Record<Difficulty, MosaicConfig> = {
  easy: { rows: 5, cols: 5, density: 0.5, clueRatio: 0.9 },
  medium: { rows: 8, cols: 8, density: 0.5, clueRatio: 0.8 },
  hard: { rows: 10, cols: 10, density: 0.5, clueRatio: 0.7 },
  genius: { rows: 15, cols: 15, density: 0.5, clueRatio: 0.6 },
};

export interface MosaicOptions {
  sizeDelta?: number;
}

export function mosaicConfig(difficulty: Difficulty, options: MosaicOptions = {}): MosaicConfig {
  const base = MOSAIC_PRESETS[difficulty];
  const delta = options.sizeDelta ?? 0;
  return { ...base, rows: base.rows + delta, cols: base.cols + delta };
}

export function mosaicClues(solution: Uint8Array, rows: number, cols: number): Int8Array {
  const out = new Int8Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let n = 0;
      for (const i of mosaicBlockCells(rows, cols, r, c)) if (solution[i] === 1) n++;
      out[r * cols + c] = n;
    }
  }
  return out;
}

const DIRS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

function randomSolution(config: MosaicConfig, rng: Rng): Uint8Array {
  const { rows, cols } = config;
  const grid = new Uint8Array(rows * cols);
  const target = Math.round(config.density * rows * cols);
  const filled: number[] = [];
  for (let guard = 0; filled.length < target && guard < 100_000; guard++) {
    if (filled.length > 0 && rng.next() < 0.9) {
      const i = rng.pick(filled);
      const [dr, dc] = rng.pick(DIRS);
      const r = Math.floor(i / cols) + dr;
      const c = (i % cols) + dc;
      if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
      const j = r * cols + c;
      if (grid[j]) continue;
      grid[j] = 1;
      filled.push(j);
    } else {
      const j = rng.int(rows * cols);
      if (grid[j]) continue;
      grid[j] = 1;
      filled.push(j);
    }
  }
  return grid;
}

function validSolution(grid: Uint8Array): boolean {
  return grid.some((v) => v === 1) && grid.some((v) => v === 0);
}

function usesPairwise(difficulty: Difficulty): boolean {
  return difficulty === 'hard' || difficulty === 'genius';
}

function initialClues(full: Int8Array, ratio: number, rng: Rng): Int8Array {
  const clues = new Int8Array(full.length).fill(-1);
  const order = rng.shuffle(Array.from(full, (_, i) => i));
  const keep = Math.ceil(ratio * full.length);
  for (let k = 0; k < keep; k++) {
    const i = order[k]!;
    clues[i] = full[i]!;
  }
  return clues;
}

function removeClues(spec: MosaicSpec, pairwise: boolean, rng: Rng): void {
  const present = Array.from(spec.clues, (v, i) => (v >= 0 ? i : -1)).filter((i) => i >= 0);
  for (const i of rng.shuffle(present)) {
    const prev = spec.clues[i]!;
    spec.clues[i] = -1;
    if (!mosaicSolveByLogic(spec, pairwise).solved) spec.clues[i] = prev;
  }
}

export function generateMosaic(seed: number, difficulty: Difficulty, options: MosaicOptions = {}): MosaicSpec {
  const config = mosaicConfig(difficulty, options);
  const rng = new Rng(seed);
  const pairwise = usesPairwise(difficulty);
  for (let attempt = 0; attempt < 2000; attempt++) {
    const solution = randomSolution(config, rng);
    if (!validSolution(solution)) continue;
    const clues = initialClues(mosaicClues(solution, config.rows, config.cols), config.clueRatio, rng);
    const spec: MosaicSpec = { version: MOSAIC_VERSION, seed, difficulty, config, solution, clues };
    if (!mosaicSolveByLogic(spec, pairwise).solved) continue;
    removeClues(spec, pairwise, rng);
    return spec;
  }
  throw new Error(`could not generate mosaic for seed ${seed} / ${difficulty}`);
}

export function emptyMosaicState(spec: MosaicSpec): MosaicState {
  return new Uint8Array(spec.config.rows * spec.config.cols);
}

function filledBit(v: number): number {
  return v === 1 ? 1 : 0;
}

export function isMosaicSolved(spec: MosaicSpec, state: MosaicState): boolean {
  return spec.solution.every((v, i) => v === filledBit(state[i]!));
}

export function mosaicProgress(spec: MosaicSpec, state: MosaicState): { matching: number; total: number } {
  let matching = 0;
  let total = 0;
  spec.solution.forEach((v, i) => {
    if (!v) return;
    total++;
    if (filledBit(state[i]!) === v) matching++;
  });
  return { matching, total };
}

export function mosaicClueSatisfied(spec: MosaicSpec, state: MosaicState, r: number, c: number): boolean {
  const { rows, cols } = spec.config;
  const clue = spec.clues[r * cols + c]!;
  if (clue < 0) return false;
  let filled = 0;
  for (const i of mosaicBlockCells(rows, cols, r, c)) {
    if (state[i] === 0) return false;
    filled += filledBit(state[i]!);
  }
  return filled === clue;
}

// More cells filled than the clue allows, or so many crossed out that it can no longer be met.
export function mosaicClueBroken(spec: MosaicSpec, state: MosaicState, r: number, c: number): boolean {
  const { rows, cols } = spec.config;
  const clue = spec.clues[r * cols + c]!;
  if (clue < 0) return false;
  let filled = 0;
  let open = 0;
  for (const i of mosaicBlockCells(rows, cols, r, c)) {
    if (state[i] === 0) open++;
    else filled += filledBit(state[i]!);
  }
  return filled > clue || filled + open < clue;
}

export interface MosaicHint {
  r: number;
  c: number;
  value: number;
}

function cellHint(cols: number, i: number, value: number): MosaicHint {
  return { r: Math.floor(i / cols), c: i % cols, value };
}

export function mosaicHint(spec: MosaicSpec, state: MosaicState): MosaicHint | null {
  const { cols } = spec.config;
  if (isMosaicSolved(spec, state)) return null;
  for (let i = 0; i < state.length; i++) {
    const v = state[i]!;
    if (v === 0) continue;
    const want = spec.solution[i] || MOSAIC_MARKED_EMPTY;
    if (v !== want) return cellHint(cols, i, want);
  }
  const next = mosaicPropagate(spec, state, 1).state;
  let empty: number | null = null;
  for (let i = 0; i < state.length; i++) {
    if (next[i] === state[i]) continue;
    if (next[i] !== MOSAIC_MARKED_EMPTY) return cellHint(cols, i, next[i]!);
    empty ??= i;
  }
  if (empty !== null) return cellHint(cols, empty, MOSAIC_MARKED_EMPTY);
  const unknown = state.findIndex((v) => v === 0);
  if (unknown < 0) return null;
  return cellHint(cols, unknown, spec.solution[unknown] || MOSAIC_MARKED_EMPTY);
}
