import { countHistogram } from '../family.ts';
import type { SudokuCage, SudokuSpec } from './puzzle.ts';

export const SUDOKU_TECHNIQUES = [
  'naked-single',
  'hidden-single',
  'cage-sum',
  'pointing',
  'box-line',
  'naked-pair',
  'hidden-pair',
  'naked-triple',
  'innie-outie',
  'x-wing',
] as const;

export type SudokuTechnique = (typeof SUDOKU_TECHNIQUES)[number];

export const SUDOKU_TECHNIQUE_WEIGHT: Record<SudokuTechnique, number> = {
  'naked-single': 1,
  'hidden-single': 1.5,
  'cage-sum': 3,
  pointing: 4,
  'box-line': 4,
  'naked-pair': 6,
  'hidden-pair': 7,
  'naked-triple': 9,
  'innie-outie': 12,
  'x-wing': 14,
};

export type SudokuPuzzle = Pick<SudokuSpec, 'givens' | 'cages'>;

const ALL = 0x1ff;
const N = 81;

export function sudokuRow(i: number): number {
  return Math.floor(i / 9);
}

export function sudokuCol(i: number): number {
  return i % 9;
}

export function sudokuBox(i: number): number {
  return Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3);
}

function buildUnits(): number[][] {
  const units: number[][] = Array.from({ length: 27 }, () => []);
  for (let i = 0; i < N; i++) {
    units[sudokuRow(i)]!.push(i);
    units[9 + sudokuCol(i)]!.push(i);
    units[18 + sudokuBox(i)]!.push(i);
  }
  return units;
}

export const SUDOKU_UNITS: readonly (readonly number[])[] = buildUnits();

function buildPeers(): { peers: number[][]; flag: Uint8Array } {
  const flag = new Uint8Array(N * N);
  const peers: number[][] = Array.from({ length: N }, () => []);
  for (const unit of SUDOKU_UNITS) {
    for (const a of unit) for (const b of unit) if (a !== b) flag[a * N + b] = 1;
  }
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) if (flag[a * N + b]) peers[a]!.push(b);
  return { peers, flag };
}

const { peers: PEERS, flag: PEER_FLAG } = buildPeers();

export function sudokuPeers(i: number): readonly number[] {
  return PEERS[i]!;
}

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

function lowestDigit(m: number): number {
  return 32 - Math.clz32(m & -m);
}

function highestDigit(m: number): number {
  return 32 - Math.clz32(m);
}

function cageIndex(cages: readonly SudokuCage[]): Int8Array {
  const cageOf = new Int8Array(N).fill(-1);
  cages.forEach((cage, k) => {
    for (const i of cage.cells) cageOf[i] = k;
  });
  return cageOf;
}

function extremeSum(count: number, used: number, smallest: boolean): number {
  let sum = 0;
  let taken = 0;
  for (let step = 0; step < 9 && taken < count; step++) {
    const d = smallest ? step + 1 : 9 - step;
    if (used & bit(d)) continue;
    sum += d;
    taken++;
  }
  return taken < count ? (smallest ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY) : sum;
}

export interface SudokuCountResult {
  solutions: number;
  nodes: number;
  complete: boolean;
}

export function countSudokuSolutions(puzzle: SudokuPuzzle, limit = 2, start?: Uint8Array, maxNodes = 2_000_000): SudokuCountResult {
  const pruned = logicCandidates(puzzle, start);
  if (!pruned) return { solutions: 0, nodes: 0, complete: true };
  const values = new Uint8Array(N);
  const rowM = new Uint16Array(9);
  const colM = new Uint16Array(9);
  const boxM = new Uint16Array(9);
  const cages = puzzle.cages;
  const cageOf = cageIndex(cages);
  const cageUsed = new Uint16Array(cages.length);
  const cagePlaced = new Int16Array(cages.length);
  const cageLeft = Uint8Array.from(cages, (c) => c.cells.length);
  let nodes = 0;
  let solutions = 0;
  let complete = true;

  const toggle = (i: number, d: number, on: boolean) => {
    const b = bit(d);
    rowM[sudokuRow(i)]! ^= b;
    colM[sudokuCol(i)]! ^= b;
    boxM[sudokuBox(i)]! ^= b;
    values[i] = on ? d : 0;
    const k = cageOf[i]!;
    if (k < 0) return;
    cageUsed[k]! ^= b;
    cagePlaced[k]! += on ? d : -d;
    cageLeft[k]! += on ? -1 : 1;
  };

  const allowed = (i: number): number => {
    let m = pruned[i]! & ~(rowM[sudokuRow(i)]! | colM[sudokuCol(i)]! | boxM[sudokuBox(i)]!);
    const k = cageOf[i]!;
    if (k < 0 || m === 0) return m;
    const used = cageUsed[k]!;
    m &= ~used;
    const left = cageLeft[k]! - 1;
    const rem = cages[k]!.sum - cagePlaced[k]!;
    let out = 0;
    let rest = m;
    while (rest) {
      const b = rest & -rest;
      rest ^= b;
      const d = lowestDigit(b);
      const after = rem - d;
      if (after >= extremeSum(left, used | b, true) && after <= extremeSum(left, used | b, false)) out |= b;
    }
    return out;
  };

  for (let i = 0; i < N; i++) {
    const v = start?.[i] || puzzle.givens[i]!;
    if (!v) continue;
    if (!(allowed(i) & bit(v))) return { solutions: 0, nodes: 0, complete: true };
    toggle(i, v, true);
  }

  const search = (): void => {
    if (solutions >= limit || !complete) return;
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < N; i++) {
      if (values[i]) continue;
      const m = allowed(i);
      const c = popcount(m);
      if (c >= bestCount) continue;
      best = i;
      bestMask = m;
      bestCount = c;
      if (c <= 1) break;
    }
    if (best < 0) {
      solutions++;
      return;
    }
    if (bestCount === 0) return;
    let m = bestMask;
    while (m) {
      const b = m & -m;
      m ^= b;
      const d = lowestDigit(b);
      if (++nodes > maxNodes) {
        complete = false;
        return;
      }
      toggle(best, d, true);
      search();
      toggle(best, d, false);
      if (solutions >= limit || !complete) return;
    }
  };

  search();
  return { solutions, nodes, complete };
}

export function isSudokuUnique(puzzle: SudokuPuzzle): boolean {
  const r = countSudokuSolutions(puzzle, 2);
  return r.complete && r.solutions === 1;
}

export interface SudokuPlacement {
  cell: number;
  value: number;
  technique: SudokuTechnique;
}

interface Grid {
  values: Uint8Array;
  cand: Uint16Array;
  cages: readonly SudokuCage[];
  cageOf: Int8Array;
  placements: SudokuPlacement[];
  contradiction: boolean;
  stamp: Uint32Array;
  cageSeen: Float64Array;
  regionSeen: Float64Array;
}

function eliminate(g: Grid, i: number, mask: number): boolean {
  const before = g.cand[i]!;
  const after = before & ~mask;
  if (after === before) return false;
  g.cand[i] = after;
  g.stamp[i]!++;
  if (after === 0) g.contradiction = true;
  return true;
}

function place(g: Grid, i: number, d: number, technique: SudokuTechnique): void {
  const b = bit(d);
  g.values[i] = d;
  g.cand[i] = b;
  g.placements.push({ cell: i, value: d, technique });
  for (const p of PEERS[i]!) eliminate(g, p, b);
  const k = g.cageOf[i]!;
  if (k < 0) return;
  for (const c of g.cages[k]!.cells) if (c !== i) eliminate(g, c, b);
}

function openCells(g: Grid, unit: readonly number[], b: number): number[] {
  const out: number[] = [];
  for (const i of unit) if (!g.values[i] && g.cand[i]! & b) out.push(i);
  return out;
}

function nakedSingle(g: Grid): number {
  let n = 0;
  for (let i = 0; i < N; i++) {
    if (g.values[i]) continue;
    const m = g.cand[i]!;
    if (m === 0) {
      g.contradiction = true;
      return n;
    }
    if (popcount(m) !== 1) continue;
    place(g, i, lowestDigit(m), 'naked-single');
    n++;
  }
  return n;
}

function hiddenSingle(g: Grid): number {
  let n = 0;
  for (const unit of SUDOKU_UNITS) {
    for (let d = 1; d <= 9; d++) {
      const b = bit(d);
      let where = -1;
      let count = 0;
      for (const i of unit) {
        if (!(g.cand[i]! & b)) continue;
        if (g.values[i]) {
          count = -1;
          break;
        }
        count++;
        where = i;
      }
      if (count === 0) {
        g.contradiction = true;
        return n;
      }
      if (count !== 1) continue;
      place(g, where, d, 'hidden-single');
      n++;
    }
  }
  return n;
}

function sameLine(cells: readonly number[], line: (i: number) => number): number {
  const first = line(cells[0]!);
  return cells.every((i) => line(i) === first) ? first : -1;
}

function eliminateOutside(g: Grid, unit: readonly number[], keep: readonly number[], b: number): boolean {
  let changed = false;
  for (const i of unit) {
    if (g.values[i] || keep.includes(i)) continue;
    if (eliminate(g, i, b)) changed = true;
  }
  return changed;
}

function pointing(g: Grid): number {
  for (let box = 0; box < 9; box++) {
    for (let d = 1; d <= 9; d++) {
      const b = bit(d);
      const cells = openCells(g, SUDOKU_UNITS[18 + box]!, b);
      if (cells.length < 2) continue;
      const r = sameLine(cells, sudokuRow);
      if (r >= 0 && eliminateOutside(g, SUDOKU_UNITS[r]!, cells, b)) return 1;
      const c = sameLine(cells, sudokuCol);
      if (c >= 0 && eliminateOutside(g, SUDOKU_UNITS[9 + c]!, cells, b)) return 1;
    }
  }
  return 0;
}

function boxLine(g: Grid): number {
  for (let line = 0; line < 18; line++) {
    for (let d = 1; d <= 9; d++) {
      const b = bit(d);
      const cells = openCells(g, SUDOKU_UNITS[line]!, b);
      if (cells.length < 2) continue;
      const box = sameLine(cells, sudokuBox);
      if (box >= 0 && eliminateOutside(g, SUDOKU_UNITS[18 + box]!, cells, b)) return 1;
    }
  }
  return 0;
}

function combos(items: number[], size: number): number[][] {
  const out: number[][] = [];
  const pick = (start: number, acc: number[]) => {
    if (acc.length === size) {
      out.push([...acc]);
      return;
    }
    for (let k = start; k < items.length; k++) {
      acc.push(items[k]!);
      pick(k + 1, acc);
      acc.pop();
    }
  };
  pick(0, []);
  return out;
}

function nakedSubset(g: Grid, size: number, technique: SudokuTechnique): number {
  for (const unit of SUDOKU_UNITS) {
    const open = unit.filter((i) => !g.values[i]);
    if (open.length <= size) continue;
    const small = open.filter((i) => popcount(g.cand[i]!) <= size);
    for (const combo of combos(small, size)) {
      let union = 0;
      for (const i of combo) union |= g.cand[i]!;
      if (popcount(union) !== size) continue;
      let changed = false;
      for (const i of open) if (!combo.includes(i) && eliminate(g, i, union)) changed = true;
      if (changed) return 1;
    }
  }
  return 0;
}

function hiddenPair(g: Grid): number {
  for (const unit of SUDOKU_UNITS) {
    const positions: number[][] = [];
    for (let d = 1; d <= 9; d++) positions.push(openCells(g, unit, bit(d)));
    for (let a = 0; a < 9; a++) {
      const pa = positions[a]!;
      if (pa.length !== 2) continue;
      for (let b = a + 1; b < 9; b++) {
        const pb = positions[b]!;
        if (pb.length !== 2 || pa[0] !== pb[0] || pa[1] !== pb[1]) continue;
        const keep = bit(a + 1) | bit(b + 1);
        let changed = false;
        for (const i of pa) if (eliminate(g, i, ALL & ~keep)) changed = true;
        if (changed) return 1;
      }
    }
  }
  return 0;
}

function xWingAxis(g: Grid, b: number, minor: (i: number) => number, cellAt: (maj: number, min: number) => number): boolean {
  const lines: number[][] = [];
  for (let m = 0; m < 9; m++) {
    const cells: number[] = [];
    for (let k = 0; k < 9; k++) {
      const i = cellAt(m, k);
      if (!g.values[i] && g.cand[i]! & b) cells.push(minor(i));
    }
    lines.push(cells);
  }
  for (let a = 0; a < 9; a++) {
    const la = lines[a]!;
    if (la.length !== 2) continue;
    for (let c = a + 1; c < 9; c++) {
      const lc = lines[c]!;
      if (lc.length !== 2 || la[0] !== lc[0] || la[1] !== lc[1]) continue;
      let changed = false;
      for (const min of la) {
        for (let m = 0; m < 9; m++) {
          if (m === a || m === c) continue;
          const i = cellAt(m, min);
          if (!g.values[i] && eliminate(g, i, b)) changed = true;
        }
      }
      if (changed) return true;
    }
  }
  return false;
}

function xWing(g: Grid): number {
  for (let d = 1; d <= 9; d++) {
    const b = bit(d);
    if (xWingAxis(g, b, sudokuCol, (r, c) => r * 9 + c)) return 1;
    if (xWingAxis(g, b, sudokuRow, (c, r) => r * 9 + c)) return 1;
  }
  return 0;
}

function sumCombos(cells: readonly number[], cand: Uint16Array, target: number, distinctAll: boolean): Uint16Array {
  const n = cells.length;
  const allowed = new Uint16Array(n);
  const chosen = new Uint8Array(n);
  const minRest = new Int16Array(n + 1);
  const maxRest = new Int16Array(n + 1);
  for (let k = n - 1; k >= 0; k--) {
    const m = cand[cells[k]!]!;
    if (m === 0) return allowed;
    minRest[k] = minRest[k + 1]! + lowestDigit(m);
    maxRest[k] = maxRest[k + 1]! + highestDigit(m);
  }
  const conflicts = (k: number, d: number): boolean => {
    for (let j = 0; j < k; j++) {
      if (chosen[j] !== d) continue;
      if (distinctAll || PEER_FLAG[cells[j]! * N + cells[k]!]) return true;
    }
    return false;
  };
  const dfs = (k: number, sum: number): void => {
    if (k === n) {
      if (sum !== target) return;
      for (let j = 0; j < n; j++) allowed[j]! |= bit(chosen[j]!);
      return;
    }
    const rem = target - sum;
    if (rem < minRest[k]! || rem > maxRest[k]!) return;
    let m = cand[cells[k]!]!;
    while (m) {
      const b = m & -m;
      m ^= b;
      const d = lowestDigit(b);
      if (conflicts(k, d)) continue;
      chosen[k] = d;
      dfs(k + 1, sum + d);
    }
  };
  dfs(0, 0);
  return allowed;
}

function restrictToSum(g: Grid, cells: readonly number[], target: number, distinctAll: boolean): boolean {
  const allowed = sumCombos(cells, g.cand, target, distinctAll);
  let changed = false;
  cells.forEach((i, k) => {
    if (eliminate(g, i, ALL & ~allowed[k]!)) changed = true;
  });
  return changed;
}

function stampSum(g: Grid, cells: readonly number[]): number {
  let sum = 0;
  for (const i of cells) sum += g.stamp[i]!;
  return sum;
}

function cageSum(g: Grid): number {
  for (let k = 0; k < g.cages.length; k++) {
    const cage = g.cages[k]!;
    const stamp = stampSum(g, cage.cells);
    if (stamp === g.cageSeen[k] || cage.cells.every((i) => g.values[i])) continue;
    g.cageSeen[k] = stamp;
    if (restrictToSum(g, cage.cells, cage.sum, true)) return 1;
  }
  return 0;
}

interface Region {
  cells: readonly number[];
  total: number;
}

function buildRegions(): Region[] {
  const out: Region[] = [];
  const add = (units: readonly (readonly number[])[]) => out.push({ cells: units.flat(), total: 45 * units.length });
  for (let u = 0; u < 27; u++) add([SUDOKU_UNITS[u]!]);
  for (let k = 0; k < 8; k++) {
    add([SUDOKU_UNITS[k]!, SUDOKU_UNITS[k + 1]!]);
    add([SUDOKU_UNITS[9 + k]!, SUDOKU_UNITS[10 + k]!]);
  }
  for (let b = 0; b < 9; b++) {
    if (b % 3 < 2) add([SUDOKU_UNITS[18 + b]!, SUDOKU_UNITS[19 + b]!]);
    if (b < 6) add([SUDOKU_UNITS[18 + b]!, SUDOKU_UNITS[21 + b]!]);
  }
  for (let k = 0; k < 3; k++) {
    add([SUDOKU_UNITS[3 * k]!, SUDOKU_UNITS[3 * k + 1]!, SUDOKU_UNITS[3 * k + 2]!]);
    add([SUDOKU_UNITS[9 + 3 * k]!, SUDOKU_UNITS[10 + 3 * k]!, SUDOKU_UNITS[11 + 3 * k]!]);
  }
  return out;
}

const REGIONS = buildRegions();
const MAX_INNIES = 4;

function innieOutie(g: Grid): number {
  if (g.cages.length === 0) return 0;
  const inside = new Uint8Array(N);
  for (let k = 0; k < REGIONS.length; k++) {
    const region = REGIONS[k]!;
    const stamp = stampSum(g, region.cells);
    if (stamp === g.regionSeen[k]) continue;
    g.regionSeen[k] = stamp;
    inside.fill(0);
    for (const i of region.cells) inside[i] = 1;
    let sumInside = 0;
    let sumPartial = 0;
    const innies: number[] = [];
    const outies: number[] = [];
    for (const cage of g.cages) {
      const inCount = cage.cells.filter((i) => inside[i]).length;
      if (inCount === 0) continue;
      if (inCount === cage.cells.length) {
        sumInside += cage.sum;
        continue;
      }
      sumPartial += cage.sum;
      for (const i of cage.cells) (inside[i] ? innies : outies).push(i);
    }
    const innieTarget = region.total - sumInside;
    if (innies.length > 0 && innies.length <= MAX_INNIES && innies.some((i) => !g.values[i]) && restrictToSum(g, innies, innieTarget, false)) return 1;
    if (outies.length > 0 && outies.length <= MAX_INNIES && outies.some((i) => !g.values[i]) && restrictToSum(g, outies, sumPartial - innieTarget, false)) return 1;
  }
  return 0;
}

const TECHNIQUE_FN: Record<SudokuTechnique, (g: Grid) => number> = {
  'naked-single': nakedSingle,
  'hidden-single': hiddenSingle,
  'cage-sum': cageSum,
  pointing,
  'box-line': boxLine,
  'naked-pair': (g) => nakedSubset(g, 2, 'naked-pair'),
  'hidden-pair': hiddenPair,
  'naked-triple': (g) => nakedSubset(g, 3, 'naked-triple'),
  'innie-outie': innieOutie,
  'x-wing': xWing,
};

export interface SudokuLogicResult {
  solved: boolean;
  contradiction: boolean;
  rounds: number;
  used: Record<SudokuTechnique, number>;
  state: Uint8Array;
  placements: SudokuPlacement[];
}

function emptyUsage(): Record<SudokuTechnique, number> {
  const used = {} as Record<SudokuTechnique, number>;
  for (const t of SUDOKU_TECHNIQUES) used[t] = 0;
  return used;
}

function initGrid(puzzle: SudokuPuzzle, start?: Uint8Array): Grid {
  const g: Grid = {
    values: new Uint8Array(N),
    cand: new Uint16Array(N).fill(ALL),
    cages: puzzle.cages,
    cageOf: cageIndex(puzzle.cages),
    placements: [],
    contradiction: false,
    stamp: new Uint32Array(N),
    cageSeen: new Float64Array(puzzle.cages.length).fill(-1),
    regionSeen: new Float64Array(REGIONS.length).fill(-1),
  };
  for (let i = 0; i < N; i++) {
    const v = start?.[i] || puzzle.givens[i]!;
    if (!v) continue;
    if (!(g.cand[i]! & bit(v))) g.contradiction = true;
    place(g, i, v, 'naked-single');
  }
  g.placements = [];
  return g;
}

const MAX_ROUNDS = 4000;

function runLogic(g: Grid, techniques: readonly SudokuTechnique[]): { rounds: number; used: Record<SudokuTechnique, number> } {
  const used = emptyUsage();
  const order = SUDOKU_TECHNIQUES.filter((t) => techniques.includes(t));
  let rounds = 0;
  while (!g.contradiction && rounds < MAX_ROUNDS) {
    if (g.values.every((v) => v !== 0)) break;
    let progressed = false;
    for (const t of order) {
      const n = TECHNIQUE_FN[t](g);
      if (n <= 0) continue;
      used[t] += n;
      progressed = true;
      rounds++;
      break;
    }
    if (!progressed) break;
  }
  return { rounds, used };
}

function logicCandidates(puzzle: SudokuPuzzle, start?: Uint8Array): Uint16Array | null {
  const g = initGrid(puzzle, start);
  runLogic(g, SUDOKU_TECHNIQUES);
  return g.contradiction ? null : g.cand;
}

export function sudokuSolveByLogic(puzzle: SudokuPuzzle, techniques: readonly SudokuTechnique[] = SUDOKU_TECHNIQUES, start?: Uint8Array): SudokuLogicResult {
  const g = initGrid(puzzle, start);
  const { rounds, used } = runLogic(g, techniques);
  const solved = !g.contradiction && g.values.every((v) => v !== 0);
  return { solved, contradiction: g.contradiction, rounds, used, state: g.values, placements: g.placements };
}

export function isSudokuLogicSolvable(puzzle: SudokuPuzzle, techniques: readonly SudokuTechnique[] = SUDOKU_TECHNIQUES): boolean {
  return sudokuSolveByLogic(puzzle, techniques).solved;
}

export interface SudokuDifficultyReport {
  score: number;
  rounds: number;
  hardest: SudokuTechnique;
  used: Record<SudokuTechnique, number>;
}

export function sudokuDifficultyReport(puzzle: SudokuPuzzle): SudokuDifficultyReport {
  const r = sudokuSolveByLogic(puzzle);
  let score = 0;
  let hardest: SudokuTechnique = 'naked-single';
  for (const t of SUDOKU_TECHNIQUES) {
    const n = r.used[t];
    if (n === 0) continue;
    score += n * SUDOKU_TECHNIQUE_WEIGHT[t];
    if (SUDOKU_TECHNIQUE_WEIGHT[t] > SUDOKU_TECHNIQUE_WEIGHT[hardest]) hardest = t;
  }
  return { score: Math.round(score * 10) / 10, rounds: r.rounds, hardest, used: r.used };
}

type Transform = (r: number, c: number) => number;

const TRANSFORMS: Transform[] = [
  (r, c) => r * 9 + c,
  (r, c) => r * 9 + (8 - c),
  (r, c) => (8 - r) * 9 + c,
  (r, c) => (8 - r) * 9 + (8 - c),
  (r, c) => c * 9 + r,
  (r, c) => c * 9 + (8 - r),
  (r, c) => (8 - c) * 9 + r,
  (r, c) => (8 - c) * 9 + (8 - r),
];

export function sudokuCanonicalKey(spec: Pick<SudokuSpec, 'solution' | 'givens' | 'cages'>): string {
  const cageOf = cageIndex(spec.cages);
  let best = '';
  for (const t of TRANSFORMS) {
    const relabel = new Uint8Array(10);
    let next = 1;
    let key = '';
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const i = t(r, c);
        const d = spec.solution[i]!;
        if (!relabel[d]) relabel[d] = next++;
        const right = c < 8 && cageOf[i]! >= 0 && cageOf[i] === cageOf[t(r, c + 1)] ? 1 : 0;
        const down = r < 8 && cageOf[i]! >= 0 && cageOf[i] === cageOf[t(r + 1, c)] ? 1 : 0;
        key += `${relabel[d]}${spec.givens[i] ? 'g' : '.'}${right}${down}`;
      }
    }
    if (best === '' || key < best) best = key;
  }
  return `9x9|${best}`;
}

// Vocabulary: the cage size distribution plus the givens. Plain sudoku gets no family key
// at all, because every puzzle there uses the same nine digits and the only thing such a
// key could separate is the difficulty, which the presets already fix.
export function killerFamilyKey(spec: SudokuSpec): string {
  const givens = [...spec.givens].filter((v) => v > 0).length;
  return `g${givens}/${countHistogram(spec.cages.map((cage) => cage.cells.length))}`;
}
