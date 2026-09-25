import { countHistogram } from '../family.ts';
import type { RegionsSpec } from './puzzle.ts';

export const REGIONS_MARKED_EMPTY = 255;

export interface RegionsUnits {
  size: number;
  stars: number;
  rows: number[][];
  cols: number[][];
  regions: number[][];
}

export function regionsUnits(spec: RegionsSpec): RegionsUnits {
  const { size, stars } = spec.config;
  const rows: number[][] = [];
  const cols: number[][] = [];
  const regions: number[][] = [];
  for (let i = 0; i < size; i++) {
    rows.push([]);
    cols.push([]);
    regions.push([]);
  }
  for (let i = 0; i < size * size; i++) {
    rows[Math.floor(i / size)]!.push(i);
    cols[i % size]!.push(i);
    regions[spec.regions[i]!]!.push(i);
  }
  return { size, stars, rows, cols, regions };
}

export function regionsNeighbors(size: number, i: number): number[] {
  const r = Math.floor(i / size);
  const c = i % size;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && cc >= 0 && rr < size && cc < size) out.push(rr * size + cc);
    }
  }
  return out;
}

export interface RegionsCount {
  solutions: number;
  nodes: number;
}

const ELIMINATED = 2;

export function enumerateRegionsSolutions(
  spec: RegionsSpec,
  limit: number,
  onSolution: (grid: Uint8Array) => void,
  maxNodes = Number.POSITIVE_INFINITY,
): RegionsCount {
  const units = regionsUnits(spec);
  const n = units.size;
  const k = units.stars;
  const all = [...units.rows, ...units.cols, ...units.regions];
  const unitsOf: number[][] = Array.from({ length: n * n }, (_, i) => [Math.floor(i / n), n + (i % n), 2 * n + spec.regions[i]!]);
  const placed = new Uint8Array(all.length);
  const open = Uint8Array.from(all, (cells) => cells.length);
  const state = new Uint8Array(n * n);
  const trail: number[] = [];
  let solutions = 0;
  let nodes = 0;

  function eliminate(i: number): void {
    if (state[i] !== 0) return;
    state[i] = ELIMINATED;
    trail.push(i);
    for (const u of unitsOf[i]!) open[u]!--;
  }

  function place(i: number): void {
    state[i] = 1;
    trail.push(i);
    for (const u of unitsOf[i]!) open[u]!--;
    for (const j of regionsNeighbors(n, i)) eliminate(j);
    for (const u of unitsOf[i]!) {
      placed[u]!++;
      if (placed[u] === k) for (const j of all[u]!) eliminate(j);
    }
  }

  function undo(mark: number): void {
    while (trail.length > mark) {
      const i = trail.pop()!;
      for (const u of unitsOf[i]!) {
        open[u]!++;
        if (state[i] === 1) placed[u]!--;
      }
      state[i] = 0;
    }
  }

  function pickUnit(): number | null | undefined {
    let best: number | null = null;
    let bestSlack = Number.POSITIVE_INFINITY;
    for (let u = 0; u < all.length; u++) {
      const need = k - placed[u]!;
      if (need === 0) continue;
      if (open[u]! < need) return undefined;
      const slack = open[u]! - need;
      if (slack < bestSlack) {
        bestSlack = slack;
        best = u;
        if (slack === 0) break;
      }
    }
    return best;
  }

  function search(): void {
    if (solutions >= limit || nodes > maxNodes) return;
    const u = pickUnit();
    if (u === undefined) return;
    if (u === null) {
      solutions++;
      onSolution(state.map((v) => (v === 1 ? 1 : 0)));
      return;
    }
    const candidates = all[u]!.filter((i) => state[i] === 0);
    const start = trail.length;
    for (const i of candidates) {
      nodes++;
      const mark = trail.length;
      place(i);
      search();
      undo(mark);
      if (solutions >= limit || nodes > maxNodes) break;
      eliminate(i);
    }
    undo(start);
  }

  search();
  return { solutions, nodes };
}

export function countRegionsSolutions(spec: RegionsSpec, limit = 2): RegionsCount {
  return enumerateRegionsSolutions(spec, limit, () => {});
}

export function isRegionsUnique(spec: RegionsSpec): boolean {
  return countRegionsSolutions(spec, 2).solutions === 1;
}

function assign(state: Uint8Array, cells: readonly number[], value: number): number {
  let n = 0;
  for (const i of cells) {
    if (state[i] !== 0) continue;
    state[i] = value;
    n++;
  }
  return n;
}

function unknownsAndNeed(state: Uint8Array, cells: readonly number[], stars: number): { unknown: number[]; need: number } {
  const unknown: number[] = [];
  let placed = 0;
  for (const i of cells) {
    const v = state[i]!;
    if (v === 0) unknown.push(i);
    else if (v === 1) placed++;
  }
  return { unknown, need: stars - placed };
}

function passStars(state: Uint8Array, size: number): number {
  let deduced = 0;
  for (let i = 0; i < state.length; i++) {
    if (state[i] !== 1) continue;
    for (const j of regionsNeighbors(size, i)) {
      if (state[j] === 1) return -1;
      if (state[j] === 0) {
        state[j] = REGIONS_MARKED_EMPTY;
        deduced++;
      }
    }
  }
  return deduced;
}

function passUnit(state: Uint8Array, cells: readonly number[], stars: number): number {
  const { unknown, need } = unknownsAndNeed(state, cells, stars);
  if (need < 0 || need > unknown.length) return -1;
  if (unknown.length === 0) return 0;
  if (need === 0) return assign(state, unknown, REGIONS_MARKED_EMPTY);
  if (need === unknown.length) return assign(state, unknown, 1);
  return 0;
}

function passUnits(state: Uint8Array, units: RegionsUnits): number {
  let deduced = 0;
  for (const group of [units.rows, units.cols, units.regions]) {
    for (const cells of group) {
      const d = passUnit(state, cells, units.stars);
      if (d < 0) return -1;
      deduced += d;
    }
  }
  return deduced;
}

type Axis = 'row' | 'col';

function lineIndex(size: number, i: number, axis: Axis): number {
  return axis === 'row' ? Math.floor(i / size) : i % size;
}

function eliminateOutside(state: Uint8Array, targets: Iterable<number>, cellsOf: (t: number) => readonly number[], keep: (i: number) => boolean): number {
  let deduced = 0;
  for (const t of targets) {
    for (const i of cellsOf(t)) {
      if (state[i] !== 0 || keep(i)) continue;
      state[i] = REGIONS_MARKED_EMPTY;
      deduced++;
    }
  }
  return deduced;
}

function confineRegions(state: Uint8Array, units: RegionsUnits, subset: readonly number[], axis: Axis, regionOf: Uint8Array): number {
  const lines = axis === 'row' ? units.rows : units.cols;
  const touched = new Set<number>();
  let need = 0;
  for (const reg of subset) {
    const u = unknownsAndNeed(state, units.regions[reg]!, units.stars);
    if (u.need <= 0) return 0;
    need += u.need;
    for (const i of u.unknown) touched.add(lineIndex(units.size, i, axis));
  }
  if (touched.size !== subset.length) return 0;
  let lineNeed = 0;
  for (const line of touched) lineNeed += unknownsAndNeed(state, lines[line]!, units.stars).need;
  if (lineNeed !== need) return 0;
  return eliminateOutside(state, touched, (line) => lines[line]!, (i) => subset.includes(regionOf[i]!));
}

function confineLines(state: Uint8Array, units: RegionsUnits, subset: readonly number[], axis: Axis, regionOf: Uint8Array): number {
  const lines = axis === 'row' ? units.rows : units.cols;
  const touched = new Set<number>();
  let need = 0;
  for (const line of subset) {
    const u = unknownsAndNeed(state, lines[line]!, units.stars);
    if (u.need <= 0) return 0;
    need += u.need;
    for (const i of u.unknown) touched.add(regionOf[i]!);
  }
  if (touched.size !== subset.length) return 0;
  let regionNeed = 0;
  for (const reg of touched) regionNeed += unknownsAndNeed(state, units.regions[reg]!, units.stars).need;
  if (regionNeed !== need) return 0;
  return eliminateOutside(state, touched, (reg) => units.regions[reg]!, (i) => subset.includes(lineIndex(units.size, i, axis)));
}

function passConfined(state: Uint8Array, units: RegionsUnits, regionOf: Uint8Array): number {
  const n = units.size;
  let deduced = 0;
  for (const axis of ['row', 'col'] as const) {
    for (let a = 0; a < n; a++) {
      deduced += confineRegions(state, units, [a], axis, regionOf);
      deduced += confineLines(state, units, [a], axis, regionOf);
      for (let b = a + 1; b < n; b++) {
        deduced += confineRegions(state, units, [a, b], axis, regionOf);
        deduced += confineLines(state, units, [a, b], axis, regionOf);
      }
    }
  }
  return deduced;
}

export interface RegionsLogicResult {
  solved: boolean;
  contradiction: boolean;
  rounds: number;
  deducedPerRound: number[];
  state: Uint8Array;
}

export function regionsPropagate(spec: RegionsSpec, start: Uint8Array, maxRounds = Number.POSITIVE_INFINITY): RegionsLogicResult {
  const units = regionsUnits(spec);
  const state = Uint8Array.from(start);
  const deducedPerRound: number[] = [];
  let contradiction = false;
  while (deducedPerRound.length < maxRounds) {
    let d = passStars(state, units.size);
    if (d >= 0) {
      const u = passUnits(state, units);
      d = u < 0 ? -1 : d + u;
    }
    if (d === 0) d = passConfined(state, units, spec.regions);
    if (d < 0) {
      contradiction = true;
      break;
    }
    if (d === 0) break;
    deducedPerRound.push(d);
  }
  const solved = !contradiction && state.every((v) => v !== 0);
  return { solved, contradiction, rounds: deducedPerRound.length, deducedPerRound, state };
}

export function regionsSolveByLogic(spec: RegionsSpec): RegionsLogicResult {
  return regionsPropagate(spec, new Uint8Array(spec.config.size * spec.config.size));
}

export interface RegionsDifficultyReport {
  score: number;
  rounds: number;
  nodes: number;
  cells: number;
  logicSolved: boolean;
}

export function regionsDifficultyReport(spec: RegionsSpec): RegionsDifficultyReport {
  const cells = spec.config.size * spec.config.size;
  const logic = regionsSolveByLogic(spec);
  const { nodes } = countRegionsSolutions(spec, 1);
  const unknownRatio = logic.solved ? 0 : logic.state.filter((v) => v === 0).length / cells;
  const score = logic.rounds * 2 + unknownRatio * 40 + Math.log2(nodes + 1) * 3 + Math.log2(cells) * 2;
  return { score: Math.round(score * 10) / 10, rounds: logic.rounds, nodes, cells, logicSolved: logic.solved };
}

type Transform = (r: number, c: number) => [number, number];

export function regionsCanonicalKey(spec: RegionsSpec): string {
  const n = spec.config.size;
  const transforms: Transform[] = [
    (r, c) => [r, c],
    (r, c) => [r, n - 1 - c],
    (r, c) => [n - 1 - r, c],
    (r, c) => [n - 1 - r, n - 1 - c],
    (r, c) => [c, r],
    (r, c) => [c, n - 1 - r],
    (r, c) => [n - 1 - c, r],
    (r, c) => [n - 1 - c, n - 1 - r],
  ];
  let best = '';
  for (const t of transforms) {
    const label = new Int16Array(n).fill(-1);
    let nextLabel = 0;
    let key = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const [sr, sc] = t(r, c);
        const reg = spec.regions[sr * n + sc]!;
        if (label[reg]! < 0) label[reg] = nextLabel++;
        key += String.fromCharCode(65 + label[reg]!);
      }
    }
    if (best === '' || key < best) best = key;
  }
  return `${n}x${n}s${spec.config.stars}|${best}`;
}

// Vocabulary: the region size distribution. Where the regions sit is not part of it.
export function regionsFamilyKey(spec: RegionsSpec): string {
  const sizes = new Map<number, number>();
  for (const r of spec.regions) sizes.set(r, (sizes.get(r) ?? 0) + 1);
  return countHistogram(sizes.values());
}
