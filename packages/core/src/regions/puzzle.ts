import { Rng } from '../rng.ts';
import type { Difficulty } from '../types.ts';
import { REGIONS_MARKED_EMPTY, enumerateRegionsSolutions, regionsNeighbors, regionsPropagate, regionsUnits } from './solver.ts';

export { REGIONS_MARKED_EMPTY } from './solver.ts';

export const REGIONS_VERSION = 1;
// Stars (Hearts) apart from Crowns since 2026-10-02: version 2 keeps blind regions out of medium.
export const STARS_VERSION = 2;

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

const SNAKE_BIAS = 0.85;
const SIZE_SKEW = 3;

function targetSizes(n: number, sizes: Int32Array, rng: Rng): Float64Array {
  const weights = Float64Array.from({ length: n }, () => 0.05 + rng.next() ** SIZE_SKEW);
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w, reg) => Math.max(sizes[reg]!, Math.min(2.5 * n, (w / total) * n * n)));
}

function grow(n: number, owner: Int16Array, rng: Rng): void {
  const frontiers: number[][] = Array.from({ length: n }, () => []);
  const sizes = new Int32Array(n);
  const push = (i: number) => {
    const reg = owner[i]!;
    const r = Math.floor(i / n);
    const c = i % n;
    for (const [dr, dc] of rng.shuffle([...DIRS])) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
      const j = rr * n + cc;
      if (owner[j]! < 0) frontiers[reg]!.push(j);
    }
  };
  for (let i = 0; i < n * n; i++) {
    if (owner[i]! < 0) continue;
    sizes[owner[i]!]!++;
    push(i);
  }
  const target = targetSizes(n, sizes, rng);
  for (;;) {
    let reg = -1;
    let bestRatio = Number.POSITIVE_INFINITY;
    for (let cand = 0; cand < n; cand++) {
      if (frontiers[cand]!.length === 0) continue;
      const ratio = sizes[cand]! / target[cand]!;
      if (ratio < bestRatio || (ratio === bestRatio && rng.next() < 0.5)) {
        bestRatio = ratio;
        reg = cand;
      }
    }
    if (reg < 0) break;
    const frontier = frontiers[reg]!;
    const pick = rng.next() < SNAKE_BIAS ? frontier.length - 1 : rng.int(frontier.length);
    const cell = frontier[pick]!;
    frontier[pick] = frontier[frontier.length - 1]!;
    frontier.pop();
    if (owner[cell]! >= 0) continue;
    owner[cell] = reg;
    sizes[reg]!++;
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

function otherRegions(n: number, spec: RegionsSpec, i: number): number[] {
  const r = Math.floor(i / n);
  const c = i % n;
  const out: number[] = [];
  for (const [dr, dc] of DIRS) {
    const rr = r + dr;
    const cc = c + dc;
    if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
    const reg = spec.regions[rr * n + cc]!;
    if (reg !== spec.regions[i] && !out.includes(reg)) out.push(reg);
  }
  return out;
}

const REFINE_LIMIT = 64;

interface Work {
  left: number;
}

function altStarFrequency(spec: RegionsSpec, limit: number, work: Work): { count: number; freq: Uint16Array } {
  const freq = new Uint16Array(spec.solution.length);
  const { solutions, nodes } = enumerateRegionsSolutions(
    spec,
    limit,
    (grid) => {
      for (let i = 0; i < grid.length; i++) if (grid[i] === 1 && spec.solution[i] === 0) freq[i]!++;
    },
    work.left,
  );
  work.left -= nodes;
  if (work.left < 0) throw new Error('regions generation ran out of budget');
  return { count: solutions, freq };
}

function rankedMoves(n: number, spec: RegionsSpec, freq: Uint16Array, rng: Rng): number[] {
  const cells: number[] = [];
  for (let i = 0; i < freq.length; i++) if (freq[i]! > 0) cells.push(i);
  rng.shuffle(cells);
  cells.sort((a, b) => freq[b]! - freq[a]!);
  const out: number[] = [];
  for (const i of cells) for (const reg of rng.shuffle(otherRegions(n, spec, i))) out.push(i * n + reg);
  return out;
}

const REFINE_BATCH = 8;
const TABU = 6;

function remember(tabu: number[], cell: number): void {
  tabu.push(cell);
  if (tabu.length > TABU) tabu.shift();
}

function movable(n: number, spec: RegionsSpec, tabu: readonly number[], move: number): boolean {
  const cell = Math.floor(move / n);
  return !tabu.includes(cell) && !spec.solution[cell] && staysConnected(n, spec.regions, spec.regions[cell]!, cell);
}

function randomMove(n: number, spec: RegionsSpec, tabu: readonly number[], rng: Rng): number | undefined {
  const moves: number[] = [];
  for (let i = 0; i < n * n; i++) for (const reg of otherRegions(n, spec, i)) moves.push(i * n + reg);
  return rng.shuffle(moves).find((m) => movable(n, spec, tabu, m));
}

function refineUnique(spec: RegionsSpec, rng: Rng, maxSteps: number, work: Work): boolean {
  const n = spec.config.size;
  let { count, freq } = altStarFrequency(spec, REFINE_LIMIT, work);
  const tabu: number[] = [];
  for (let step = 0; step < maxSteps && count !== 1; step++) {
    let best: { move: number; count: number; freq: Uint16Array } | null = null;
    let tried = 0;
    for (const move of rankedMoves(n, spec, freq, rng)) {
      if (tried >= REFINE_BATCH || (count >= REFINE_LIMIT && tried > 0)) break;
      if (!movable(n, spec, tabu, move)) continue;
      tried++;
      const cell = Math.floor(move / n);
      const from = spec.regions[cell]!;
      spec.regions[cell] = move % n;
      const next = altStarFrequency(spec, Math.min(REFINE_LIMIT, count + 1), work);
      spec.regions[cell] = from;
      if (!best || next.count < best.count) best = { move, count: next.count, freq: next.freq };
      if (next.count <= count) break;
    }
    if (!best) {
      const move = randomMove(n, spec, tabu, rng);
      if (move === undefined) return false;
      spec.regions[Math.floor(move / n)] = move % n;
      const next = altStarFrequency(spec, REFINE_LIMIT, work);
      best = { move, count: next.count, freq: next.freq };
    }
    spec.regions[Math.floor(best.move / n)] = best.move % n;
    remember(tabu, Math.floor(best.move / n));
    count = best.count;
    freq = best.freq;
  }
  return count === 1;
}

// Solver nodes a runtime pick (scheduled or random) may spend on one seed, summed over the
// generator's internal attempts. Past it the seed is rejected and the caller moves on, so no device stalls on a
// seed the hill climb struggles with. A node count, not a clock, so every device agrees.
// Every published daily, weekly and monthly up to 2028-02 stays below it; raising or
// lowering it changes which seeds later periods get.
export const REGIONS_BUDGET = 500_000;

// A region whose shape alone leaves one way to place its stars, such as three cells in a row
// with two stars: players learn the shape and fill it without reading the board.
function blindRegions(spec: RegionsSpec): number {
  const n = spec.config.size;
  const k = spec.config.stars;
  const cells: number[][] = Array.from({ length: n }, () => []);
  spec.regions.forEach((reg, i) => cells[reg]!.push(i));
  const touch = (a: number, b: number) => Math.abs(Math.floor(a / n) - Math.floor(b / n)) <= 1 && Math.abs((a % n) - (b % n)) <= 1;
  let blind = 0;
  for (const region of cells) {
    let ways = 0;
    const place = (from: number, chosen: number[]): void => {
      if (chosen.length === k) {
        ways++;
        return;
      }
      for (let i = from; i < region.length && ways < 2; i++) if (chosen.every((c) => !touch(c, region[i]!))) place(i + 1, [...chosen, region[i]!]);
    };
    place(0, []);
    if (ways === 1) blind++;
  }
  return blind;
}

export function generateRegions(
  seed: number,
  config: RegionsConfig,
  difficulty: Difficulty = 'medium',
  budget = Number.POSITIVE_INFINITY,
  version = REGIONS_VERSION,
  maxBlind = Number.POSITIVE_INFINITY,
): RegionsSpec {
  const { size, stars } = config;
  if (size < stars * 4) throw new Error(`regions grid ${size} too small for ${stars} stars`);
  const rng = new Rng(seed);
  const work: Work = { left: budget };
  for (let attempt = 0; attempt < 40; attempt++) {
    const solution = randomStars(size, stars, rng);
    if (!solution) continue;
    const regions = buildRegions(size, stars, solution, rng);
    if (!regions) continue;
    const spec: RegionsSpec = { version, seed, difficulty, config, regions, solution };
    if (refineUnique(spec, rng, 200, work) && blindRegions(spec) <= maxBlind) return spec;
  }
  throw new Error(`could not generate regions puzzle for seed ${seed} / ${size}x${size} with ${stars} stars`);
}

export function generateCrowns(seed: number, difficulty: Difficulty, options: RegionsOptions = {}, budget?: number): RegionsSpec {
  return generateRegions(seed, crownsConfig(difficulty, options), difficulty, budget);
}

// Blind regions a Stars board may keep (2026-10-02, Frieder: on easy and medium two hearts
// could be set blind from a recurring shape). Easy keeps them as a way in; hard and genius
// were not part of the change.
const STARS_MAX_BLIND: Partial<Record<Difficulty, number>> = { medium: 0 };

export function generateStars(seed: number, difficulty: Difficulty, options: RegionsOptions = {}, budget?: number): RegionsSpec {
  return generateRegions(seed, starsConfig(difficulty, options), difficulty, budget, STARS_VERSION, STARS_MAX_BLIND[difficulty]);
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

// Picks a palette colour per region so that touching regions look as different as the palette
// allows. `distance[a][b]` is how far apart colours a and b look; the caller measures its own
// palette, so the core never needs to know the colours. Every region gets its own colour while
// the palette has enough. Greedy first (most neighbours first, each taking the colour furthest
// from its coloured neighbours), then single moves and swaps while they improve the closest
// touching pair, then the next closest, and so on. Deterministic, so every device agrees.
export function regionsPalette(spec: RegionsSpec, distance: readonly (readonly number[])[]): Uint8Array {
  const n = spec.config.size;
  const colors = distance.length;
  const unique = n <= colors;
  // Regions that share an edge; touching only at a corner does not make two colours read as one.
  const adjacent: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (let i = 0; i < n * n; i++) {
    for (const j of [i % n < n - 1 ? i + 1 : -1, i + n < n * n ? i + n : -1]) {
      const a = spec.regions[i]!;
      const b = j >= 0 ? spec.regions[j]! : a;
      if (a === b) continue;
      adjacent[a]!.add(b);
      adjacent[b]!.add(a);
    }
  }
  const out = new Array<number>(n).fill(-1);
  const order = Array.from({ length: n }, (_, reg) => reg).sort((a, b) => adjacent[b]!.size - adjacent[a]!.size || a - b);
  for (const reg of order) {
    let best = 0;
    let bestGap = -1;
    for (let c = 0; c < colors; c++) {
      if (unique && out.includes(c)) continue;
      let gap = Infinity;
      for (const other of adjacent[reg]!) if (out[other]! >= 0) gap = Math.min(gap, distance[c]![out[other]!]!);
      if (gap > bestGap) {
        best = c;
        bestGap = gap;
      }
    }
    out[reg] = best;
  }
  // The touching pairs' distances, closest first; one assignment beats another on the first
  // pair where they differ.
  const gaps = () => {
    const d: number[] = [];
    for (let a = 0; a < n; a++) for (const b of adjacent[a]!) if (b > a) d.push(distance[out[a]!]![out[b]!]!);
    return d.sort((x, y) => x - y);
  };
  const better = (x: number[], y: number[]) => {
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i]! > y[i]!;
    return false;
  };
  let current = gaps();
  for (let improved = true; improved; ) {
    improved = false;
    for (let a = 0; a < n; a++) {
      for (let c = 0; c < colors; c++) {
        const old = out[a]!;
        if (c === old) continue;
        const b = unique ? out.indexOf(c) : -1;
        out[a] = c;
        if (b >= 0) out[b] = old;
        const next = gaps();
        if (better(next, current)) {
          current = next;
          improved = true;
        } else {
          out[a] = old;
          if (b >= 0) out[b] = c;
        }
      }
    }
  }
  return Uint8Array.from(out);
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
