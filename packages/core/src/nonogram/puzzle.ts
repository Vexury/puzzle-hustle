import { Rng } from '../rng.ts';
import type { Difficulty } from '../types.ts';
import { MARKED_EMPTY, cluesEqual, filledColor, gridClues, lineClues, readLine, type Clue, type LineAxis } from './clues.ts';
import { nonogramDepth, propagateLines, solveByLines } from './solver.ts';

export { MARKED_EMPTY, type Clue } from './clues.ts';

export const NONOGRAM_VERSION = 2;
export const NONOGRAM_MAX_COLORS = 3;

export interface NonogramConfig {
  rows: number;
  cols: number;
  colors: number;
  density: number;
}

export interface NonogramSpec {
  version: number;
  seed: number;
  difficulty: Difficulty;
  config: NonogramConfig;
  solution: Uint8Array;
  rowClues: Clue[][];
  colClues: Clue[][];
}

export type NonogramState = Uint8Array;

export const NONOGRAM_PRESETS: Record<Difficulty, NonogramConfig> = {
  easy: { rows: 5, cols: 5, colors: 1, density: 0.55 },
  medium: { rows: 10, cols: 10, colors: 1, density: 0.55 },
  hard: { rows: 10, cols: 10, colors: 2, density: 0.6 },
  genius: { rows: 10, cols: 10, colors: 3, density: 0.6 },
};

export interface NonogramOptions {
  sizeDelta?: number;
  colorDelta?: number;
}


// Auf demselben Gitter reicht die Logiktiefe von etwa 44 bis 94, waehrend die Mediane der
// Farbvarianten nur fuenf Punkte auseinanderliegen. Die Stufen trennt deshalb der Anspruch,
// nicht die Groesse: der Generator sucht weiter, bis das Raetsel ins Fenster faellt.
const DEPTH_GATES: Partial<Record<Difficulty, { min?: number; max?: number }>> = {
  medium: { max: 42 },
  hard: { min: 42 },
  genius: { min: 56 },
};

export function nonogramConfig(difficulty: Difficulty, options: NonogramOptions = {}): NonogramConfig {
  const base = NONOGRAM_PRESETS[difficulty];
  const delta = options.sizeDelta ?? 0;
  const colors = Math.min(NONOGRAM_MAX_COLORS, Math.max(1, base.colors + (options.colorDelta ?? 0)));
  return { ...base, rows: base.rows + delta, cols: base.cols + delta, colors };
}

const DIRS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

function randomSolution(config: NonogramConfig, rng: Rng): Uint8Array {
  const { rows, cols, colors } = config;
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
      grid[j] = grid[i]!;
      filled.push(j);
    } else {
      const j = rng.int(rows * cols);
      if (grid[j]) continue;
      grid[j] = 1 + rng.int(colors);
      filled.push(j);
    }
  }
  return grid;
}

function validSolution(config: NonogramConfig, difficulty: Difficulty, grid: Uint8Array): boolean {
  const { rows, cols, colors } = config;
  const seen = new Set<number>();
  for (const v of grid) if (v) seen.add(v);
  if (seen.size < colors) return false;
  if (difficulty !== 'easy' && difficulty !== 'medium') return true;
  for (let r = 0; r < rows; r++) if (readLine(grid, rows, cols, 'row', r).every((v) => v === 0)) return false;
  for (let c = 0; c < cols; c++) if (readLine(grid, rows, cols, 'col', c).every((v) => v === 0)) return false;
  return true;
}

export function generateNonogram(seed: number, difficulty: Difficulty, options: NonogramOptions = {}): NonogramSpec {
  const config = nonogramConfig(difficulty, options);
  const cells = config.rows * config.cols;
  const gate = DEPTH_GATES[difficulty];
  const rng = new Rng(seed);
  let closest: NonogramSpec | null = null;
  let closestMiss = Infinity;
  for (let attempt = 0; attempt < 2000; attempt++) {
    const solution = randomSolution(config, rng);
    if (!validSolution(config, difficulty, solution)) continue;
    const { rowClues, colClues } = gridClues(solution, config.rows, config.cols);
    const spec: NonogramSpec = { version: NONOGRAM_VERSION, seed, difficulty, config, solution, rowClues, colClues };
    const solved = solveByLines(spec);
    if (!solved.solved) continue;
    if (!gate) return spec;
    const depth = nonogramDepth(solved.rounds, (solved.deducedPerRound[0] ?? 0) / cells);
    const miss = Math.max((gate.min ?? -Infinity) - depth, depth - (gate.max ?? Infinity), 0);
    if (miss === 0) return spec;
    // Kein Seed darf leer ausgehen, sonst reisst der Zeitplan. Das knappste Verfehlen gewinnt.
    if (miss < closestMiss) {
      closestMiss = miss;
      closest = spec;
    }
  }
  if (closest) return closest;
  throw new Error(`could not generate nonogram for seed ${seed} / ${difficulty}`);
}

export function emptyState(spec: NonogramSpec): NonogramState {
  return new Uint8Array(spec.config.rows * spec.config.cols);
}

export function isNonogramSolved(spec: NonogramSpec, state: NonogramState): boolean {
  return spec.solution.every((v, i) => v === filledColor(state[i]!));
}

export function nonogramProgress(spec: NonogramSpec, state: NonogramState): { matching: number; total: number } {
  let matching = 0;
  let total = 0;
  spec.solution.forEach((v, i) => {
    if (!v) return;
    total++;
    if (filledColor(state[i]!) === v) matching++;
  });
  return { matching, total };
}

export function lineSatisfied(spec: NonogramSpec, state: NonogramState, axis: LineAxis, index: number): boolean {
  const { rows, cols } = spec.config;
  const clues = axis === 'row' ? spec.rowClues[index]! : spec.colClues[index]!;
  return cluesEqual(lineClues(readLine(state, rows, cols, axis, index)), clues);
}

export interface NonogramHint {
  r: number;
  c: number;
  value: number;
}

function cellHint(cols: number, i: number, value: number): NonogramHint {
  return { r: Math.floor(i / cols), c: i % cols, value };
}

export function nonogramHint(spec: NonogramSpec, state: NonogramState): NonogramHint | null {
  const { cols } = spec.config;
  if (isNonogramSolved(spec, state)) return null;
  for (let i = 0; i < state.length; i++) {
    const v = state[i]!;
    if (v === 0) continue;
    const want = spec.solution[i] || MARKED_EMPTY;
    if (v !== want) return cellHint(cols, i, want);
  }
  const next = propagateLines(spec, state, 1).state;
  let empty: number | null = null;
  for (let i = 0; i < state.length; i++) {
    if (next[i] === state[i]) continue;
    if (next[i] !== MARKED_EMPTY) return cellHint(cols, i, next[i]!);
    empty ??= i;
  }
  if (empty !== null) return cellHint(cols, empty, MARKED_EMPTY);
  const unknown = state.findIndex((v) => v === 0);
  if (unknown < 0) return null;
  return cellHint(cols, unknown, spec.solution[unknown] || MARKED_EMPTY);
}
