import { Rng } from '../rng.ts';
import type { Difficulty } from '../types.ts';
import {
  SLAB_MAX_PIPS,
  ruleBroken,
  ruleHolds,
  slabCells,
  slabDirection,
  slabNeighbour,
  slabsRegions,
  solveSlabs,
  type SlabsPlacement,
  type SlabsSolveResult,
  type SlabsPuzzle,
  type SlabsRule,
} from './solver.ts';

export const SLABS_VERSION = 3;

export interface SlabsConfig {
  cols: number;
  rows: number;
  slabs: number;
  maxTier: 1 | 2 | 3;
  // How many deductions the top allowed tier must contribute, so a medium board is not
  // secretly an easy one.
  minTopSteps: number;
  minRegion: number;
  maxRegion: number;
  // Chance that a region is offered a weaker rule than its exact sum.
  weaken: number;
  // Chance that a sum region is offered no rule at all, leaving its cells free.
  blank: number;
  // Cap on the top tier's deductions, so the hardest rule shows up a few times instead of
  // carrying the whole board.
  maxTopSteps: number;
  // The board splits into 1 to this many separate islands.
  islands: number;
  // Chance that a slab is laid so one of its halves matches a neighbour, which feeds `=` regions.
  matchBias: number;
  // Shape of the solve: at most this many waves of slabs falling into place one after another,
  // and at least this many slabs in the first wave, so a player can work along from the start.
  maxWaves: number;
  minFirst: number;
}

// At most eight columns, so the board and the tray fit a phone without zoom.
export const SLABS_PRESETS: Record<Difficulty, SlabsConfig> = {
  easy: { cols: 4, rows: 5, slabs: 6, maxTier: 1, minTopSteps: 0, minRegion: 1, maxRegion: 3, weaken: 0.2, blank: 0.5, maxTopSteps: 0, islands: 1, matchBias: 0.85, maxWaves: 3, minFirst: 2 },
  medium: { cols: 6, rows: 6, slabs: 10, maxTier: 1, minTopSteps: 0, minRegion: 1, maxRegion: 4, weaken: 0.4, blank: 0.6, maxTopSteps: 0, islands: 2, matchBias: 0.85, maxWaves: 4, minFirst: 3 },
  hard: { cols: 7, rows: 7, slabs: 14, maxTier: 2, minTopSteps: 0, minRegion: 2, maxRegion: 4, weaken: 0.6, blank: 0.6, maxTopSteps: 4, islands: 2, matchBias: 0.85, maxWaves: 6, minFirst: 3 },
  genius: { cols: 8, rows: 8, slabs: 20, maxTier: 3, minTopSteps: 1, minRegion: 2, maxRegion: 5, weaken: 0.8, blank: 0.6, maxTopSteps: 12, islands: 3, matchBias: 0.85, maxWaves: 9, minFirst: 4 },
};

export interface SlabsSpec extends SlabsPuzzle {
  version: number;
  seed: number;
  difficulty: Difficulty;
  config: SlabsConfig;
  solution: SlabsPlacement[];
  // Slab indices in the order the logic solver fixes them; hints place slabs in this order.
  order: number[];
}

const DOUBLE_SIX: [number, number][] = [];
for (let a = 0; a <= SLAB_MAX_PIPS; a++) for (let b = a; b <= SLAB_MAX_PIPS; b++) DOUBLE_SIX.push([a, b]);

// Grows each island domino by domino, preferring pairs that hug the area already laid, so an
// island comes out as a compact blob with the odd notch or hole. Islands never touch, not even
// at a corner, and each holds at least two slabs.
export function growTiling(rng: Rng, cols: number, rows: number, count: number, islands = 1): [number, number][] | null {
  const used = new Uint8Array(cols * rows);
  const island = new Int8Array(cols * rows).fill(-1);
  const dominoes: [number, number][] = [];
  const perIsland = new Array<number>(islands).fill(0);
  const neighbours = (cell: number) => [0, 1, 2, 3].map((d) => slabNeighbour(cols, rows, cell, d)).filter((n) => n >= 0);
  const touching = (cell: number, other: number) => neighbours(cell).filter((n) => n !== other && used[n]).length;
  // Islands met within the 3x3 around a cell.
  const near = (cell: number): number[] => {
    const r = Math.floor(cell / cols);
    const c = cell % cols;
    const found: number[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
        const id = island[rr * cols + cc]!;
        if (id >= 0 && !found.includes(id)) found.push(id);
      }
    }
    return found;
  };
  const lay = (pair: [number, number], id: number) => {
    for (const c of pair) {
      used[c] = 1;
      island[c] = id;
    }
    perIsland[id]!++;
    dominoes.push(pair);
  };
  for (let id = 0; id < islands; id++) {
    const starts: [number, number][] = [];
    for (let cell = 0; cell < cols * rows; cell++) {
      for (const dir of [0, 1]) {
        const other = slabNeighbour(cols, rows, cell, dir);
        if (other >= 0 && !near(cell).length && !near(other).length) starts.push([cell, other]);
      }
    }
    if (!starts.length) return null;
    lay(rng.pick(starts), id);
  }
  while (dominoes.length < count) {
    const options: { pair: [number, number]; weight: number; id: number }[] = [];
    for (let cell = 0; cell < cols * rows; cell++) {
      if (used[cell]) continue;
      for (const dir of [0, 1]) {
        const other = slabNeighbour(cols, rows, cell, dir);
        if (other < 0 || used[other]) continue;
        const touch = touching(cell, other) + touching(other, cell);
        if (!touch) continue;
        const ids = [...new Set([...near(cell), ...near(other)])];
        if (ids.length !== 1) continue;
        const id = ids[0]!;
        // Small islands are fed first, so none stays a lone slab.
        const hunger = perIsland[id]! < 2 ? 4 : 1;
        options.push({ pair: [cell, other], weight: (1 + touch * touch) * hunger, id });
      }
    }
    if (!options.length) return null;
    let roll = rng.next() * options.reduce((s, o) => s + o.weight, 0);
    let chosen = options[options.length - 1]!;
    for (const o of options) {
      roll -= o.weight;
      if (roll < 0) {
        chosen = o;
        break;
      }
    }
    lay(chosen.pair, chosen.id);
  }
  return perIsland.every((n) => n >= 2) ? dominoes : null;
}

// A region never holds both halves of a slab with two different values: every rule is blind to
// order, so that slab could be flipped and the puzzle would have two solutions. `mate` is the
// other half of each cell's slab, -1 for doubles, which may sit inside one region.
export function carveRegions(rng: Rng, cols: number, rows: number, blocked: Uint8Array, mate: Int16Array, cfg: SlabsConfig): Int16Array {
  const regionOf = new Int16Array(cols * rows).fill(-1);
  const free: number[] = [];
  for (let i = 0; i < cols * rows; i++) if (!blocked[i]) free.push(i);
  let next = 0;
  for (const start of rng.shuffle(free)) {
    if (regionOf[start]! >= 0) continue;
    const size = cfg.minRegion + rng.int(cfg.maxRegion - cfg.minRegion + 1);
    const cells = [start];
    regionOf[start] = next;
    while (cells.length < size) {
      const frontier: number[] = [];
      for (const c of cells) {
        for (let d = 0; d < 4; d++) {
          const n = slabNeighbour(cols, rows, c, d);
          if (n < 0 || blocked[n] || regionOf[n]! >= 0 || frontier.includes(n)) continue;
          if (mate[n]! >= 0 && regionOf[mate[n]!] === next) continue;
          frontier.push(n);
        }
      }
      if (!frontier.length) break;
      frontier.sort((a, b) => a - b);
      const pick = rng.pick(frontier);
      regionOf[pick] = next;
      cells.push(pick);
    }
    next++;
  }
  return regionOf;
}

// The waves of a solve: a slab's wave is the propagation round it was fixed in, counted over the
// distinct rounds that fixed anything.
function waveShape(res: SlabsSolveResult): { waves: number; first: number; ranks: number[] } {
  const rounds = [...new Set(res.waves.filter((w) => w >= 0))].sort((a, b) => a - b);
  const ranks = res.waves.map((w) => rounds.indexOf(w));
  return { waves: rounds.length, first: ranks.filter((r) => r === 0).length, ranks };
}

function fits(res: SlabsSolveResult, cfg: SlabsConfig): boolean {
  if (!res.solved) return false;
  const { waves, first } = waveShape(res);
  return waves <= cfg.maxWaves && first >= cfg.minFirst;
}

function solvesWell(p: SlabsPuzzle, cfg: SlabsConfig): boolean {
  return fits(solveSlabs(p, cfg.maxTier), cfg);
}

// While the solver still leaves slabs open, or the chain of deductions is too long or starts too
// thin, one cell of the slabs concerned leaves its region and gets its own exact sum: open slabs
// first, else the last wave, else the second. Pieces of the old region that fall apart become
// regions of their own.
function splitUntilSolved(
  rng: Rng,
  cols: number,
  rows: number,
  regionOf: Int16Array,
  solution: SlabsPlacement[],
  base: Omit<SlabsPuzzle, 'regionOf' | 'rules'>,
  rules: (SlabsRule | null)[],
  resum: (reg: number) => void,
  cfg: SlabsConfig,
): boolean {
  for (;;) {
    const res = solveSlabs(compact(base, regionOf, rules), cfg.maxTier);
    if (fits(res, cfg)) return true;
    if (res.contradiction) return false;
    const size = (reg: number) => regionOf.reduce((n, r) => n + (r === reg ? 1 : 0), 0);
    const { waves, ranks } = waveShape(res);
    // Open slabs; else the last wave, falling back to earlier ones; else the second wave.
    const targets = !res.solved ? [-1] : waves > cfg.maxWaves ? Array.from({ length: waves - 1 }, (_, i) => waves - 1 - i) : [1];
    const unsure: number[] = [];
    for (const target of targets) {
      res.placements.forEach((placed, s) => {
        if (target < 0 ? placed : ranks[s] !== target) return;
        const cells = slabCells(base as SlabsPuzzle, solution[s]!.anchor, solution[s]!.dir)!;
        for (const c of cells) if (size(regionOf[c]!) > 1) unsure.push(c);
      });
      if (unsure.length) break;
    }
    if (!unsure.length) return false;
    unsure.sort((a, b) => a - b);
    const cell = rng.pick(unsure);
    const old = regionOf[cell]!;
    regionOf[cell] = rules.length;
    resum(rules.length);
    // Re-label the rest of the old region by connected pieces.
    const rest: number[] = [];
    for (let i = 0; i < regionOf.length; i++) if (regionOf[i] === old) rest.push(i);
    const seen = new Set<number>();
    const ids: number[] = [];
    for (const start of rest) {
      if (seen.has(start)) continue;
      const id = ids.length ? rules.length + ids.length - 1 : old;
      ids.push(id);
      const queue = [start];
      seen.add(start);
      for (let q = 0; q < queue.length; q++) {
        const cur = queue[q]!;
        regionOf[cur] = id;
        for (let d = 0; d < 4; d++) {
          const n = slabNeighbour(cols, rows, cur, d);
          if (n >= 0 && regionOf[n] === old && !seen.has(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
    }
    // Only now: every piece must carry its final label before any sum is taken.
    for (const id of ids) resum(id);
  }
}

// Equal and all-different go first where the values allow them: they read best on the board
// and are the rarest by chance. Then less-than, greater-than and no rule at all, in random order.
// Splitting leaves many single-cell sums. Neighbouring regions are joined again wherever the
// puzzle stays solvable, so the board shows groups instead of a grid of given numbers.
function mergeWhileSolved(
  rng: Rng,
  cfg: SlabsConfig,
  regionOf: Int16Array,
  mate: Int16Array,
  base: Omit<SlabsPuzzle, 'regionOf' | 'rules'>,
  rules: (SlabsRule | null)[],
  resum: (reg: number) => void,
  values: Int8Array,
) {
  const { cols, rows } = cfg;
  const pairs: [number, number][] = [];
  for (let cell = 0; cell < regionOf.length; cell++) {
    for (const dir of [0, 1]) {
      const n = slabNeighbour(cols, rows, cell, dir);
      if (n < 0 || regionOf[cell]! < 0 || regionOf[n]! < 0 || regionOf[cell] === regionOf[n]) continue;
      pairs.push([cell, n]);
    }
  }
  // Neighbours with equal values go first: joined, they give `=` instead of two sums.
  const shuffled = rng.shuffle(pairs);
  const same = ([x, y]: [number, number]) => values[x] === values[y];
  for (const [x, y] of [...shuffled.filter(same), ...shuffled.filter((p) => !same(p))]) {
    const a = regionOf[x]!;
    const b = regionOf[y]!;
    if (a === b) continue;
    const union: number[] = [];
    for (let i = 0; i < regionOf.length; i++) if (regionOf[i] === a || regionOf[i] === b) union.push(i);
    if (union.length > cfg.maxRegion) continue;
    if (union.some((c) => mate[c]! >= 0 && union.includes(mate[c]!))) continue;
    const before = union.map((c) => regionOf[c]!);
    for (const c of union) regionOf[c] = a;
    resum(a);
    rules[b] = null;
    if (solvesWell(compact(base, regionOf, rules), cfg)) continue;
    union.forEach((c, i) => (regionOf[c] = before[i]!));
    resum(a);
    resum(b);
  }
}

function weakerRules(rng: Rng, values: number[]): (SlabsRule | null)[] {
  const sum = values.reduce((s, v) => s + v, 0);
  const shaped: SlabsRule[] = [];
  if (values.length >= 2 && values.every((v) => v === values[0])) shaped.push({ kind: 'eq', target: 0 });
  if (values.length >= 2 && new Set(values).size === values.length) shaped.push({ kind: 'neq', target: 0 });
  const loose: (SlabsRule | null)[] = [null, { kind: 'lt', target: sum + 1 + rng.int(3) }];
  if (sum >= 1) loose.push({ kind: 'gt', target: Math.max(0, sum - 1 - rng.int(3)) });
  return [...rng.shuffle(shaped), ...rng.shuffle(loose)];
}

function compact(base: Omit<SlabsPuzzle, 'regionOf' | 'rules'>, regionOf: Int16Array, rules: (SlabsRule | null)[]): SlabsPuzzle {
  const remap = new Int16Array(rules.length).fill(-1);
  const kept: SlabsRule[] = [];
  const out = new Int16Array(regionOf.length).fill(-1);
  for (let i = 0; i < regionOf.length; i++) {
    const reg = regionOf[i]!;
    if (reg < 0 || !rules[reg]) continue;
    if (remap[reg]! < 0) {
      remap[reg] = kept.length;
      kept.push(rules[reg]!);
    }
    out[i] = remap[reg]!;
  }
  return { ...base, regionOf: out, rules: kept };
}

// One slab per domino, all different. With chance `bias` a domino takes a slab, and an order of
// its halves, that repeats a value already lying next to it, so equal groups exist to become `=`.
// Each domino comes back ordered so its first cell holds the slab's first value.
function pickSlabs(rng: Rng, cols: number, rows: number, dominoes: [number, number][], bias: number): [number, number][] {
  const free = rng.shuffle([...DOUBLE_SIX]);
  const values = new Int8Array(cols * rows).fill(-1);
  const out: [number, number][] = [];
  dominoes.forEach((pair, i) => {
    const around = (cell: number) =>
      [0, 1, 2, 3]
        .map((d) => slabNeighbour(cols, rows, cell, d))
        .filter((n) => n >= 0 && !pair.includes(n) && values[n]! >= 0)
        .map((n) => values[n]!);
    const flip = rng.int(2);
    const orders: [number, number][] = flip ? [[pair[0], pair[1]], [pair[1], pair[0]]] : [[pair[1], pair[0]], [pair[0], pair[1]]];
    let slab = 0;
    let cells = orders[0]!;
    if (rng.next() < bias) {
      search: for (let k = 0; k < free.length; k++) {
        const [a, b] = free[k]!;
        for (const [x, y] of orders) {
          if (around(x).includes(a) || around(y).includes(b)) {
            slab = k;
            cells = [x, y];
            break search;
          }
        }
      }
    }
    const [a, b] = free.splice(slab, 1)[0]!;
    values[cells[0]] = a;
    values[cells[1]] = b;
    out.push([a, b]);
    dominoes[i] = cells;
  });
  return out;
}

export function generateSlabs(seed: number, difficulty: Difficulty): SlabsSpec {
  const cfg = SLABS_PRESETS[difficulty];
  const { cols, rows } = cfg;
  const rng = new Rng(seed);
  for (let attempt = 0; attempt < 150; attempt++) {
    const dominoes = growTiling(rng, cols, rows, cfg.slabs, 1 + rng.int(cfg.islands));
    if (!dominoes) continue;
    const blocked = new Uint8Array(cols * rows).fill(1);
    const values = new Int8Array(cols * rows).fill(-1);
    const slabs = pickSlabs(rng, cols, rows, dominoes, cfg.matchBias);
    const solution: SlabsPlacement[] = [];
    const mate = new Int16Array(cols * rows).fill(-1);
    dominoes.forEach(([first, second], i) => {
      const [a, b] = slabs[i]!;
      if (a !== b) {
        mate[first] = second;
        mate[second] = first;
      }
      blocked[first] = 0;
      blocked[second] = 0;
      values[first] = a;
      values[second] = b;
      solution.push({ anchor: first, dir: slabDirection(cols, first, second) });
    });
    const regionOf = carveRegions(rng, cols, rows, blocked, mate, cfg);
    const base = { config: { cols, rows }, blocked, slabs };
    const rules: (SlabsRule | null)[] = [];
    const regionValues: number[][] = [];
    const resum = (reg: number) => {
      const vals: number[] = [];
      for (let i = 0; i < regionOf.length; i++) if (regionOf[i] === reg) vals.push(values[i]!);
      regionValues[reg] = vals;
      // A region of equal values always reads as `=`, the rule players like best.
      rules[reg] =
        vals.length >= 2 && vals.every((v) => v === vals[0]) ? { kind: 'eq', target: 0 } : { kind: 'sum', target: vals.reduce((sum, v) => sum + v, 0) };
    };
    const regionCount = regionOf.reduce((m, r) => Math.max(m, r + 1), 0);
    for (let reg = 0; reg < regionCount; reg++) resum(reg);
    if (!splitUntilSolved(rng, cols, rows, regionOf, solution, base, rules, resum, cfg)) continue;
    mergeWhileSolved(rng, cfg, regionOf, mate, base, rules, resum, values);
    const order = rng.shuffle(rules.map((_, i) => i));
    for (const reg of order) {
      const sum = rules[reg];
      if (!sum || sum.kind !== 'sum' || rng.next() >= cfg.blank) continue;
      rules[reg] = null;
      if (!solvesWell(compact(base, regionOf, rules), cfg)) rules[reg] = sum;
    }
    for (const reg of order) {
      const strong = rules[reg];
      if (!strong || strong.kind !== 'sum' || rng.next() >= cfg.weaken) continue;
      for (const weaker of weakerRules(rng, regionValues[reg]!)) {
        rules[reg] = weaker;
        if (solvesWell(compact(base, regionOf, rules), cfg)) break;
        rules[reg] = strong;
      }
    }
    const puzzle = compact(base, regionOf, rules);
    const res = solveSlabs(puzzle, cfg.maxTier);
    if (!fits(res, cfg)) continue;
    const top = res.steps[cfg.maxTier - 1]!;
    if (cfg.maxTier > 1 && (top < cfg.minTopSteps || top > cfg.maxTopSteps)) continue;
    return { ...puzzle, version: SLABS_VERSION, seed, difficulty, config: cfg, solution, order: res.order };
  }
  throw new Error(`could not generate slabs puzzle for seed ${seed} / ${difficulty}`);
}

// Player state: [anchor, dir] per slab, anchor -1 = in the tray (dir stays as its tray orientation).
export type SlabsState = number[];

export function emptySlabsState(spec: SlabsSpec): SlabsState {
  return spec.slabs.flatMap(() => [-1, 0]);
}

export function slabsOccupancy(spec: SlabsPuzzle, state: SlabsState): Int16Array {
  const occ = new Int16Array(spec.config.cols * spec.config.rows).fill(-1);
  for (let s = 0; s < spec.slabs.length; s++) {
    const cells = state[s * 2]! < 0 ? null : slabCells(spec, state[s * 2]!, state[s * 2 + 1]!);
    if (!cells) continue;
    occ[cells[0]] = s;
    occ[cells[1]] = s;
  }
  return occ;
}

export function validSlabsState(spec: SlabsSpec, initial: number[] | undefined): SlabsState {
  if (!initial || initial.length !== spec.slabs.length * 2) return emptySlabsState(spec);
  const occ = new Int16Array(spec.config.cols * spec.config.rows).fill(-1);
  for (let s = 0; s < spec.slabs.length; s++) {
    const anchor = initial[s * 2]!;
    const dir = initial[s * 2 + 1]!;
    if (!Number.isInteger(dir) || dir < 0 || dir > 3) return emptySlabsState(spec);
    if (anchor === -1) continue;
    const cells = slabCells(spec, anchor, dir);
    if (!cells) return emptySlabsState(spec);
    for (const c of cells) {
      if (occ[c]! >= 0) return emptySlabsState(spec);
      occ[c] = s;
    }
  }
  return [...initial];
}

// Puts a slab on the board. Whatever it covers goes back to the tray.
export function slabsPlace(spec: SlabsPuzzle, state: SlabsState, slab: number, anchor: number, dir: number): SlabsState | null {
  const cells = slabCells(spec, anchor, dir);
  if (!cells) return null;
  if (state[slab * 2] === anchor && state[slab * 2 + 1] === dir) return null;
  const occ = slabsOccupancy(spec, state);
  const next = [...state];
  for (const c of cells) {
    const o = occ[c]!;
    if (o >= 0 && o !== slab) next[o * 2] = -1;
  }
  next[slab * 2] = anchor;
  next[slab * 2 + 1] = dir;
  return next;
}

export function slabsToTray(state: SlabsState, slab: number): SlabsState {
  const next = [...state];
  next[slab * 2] = -1;
  return next;
}

export function slabsPivotCell(spec: SlabsPuzzle, state: SlabsState, slab: number, pivot: 0 | 1): number {
  const anchor = state[slab * 2]!;
  if (anchor < 0) return -1;
  return pivot === 0 ? anchor : slabNeighbour(spec.config.cols, spec.config.rows, anchor, state[slab * 2 + 1]!);
}

// Where the other half points, seen from the pivot half.
function otherDir(dir: number, pivot: 0 | 1): number {
  return pivot === 0 ? dir : (dir + 2) % 4;
}

function poseAround(spec: SlabsPuzzle, pivotCell: number, pivot: 0 | 1, towards: number): SlabsPlacement | null {
  if (pivot === 0) return { anchor: pivotCell, dir: towards };
  const anchor = slabNeighbour(spec.config.cols, spec.config.rows, pivotCell, towards);
  return anchor < 0 ? null : { anchor, dir: (towards + 2) % 4 };
}

function fitsFree(spec: SlabsPuzzle, occ: Int16Array, slab: number, pose: SlabsPlacement | null): boolean {
  const cells = pose && slabCells(spec, pose.anchor, pose.dir);
  return !!cells && cells.every((c) => occ[c]! < 0 || occ[c] === slab);
}

// `turns` quarter turns clockwise in place around the pressed half; null when that pose is blocked or taken.
export function slabsRotate(spec: SlabsPuzzle, state: SlabsState, slab: number, pivot: 0 | 1, turns = 1): SlabsState | null {
  const anchor = state[slab * 2]!;
  const dir = state[slab * 2 + 1]!;
  const next = [...state];
  if (anchor < 0) {
    next[slab * 2 + 1] = (dir + turns) % 4;
    return next;
  }
  const pivotCell = slabsPivotCell(spec, state, slab, pivot);
  const occ = slabsOccupancy(spec, state);
  const pose = poseAround(spec, pivotCell, pivot, (otherDir(dir, pivot) + turns) % 4);
  if (!fitsFree(spec, occ, slab, pose)) return null;
  next[slab * 2] = pose!.anchor;
  next[slab * 2 + 1] = pose!.dir;
  return next;
}

export function slabsValues(spec: SlabsPuzzle, state: SlabsState): Int8Array {
  const values = new Int8Array(spec.config.cols * spec.config.rows).fill(-1);
  for (let s = 0; s < spec.slabs.length; s++) {
    const cells = state[s * 2]! < 0 ? null : slabCells(spec, state[s * 2]!, state[s * 2 + 1]!);
    if (!cells) continue;
    values[cells[0]] = spec.slabs[s]![0];
    values[cells[1]] = spec.slabs[s]![1];
  }
  return values;
}

export type SlabsRegionStatus = 'open' | 'done' | 'broken';

export function slabsRegionStatus(spec: SlabsPuzzle, state: SlabsState): SlabsRegionStatus[] {
  const values = slabsValues(spec, state);
  return slabsRegions(spec).map((cells, reg) => {
    const filled = cells.map((c) => values[c]!).filter((v) => v >= 0);
    const open = cells.length - filled.length;
    const rule = spec.rules[reg]!;
    if (ruleBroken(rule, filled, open)) return 'broken';
    return open === 0 && ruleHolds(rule, filled) ? 'done' : 'open';
  });
}

export function isSlabsSolved(spec: SlabsPuzzle, state: SlabsState): boolean {
  for (let s = 0; s < spec.slabs.length; s++) if (state[s * 2]! < 0) return false;
  const values = slabsValues(spec, state);
  for (let i = 0; i < values.length; i++) if (!spec.blocked[i] && values[i]! < 0) return false;
  return slabsRegionStatus(spec, state).every((s) => s === 'done');
}

// Correct means the same values on the same cells as the solution, so a double laid the other
// way round still counts.
function slabCorrect(spec: SlabsSpec, state: SlabsState, slab: number): boolean {
  if (state[slab * 2]! < 0) return false;
  const have = slabCells(spec, state[slab * 2]!, state[slab * 2 + 1]!);
  const want = slabCells(spec, spec.solution[slab]!.anchor, spec.solution[slab]!.dir)!;
  if (!have) return false;
  if (have[0] === want[0] && have[1] === want[1]) return true;
  const [a, b] = spec.slabs[slab]!;
  return a === b && have[0] === want[1] && have[1] === want[0];
}

export type SlabsHint = { kind: 'remove'; slab: number } | { kind: 'place'; slab: number };

export function slabsHint(spec: SlabsSpec, state: SlabsState): SlabsHint | null {
  for (let s = 0; s < spec.slabs.length; s++) if (state[s * 2]! >= 0 && !slabCorrect(spec, state, s)) return { kind: 'remove', slab: s };
  for (const s of spec.order) if (!slabCorrect(spec, state, s)) return { kind: 'place', slab: s };
  return null;
}

export function applySlabsHint(spec: SlabsSpec, state: SlabsState, hint: SlabsHint): SlabsState {
  if (hint.kind === 'remove') return slabsToTray(state, hint.slab);
  const { anchor, dir } = spec.solution[hint.slab]!;
  return slabsPlace(spec, state, hint.slab, anchor, dir) ?? state;
}

export interface SlabsSample {
  x: number;
  y: number;
  t: number;
}

// A jerk while a slab is held: out at least half a cell and most of the way back, all within
// 250 ms. A fast drag goes one way and never comes back, so it never counts. Pixels and ms.
// A still finger sends no events, so the start is the last sample from before the window.
export function isSlabsJerk(samples: readonly SlabsSample[], cell: number): boolean {
  const last = samples[samples.length - 1];
  if (!last) return false;
  let i = samples.length - 1;
  while (i > 0 && last.t - samples[i]!.t < 250) i--;
  const start = samples[i]!;
  let peak = 0;
  for (let k = i + 1; k < samples.length - 1; k++) peak = Math.max(peak, Math.hypot(samples[k]!.x - start.x, samples[k]!.y - start.y));
  return peak >= cell * 0.5 && Math.hypot(last.x - start.x, last.y - start.y) <= peak * 0.35;
}
