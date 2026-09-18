import type { KakuroRun, KakuroSpec } from './puzzle.ts';

export const KAKURO_TECHNIQUES = ['naked-single', 'hidden-single', 'single-combination', 'run-intersection', 'naked-pair', 'sum-partition'] as const;

export type KakuroTechnique = (typeof KAKURO_TECHNIQUES)[number];

export const KAKURO_TECHNIQUE_WEIGHT: Record<KakuroTechnique, number> = {
  'naked-single': 1,
  'hidden-single': 1.5,
  'single-combination': 2,
  'run-intersection': 3,
  'naked-pair': 5,
  'sum-partition': 6,
};

export type KakuroPuzzle = Pick<KakuroSpec, 'config' | 'cells' | 'runs'>;

const ALL = 0x1ff;
const T_LEN = 10;
const T_SUM = 46;

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

function tableIndex(used: number, len: number, sum: number): number {
  return (used * T_LEN + len) * T_SUM + sum;
}

const COMBO = new Uint16Array(512 * T_LEN * T_SUM);
const REQUIRED = new Uint16Array(512 * T_LEN * T_SUM).fill(ALL);
const COUNT = new Uint8Array(512 * T_LEN * T_SUM);

(function buildTables() {
  for (let s = 1; s < 512; s++) {
    const len = popcount(s);
    let sum = 0;
    for (let d = 1; d <= 9; d++) if (s & bit(d)) sum += d;
    for (let used = 0; used < 512; used++) {
      if (used & s) continue;
      const k = tableIndex(used, len, sum);
      COMBO[k]! |= s;
      REQUIRED[k]! &= s;
      if (COUNT[k]! < 255) COUNT[k]!++;
    }
  }
  for (let k = 0; k < REQUIRED.length; k++) if (COUNT[k] === 0) REQUIRED[k] = 0;
})();

export function kakuroComboDigits(used: number, len: number, sum: number): number {
  if (len < 0 || len > 9 || sum < 0 || sum > 45) return 0;
  return COMBO[tableIndex(used, len, sum)]!;
}

export function kakuroCombinations(len: number, sum: number): number[][] {
  const out: number[][] = [];
  for (let s = 1; s < 512; s++) {
    if (popcount(s) !== len) continue;
    let total = 0;
    const digits: number[] = [];
    for (let d = 1; d <= 9; d++) {
      if (!(s & bit(d))) continue;
      total += d;
      digits.push(d);
    }
    if (total === sum) out.push(digits);
  }
  return out;
}

export interface KakuroRunMap {
  h: Int16Array;
  v: Int16Array;
}

export function kakuroRunMap(puzzle: KakuroPuzzle): KakuroRunMap {
  const n = puzzle.cells.length;
  const h = new Int16Array(n).fill(-1);
  const v = new Int16Array(n).fill(-1);
  puzzle.runs.forEach((run, k) => {
    const m = run.dir === 'h' ? h : v;
    for (const i of run.cells) m[i] = k;
  });
  return { h, v };
}

interface RunState {
  used: number;
  left: number;
  rem: number;
}

function runState(values: Uint8Array, run: KakuroRun): RunState {
  let used = 0;
  let left = 0;
  let rem = run.sum;
  for (const i of run.cells) {
    const v = values[i]!;
    if (v) {
      used |= bit(v);
      rem -= v;
    } else left++;
  }
  return { used, left, rem };
}

function tableAt(s: RunState): number {
  if (s.rem < 0 || s.rem > 45) return -1;
  return tableIndex(s.used, s.left, s.rem);
}

export interface KakuroCountResult {
  solutions: number;
  nodes: number;
  complete: boolean;
  grids: Uint8Array[];
}

export function countKakuroSolutions(puzzle: KakuroPuzzle, limit = 2, maxNodes = 2_000_000, start?: Uint8Array, keep = 0): KakuroCountResult {
  const pruned = logicCandidates(puzzle, start);
  const grids: Uint8Array[] = [];
  if (!pruned) return { solutions: 0, nodes: 0, complete: true, grids };
  const n = puzzle.cells.length;
  const { runs } = puzzle;
  const map = kakuroRunMap(puzzle);
  const values = new Uint8Array(n);
  const used = new Uint16Array(runs.length);
  const placed = new Int16Array(runs.length);
  const left = Uint8Array.from(runs, (r) => r.length);
  const whites: number[] = [];
  for (let i = 0; i < n; i++) if (puzzle.cells[i]) whites.push(i);
  let nodes = 0;
  let solutions = 0;
  let complete = true;

  const toggle = (i: number, d: number, on: boolean) => {
    const b = bit(d);
    values[i] = on ? d : 0;
    for (const k of [map.h[i]!, map.v[i]!]) {
      used[k]! ^= b;
      placed[k]! += on ? d : -d;
      left[k]! += on ? -1 : 1;
    }
  };

  const runMask = (k: number): number => {
    const rem = runs[k]!.sum - placed[k]!;
    if (rem < 0 || rem > 45) return 0;
    return COMBO[tableIndex(used[k]!, left[k]!, rem)]!;
  };

  const allowed = (i: number): number => pruned[i]! & runMask(map.h[i]!) & runMask(map.v[i]!);

  for (const i of whites) {
    const m = pruned[i]!;
    if (popcount(m) !== 1) continue;
    const d = lowestDigit(m);
    if (!(allowed(i) & m)) return { solutions: 0, nodes: 0, complete: true, grids };
    toggle(i, d, true);
  }

  const search = (): void => {
    if (solutions >= limit || !complete) return;
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (const i of whites) {
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
      if (grids.length < keep) grids.push(Uint8Array.from(values));
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
  return { solutions, nodes, complete, grids };
}

export function isKakuroUnique(puzzle: KakuroPuzzle, maxNodes = 2_000_000): boolean {
  const r = countKakuroSolutions(puzzle, 2, maxNodes);
  return r.complete && r.solutions === 1;
}

export interface KakuroPlacement {
  cell: number;
  value: number;
  technique: KakuroTechnique;
}

interface Grid {
  n: number;
  cells: Uint8Array;
  values: Uint8Array;
  cand: Uint16Array;
  runs: readonly KakuroRun[];
  map: KakuroRunMap;
  placements: KakuroPlacement[];
  contradiction: boolean;
  stamp: Uint32Array;
  runSeen: Float64Array;
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

function place(g: Grid, i: number, d: number, technique: KakuroTechnique): void {
  const b = bit(d);
  g.values[i] = d;
  g.cand[i] = b;
  g.stamp[i]!++;
  g.placements.push({ cell: i, value: d, technique });
  for (const k of [g.map.h[i]!, g.map.v[i]!]) {
    for (const j of g.runs[k]!.cells) if (j !== i) eliminate(g, j, b);
  }
}

function openCells(g: Grid, run: KakuroRun): number[] {
  return run.cells.filter((i) => !g.values[i]);
}

function nakedSingle(g: Grid): number {
  let n = 0;
  for (let i = 0; i < g.n; i++) {
    if (!g.cells[i] || g.values[i]) continue;
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
  for (const run of g.runs) {
    const s = runState(g.values, run);
    if (s.left === 0) continue;
    const k = tableAt(s);
    if (k < 0 || COMBO[k] === 0) {
      g.contradiction = true;
      return n;
    }
    let req = REQUIRED[k]!;
    while (req) {
      const b = req & -req;
      req ^= b;
      let where = -1;
      let count = 0;
      for (const i of run.cells) {
        if (g.values[i] || !(g.cand[i]! & b)) continue;
        count++;
        where = i;
      }
      if (count === 0) {
        g.contradiction = true;
        return n;
      }
      if (count !== 1) continue;
      place(g, where, lowestDigit(b), 'hidden-single');
      n++;
      break;
    }
  }
  return n;
}

function restrictRuns(g: Grid, onlySingle: boolean): number {
  let n = 0;
  for (const run of g.runs) {
    const s = runState(g.values, run);
    if (s.left === 0) continue;
    const k = tableAt(s);
    if (k < 0 || COMBO[k] === 0) {
      g.contradiction = true;
      return n;
    }
    if (onlySingle && COUNT[k] !== 1) continue;
    const mask = COMBO[k]!;
    let changed = false;
    for (const i of run.cells) if (!g.values[i] && eliminate(g, i, ALL & ~mask)) changed = true;
    if (changed) n++;
  }
  return n;
}

function nakedPair(g: Grid): number {
  for (const run of g.runs) {
    const open = openCells(g, run);
    if (open.length <= 2) continue;
    for (let a = 0; a < open.length; a++) {
      const ma = g.cand[open[a]!]!;
      if (popcount(ma) !== 2) continue;
      for (let b = a + 1; b < open.length; b++) {
        if (g.cand[open[b]!] !== ma) continue;
        let changed = false;
        for (const i of open) if (i !== open[a] && i !== open[b] && eliminate(g, i, ma)) changed = true;
        if (changed) return 1;
      }
    }
  }
  return 0;
}

function sumCombos(cells: readonly number[], cand: Uint16Array, target: number): Uint16Array {
  const n = cells.length;
  const allowed = new Uint16Array(n);
  const chosen = new Uint8Array(n);
  const dfs = (k: number, sum: number, usedMask: number): void => {
    if (k === n) {
      if (sum !== target) return;
      for (let j = 0; j < n; j++) allowed[j]! |= bit(chosen[j]!);
      return;
    }
    const rem = target - sum;
    if (rem < 0 || rem > 45) return;
    if (!(COMBO[tableIndex(usedMask, n - k, rem)]! & cand[cells[k]!]!)) return;
    let m = cand[cells[k]!]! & ~usedMask;
    while (m) {
      const b = m & -m;
      m ^= b;
      chosen[k] = lowestDigit(b);
      dfs(k + 1, sum + chosen[k]!, usedMask | b);
    }
  };
  dfs(0, 0, 0);
  return allowed;
}

function stampSum(g: Grid, cells: readonly number[]): number {
  let sum = 0;
  for (const i of cells) sum += g.stamp[i]!;
  return sum;
}

function sumPartition(g: Grid): number {
  for (let k = 0; k < g.runs.length; k++) {
    const run = g.runs[k]!;
    const stamp = stampSum(g, run.cells);
    if (stamp === g.runSeen[k]) continue;
    g.runSeen[k] = stamp;
    const s = runState(g.values, run);
    if (s.left === 0) continue;
    const open = openCells(g, run);
    const allowed = sumCombos(open, g.cand, s.rem);
    let changed = false;
    open.forEach((i, j) => {
      if (eliminate(g, i, ALL & ~allowed[j]!)) changed = true;
    });
    if (changed) return 1;
  }
  return 0;
}

const TECHNIQUE_FN: Record<KakuroTechnique, (g: Grid) => number> = {
  'naked-single': nakedSingle,
  'hidden-single': hiddenSingle,
  'single-combination': (g) => restrictRuns(g, true),
  'run-intersection': (g) => restrictRuns(g, false),
  'naked-pair': nakedPair,
  'sum-partition': sumPartition,
};

export interface KakuroLogicResult {
  solved: boolean;
  contradiction: boolean;
  rounds: number;
  used: Record<KakuroTechnique, number>;
  state: Uint8Array;
  placements: KakuroPlacement[];
}

function emptyUsage(): Record<KakuroTechnique, number> {
  const used = {} as Record<KakuroTechnique, number>;
  for (const t of KAKURO_TECHNIQUES) used[t] = 0;
  return used;
}

function initGrid(puzzle: KakuroPuzzle, start?: Uint8Array): Grid {
  const n = puzzle.cells.length;
  const g: Grid = {
    n,
    cells: puzzle.cells,
    values: new Uint8Array(n),
    cand: new Uint16Array(n),
    runs: puzzle.runs,
    map: kakuroRunMap(puzzle),
    placements: [],
    contradiction: false,
    stamp: new Uint32Array(n),
    runSeen: new Float64Array(puzzle.runs.length).fill(-1),
  };
  for (let i = 0; i < n; i++) if (puzzle.cells[i]) g.cand[i] = ALL;
  if (start) {
    for (let i = 0; i < n; i++) {
      const v = start[i]!;
      if (!v || !puzzle.cells[i]) continue;
      if (!(g.cand[i]! & bit(v))) g.contradiction = true;
      place(g, i, v, 'naked-single');
    }
  }
  g.placements = [];
  return g;
}

const MAX_ROUNDS = 4000;

function runLogic(g: Grid, techniques: readonly KakuroTechnique[]): { rounds: number; used: Record<KakuroTechnique, number> } {
  const used = emptyUsage();
  const order = KAKURO_TECHNIQUES.filter((t) => techniques.includes(t));
  let rounds = 0;
  while (!g.contradiction && rounds < MAX_ROUNDS) {
    let done = true;
    for (let i = 0; i < g.n; i++) {
      if (g.cells[i] && !g.values[i]) {
        done = false;
        break;
      }
    }
    if (done) break;
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

function logicCandidates(puzzle: KakuroPuzzle, start?: Uint8Array): Uint16Array | null {
  const g = initGrid(puzzle, start);
  runLogic(g, KAKURO_TECHNIQUES);
  return g.contradiction ? null : g.cand;
}

function allFilled(g: Grid): boolean {
  for (let i = 0; i < g.n; i++) if (g.cells[i] && !g.values[i]) return false;
  return true;
}

export function kakuroSolveByLogic(puzzle: KakuroPuzzle, techniques: readonly KakuroTechnique[] = KAKURO_TECHNIQUES, start?: Uint8Array): KakuroLogicResult {
  const g = initGrid(puzzle, start);
  const { rounds, used } = runLogic(g, techniques);
  const solved = !g.contradiction && allFilled(g);
  return { solved, contradiction: g.contradiction, rounds, used, state: g.values, placements: g.placements };
}

export function isKakuroLogicSolvable(puzzle: KakuroPuzzle, techniques: readonly KakuroTechnique[] = KAKURO_TECHNIQUES): boolean {
  return kakuroSolveByLogic(puzzle, techniques).solved;
}

export interface KakuroDifficultyReport {
  score: number;
  rounds: number;
  hardest: KakuroTechnique;
  used: Record<KakuroTechnique, number>;
  solvedByLogic: boolean;
  nodes: number;
}

export function kakuroDifficultyReport(puzzle: KakuroPuzzle, maxNodes = 2_000_000): KakuroDifficultyReport {
  const r = kakuroSolveByLogic(puzzle);
  let score = 0;
  let hardest: KakuroTechnique = 'naked-single';
  for (const t of KAKURO_TECHNIQUES) {
    const n = r.used[t];
    if (n === 0) continue;
    score += n * KAKURO_TECHNIQUE_WEIGHT[t];
    if (KAKURO_TECHNIQUE_WEIGHT[t] > KAKURO_TECHNIQUE_WEIGHT[hardest]) hardest = t;
  }
  let nodes = 0;
  if (!r.solved) {
    nodes = countKakuroSolutions(puzzle, 1, maxNodes).nodes;
    score += 10 + 4 * Math.log2(nodes + 1);
  }
  return { score: Math.round(score * 10) / 10, rounds: r.rounds, hardest, used: r.used, solvedByLogic: r.solved, nodes };
}

function clueGrid(puzzle: KakuroPuzzle): { right: Int16Array; down: Int16Array } {
  const n = puzzle.cells.length;
  const { cols } = puzzle.config;
  const right = new Int16Array(n);
  const down = new Int16Array(n);
  for (const run of puzzle.runs) {
    if (run.dir === 'h') right[run.start - 1] = run.sum;
    else down[run.start - cols] = run.sum;
  }
  return { right, down };
}

export function kakuroCanonicalKey(puzzle: KakuroPuzzle): string {
  const { rows, cols } = puzzle.config;
  const { right, down } = clueGrid(puzzle);
  const encode = (transpose: boolean): string => {
    const R = transpose ? cols : rows;
    const C = transpose ? rows : cols;
    const parts: string[] = [`${R}x${C}`];
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const i = transpose ? c * cols + r : r * cols + c;
        if (puzzle.cells[i]) {
          parts.push('.');
          continue;
        }
        const a = transpose ? down[i]! : right[i]!;
        const b = transpose ? right[i]! : down[i]!;
        parts.push(a || b ? `${a}/${b}` : 'x');
      }
    }
    return parts.join(',');
  };
  const a = encode(false);
  const b = encode(true);
  return a < b ? a : b;
}
