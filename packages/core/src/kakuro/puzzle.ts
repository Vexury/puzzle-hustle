import { Rng } from '../rng.ts';
import type { Difficulty } from '../types.ts';
import { KAKURO_TECHNIQUES, isKakuroUnique, kakuroRunMap, kakuroSolveByLogic, type KakuroRunMap, type KakuroTechnique } from './solver.ts';

export const KAKURO_VERSION = 1;

export interface KakuroConfig {
  rows: number;
  cols: number;
  blackRatio: number;
  maxRun: number;
  logicOnly: boolean;
}

export interface KakuroRun {
  start: number;
  dir: 'h' | 'v';
  length: number;
  sum: number;
  cells: number[];
}

export interface KakuroSpec {
  version: number;
  seed: number;
  difficulty: Difficulty;
  config: KakuroConfig;
  cells: Uint8Array;
  solution: Uint8Array;
  runs: KakuroRun[];
}

export type KakuroState = Uint8Array;

export interface KakuroOptions {
  sizeDelta?: number;
}

export const KAKURO_PRESETS: Record<Difficulty, KakuroConfig> = {
  easy: { rows: 6, cols: 6, blackRatio: 0.3, maxRun: 4, logicOnly: true },
  medium: { rows: 8, cols: 8, blackRatio: 0.28, maxRun: 5, logicOnly: true },
  hard: { rows: 10, cols: 10, blackRatio: 0.25, maxRun: 6, logicOnly: false },
  genius: { rows: 12, cols: 12, blackRatio: 0.22, maxRun: 7, logicOnly: false },
};

export function kakuroConfig(difficulty: Difficulty, options: KakuroOptions = {}): KakuroConfig {
  const p = KAKURO_PRESETS[difficulty];
  const d = options.sizeDelta ?? 0;
  return { ...p, rows: p.rows + d, cols: p.cols + d };
}

const ALL = 0x1ff;

function bit(d: number): number {
  return 1 << (d - 1);
}

function popcount(m: number): number {
  let n = 0;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
}

class Layout {
  readonly rows: number;
  readonly cols: number;
  readonly cells: Uint8Array;

  constructor(rows: number, cols: number) {
    this.rows = rows;
    this.cols = cols;
    this.cells = new Uint8Array(rows * cols);
  }

  white(r: number, c: number): boolean {
    return r >= 1 && c >= 1 && r < this.rows && c < this.cols && this.cells[r * this.cols + c] === 1;
  }

  interior(r: number, c: number): boolean {
    return r >= 1 && c >= 1 && r < this.rows && c < this.cols;
  }

  runLength(r: number, c: number, dr: number, dc: number): number {
    let len = 1;
    for (let k = 1; this.white(r - dr * k, c - dc * k); k++) len++;
    for (let k = 1; this.white(r + dr * k, c + dc * k); k++) len++;
    return len;
  }

  isStart(r: number, c: number, dr: number, dc: number): boolean {
    return this.white(r, c) && !this.white(r - dr, c - dc);
  }
}

function connected(l: Layout): boolean {
  const n = l.rows * l.cols;
  const seen = new Uint8Array(n);
  let first = -1;
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (!l.cells[i]) continue;
    total++;
    if (first < 0) first = i;
  }
  if (total === 0) return false;
  const stack = [first];
  seen[first] = 1;
  let count = 0;
  while (stack.length) {
    const i = stack.pop()!;
    count++;
    const r = Math.floor(i / l.cols);
    const c = i % l.cols;
    for (const [rr, cc] of [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ] as const) {
      if (!l.white(rr, cc)) continue;
      const j = rr * l.cols + cc;
      if (seen[j]) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return count === total;
}

const NEIGHBORS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

function tryBlack(l: Layout, i: number): boolean {
  const backup = Uint8Array.from(l.cells);
  const stack = [i];
  while (stack.length) {
    const j = stack.pop()!;
    if (!l.cells[j]) continue;
    l.cells[j] = 0;
    const r = Math.floor(j / l.cols);
    const c = j % l.cols;
    for (const [dr, dc] of NEIGHBORS) {
      const rr = r + dr;
      const cc = c + dc;
      if (l.white(rr, cc) && (l.runLength(rr, cc, 0, 1) < 2 || l.runLength(rr, cc, 1, 0) < 2)) stack.push(rr * l.cols + cc);
    }
  }
  if (connected(l)) return true;
  l.cells.set(backup);
  return false;
}

function longRun(l: Layout, maxRun: number): number[] | null {
  for (let r = 1; r < l.rows; r++) {
    for (let c = 1; c < l.cols; c++) {
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
      ] as const) {
        if (!l.isStart(r, c, dr, dc)) continue;
        const len = l.runLength(r, c, dr, dc);
        if (len <= maxRun) continue;
        const cells: number[] = [];
        for (let k = 0; k < len; k++) if (k === 0 || k === len - 1 || (k >= 2 && k <= len - 3)) cells.push((r + dr * k) * l.cols + (c + dc * k));
        return cells;
      }
    }
  }
  return null;
}

const MIN_WHITE_RATIO = 0.5;

function buildLayout(config: KakuroConfig, rng: Rng): Uint8Array | null {
  const l = new Layout(config.rows, config.cols);
  const interior: number[] = [];
  for (let r = 1; r < l.rows; r++) {
    for (let c = 1; c < l.cols; c++) {
      l.cells[r * l.cols + c] = 1;
      interior.push(r * l.cols + c);
    }
  }
  const blacks = () => interior.reduce((n, i) => n + (l.cells[i] ? 0 : 1), 0);
  for (let guard = 0; guard < interior.length; guard++) {
    const options = longRun(l, config.maxRun);
    if (!options) break;
    if (!rng.shuffle(options).some((i) => tryBlack(l, i))) return null;
  }
  const target = Math.round(config.blackRatio * interior.length);
  for (const i of rng.shuffle([...interior])) {
    if (blacks() >= target) break;
    if (l.cells[i]) tryBlack(l, i);
  }
  return interior.length - blacks() >= MIN_WHITE_RATIO * interior.length ? l.cells : null;
}

function extractRuns(cells: Uint8Array, rows: number, cols: number): KakuroRun[] {
  const l = new Layout(rows, cols);
  l.cells.set(cells);
  const runs: KakuroRun[] = [];
  for (const dir of ['h', 'v'] as const) {
    const dr = dir === 'h' ? 0 : 1;
    const dc = dir === 'h' ? 1 : 0;
    for (let r = 1; r < rows; r++) {
      for (let c = 1; c < cols; c++) {
        if (!l.isStart(r, c, dr, dc)) continue;
        const run: number[] = [];
        for (let k = 0; l.white(r + dr * k, c + dc * k); k++) run.push((r + dr * k) * cols + (c + dc * k));
        runs.push({ start: r * cols + c, dir, length: run.length, sum: 0, cells: run });
      }
    }
  }
  return runs;
}

const FILL_NODES = 40_000;
const EXTREME_BIAS = 2;

function biasedDigits(mask: number, rng: Rng): number[] {
  const pool: { d: number; w: number }[] = [];
  for (let d = 1; d <= 9; d++) if (mask & bit(d)) pool.push({ d, w: 1 + EXTREME_BIAS * Math.abs(d - 5) });
  const out: number[] = [];
  while (pool.length) {
    let total = 0;
    for (const p of pool) total += p.w;
    let x = rng.next() * total;
    let k = 0;
    while (k < pool.length - 1 && x >= pool[k]!.w) x -= pool[k++]!.w;
    out.push(pool[k]!.d);
    pool.splice(k, 1);
  }
  return out;
}

function fillDigits(cells: Uint8Array, runs: KakuroRun[], map: KakuroRunMap, rng: Rng): Uint8Array | null {
  const n = cells.length;
  const values = new Uint8Array(n);
  const used = new Uint16Array(runs.length);
  const whites: number[] = [];
  for (let i = 0; i < n; i++) if (cells[i]) whites.push(i);
  rng.shuffle(whites);
  let nodes = 0;
  const search = (filled: number): boolean => {
    if (filled === whites.length) return true;
    if (++nodes > FILL_NODES) return false;
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (const i of whites) {
      if (values[i]) continue;
      const m = ALL & ~(used[map.h[i]!]! | used[map.v[i]!]!);
      const c = popcount(m);
      if (c >= bestCount) continue;
      best = i;
      bestMask = m;
      bestCount = c;
      if (c <= 1) break;
    }
    if (bestCount === 0) return false;
    const h = map.h[best]!;
    const v = map.v[best]!;
    for (const d of biasedDigits(bestMask, rng)) {
      const b = bit(d);
      values[best] = d;
      used[h]! |= b;
      used[v]! |= b;
      if (search(filled + 1)) return true;
      values[best] = 0;
      used[h]! &= ~b;
      used[v]! &= ~b;
    }
    return false;
  };
  return search(0) ? values : null;
}

const LAYOUT_ATTEMPTS = 40;
const FILL_ATTEMPTS = 3;
const REPAIR_STEPS_PER_CELL = 2;
const REPAIR_STALL = 10;
const REPAIR_CELLS = 3;

function uniquenessBudget(config: KakuroConfig): number {
  return 20_000 + 2_000 * config.rows * config.cols;
}

function setDigit(spec: KakuroSpec, map: KakuroRunMap, i: number, d: number): void {
  const old = spec.solution[i]!;
  spec.solution[i] = d;
  for (const k of [map.h[i]!, map.v[i]!]) spec.runs[k]!.sum += d - old;
}

function freeDigits(spec: KakuroSpec, map: KakuroRunMap, i: number): number[] {
  let used = 0;
  for (const k of [map.h[i]!, map.v[i]!]) for (const j of spec.runs[k]!.cells) used |= bit(spec.solution[j]!);
  const out: number[] = [];
  for (let d = 1; d <= 9; d++) if (!(used & bit(d))) out.push(d);
  return out;
}

function unresolved(spec: KakuroSpec): number[] {
  const state = kakuroSolveByLogic(spec).state;
  const out: number[] = [];
  for (let i = 0; i < spec.cells.length; i++) if (spec.cells[i] && !state[i]) out.push(i);
  return out;
}

function repairUniqueness(spec: KakuroSpec, map: KakuroRunMap, rng: Rng): boolean {
  let open = unresolved(spec);
  const maxSteps = REPAIR_STEPS_PER_CELL * spec.cells.reduce((n, v) => n + v, 0);
  let stalled = 0;
  for (let step = 0; step < maxSteps && open.length > 0 && stalled < REPAIR_STALL; step++) {
    let best: { i: number; d: number; open: number[] } | null = null;
    outer: for (const i of rng.shuffle([...open]).slice(0, REPAIR_CELLS)) {
      const original = spec.solution[i]!;
      for (const d of rng.shuffle(freeDigits(spec, map, i))) {
        setDigit(spec, map, i, d);
        const next = unresolved(spec);
        setDigit(spec, map, i, original);
        if (!best || next.length < best.open.length) best = { i, d, open: next };
        if (next.length < open.length) break outer;
      }
    }
    if (!best) return false;
    stalled = best.open.length < open.length ? 0 : stalled + 1;
    setDigit(spec, map, best.i, best.d);
    open = best.open;
  }
  return open.length === 0 || !spec.config.logicOnly;
}

function acceptable(spec: KakuroSpec): boolean {
  if (spec.config.logicOnly && !kakuroSolveByLogic(spec).solved) return false;
  return isKakuroUnique(spec, uniquenessBudget(spec.config));
}

export function generateKakuro(seed: number, difficulty: Difficulty, options: KakuroOptions = {}): KakuroSpec {
  const config = kakuroConfig(difficulty, options);
  const rng = new Rng(seed);
  for (let attempt = 0; attempt < LAYOUT_ATTEMPTS; attempt++) {
    const cells = buildLayout(config, rng);
    if (!cells) continue;
    const runs = extractRuns(cells, config.rows, config.cols);
    const map = kakuroRunMap({ config, cells, runs });
    for (let fill = 0; fill < FILL_ATTEMPTS; fill++) {
      const solution = fillDigits(cells, runs, map, rng);
      if (!solution) break;
      const sized = runs.map((run) => ({ ...run, cells: [...run.cells], sum: run.cells.reduce((s, i) => s + solution[i]!, 0) }));
      const spec: KakuroSpec = { version: KAKURO_VERSION, seed, difficulty, config, cells, solution, runs: sized };
      if (repairUniqueness(spec, map, rng) && acceptable(spec)) return spec;
    }
  }
  throw new Error(`could not generate kakuro for seed ${seed} / ${difficulty}`);
}

export function emptyKakuroState(spec: KakuroSpec): KakuroState {
  return new Uint8Array(spec.cells.length);
}

export function kakuroStateToArray(state: KakuroState): number[] {
  return [...state];
}

export function kakuroStateFromArray(spec: KakuroSpec, arr: readonly number[]): KakuroState {
  if (arr.length !== spec.cells.length) return emptyKakuroState(spec);
  const state = new Uint8Array(arr.length);
  for (let i = 0; i < arr.length; i++) state[i] = spec.cells[i] ? arr[i]! : 0;
  return state;
}

export function isKakuroSolved(spec: KakuroSpec, state: KakuroState): boolean {
  for (let i = 0; i < spec.cells.length; i++) if (spec.cells[i] && state[i] !== spec.solution[i]) return false;
  return true;
}

export function kakuroProgress(spec: KakuroSpec, state: KakuroState): { matching: number; total: number } {
  let matching = 0;
  let total = 0;
  for (let i = 0; i < spec.cells.length; i++) {
    if (!spec.cells[i]) continue;
    total++;
    if (state[i] === spec.solution[i]) matching++;
  }
  return { matching, total };
}

export function kakuroRunSatisfied(run: KakuroRun, state: KakuroState): boolean {
  let seen = 0;
  let sum = 0;
  for (const i of run.cells) {
    const v = state[i]!;
    if (!v || seen & bit(v)) return false;
    seen |= bit(v);
    sum += v;
  }
  return sum === run.sum;
}

export function kakuroConflicts(spec: KakuroSpec, state: KakuroState): Uint8Array {
  const flags = new Uint8Array(spec.cells.length);
  for (const run of spec.runs) {
    const seen = new Int16Array(10).fill(-1);
    let sum = 0;
    let filled = 0;
    for (const i of run.cells) {
      const v = state[i]!;
      if (!v) continue;
      filled++;
      sum += v;
      const prev = seen[v]!;
      if (prev >= 0) {
        flags[prev] = 1;
        flags[i] = 1;
      }
      seen[v] = i;
    }
    if (sum > run.sum || (filled === run.length && sum !== run.sum)) for (const i of run.cells) if (state[i]) flags[i] = 1;
  }
  return flags;
}

export interface KakuroClue {
  right: number;
  down: number;
  rightRun: number;
  downRun: number;
}

export function kakuroClues(spec: KakuroSpec): (KakuroClue | null)[] {
  const { cols } = spec.config;
  const out: (KakuroClue | null)[] = Array.from({ length: spec.cells.length }, () => null);
  spec.runs.forEach((run, k) => {
    const at = run.dir === 'h' ? run.start - 1 : run.start - cols;
    const clue = out[at] ?? { right: 0, down: 0, rightRun: -1, downRun: -1 };
    if (run.dir === 'h') {
      clue.right = run.sum;
      clue.rightRun = k;
    } else {
      clue.down = run.sum;
      clue.downRun = k;
    }
    out[at] = clue;
  });
  return out;
}

export interface KakuroHint {
  index: number;
  digit: number;
  reason: string;
}

const REASONS: Record<KakuroTechnique, string> = {
  'naked-single': 'Only one digit fits this cell',
  'hidden-single': 'This digit must appear in the run and has only one place left',
  'single-combination': 'The run sum allows only one set of digits',
  'run-intersection': 'Only this digit works for both the across and the down sum',
  'naked-pair': 'A naked pair rules out the other digits here',
  'sum-partition': 'The remaining sum leaves only this digit here',
};

export function kakuroHint(spec: KakuroSpec, state: KakuroState): KakuroHint | null {
  if (isKakuroSolved(spec, state)) return null;
  for (let i = 0; i < spec.cells.length; i++) {
    const v = state[i]!;
    if (spec.cells[i] && v && v !== spec.solution[i]) return { index: i, digit: spec.solution[i]!, reason: 'This cell was wrong' };
  }
  const r = kakuroSolveByLogic(spec, KAKURO_TECHNIQUES, state);
  const p = r.placements[0];
  if (p && p.value === spec.solution[p.cell]) return { index: p.cell, digit: p.value, reason: REASONS[p.technique] };
  for (let i = 0; i < spec.cells.length; i++) {
    if (spec.cells[i] && !state[i]) return { index: i, digit: spec.solution[i]!, reason: 'Revealed from the solution' };
  }
  return null;
}
