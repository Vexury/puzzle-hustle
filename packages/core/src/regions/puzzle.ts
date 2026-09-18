import { Rng } from '../rng.ts';
import type { Difficulty } from '../types.ts';
import { REGIONS_MARKED_EMPTY, countRegionsSolutions, regionsNeighbors, regionsPropagate, regionsUnits } from './solver.ts';

export { REGIONS_MARKED_EMPTY } from './solver.ts';

export const REGIONS_VERSION = 1;

export interface RegionsConfig {
  size: number;
  stars: number;
}

export interface RegionsSpec {
  version: number;
  seed: number;
  difficulty: Difficulty;
  config: RegionsConfig;
  regions: Uint8Array;
  solution: Uint8Array;
}

export type RegionsState = Uint8Array;

export interface RegionsOptions {
  sizeDelta?: number;
}

export const CROWNS_PRESETS: Record<Difficulty, RegionsConfig> = {
  easy: { size: 6, stars: 1 },
  medium: { size: 8, stars: 1 },
  hard: { size: 9, stars: 1 },
  genius: { size: 11, stars: 1 },
};

export const STARS_PRESETS: Record<Difficulty, RegionsConfig> = {
  easy: { size: 8, stars: 2 },
  medium: { size: 9, stars: 2 },
  hard: { size: 10, stars: 2 },
  genius: { size: 12, stars: 2 },
};

function withDelta(base: RegionsConfig, options: RegionsOptions): RegionsConfig {
  return { ...base, size: base.size + (options.sizeDelta ?? 0) };
}

export function crownsConfig(difficulty: Difficulty, options: RegionsOptions = {}): RegionsConfig {
  return withDelta(CROWNS_PRESETS[difficulty], options);
}

export function starsConfig(difficulty: Difficulty, options: RegionsOptions = {}): RegionsConfig {
  return withDelta(STARS_PRESETS[difficulty], options);
}

const DIRS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

function randomStars(n: number, k: number, rng: Rng): Uint8Array | null {
  const grid = new Uint8Array(n * n);
  const colCount = new Uint8Array(n);
  let budget = 20_000;

  function blocked(r: number, c: number): boolean {
    if (r === 0) return false;
    const base = (r - 1) * n;
    return grid[base + c] === 1 || (c > 0 && grid[base + c - 1] === 1) || (c + 1 < n && grid[base + c + 1] === 1);
  }

  function rowChoices(r: number, minCol: number): number[] {
    const out: number[] = [];
    for (let c = minCol; c < n; c++) if (colCount[c]! < k && !blocked(r, c)) out.push(c);
    return rng.shuffle(out);
  }

  function place(r: number, minCol: number, count: number): boolean {
    if (budget-- <= 0) return false;
    if (count === k) {
      const left = n - r - 1;
      for (let c = 0; c < n; c++) if (colCount[c]! + left < k) return false;
      return r === n - 1 || place(r + 1, 0, 0);
    }
    for (const c of rowChoices(r, minCol)) {
      const inRow = grid.subarray(r * n, r * n + n);
      if ((c > 0 && inRow[c - 1] === 1) || (c + 1 < n && inRow[c + 1] === 1)) continue;
      grid[r * n + c] = 1;
      colCount[c]!++;
      if (place(r, c + 2, count + 1)) return true;
      grid[r * n + c] = 0;
      colCount[c]!--;
      if (budget <= 0) return false;
    }
    return false;
  }

  return place(0, 0, 0) ? grid : null;
}

function distance(n: number, a: number, b: number): number {
  return Math.abs(Math.floor(a / n) - Math.floor(b / n)) + Math.abs((a % n) - (b % n));
}

function groupStars(n: number, k: number, stars: number[], rng: Rng): number[][] {
  const free = rng.shuffle([...stars]);
  const groups: number[][] = [];
  while (free.length > 0) {
    const first = free.pop()!;
    const group = [first];
    while (group.length < k) {
      let best = -1;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < free.length; i++) {
        const d = distance(n, first, free[i]!) + rng.next() * 0.5;
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      group.push(free.splice(best, 1)[0]!);
    }
    groups.push(group);
  }
  return groups;
}

function connect(n: number, owner: Int16Array, from: number, to: number, reg: number, rng: Rng): boolean {
  const prev = new Int32Array(n * n).fill(-1);
  prev[from] = from;
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]!;
    if (cur === to) break;
    const r = Math.floor(cur / n);
    const c = cur % n;
    for (const [dr, dc] of rng.shuffle([...DIRS])) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
      const j = rr * n + cc;
      if (prev[j]! >= 0) continue;
      if (owner[j]! >= 0 && j !== to) continue;
      prev[j] = cur;
      queue.push(j);
    }
  }
  if (prev[to]! < 0) return false;
  for (let cur = to; cur !== from; cur = prev[cur]!) owner[cur] = reg;
  return true;
}

function grow(n: number, owner: Int16Array, rng: Rng): void {
  const frontier: number[] = [];
  const push = (i: number) => {
    const r = Math.floor(i / n);
    const c = i % n;
    for (const [dr, dc] of DIRS) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
      const j = rr * n + cc;
      if (owner[j]! < 0) frontier.push(j * n + owner[i]!);
    }
  };
  for (let i = 0; i < n * n; i++) if (owner[i]! >= 0) push(i);
  while (frontier.length > 0) {
    const pick = rng.int(frontier.length);
    const entry = frontier[pick]!;
    frontier[pick] = frontier[frontier.length - 1]!;
    frontier.pop();
    const cell = Math.floor(entry / n);
    if (owner[cell]! >= 0) continue;
    owner[cell] = entry % n;
    push(cell);
  }
}

function buildRegions(n: number, k: number, solution: Uint8Array, rng: Rng): Uint8Array | null {
  const stars = Array.from(solution, (v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const owner = new Int16Array(n * n).fill(-1);
  const groups = groupStars(n, k, stars, rng);
  groups.forEach((group, reg) => group.forEach((i) => (owner[i] = reg)));
  for (let reg = 0; reg < groups.length; reg++) {
    const group = groups[reg]!;
    for (let g = 1; g < group.length; g++) if (!connect(n, owner, group[g - 1]!, group[g]!, reg, rng)) return null;
  }
  grow(n, owner, rng);
  return Uint8Array.from(owner);
}

function staysConnected(n: number, regions: Uint8Array, reg: number, removed: number): boolean {
  let start = -1;
  let total = 0;
  for (let i = 0; i < n * n; i++) {
    if (regions[i] !== reg || i === removed) continue;
    total++;
    start = i;
  }
  if (start < 0) return false;
  const seen = new Uint8Array(n * n);
  seen[start] = 1;
  const stack = [start];
  let reached = 0;
  while (stack.length > 0) {
    const cur = stack.pop()!;
    reached++;
    const r = Math.floor(cur / n);
    const c = cur % n;
    for (const [dr, dc] of DIRS) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
      const j = rr * n + cc;
      if (j === removed || seen[j] || regions[j] !== reg) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return reached === total;
}

function boundaryMoves(n: number, spec: RegionsSpec): number[] {
  const out: number[] = [];
  for (let i = 0; i < n * n; i++) {
    if (spec.solution[i]) continue;
    const r = Math.floor(i / n);
    const c = i % n;
    for (const [dr, dc] of DIRS) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
      const j = rr * n + cc;
      if (spec.regions[j] !== spec.regions[i]) out.push(i * n * n + j);
    }
  }
  return out;
}

const REFINE_LIMIT = 64;

function refineUnique(spec: RegionsSpec, rng: Rng, maxSteps: number): boolean {
  const n = spec.config.size;
  let count = countRegionsSolutions(spec, REFINE_LIMIT).solutions;
  for (let step = 0; step < maxSteps && count !== 1; step++) {
    const moves = boundaryMoves(n, spec);
    if (moves.length === 0) return false;
    const move = rng.pick(moves);
    const cell = Math.floor(move / (n * n));
    const from = spec.regions[cell]!;
    const to = spec.regions[move % (n * n)]!;
    if (!staysConnected(n, spec.regions, from, cell)) continue;
    spec.regions[cell] = to;
    const next = countRegionsSolutions(spec, Math.min(REFINE_LIMIT, count + 1)).solutions;
    if (next === 0 || next > count) spec.regions[cell] = from;
    else count = next;
  }
  return count === 1;
}

export function generateRegions(seed: number, config: RegionsConfig, difficulty: Difficulty = 'medium'): RegionsSpec {
  const { size, stars } = config;
  if (size < stars * 4) throw new Error(`regions grid ${size} too small for ${stars} stars`);
  const rng = new Rng(seed);
  for (let attempt = 0; attempt < 40; attempt++) {
    const solution = randomStars(size, stars, rng);
    if (!solution) continue;
    const regions = buildRegions(size, stars, solution, rng);
    if (!regions) continue;
    const spec: RegionsSpec = { version: REGIONS_VERSION, seed, difficulty, config, regions, solution };
    if (refineUnique(spec, rng, 600)) return spec;
  }
  throw new Error(`could not generate regions puzzle for seed ${seed} / ${size}x${size} with ${stars} stars`);
}

export function generateCrowns(seed: number, difficulty: Difficulty, options: RegionsOptions = {}): RegionsSpec {
  return generateRegions(seed, crownsConfig(difficulty, options), difficulty);
}

export function generateStars(seed: number, difficulty: Difficulty, options: RegionsOptions = {}): RegionsSpec {
  return generateRegions(seed, starsConfig(difficulty, options), difficulty);
}

export function emptyRegionsState(spec: RegionsSpec): RegionsState {
  return new Uint8Array(spec.config.size * spec.config.size);
}

function starBit(v: number): number {
  return v === 1 ? 1 : 0;
}

export function isRegionsSolved(spec: RegionsSpec, state: RegionsState): boolean {
  return spec.solution.every((v, i) => v === starBit(state[i]!));
}

export function regionsProgress(spec: RegionsSpec, state: RegionsState): { matching: number; total: number } {
  let matching = 0;
  let total = 0;
  spec.solution.forEach((v, i) => {
    if (!v) return;
    total++;
    if (starBit(state[i]!) === v) matching++;
  });
  return { matching, total };
}

export interface RegionsLineCounts {
  rows: Uint8Array;
  cols: Uint8Array;
  regions: Uint8Array;
}

export function regionsLineCounts(spec: RegionsSpec, state: RegionsState): RegionsLineCounts {
  const n = spec.config.size;
  const rows = new Uint8Array(n);
  const cols = new Uint8Array(n);
  const regions = new Uint8Array(n);
  for (let i = 0; i < state.length; i++) {
    if (state[i] !== 1) continue;
    rows[Math.floor(i / n)]!++;
    cols[i % n]!++;
    regions[spec.regions[i]!]!++;
  }
  return { rows, cols, regions };
}

export function regionsConflicts(spec: RegionsSpec, state: RegionsState): Uint8Array {
  const n = spec.config.size;
  const k = spec.config.stars;
  const counts = regionsLineCounts(spec, state);
  const out = new Uint8Array(state.length);
  for (let i = 0; i < state.length; i++) {
    if (state[i] !== 1) continue;
    const over = counts.rows[Math.floor(i / n)]! > k || counts.cols[i % n]! > k || counts.regions[spec.regions[i]!]! > k;
    out[i] = over || regionsNeighbors(n, i).some((j) => state[j] === 1) ? 1 : 0;
  }
  return out;
}

export function regionsUnitComplete(spec: RegionsSpec, counts: RegionsLineCounts, i: number): boolean {
  const n = spec.config.size;
  const k = spec.config.stars;
  return counts.rows[Math.floor(i / n)] === k || counts.cols[i % n] === k || counts.regions[spec.regions[i]!] === k;
}

export function regionsBorders(spec: RegionsSpec, i: number): { top: boolean; right: boolean; bottom: boolean; left: boolean } {
  const n = spec.config.size;
  const r = Math.floor(i / n);
  const c = i % n;
  const reg = spec.regions[i];
  const other = (rr: number, cc: number) => rr < 0 || cc < 0 || rr >= n || cc >= n || spec.regions[rr * n + cc] !== reg;
  return { top: other(r - 1, c), right: other(r, c + 1), bottom: other(r + 1, c), left: other(r, c - 1) };
}

export function regionsPalette(spec: RegionsSpec, colors: number): Uint8Array {
  const n = spec.config.size;
  const out = new Uint8Array(n);
  if (n <= colors) {
    for (let reg = 0; reg < n; reg++) out[reg] = reg;
    return out;
  }
  const units = regionsUnits(spec);
  const adjacent: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (let i = 0; i < n * n; i++) {
    for (const j of regionsNeighbors(n, i)) {
      const a = spec.regions[i]!;
      const b = spec.regions[j]!;
      if (a !== b) adjacent[a]!.add(b);
    }
  }
  const order = Array.from({ length: n }, (_, reg) => reg).sort((a, b) => units.regions[b]!.length - units.regions[a]!.length);
  const assigned = new Int16Array(n).fill(-1);
  for (const reg of order) {
    const used = new Set<number>();
    for (const other of adjacent[reg]!) if (assigned[other]! >= 0) used.add(assigned[other]!);
    let color = 0;
    while (used.has(color) && color < colors) color++;
    assigned[reg] = color % colors;
  }
  for (let reg = 0; reg < n; reg++) out[reg] = assigned[reg]!;
  return out;
}

export interface RegionsHint {
  r: number;
  c: number;
  value: number;
}

function cellHint(n: number, i: number, value: number): RegionsHint {
  return { r: Math.floor(i / n), c: i % n, value };
}

export function regionsHint(spec: RegionsSpec, state: RegionsState): RegionsHint | null {
  const n = spec.config.size;
  if (isRegionsSolved(spec, state)) return null;
  for (let i = 0; i < state.length; i++) {
    const v = state[i]!;
    if (v === 0) continue;
    const want = spec.solution[i] ? 1 : REGIONS_MARKED_EMPTY;
    if (v !== want) return cellHint(n, i, want);
  }
  const next = regionsPropagate(spec, state, 1).state;
  let empty: number | null = null;
  for (let i = 0; i < state.length; i++) {
    if (next[i] === state[i]) continue;
    if (next[i] === 1 && spec.solution[i] === 1) return cellHint(n, i, 1);
    if (next[i] === REGIONS_MARKED_EMPTY && spec.solution[i] === 0) empty ??= i;
  }
  if (empty !== null) return cellHint(n, empty, REGIONS_MARKED_EMPTY);
  const star = spec.solution.findIndex((v, i) => v === 1 && state[i] === 0);
  if (star >= 0) return cellHint(n, star, 1);
  const unknown = state.findIndex((v) => v === 0);
  if (unknown < 0) return null;
  return cellHint(n, unknown, REGIONS_MARKED_EMPTY);
}
