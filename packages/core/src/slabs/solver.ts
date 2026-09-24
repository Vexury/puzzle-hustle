// Slabs: dominoes from a double-six set placed on a rectangle with blocked cells, so that every
// region's rule holds. Directions run clockwise on screen: 0 = E, 1 = S, 2 = W, 3 = N.
export const SLAB_DR = [0, 1, 0, -1] as const;
export const SLAB_DC = [1, 0, -1, 0] as const;
export const SLAB_MAX_PIPS = 6;
const ALL_VALUES = (1 << (SLAB_MAX_PIPS + 1)) - 1;

export type SlabsRuleKind = 'sum' | 'lt' | 'gt' | 'eq' | 'neq';

export interface SlabsRule {
  kind: SlabsRuleKind;
  // Ignored for eq and neq.
  target: number;
}

export interface SlabsPlacement {
  anchor: number;
  dir: number;
}

// slabs[i] = [a, b] with a <= b; a placement puts a on its anchor and b on the neighbour in dir.
export interface SlabsPuzzle {
  config: { cols: number; rows: number };
  blocked: Uint8Array;
  slabs: [number, number][];
  regionOf: Int16Array;
  rules: SlabsRule[];
}

export function slabNeighbour(cols: number, rows: number, cell: number, dir: number): number {
  const r = Math.floor(cell / cols) + SLAB_DR[dir as 0]!;
  const c = (cell % cols) + SLAB_DC[dir as 0]!;
  if (r < 0 || c < 0 || r >= rows || c >= cols) return -1;
  return r * cols + c;
}

export function slabCells(p: SlabsPuzzle, anchor: number, dir: number): [number, number] | null {
  const { cols, rows } = p.config;
  if (!Number.isInteger(anchor) || anchor < 0 || anchor >= cols * rows) return null;
  if (!Number.isInteger(dir) || dir < 0 || dir > 3) return null;
  const other = slabNeighbour(cols, rows, anchor, dir);
  if (other < 0 || p.blocked[anchor] || p.blocked[other]) return null;
  return [anchor, other];
}

export function slabDirection(cols: number, from: number, to: number): number {
  if (to === from + 1) return 0;
  if (to === from + cols) return 1;
  if (to === from - 1) return 2;
  return 3;
}

export function ruleHolds(rule: SlabsRule, values: readonly number[]): boolean {
  const sum = values.reduce((s, v) => s + v, 0);
  switch (rule.kind) {
    case 'sum':
      return sum === rule.target;
    case 'lt':
      return sum < rule.target;
    case 'gt':
      return sum > rule.target;
    case 'eq':
      return values.every((v) => v === values[0]);
    case 'neq':
      return new Set(values).size === values.length;
  }
}

// True once the rule cannot hold any more, whatever lands on the `open` cells still empty.
export function ruleBroken(rule: SlabsRule, values: readonly number[], open: number): boolean {
  const sum = values.reduce((s, v) => s + v, 0);
  switch (rule.kind) {
    case 'sum':
      return sum > rule.target || sum + SLAB_MAX_PIPS * open < rule.target;
    case 'lt':
      return sum >= rule.target;
    case 'gt':
      return sum + SLAB_MAX_PIPS * open <= rule.target;
    case 'eq':
      return values.some((v) => v !== values[0]);
    case 'neq':
      return new Set(values).size !== values.length || values.length + open > SLAB_MAX_PIPS + 1;
  }
}

export function slabsRegions(p: SlabsPuzzle): number[][] {
  const out: number[][] = p.rules.map(() => []);
  for (let i = 0; i < p.regionOf.length; i++) {
    const reg = p.regionOf[i]!;
    if (reg >= 0) out[reg]!.push(i);
  }
  return out;
}

function popcount(m: number): number {
  let n = 0;
  for (; m; m &= m - 1) n++;
  return n;
}

function lowest(m: number): number {
  return 31 - Math.clz32(m & -m);
}

function highest(m: number): number {
  return 31 - Math.clz32(m);
}

// The static part: every way a slab can lie, indexed by slab and by cell.
interface Board {
  p: SlabsPuzzle;
  cells: number;
  pSlab: Int16Array;
  pC1: Int16Array;
  pC2: Int16Array;
  pV1: Uint8Array;
  pV2: Uint8Array;
  bySlab: number[][];
  byCell: number[][];
  regions: number[][];
}

interface Dyn {
  alive: Uint8Array;
  allowed: Uint8Array;
  fixed: Int32Array;
  order: number[];
}

function buildBoard(p: SlabsPuzzle): Board {
  const { cols, rows } = p.config;
  const cells = cols * rows;
  const slab: number[] = [];
  const c1: number[] = [];
  const c2: number[] = [];
  const v1: number[] = [];
  const v2: number[] = [];
  const bySlab: number[][] = p.slabs.map(() => []);
  const byCell: number[][] = Array.from({ length: cells }, () => []);
  const add = (s: number, a: number, b: number, va: number, vb: number) => {
    const id = slab.length;
    slab.push(s);
    c1.push(a);
    c2.push(b);
    v1.push(va);
    v2.push(vb);
    bySlab[s]!.push(id);
    byCell[a]!.push(id);
    byCell[b]!.push(id);
  };
  for (let s = 0; s < p.slabs.length; s++) {
    const [a, b] = p.slabs[s]!;
    for (let cell = 0; cell < cells; cell++) {
      if (p.blocked[cell]) continue;
      // E and S cover every unordered pair once; both value orders make the four orientations.
      for (const dir of [0, 1]) {
        const other = slabNeighbour(cols, rows, cell, dir);
        if (other < 0 || p.blocked[other]) continue;
        add(s, cell, other, a, b);
        if (a !== b) add(s, cell, other, b, a);
      }
    }
  }
  return {
    p,
    cells,
    pSlab: Int16Array.from(slab),
    pC1: Int16Array.from(c1),
    pC2: Int16Array.from(c2),
    pV1: Uint8Array.from(v1),
    pV2: Uint8Array.from(v2),
    bySlab,
    byCell,
    regions: slabsRegions(p),
  };
}

function initialDyn(b: Board): Dyn {
  const allowed = new Uint8Array(b.cells);
  for (let i = 0; i < b.cells; i++) allowed[i] = b.p.blocked[i] ? 0 : ALL_VALUES;
  return { alive: new Uint8Array(b.pSlab.length).fill(1), allowed, fixed: new Int32Array(b.p.slabs.length).fill(-1), order: [] };
}

function cloneDyn(d: Dyn): Dyn {
  return { alive: d.alive.slice(), allowed: d.allowed.slice(), fixed: d.fixed.slice(), order: [...d.order] };
}

function fix(b: Board, d: Dyn, id: number) {
  const s = b.pSlab[id]!;
  d.fixed[s] = id;
  d.order.push(s);
  for (const other of b.bySlab[s]!) if (other !== id) d.alive[other] = 0;
}

// Bounds per rule on the allowed values. Returns -1 on contradiction, else whether anything changed.
function ruleBounds(b: Board, d: Dyn): number {
  let changed = 0;
  for (let reg = 0; reg < b.regions.length; reg++) {
    const cells = b.regions[reg]!;
    const rule = b.p.rules[reg]!;
    if (rule.kind === 'eq') {
      let inter = ALL_VALUES;
      for (const c of cells) inter &= d.allowed[c]!;
      if (!inter) return -1;
      for (const c of cells) {
        if (d.allowed[c] !== inter) {
          d.allowed[c] = inter;
          changed = 1;
        }
      }
      continue;
    }
    if (rule.kind === 'neq') {
      let union = 0;
      for (const c of cells) union |= d.allowed[c]!;
      if (popcount(union) < cells.length) return -1;
      for (const c of cells) {
        const m = d.allowed[c]!;
        if (popcount(m) !== 1) continue;
        for (const o of cells) {
          if (o === c || !(d.allowed[o]! & m)) continue;
          d.allowed[o] = d.allowed[o]! & ~m;
          if (!d.allowed[o]) return -1;
          changed = 1;
        }
      }
      continue;
    }
    let minAll = 0;
    let maxAll = 0;
    for (const c of cells) {
      minAll += lowest(d.allowed[c]!);
      maxAll += highest(d.allowed[c]!);
    }
    for (const c of cells) {
      const m = d.allowed[c]!;
      const minO = minAll - lowest(m);
      const maxO = maxAll - highest(m);
      let keep = 0;
      for (let v = 0; v <= SLAB_MAX_PIPS; v++) {
        if (!((m >> v) & 1)) continue;
        const ok =
          rule.kind === 'sum' ? v + minO <= rule.target && v + maxO >= rule.target : rule.kind === 'lt' ? v + minO < rule.target : v + maxO > rule.target;
        if (ok) keep |= 1 << v;
      }
      if (!keep) return -1;
      if (keep !== m) {
        d.allowed[c] = keep;
        changed = 1;
      }
    }
  }
  return changed;
}

// Tier 1 to its fixpoint. Returns false on contradiction.
function propagate(b: Board, d: Dyn): boolean {
  const cover = new Int32Array(b.cells);
  for (let round = 0; ; round++) {
    let changed = false;
    cover.fill(-1);
    for (let s = 0; s < d.fixed.length; s++) {
      const id = d.fixed[s]!;
      if (id < 0) continue;
      cover[b.pC1[id]!] = s;
      cover[b.pC2[id]!] = s;
    }
    for (let id = 0; id < d.alive.length; id++) {
      if (!d.alive[id]) continue;
      const s = b.pSlab[id]!;
      const a = b.pC1[id]!;
      const c = b.pC2[id]!;
      const bad =
        !((d.allowed[a]! >> b.pV1[id]!) & 1) ||
        !((d.allowed[c]! >> b.pV2[id]!) & 1) ||
        (cover[a]! >= 0 && cover[a] !== s) ||
        (cover[c]! >= 0 && cover[c] !== s);
      if (bad) {
        d.alive[id] = 0;
        changed = true;
        if (d.fixed[s] === id) return false;
      }
    }
    for (let s = 0; s < b.bySlab.length; s++) {
      if (d.fixed[s]! >= 0) continue;
      let only = -1;
      let count = 0;
      for (const id of b.bySlab[s]!) {
        if (!d.alive[id]) continue;
        count++;
        only = id;
      }
      if (count === 0) return false;
      if (count === 1) {
        fix(b, d, only);
        changed = true;
      }
    }
    for (let cell = 0; cell < b.cells; cell++) {
      if (b.p.blocked[cell]) continue;
      let slab = -2;
      let partner = -2;
      let values = 0;
      let count = 0;
      for (const id of b.byCell[cell]!) {
        if (!d.alive[id]) continue;
        count++;
        const s = b.pSlab[id]!;
        slab = slab === -2 || slab === s ? s : -1;
        const mate = b.pC1[id] === cell ? b.pC2[id]! : b.pC1[id]!;
        partner = partner === -2 || partner === mate ? mate : -1;
        values |= 1 << (b.pC1[id] === cell ? b.pV1[id]! : b.pV2[id]!);
      }
      if (count === 0) return false;
      // Only one slab can cover this cell: that slab lies nowhere else.
      if (slab >= 0) {
        for (const id of b.bySlab[slab]!) {
          if (d.alive[id] && b.pC1[id] !== cell && b.pC2[id] !== cell) {
            d.alive[id] = 0;
            changed = true;
          }
        }
      }
      // Only one partner is possible: nothing else may cover that partner.
      if (partner >= 0) {
        for (const id of b.byCell[partner]!) {
          if (d.alive[id] && b.pC1[id] !== cell && b.pC2[id] !== cell) {
            d.alive[id] = 0;
            changed = true;
          }
        }
      }
      const next = d.allowed[cell]! & values;
      if (!next) return false;
      if (next !== d.allowed[cell]) {
        d.allowed[cell] = next;
        changed = true;
      }
    }
    const bounds = ruleBounds(b, d);
    if (bounds < 0) return false;
    if (bounds) changed = true;
    if (!changed) return true;
    if (round > 10_000) return true;
  }
}

// Tier 2: every value tuple of each region against its rule. -1 contradiction, 1 changed, 0 stuck.
function regionConsistency(b: Board, d: Dyn): number {
  let changed = 0;
  for (let reg = 0; reg < b.regions.length; reg++) {
    const cells = b.regions[reg]!;
    const rule = b.p.rules[reg]!;
    let product = 1;
    for (const c of cells) product *= popcount(d.allowed[c]!);
    if (product <= 1 || product > 200_000) continue;
    const support = new Uint8Array(cells.length);
    const values: number[] = [];
    const walk = (i: number) => {
      if (i === cells.length) {
        if (!ruleHolds(rule, values)) return;
        for (let k = 0; k < values.length; k++) support[k] = support[k]! | (1 << values[k]!);
        return;
      }
      const m = d.allowed[cells[i]!]!;
      for (let v = 0; v <= SLAB_MAX_PIPS; v++) {
        if (!((m >> v) & 1)) continue;
        values.push(v);
        if (!ruleBroken(rule, values, cells.length - i - 1)) walk(i + 1);
        values.pop();
      }
    };
    walk(0);
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k]!;
      if (!support[k]) return -1;
      if (support[k] !== d.allowed[c]) {
        d.allowed[c] = support[k]!;
        changed = 1;
      }
    }
  }
  return changed;
}

function allFixed(d: Dyn): boolean {
  for (const id of d.fixed) if (id < 0) return false;
  return true;
}

function consistent(b: Board, d: Dyn): boolean {
  if (!propagate(b, d)) return false;
  for (;;) {
    if (allFixed(d)) return true;
    const r = regionConsistency(b, d);
    if (r < 0) return false;
    if (r === 0) return true;
    if (!propagate(b, d)) return false;
  }
}

// Tier 3: one placement whose tier-2 consequences contradict is removed. Tight slabs first.
function lookahead(b: Board, d: Dyn): boolean {
  const open: number[] = [];
  for (let s = 0; s < d.fixed.length; s++) if (d.fixed[s]! < 0) open.push(s);
  const live = (s: number) => b.bySlab[s]!.filter((id) => d.alive[id]);
  open.sort((x, y) => live(x).length - live(y).length || x - y);
  for (const s of open) {
    for (const id of live(s)) {
      const trial = cloneDyn(d);
      fix(b, trial, id);
      if (!consistent(b, trial)) {
        d.alive[id] = 0;
        return true;
      }
    }
  }
  return false;
}

export interface SlabsSolveResult {
  solved: boolean;
  contradiction: boolean;
  steps: [number, number, number];
  placements: (SlabsPlacement | null)[];
  order: number[];
}

function valuesOf(b: Board, d: Dyn): Int8Array {
  const vals = new Int8Array(b.cells).fill(-1);
  for (const id of d.fixed) {
    if (id < 0) continue;
    vals[b.pC1[id]!] = b.pV1[id]!;
    vals[b.pC2[id]!] = b.pV2[id]!;
  }
  return vals;
}

export function solveSlabs(p: SlabsPuzzle, maxTier: 1 | 2 | 3): SlabsSolveResult {
  const b = buildBoard(p);
  const d = initialDyn(b);
  const steps: [number, number, number] = [0, 0, 0];
  let contradiction = false;
  for (;;) {
    const before = d.order.length;
    if (!propagate(b, d)) {
      contradiction = true;
      break;
    }
    steps[0] += d.order.length - before;
    if (allFixed(d)) break;
    if (maxTier >= 2) {
      const r = regionConsistency(b, d);
      if (r < 0) {
        contradiction = true;
        break;
      }
      if (r > 0) {
        steps[1]++;
        continue;
      }
    }
    if (maxTier >= 3 && lookahead(b, d)) {
      steps[2]++;
      continue;
    }
    break;
  }
  let solved = !contradiction && allFixed(d);
  if (solved) {
    const vals = valuesOf(b, d);
    for (let reg = 0; reg < b.regions.length; reg++) {
      if (!ruleHolds(p.rules[reg]!, b.regions[reg]!.map((c) => vals[c]!))) {
        solved = false;
        contradiction = true;
      }
    }
  }
  const { cols } = p.config;
  const placements = [...d.fixed].map((id): SlabsPlacement | null => {
    if (id < 0) return null;
    const [a] = p.slabs[b.pSlab[id]!]!;
    // The anchor carries the slab's first value; for the swapped order it is the second cell.
    const first = b.pV1[id] === a ? b.pC1[id]! : b.pC2[id]!;
    const second = first === b.pC1[id] ? b.pC2[id]! : b.pC1[id]!;
    return { anchor: first, dir: slabDirection(cols, first, second) };
  });
  return { solved, contradiction, steps, placements, order: d.order };
}

export function countSlabsSolutions(p: SlabsPuzzle, limit = 2, maxNodes = 2_000_000): { count: number; complete: boolean } {
  const { cols, rows } = p.config;
  const cells = cols * rows;
  const regions = slabsRegions(p);
  const regVals: number[][] = regions.map(() => []);
  const covered = new Uint8Array(cells);
  const used = new Uint8Array(p.slabs.length);
  let count = 0;
  let nodes = 0;
  let aborted = false;
  const fits = (cell: number): boolean => {
    const reg = p.regionOf[cell]!;
    if (reg < 0) return true;
    return !ruleBroken(p.rules[reg]!, regVals[reg]!, regions[reg]!.length - regVals[reg]!.length);
  };
  const walk = (from: number): void => {
    if (count >= limit || aborted) return;
    if (++nodes > maxNodes) {
      aborted = true;
      return;
    }
    let cell = from;
    while (cell < cells && (p.blocked[cell] || covered[cell])) cell++;
    if (cell === cells) {
      count++;
      return;
    }
    for (const dir of [0, 1]) {
      const other = slabNeighbour(cols, rows, cell, dir);
      if (other < 0 || p.blocked[other] || covered[other]) continue;
      for (let s = 0; s < p.slabs.length; s++) {
        if (used[s]) continue;
        const [a, b] = p.slabs[s]!;
        const orders: [number, number][] = a === b ? [[a, b]] : [
          [a, b],
          [b, a],
        ];
        for (const [va, vb] of orders) {
          const ra = p.regionOf[cell]!;
          const rb = p.regionOf[other]!;
          if (ra >= 0) regVals[ra]!.push(va);
          if (rb >= 0) regVals[rb]!.push(vb);
          if (fits(cell) && fits(other)) {
            used[s] = 1;
            covered[cell] = 1;
            covered[other] = 1;
            walk(cell + 1);
            used[s] = 0;
            covered[cell] = 0;
            covered[other] = 0;
          }
          if (rb >= 0) regVals[rb]!.pop();
          if (ra >= 0) regVals[ra]!.pop();
          if (count >= limit || aborted) return;
        }
      }
    }
  };
  walk(0);
  return { count, complete: !aborted };
}

export interface SlabsDifficultyReport {
  score: number;
  steps: [number, number, number];
  slabs: number;
  ruleless: number;
  weak: number;
}

export function slabsDifficultyReport(p: SlabsPuzzle): SlabsDifficultyReport {
  const res = solveSlabs(p, 3);
  const [t1, t2, t3] = res.steps;
  let ruleless = 0;
  for (let i = 0; i < p.regionOf.length; i++) if (!p.blocked[i] && p.regionOf[i]! < 0) ruleless++;
  const weak = p.rules.filter((r) => r.kind !== 'sum').length;
  const score = t1 * 0.25 + t2 * 2 + t3 * 6 + p.slabs.length * 1.2 + ruleless * 0.4 + weak * 0.8;
  return { score: Math.round(score * 10) / 10, steps: res.steps, slabs: p.slabs.length, ruleless, weak };
}

type Transform = (r: number, c: number) => [number, number];

export function slabsCanonicalKey(p: SlabsPuzzle): string {
  const { cols, rows } = p.config;
  const transforms: Transform[] = [
    (r, c) => [r, c],
    (r, c) => [r, cols - 1 - c],
    (r, c) => [rows - 1 - r, c],
    (r, c) => [rows - 1 - r, cols - 1 - c],
  ];
  if (cols === rows) {
    transforms.push(
      (r, c) => [c, r],
      (r, c) => [c, cols - 1 - r],
      (r, c) => [cols - 1 - c, r],
      (r, c) => [cols - 1 - c, cols - 1 - r],
    );
  }
  let best = '';
  for (const t of transforms) {
    const label = new Int16Array(p.rules.length).fill(-1);
    const labelled: number[] = [];
    let grid = '';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const [sr, sc] = t(r, c);
        const src = sr * cols + sc;
        if (p.blocked[src]) {
          grid += '#';
          continue;
        }
        const reg = p.regionOf[src]!;
        if (reg < 0) {
          grid += '.';
          continue;
        }
        if (label[reg]! < 0) {
          label[reg] = labelled.length;
          labelled.push(reg);
        }
        grid += String.fromCharCode(65 + label[reg]!);
      }
    }
    const key = `${grid}|${labelled.map((reg) => `${p.rules[reg]!.kind}${p.rules[reg]!.target}`).join(',')}`;
    if (best === '' || key < best) best = key;
  }
  const slabs = p.slabs.map(([a, b]) => `${a}${b}`).sort().join('.');
  return `slabs${cols}x${rows}|${slabs}|${best}`;
}

// Vocabulary: the mix of rule kinds and how many cells carry no rule.
export function slabsFamilyKey(p: SlabsPuzzle): string {
  const counts: Record<SlabsRuleKind, number> = { sum: 0, lt: 0, gt: 0, eq: 0, neq: 0 };
  for (const r of p.rules) counts[r.kind]++;
  let ruleless = 0;
  for (let i = 0; i < p.regionOf.length; i++) if (!p.blocked[i] && p.regionOf[i]! < 0) ruleless++;
  return `s${counts.sum}l${counts.lt}g${counts.gt}e${counts.eq}n${counts.neq}u${ruleless}`;
}
