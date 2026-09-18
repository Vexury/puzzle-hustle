import { MARKED_EMPTY, readLine, writeLine, type Clue } from './clues.ts';
import type { NonogramSpec } from './puzzle.ts';

function allowedMask(v: number, colors: number): number {
  if (v === 0) return (1 << (colors + 1)) - 1;
  if (v === MARKED_EMPTY) return 1;
  return 1 << v;
}

export function solveLine(cells: Uint8Array, clues: readonly Clue[], colors: number): number {
  const n = cells.length;
  const m = clues.length;
  const allow = Array.from(cells, (v) => allowedMask(v, colors));
  const canEmpty = (p: number) => p < n && (allow[p]! & 1) !== 0;
  const fits = (i: number, s: number) => {
    const { len, color } = clues[i]!;
    if (s + len > n) return false;
    for (let p = s; p < s + len; p++) if (!(allow[p]! & (1 << color))) return false;
    return true;
  };
  const gap = (i: number) => (i + 1 < m && clues[i + 1]!.color === clues[i]!.color ? 1 : 0);
  const after = (i: number, s: number) => {
    const e = s + clues[i]!.len;
    const g = gap(i);
    if (g && !canEmpty(e)) return -1;
    return e + g;
  };
  const W = n + 2;
  const pre = new Uint8Array((m + 1) * W);
  pre[0] = 1;
  for (let i = 0; i <= m; i++) {
    for (let p = 0; p <= n; p++) {
      if (!pre[i * W + p]) continue;
      if (canEmpty(p)) pre[i * W + p + 1] = 1;
      if (i < m && fits(i, p)) {
        const q = after(i, p);
        if (q >= 0) pre[(i + 1) * W + q] = 1;
      }
    }
  }
  const suf = new Uint8Array((m + 1) * W);
  suf[m * W + n] = 1;
  for (let p = n - 1; p >= 0; p--) if (canEmpty(p) && suf[m * W + p + 1]) suf[m * W + p] = 1;
  for (let i = m - 1; i >= 0; i--) {
    for (let p = n; p >= 0; p--) {
      let ok = canEmpty(p) && suf[i * W + p + 1] === 1;
      if (!ok && fits(i, p)) {
        const q = after(i, p);
        ok = q >= 0 && suf[(i + 1) * W + q] === 1;
      }
      suf[i * W + p] = ok ? 1 : 0;
    }
  }
  if (!suf[0]) return -1;
  const poss = new Uint8Array(n);
  for (let i = 0; i <= m; i++) {
    for (let p = 0; p < n; p++) {
      if (!pre[i * W + p]) continue;
      if (canEmpty(p) && suf[i * W + p + 1]) poss[p] = poss[p]! | 1;
      if (i < m && fits(i, p)) {
        const q = after(i, p);
        if (q < 0 || !suf[(i + 1) * W + q]) continue;
        const { len, color } = clues[i]!;
        for (let k = p; k < p + len; k++) poss[k] = poss[k]! | (1 << color);
        if (gap(i)) poss[p + len] = poss[p + len]! | 1;
      }
    }
  }
  let deduced = 0;
  for (let p = 0; p < n; p++) {
    if (cells[p] !== 0) continue;
    const mk = poss[p]!;
    if (mk === 0) return -1;
    if (mk & (mk - 1)) continue;
    cells[p] = mk === 1 ? MARKED_EMPTY : 31 - Math.clz32(mk);
    deduced++;
  }
  return deduced;
}

export interface LineSolveResult {
  solved: boolean;
  contradiction: boolean;
  rounds: number;
  deducedPerRound: number[];
  state: Uint8Array;
}

export function propagateLines(spec: NonogramSpec, start: Uint8Array, maxRounds = Number.POSITIVE_INFINITY): LineSolveResult {
  const { rows, cols, colors } = spec.config;
  const state = Uint8Array.from(start);
  const deducedPerRound: number[] = [];
  let contradiction = false;
  while (deducedPerRound.length < maxRounds && !contradiction) {
    let deduced = 0;
    for (const axis of ['row', 'col'] as const) {
      const count = axis === 'row' ? rows : cols;
      const clues = axis === 'row' ? spec.rowClues : spec.colClues;
      for (let i = 0; i < count && !contradiction; i++) {
        const line = readLine(state, rows, cols, axis, i);
        const d = solveLine(line, clues[i]!, colors);
        if (d < 0) contradiction = true;
        else if (d > 0) {
          deduced += d;
          writeLine(state, cols, axis, i, line);
        }
      }
    }
    if (deduced === 0) break;
    deducedPerRound.push(deduced);
  }
  const solved = !contradiction && state.every((v) => v !== 0);
  return { solved, contradiction, rounds: deducedPerRound.length, deducedPerRound, state };
}

export function solveByLines(spec: NonogramSpec): LineSolveResult {
  return propagateLines(spec, new Uint8Array(spec.config.rows * spec.config.cols));
}

export function isLineSolvable(spec: NonogramSpec): boolean {
  return solveByLines(spec).solved;
}

export interface NonogramDifficultyReport {
  score: number;
  rounds: number;
  firstRoundRatio: number;
  cells: number;
}

export function nonogramDifficultyReport(spec: NonogramSpec): NonogramDifficultyReport {
  const { rows, cols } = spec.config;
  const cells = rows * cols;
  const r = solveByLines(spec);
  const firstRoundRatio = (r.deducedPerRound[0] ?? 0) / cells;
  const score = r.rounds * 6 + (1 - firstRoundRatio) * 40 + Math.log2(cells) * 3;
  return { score: Math.round(score * 10) / 10, rounds: r.rounds, firstRoundRatio: Math.round(firstRoundRatio * 1000) / 1000, cells };
}

type Transform = (r: number, c: number) => [number, number];

export function nonogramCanonicalKey(spec: NonogramSpec): string {
  const { rows, cols, colors } = spec.config;
  const g = spec.solution;
  const transforms: Transform[] = [
    (r, c) => [r, c],
    (r, c) => [r, cols - 1 - c],
    (r, c) => [rows - 1 - r, c],
    (r, c) => [rows - 1 - r, cols - 1 - c],
  ];
  if (rows === cols) {
    transforms.push(
      (r, c) => [c, r],
      (r, c) => [c, rows - 1 - r],
      (r, c) => [rows - 1 - c, r],
      (r, c) => [rows - 1 - c, rows - 1 - r],
    );
  }
  let best = '';
  for (const t of transforms) {
    let key = '';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const [sr, sc] = t(r, c);
        key += g[sr * cols + sc];
      }
    }
    if (best === '' || key < best) best = key;
  }
  return `${rows}x${cols}|${colors}|${best}`;
}
