import { Rng } from '../rng.ts';
import type { Difficulty } from '../types.ts';
import {
  SUDOKU_TECHNIQUES,
  SUDOKU_UNITS,
  isSudokuUnique,
  sudokuBox,
  sudokuCol,
  sudokuRow,
  sudokuSolveByLogic,
  type SudokuTechnique,
} from './solver.ts';

export const SUDOKU_VERSION = 1;

const N = 81;

export interface SudokuConfig {
  givensTarget: number;
  cages: boolean;
  maxCage: number;
  techniques: SudokuTechnique[];
}

export interface SudokuCage {
  cells: number[];
  sum: number;
}

export interface SudokuSpec {
  version: number;
  seed: number;
  difficulty: Difficulty;
  config: SudokuConfig;
  solution: Uint8Array;
  givens: Uint8Array;
  cages: SudokuCage[];
}

export interface SudokuState {
  values: Uint8Array;
  notes: Uint16Array;
}

export type SudokuOptions = Record<string, never>;

const SINGLES: SudokuTechnique[] = ['naked-single', 'hidden-single'];

export const SUDOKU_PRESETS: Record<Difficulty, SudokuConfig> = {
  easy: { givensTarget: 38, cages: false, maxCage: 0, techniques: [...SINGLES] },
  medium: { givensTarget: 32, cages: false, maxCage: 0, techniques: [...SINGLES, 'pointing'] },
  hard: { givensTarget: 30, cages: false, maxCage: 0, techniques: [...SINGLES, 'pointing', 'box-line', 'naked-pair', 'hidden-pair', 'naked-triple'] },
  genius: { givensTarget: 25, cages: false, maxCage: 0, techniques: [...SINGLES, 'pointing', 'box-line', 'naked-pair', 'hidden-pair', 'naked-triple', 'x-wing'] },
};

export const KILLER_PRESETS: Record<Difficulty, SudokuConfig> = {
  easy: { givensTarget: 10, cages: true, maxCage: 3, techniques: [...SINGLES, 'cage-sum'] },
  medium: { givensTarget: 3, cages: true, maxCage: 4, techniques: [...SINGLES, 'cage-sum', 'pointing', 'box-line'] },
  hard: { givensTarget: 0, cages: true, maxCage: 5, techniques: [...SINGLES, 'cage-sum', 'pointing', 'box-line', 'naked-pair', 'hidden-pair', 'innie-outie'] },
  genius: { givensTarget: 0, cages: true, maxCage: 5, techniques: [...SUDOKU_TECHNIQUES] },
};

function randomSolution(rng: Rng): Uint8Array | null {
  const grid = new Uint8Array(N);
  const rowM = new Uint16Array(9);
  const colM = new Uint16Array(9);
  const boxM = new Uint16Array(9);
  const digits = Array.from({ length: 9 }, (_, d) => d + 1);
  let nodes = 0;
  const fill = (i: number): boolean => {
    if (i === N) return true;
    if (++nodes > 200_000) return false;
    const r = sudokuRow(i);
    const c = sudokuCol(i);
    const b = sudokuBox(i);
    for (const d of rng.shuffle([...digits])) {
      const m = 1 << (d - 1);
      if ((rowM[r]! | colM[c]! | boxM[b]!) & m) continue;
      rowM[r]! |= m;
      colM[c]! |= m;
      boxM[b]! |= m;
      grid[i] = d;
      if (fill(i + 1)) return true;
      rowM[r]! ^= m;
      colM[c]! ^= m;
      boxM[b]! ^= m;
      grid[i] = 0;
    }
    return false;
  };
  return fill(0) ? grid : null;
}

function neighbors(i: number): number[] {
  const out: number[] = [];
  const r = sudokuRow(i);
  const c = sudokuCol(i);
  if (r > 0) out.push(i - 9);
  if (r < 8) out.push(i + 9);
  if (c > 0) out.push(i - 1);
  if (c < 8) out.push(i + 1);
  return out;
}

const CAGE_SIZE_WEIGHT: Record<number, number> = { 2: 3, 3: 3, 4: 2, 5: 1 };

function cageSizeTarget(maxCage: number, rng: Rng): number {
  const pool: number[] = [];
  for (let size = 2; size <= maxCage; size++) for (let k = 0; k < (CAGE_SIZE_WEIGHT[size] ?? 1); k++) pool.push(size);
  return rng.pick(pool);
}

function digitBit(solution: Uint8Array, i: number): number {
  return 1 << (solution[i]! - 1);
}

function partition(solution: Uint8Array, free: Uint8Array, maxCage: number, rng: Rng): number[][] {
  const cageOf = new Int16Array(N).fill(-1);
  const groups: number[][] = [];
  const order = rng.shuffle(Array.from({ length: N }, (_, i) => i).filter((i) => free[i]));
  for (const start of order) {
    if (cageOf[start]! >= 0) continue;
    const id = groups.length;
    const cells = [start];
    cageOf[start] = id;
    let digits = digitBit(solution, start);
    const target = cageSizeTarget(maxCage, rng);
    while (cells.length < target) {
      const frontier = cells.flatMap(neighbors).filter((j) => free[j] && cageOf[j]! < 0 && !(digits & digitBit(solution, j)));
      if (frontier.length === 0) break;
      const j = rng.pick(frontier);
      cageOf[j] = id;
      cells.push(j);
      digits |= digitBit(solution, j);
    }
    groups.push(cells);
  }
  mergeSingles(groups, cageOf, solution, maxCage);
  return groups.filter((cells) => cells.length > 0);
}

function mergeSingles(groups: number[][], cageOf: Int16Array, solution: Uint8Array, maxCage: number): void {
  for (const cells of groups) {
    if (cells.length !== 1) continue;
    const i = cells[0]!;
    let best = -1;
    for (const j of neighbors(i)) {
      const k = cageOf[j]!;
      if (k < 0) continue;
      const other = groups[k]!;
      if (other.length >= maxCage || other.some((x) => solution[x] === solution[i])) continue;
      if (best < 0 || other.length < groups[best]!.length) best = k;
    }
    if (best < 0) continue;
    groups[best]!.push(i);
    cageOf[i] = best;
    cells.length = 0;
  }
}

function toCages(solution: Uint8Array, groups: number[][]): SudokuCage[] {
  return groups.map((cells) => ({ cells: [...cells].sort((x, y) => x - y), sum: cells.reduce((sum, i) => sum + solution[i]!, 0) }));
}

function growCages(solution: Uint8Array, maxCage: number, rng: Rng): SudokuCage[] {
  return toCages(solution, partition(solution, new Uint8Array(N).fill(1), maxCage, rng));
}

const REGROW_MAX_CAGE = 3;

function regrowAround(solution: Uint8Array, cages: SudokuCage[], stuck: readonly number[], rng: Rng): SudokuCage[] {
  const cageOf = new Int16Array(N);
  cages.forEach((cage, k) => {
    for (const i of cage.cells) cageOf[i] = k;
  });
  const dissolve = new Set<number>();
  for (const i of stuck) {
    dissolve.add(cageOf[i]!);
    for (const j of neighbors(i)) dissolve.add(cageOf[j]!);
  }
  const free = new Uint8Array(N);
  for (const k of dissolve) for (const i of cages[k]!.cells) free[i] = 1;
  const kept = cages.filter((_, k) => !dissolve.has(k));
  return [...kept, ...toCages(solution, partition(solution, free, REGROW_MAX_CAGE, rng))];
}

function givenCount(givens: Uint8Array): number {
  let n = 0;
  for (const v of givens) if (v) n++;
  return n;
}

function tryRemove(spec: SudokuSpec, cells: readonly number[]): boolean {
  const saved = cells.map((i) => spec.givens[i]!);
  for (const i of cells) spec.givens[i] = 0;
  if (sudokuSolveByLogic(spec, spec.config.techniques).solved) return true;
  cells.forEach((i, k) => {
    spec.givens[i] = saved[k]!;
  });
  return false;
}

function removeGroups(spec: SudokuSpec, groups: number[][], target: number, chunkCells: number): void {
  let count = givenCount(spec.givens);
  const attempt = (gs: number[][]): void => {
    if (count <= target || gs.length === 0) return;
    const cells = gs.flat();
    if (count - cells.length >= target && tryRemove(spec, cells)) {
      count -= cells.length;
      return;
    }
    if (gs.length === 1) return;
    const mid = gs.length >> 1;
    attempt(gs.slice(0, mid));
    attempt(gs.slice(mid));
  };
  let chunk: number[][] = [];
  let size = 0;
  for (const g of groups) {
    chunk.push(g);
    size += g.length;
    if (size < chunkCells) continue;
    attempt(chunk);
    chunk = [];
    size = 0;
  }
  attempt(chunk);
}

function remainingGivens(spec: SudokuSpec, rng: Rng): number[] {
  return rng.shuffle(Array.from(spec.givens, (v, i) => (v ? i : -1)).filter((i) => i >= 0));
}

const BASIC: SudokuTechnique[] = [...SINGLES, 'cage-sum', 'pointing', 'box-line'];

function needsAdvanced(config: SudokuConfig): boolean {
  return config.techniques.some((t) => !BASIC.includes(t));
}

function tooEasy(spec: SudokuSpec): boolean {
  return needsAdvanced(spec.config) && sudokuSolveByLogic(spec, BASIC).solved;
}

const EXTRA_REMOVALS = 6;

function removeGivens(spec: SudokuSpec, rng: Rng): void {
  const target = spec.config.givensTarget;
  const pairs = rng.shuffle(Array.from({ length: 41 }, (_, i) => i)).map((i) => (i === 40 ? [40] : [i, 80 - i]));
  const chunk = target === 0 ? N : 8;
  removeGroups(spec, pairs, target, chunk);
  removeGroups(spec, remainingGivens(spec, rng).map((i) => [i]), target, chunk);
  if (!tooEasy(spec)) return;
  let count = givenCount(spec.givens);
  for (const i of remainingGivens(spec, rng)) {
    if (count <= target - EXTRA_REMOVALS) return;
    if (!tryRemove(spec, [i])) continue;
    count--;
    if (!tooEasy(spec)) return;
  }
}

function acceptable(spec: SudokuSpec): boolean {
  const count = givenCount(spec.givens);
  const { givensTarget } = spec.config;
  if (givensTarget === 0 ? count !== 0 : count > givensTarget + 4) return false;
  if (tooEasy(spec)) return false;
  return isSudokuUnique(spec);
}

const ATTEMPTS = 60;
const REGROW_ROUNDS = 8;

function stuckGivens(spec: SudokuSpec): number[] {
  return Array.from(spec.givens, (v, i) => (v ? i : -1)).filter((i) => i >= 0);
}

function buildKiller(spec: SudokuSpec, rng: Rng): void {
  spec.cages = growCages(spec.solution, spec.config.maxCage, rng);
  for (let round = 0; round < REGROW_ROUNDS; round++) {
    spec.givens = Uint8Array.from(spec.solution);
    removeGivens(spec, rng);
    const stuck = stuckGivens(spec);
    if (spec.config.givensTarget > 0 || stuck.length === 0) return;
    spec.cages = regrowAround(spec.solution, spec.cages, stuck, rng);
  }
}

export function generateSudokuLike(seed: number, difficulty: Difficulty, config: SudokuConfig): SudokuSpec {
  const rng = new Rng(seed);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const solution = randomSolution(rng);
    if (!solution) continue;
    const spec: SudokuSpec = { version: SUDOKU_VERSION, seed, difficulty, config, solution, givens: Uint8Array.from(solution), cages: [] };
    if (config.cages) buildKiller(spec, rng);
    else removeGivens(spec, rng);
    if (acceptable(spec)) return spec;
  }
  throw new Error(`could not generate sudoku for seed ${seed} / ${difficulty}`);
}

export function generateSudoku(seed: number, difficulty: Difficulty, _options: SudokuOptions = {}): SudokuSpec {
  return generateSudokuLike(seed, difficulty, SUDOKU_PRESETS[difficulty]);
}

export function generateKiller(seed: number, difficulty: Difficulty, _options: SudokuOptions = {}): SudokuSpec {
  return generateSudokuLike(seed, difficulty, KILLER_PRESETS[difficulty]);
}

function blankState(): SudokuState {
  return { values: new Uint8Array(N), notes: new Uint16Array(N) };
}

export function emptySudokuState(_spec: SudokuSpec): SudokuState {
  return blankState();
}

export function sudokuStateToArray(state: SudokuState): number[] {
  return [...state.values, ...state.notes];
}

export function sudokuStateFromArray(arr: readonly number[]): SudokuState {
  const state = blankState();
  if (arr.length !== 2 * N) return state;
  for (let i = 0; i < N; i++) {
    state.values[i] = arr[i]!;
    state.notes[i] = arr[N + i]!;
  }
  return state;
}

export function sudokuCellValues(spec: SudokuSpec, state: SudokuState): Uint8Array {
  const out = new Uint8Array(N);
  for (let i = 0; i < N; i++) out[i] = spec.givens[i] || state.values[i]!;
  return out;
}

export function isSudokuSolved(spec: SudokuSpec, state: SudokuState): boolean {
  const values = sudokuCellValues(spec, state);
  return spec.solution.every((v, i) => v === values[i]);
}

export function sudokuProgress(spec: SudokuSpec, state: SudokuState): { matching: number; total: number } {
  let matching = 0;
  let total = 0;
  for (let i = 0; i < N; i++) {
    if (spec.givens[i]) continue;
    total++;
    if (state.values[i] === spec.solution[i]) matching++;
  }
  return { matching, total };
}

export function sudokuConflicts(spec: SudokuSpec, state: SudokuState): Uint8Array {
  const values = sudokuCellValues(spec, state);
  const flags = new Uint8Array(N);
  for (const unit of SUDOKU_UNITS) flagDuplicates(unit, values, flags);
  for (const cage of spec.cages) {
    flagDuplicates(cage.cells, values, flags);
    const filled = cage.cells.filter((i) => values[i]);
    const sum = filled.reduce((s, i) => s + values[i]!, 0);
    if (sum > cage.sum || (filled.length === cage.cells.length && sum !== cage.sum)) for (const i of filled) flags[i] = 1;
  }
  return flags;
}

function flagDuplicates(cells: readonly number[], values: Uint8Array, flags: Uint8Array): void {
  const seen = new Int8Array(10).fill(-1);
  for (const i of cells) {
    const v = values[i]!;
    if (!v) continue;
    const prev = seen[v]!;
    if (prev >= 0) {
      flags[prev] = 1;
      flags[i] = 1;
    }
    seen[v] = i;
  }
}

export interface SudokuHint {
  cell: number;
  value: number;
  reason: string;
}

const REASONS: Record<SudokuTechnique, string> = {
  'naked-single': 'Only one digit fits this cell',
  'hidden-single': 'This digit has only one place left in its row, column or box',
  'cage-sum': 'The cage sum leaves only one option here',
  pointing: 'A box confines a digit to one line, which fixes this cell',
  'box-line': 'A line confines a digit to one box, which fixes this cell',
  'naked-pair': 'A naked pair rules out the other digits here',
  'hidden-pair': 'A hidden pair rules out the other digits here',
  'naked-triple': 'A naked triple rules out the other digits here',
  'innie-outie': 'The 45 rule on a unit fixes this cell',
  'x-wing': 'An X-wing rules out the other digits here',
};

export function sudokuHint(spec: SudokuSpec, state: SudokuState): SudokuHint | null {
  if (isSudokuSolved(spec, state)) return null;
  for (let i = 0; i < N; i++) {
    const v = state.values[i]!;
    if (v && !spec.givens[i] && v !== spec.solution[i]) return { cell: i, value: spec.solution[i]!, reason: 'This cell was wrong' };
  }
  const r = sudokuSolveByLogic(spec, SUDOKU_TECHNIQUES, sudokuCellValues(spec, state));
  const p = r.placements[0];
  if (p && p.value === spec.solution[p.cell]) return { cell: p.cell, value: p.value, reason: REASONS[p.technique] };
  const values = sudokuCellValues(spec, state);
  const empty = values.findIndex((v) => v === 0);
  if (empty < 0) return null;
  return { cell: empty, value: spec.solution[empty]!, reason: 'Revealed from the solution' };
}
