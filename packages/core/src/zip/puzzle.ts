import { Rng } from '../rng.ts';
import type { Difficulty } from '../types.ts';
import { ZIP_DIRS, enumerateZipSolutions, zipNeighborTable } from './solver.ts';

export const ZIP_VERSION = 1;

export interface ZipConfig {
  size: number;
  numbers: number;
  walls: number;
}

export interface ZipOptions {
  sizeDelta?: number;
}

export interface ZipSpec {
  version: number;
  seed: number;
  difficulty: Difficulty;
  config: ZipConfig;
  numbers: Uint8Array;
  walls: Uint8Array;
  solution: Uint16Array;
}

export type ZipState = number[];

export const ZIP_PRESETS: Record<Difficulty, ZipConfig> = {
  easy: { size: 6, numbers: 8, walls: 1 },
  medium: { size: 7, numbers: 8, walls: 4 },
  hard: { size: 8, numbers: 8, walls: 8 },
  genius: { size: 9, numbers: 9, walls: 12 },
};

export function zipConfig(difficulty: Difficulty, options: ZipOptions = {}): ZipConfig {
  const base = ZIP_PRESETS[difficulty];
  const delta = options.sizeDelta ?? 0;
  return { ...base, size: base.size + delta, numbers: base.numbers + Math.max(0, delta) };
}

function neighborOf(n: number, i: number, d: number): number {
  const r = Math.floor(i / n) + ZIP_DIRS[d]![0];
  const c = (i % n) + ZIP_DIRS[d]![1];
  if (r < 0 || c < 0 || r >= n || c >= n) return -1;
  return r * n + c;
}

function directionBetween(n: number, from: number, to: number): number {
  const dr = Math.floor(to / n) - Math.floor(from / n);
  const dc = (to % n) - (from % n);
  for (let d = 0; d < 4; d++) if (ZIP_DIRS[d]![0] === dr && ZIP_DIRS[d]![1] === dc) return d;
  return -1;
}

function serpentine(n: number): number[] {
  const path: number[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) path.push(r * n + (r % 2 === 0 ? c : n - 1 - c));
  }
  return path;
}

function reverseRange(path: number[], pos: Int32Array, lo: number, hi: number): void {
  while (lo < hi) {
    const a = path[lo]!;
    const b = path[hi]!;
    path[lo] = b;
    path[hi] = a;
    pos[b] = lo;
    pos[a] = hi;
    lo++;
    hi--;
  }
}

function backbite(n: number, path: number[], pos: Int32Array, rng: Rng): void {
  const last = path.length - 1;
  const fromEnd = rng.next() < 0.5;
  const endCell = fromEnd ? path[last]! : path[0]!;
  const v = neighborOf(n, endCell, rng.int(4));
  if (v < 0) return;
  const i = pos[v]!;
  if (fromEnd) {
    if (i === last - 1) return;
    reverseRange(path, pos, i + 1, last);
  } else {
    if (i === 1) return;
    reverseRange(path, pos, 0, i - 1);
  }
}

function countTurns(path: readonly number[]): number {
  let turns = 0;
  for (let i = 2; i < path.length; i++) if (path[i - 1]! - path[i - 2]! !== path[i]! - path[i - 1]!) turns++;
  return turns;
}

function randomHamiltonianPath(n: number, rng: Rng): number[] {
  const path = serpentine(n);
  const pos = new Int32Array(n * n);
  path.forEach((cell, i) => (pos[cell] = i));
  const moves = 30 * n * n;
  for (let m = 0; m < moves; m++) backbite(n, path, pos, rng);
  const minTurns = Math.floor(n * n * 0.4);
  for (let extra = 0; extra < 20 && countTurns(path) < minTurns; extra++) {
    for (let m = 0; m < n * n; m++) backbite(n, path, pos, rng);
  }
  return path;
}

function spreadPositions(total: number, k: number, rng: Rng): number[] {
  const positions = [0];
  const gap = (total - 1) / (k - 1);
  for (let i = 1; i < k - 1; i++) {
    const ideal = i * gap;
    const jitter = (rng.next() - 0.5) * gap * 0.6;
    positions.push(Math.max(positions[i - 1]! + 1, Math.min(total - 1 - (k - 1 - i), Math.round(ideal + jitter))));
  }
  positions.push(total - 1);
  return positions;
}

function assignNumbers(n: number, path: readonly number[], positions: readonly number[]): Uint8Array {
  const numbers = new Uint8Array(n * n);
  positions.forEach((p, i) => (numbers[path[p]!] = i + 1));
  return numbers;
}

function addWall(walls: Uint8Array, n: number, a: number, b: number): void {
  const d = directionBetween(n, a, b);
  walls[a]! |= 1 << d;
  walls[b]! |= 1 << ((d + 2) % 4);
}

function hasWall(walls: Uint8Array, n: number, a: number, b: number): boolean {
  return (walls[a]! & (1 << directionBetween(n, a, b))) !== 0;
}

function pathEdges(n: number, path: readonly number[]): Uint8Array {
  const used = new Uint8Array(n * n);
  for (let i = 1; i < path.length; i++) {
    const d = directionBetween(n, path[i - 1]!, path[i]!);
    used[path[i - 1]!]! |= 1 << d;
    used[path[i]!]! |= 1 << ((d + 2) % 4);
  }
  return used;
}

function freeEdges(n: number, used: Uint8Array, walls: Uint8Array): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n * n; i++) {
    for (const d of [1, 2]) {
      const j = neighborOf(n, i, d);
      if (j < 0 || used[i]! & (1 << d) || walls[i]! & (1 << d)) continue;
      out.push([i, j]);
    }
  }
  return out;
}

const SOLVE_NODES: Record<Difficulty, number> = { easy: 60_000, medium: 150_000, hard: 120_000, genius: 200_000 };
const PROBE_LIMIT: Record<Difficulty, number> = { easy: 64, medium: 24, hard: 12, genius: 8 };
const SHIFTS = [-3, -2, -1, 1, 2, 3];
const MAX_ROUNDS = 40;
const MAX_NUMBERS = 60;

interface Probe {
  count: number;
  alt: number[] | null;
}

interface Build {
  n: number;
  path: number[];
  used: Uint8Array;
  walls: Uint8Array;
  positions: number[];
  numbers: Uint8Array;
  wallsPlaced: number;
  limit: number;
  maxNodes: number;
  result: Probe;
}

function probe(b: Build, numbers: Uint8Array): Probe {
  let alt: number[] | null = null;
  const r = enumerateZipSolutions({ config: { size: b.n }, numbers, walls: b.walls }, b.limit, b.maxNodes, (path) => {
    if (alt) return;
    for (let i = 0; i < path.length; i++) {
      if (path[i] !== b.path[i]) {
        alt = [...path];
        return;
      }
    }
  });
  return { count: r.exhausted ? b.limit + 1 : r.solutions, alt };
}

function wallAgainst(b: Build, alt: readonly number[], rng: Rng): [number, number] | null {
  const options: [number, number][] = [];
  for (let i = 1; i < alt.length; i++) {
    const a = alt[i - 1]!;
    const c = alt[i]!;
    const d = directionBetween(b.n, a, c);
    if (b.used[a]! & (1 << d) || b.walls[a]! & (1 << d)) continue;
    options.push([a, c]);
  }
  return options.length > 0 ? rng.pick(options) : null;
}

function numberAgainst(b: Build, rng: Rng): number | null {
  const taken = new Set(b.positions);
  const alt = b.result.alt;
  const candidates: number[] = [];
  for (let p = 1; p < b.path.length - 1; p++) {
    if (taken.has(p) || taken.has(p - 1) || taken.has(p + 1)) continue;
    if (alt && alt[p] === b.path[p]) continue;
    candidates.push(p);
  }
  if (candidates.length === 0) {
    for (let p = 1; p < b.path.length - 1; p++) if (!taken.has(p)) candidates.push(p);
  }
  if (candidates.length === 0) return null;
  let best = candidates[0]!;
  let bestGap = -1;
  for (const p of rng.shuffle(candidates)) {
    let gap = Number.POSITIVE_INFINITY;
    for (const q of b.positions) gap = Math.min(gap, Math.abs(q - p));
    if (gap > bestGap) {
      bestGap = gap;
      best = p;
    }
  }
  return best;
}

function setPositions(b: Build, positions: number[], result?: Probe): void {
  b.positions = positions.sort((x, y) => x - y);
  b.numbers = assignNumbers(b.n, b.path, b.positions);
  b.result = result ?? probe(b, b.numbers);
}

function descend(b: Build, rng: Rng): boolean {
  let improved = false;
  const interior = Array.from({ length: b.positions.length - 2 }, (_, i) => i + 1);
  for (const idx of rng.shuffle(interior)) {
    if (b.result.count === 1) return improved;
    let best: { positions: number[]; numbers: Uint8Array; probe: Probe } | null = null;
    for (const shift of rng.shuffle([...SHIFTS])) {
      const p = b.positions[idx]! + shift;
      if (p <= b.positions[idx - 1]! || p >= b.positions[idx + 1]!) continue;
      const trial = [...b.positions];
      trial[idx] = p;
      const numbers = assignNumbers(b.n, b.path, trial);
      const next = probe(b, numbers);
      if (next.count >= b.result.count) continue;
      best = { positions: trial, numbers, probe: next };
      break;
    }
    if (best) {
      b.positions = best.positions;
      b.numbers = best.numbers;
      b.result = best.probe;
      improved = true;
    }
  }
  return improved;
}

function tryBuild(seed: number, difficulty: Difficulty, config: ZipConfig, rng: Rng): ZipSpec | null {
  const n = config.size;
  const total = n * n;
  const path = randomHamiltonianPath(n, rng);
  const b: Build = {
    n,
    path,
    used: pathEdges(n, path),
    walls: new Uint8Array(total),
    positions: [],
    numbers: new Uint8Array(total),
    wallsPlaced: 0,
    limit: PROBE_LIMIT[difficulty],
    maxNodes: SOLVE_NODES[difficulty],
    result: { count: 0, alt: null },
  };
  setPositions(b, spreadPositions(total, config.numbers, rng));
  for (let round = 0; round < MAX_ROUNDS && b.result.count !== 1; round++) {
    if (b.result.count === 0) return null;
    if (b.wallsPlaced < config.walls && b.result.alt) {
      const edge = wallAgainst(b, b.result.alt, rng);
      if (edge) {
        addWall(b.walls, n, edge[0], edge[1]);
        b.wallsPlaced++;
        b.result = probe(b, b.numbers);
        continue;
      }
    }
    if (b.result.count <= b.limit && descend(b, rng)) continue;
    const p = numberAgainst(b, rng);
    if (p === null || b.positions.length >= MAX_NUMBERS) return null;
    setPositions(b, [...b.positions, p]);
  }
  if (b.result.count !== 1) return null;
  const spare = rng.shuffle(freeEdges(n, b.used, b.walls));
  while (b.wallsPlaced < config.walls && spare.length > 0) {
    const [a, c] = spare.pop()!;
    addWall(b.walls, n, a, c);
    b.wallsPlaced++;
  }
  return { version: ZIP_VERSION, seed, difficulty, config, numbers: b.numbers, walls: b.walls, solution: Uint16Array.from(path) };
}

export function generateZip(seed: number, difficulty: Difficulty, options: ZipOptions = {}): ZipSpec {
  const config = zipConfig(difficulty, options);
  if (config.size < 3) throw new Error('zip grid too small');
  const rng = new Rng(seed);
  for (let attempt = 0; attempt < 6; attempt++) {
    const spec = tryBuild(seed, difficulty, config, rng);
    if (spec) return spec;
  }
  throw new Error(`could not generate zip puzzle for seed ${seed} / ${config.size}x${config.size}`);
}

export function emptyZipState(): ZipState {
  return [];
}

export function zipStart(spec: ZipSpec): number {
  return spec.solution[0]!;
}

export function zipStepAllowed(spec: ZipSpec, from: number, to: number): boolean {
  const n = spec.config.size;
  const d = directionBetween(n, from, to);
  if (d < 0) return false;
  return !hasWall(spec.walls, n, from, to);
}

export function zipPathValid(spec: ZipSpec, state: ZipState): boolean {
  const n = spec.config.size;
  if (state.length === 0) return true;
  if (state[0] !== spec.solution[0]) return false;
  const seen = new Uint8Array(n * n);
  let next = 1;
  for (let i = 0; i < state.length; i++) {
    const cell = state[i]!;
    if (cell < 0 || cell >= n * n || seen[cell]) return false;
    seen[cell] = 1;
    if (i > 0 && !zipStepAllowed(spec, state[i - 1]!, cell)) return false;
    const v = spec.numbers[cell]!;
    if (v !== 0) {
      if (v !== next) return false;
      next++;
    }
  }
  return true;
}

export function isZipSolved(spec: ZipSpec, state: ZipState): boolean {
  const total = spec.config.size * spec.config.size;
  if (state.length !== total) return false;
  return zipPathValid(spec, state);
}

function correctPrefix(spec: ZipSpec, state: ZipState): number {
  let i = 0;
  while (i < state.length && state[i] === spec.solution[i]) i++;
  return i;
}

export function zipProgress(spec: ZipSpec, state: ZipState): { matching: number; total: number } {
  return { matching: correctPrefix(spec, state), total: spec.solution.length };
}

export interface ZipHint {
  index: number;
  truncate: number | null;
  reason: 'start' | 'next' | 'deviation';
}

export function zipHint(spec: ZipSpec, state: ZipState): ZipHint | null {
  const prefix = correctPrefix(spec, state);
  if (prefix >= spec.solution.length) return null;
  const index = spec.solution[prefix]!;
  if (prefix < state.length) return { index, truncate: prefix, reason: 'deviation' };
  return { index, truncate: null, reason: prefix === 0 ? 'start' : 'next' };
}

export function zipNumberCount(spec: ZipSpec): number {
  let k = 0;
  for (let i = 0; i < spec.numbers.length; i++) if (spec.numbers[i]! > k) k = spec.numbers[i]!;
  return k;
}

export function zipNeighbors(spec: ZipSpec): Int16Array {
  return zipNeighborTable(spec.config.size, spec.walls);
}
