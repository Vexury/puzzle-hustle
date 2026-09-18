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

function regionSuffixCounts(spec: RegionsSpec): Int32Array {
  const n = spec.config.size;
  const out = new Int32Array(n * (n + 1));
  for (let reg = 0; reg < n; reg++) {
    for (let r = n - 1; r >= 0; r--) {
      let count = out[reg * (n + 1) + r + 1]!;
      for (let c = 0; c < n; c++) if (spec.regions[r * n + c] === reg) count++;
      out[reg * (n + 1) + r] = count;
    }
  }
  return out;
}

export function countRegionsSolutions(spec: RegionsSpec, limit = 2): RegionsCount {
  const n = spec.config.size;
  const k = spec.config.stars;
  const regionOf = spec.regions;
  const suffix = regionSuffixCounts(spec);
  const colCount = new Uint8Array(n);
  const regCount = new Uint8Array(n);
  const grid = new Uint8Array(n * n);
  let solutions = 0;
  let nodes = 0;

  function feasible(r: number): boolean {
    const left = n - r - 1;
    for (let c = 0; c < n; c++) if (colCount[c]! + left < k) return false;
    for (let reg = 0; reg < n; reg++) if (regCount[reg]! + suffix[reg * (n + 1) + r + 1]! < k) return false;
    return true;
  }

  function blocked(r: number, c: number): boolean {
    if (r === 0) return false;
    const base = (r - 1) * n;
    return grid[base + c] === 1 || (c > 0 && grid[base + c - 1] === 1) || (c + 1 < n && grid[base + c + 1] === 1);
  }

  function placeRow(r: number, startCol: number, count: number): void {
    if (solutions >= limit) return;
    if (count === k) {
      nodes++;
      if (!feasible(r)) return;
      if (r === n - 1) solutions++;
      else placeRow(r + 1, 0, 0);
      return;
    }
    for (let c = startCol; c <= n - 1 - 2 * (k - count - 1); c++) {
      if (colCount[c]! >= k || blocked(r, c)) continue;
      const reg = regionOf[r * n + c]!;
      if (regCount[reg]! >= k) continue;
      colCount[c]!++;
      regCount[reg]!++;
      grid[r * n + c] = 1;
      placeRow(r, c + 2, count + 1);
      grid[r * n + c] = 0;
      colCount[c]!--;
      regCount[reg]!--;
      if (solutions >= limit) return;
    }
  }

  placeRow(0, 0, 0);
  return { solutions, nodes };
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
