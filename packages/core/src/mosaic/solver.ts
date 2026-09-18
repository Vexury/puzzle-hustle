import type { MosaicSpec } from './puzzle.ts';

export const MOSAIC_MARKED_EMPTY = 255;

interface MosaicBlocks {
  cells: number[][];
  clues: number[];
  pairs: [number, number][];
}

export function mosaicBlockCells(rows: number, cols: number, r: number, c: number): number[] {
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && cc >= 0 && rr < rows && cc < cols) out.push(rr * cols + cc);
    }
  }
  return out;
}

function buildBlocks(rows: number, cols: number, clues: Int8Array): MosaicBlocks {
  const cells: number[][] = [];
  const clueValues: number[] = [];
  const slot = new Int32Array(rows * cols).fill(-1);
  for (let i = 0; i < clues.length; i++) {
    const v = clues[i]!;
    if (v < 0) continue;
    slot[i] = cells.length;
    cells.push(mosaicBlockCells(rows, cols, Math.floor(i / cols), i % cols));
    clueValues.push(v);
  }
  const pairs: [number, number][] = [];
  for (let i = 0; i < clues.length; i++) {
    const a = slot[i]!;
    if (a < 0) continue;
    const r = Math.floor(i / cols);
    const c = i % cols;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
        const b = slot[rr * cols + cc]!;
        if (b > a) pairs.push([a, b]);
      }
    }
  }
  return { cells, clues: clueValues, pairs };
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

function unknownsAndNeed(state: Uint8Array, cells: readonly number[], clue: number): { unknown: number[]; need: number } {
  const unknown: number[] = [];
  let filled = 0;
  for (const i of cells) {
    const v = state[i]!;
    if (v === 0) unknown.push(i);
    else if (v === 1) filled++;
  }
  return { unknown, need: clue - filled };
}

function passSingles(state: Uint8Array, blocks: MosaicBlocks): number {
  let deduced = 0;
  for (let k = 0; k < blocks.cells.length; k++) {
    const { unknown, need } = unknownsAndNeed(state, blocks.cells[k]!, blocks.clues[k]!);
    if (need < 0 || need > unknown.length) return -1;
    if (unknown.length === 0) continue;
    if (need === 0) deduced += assign(state, unknown, MOSAIC_MARKED_EMPTY);
    else if (need === unknown.length) deduced += assign(state, unknown, 1);
  }
  return deduced;
}

function forceSide(state: Uint8Array, side: number[], lo: number, hi: number): number {
  if (lo > hi) return -1;
  if (side.length === 0) return 0;
  if (lo === side.length) return assign(state, side, 1);
  if (hi === 0) return assign(state, side, MOSAIC_MARKED_EMPTY);
  return 0;
}

function passPairs(state: Uint8Array, blocks: MosaicBlocks): number {
  let deduced = 0;
  for (const [a, b] of blocks.pairs) {
    const ua = unknownsAndNeed(state, blocks.cells[a]!, blocks.clues[a]!);
    const ub = unknownsAndNeed(state, blocks.cells[b]!, blocks.clues[b]!);
    const setA = new Set(ua.unknown);
    const setB = new Set(ub.unknown);
    const x = ua.unknown.filter((i) => !setB.has(i));
    const y = ub.unknown.filter((i) => !setA.has(i));
    if (x.length === 0 && y.length === 0) continue;
    const d = ua.need - ub.need;
    const lo = Math.max(0, d);
    const hi = Math.min(x.length, y.length + d);
    const dx = forceSide(state, x, lo, hi);
    if (dx < 0) return -1;
    const dy = forceSide(state, y, lo - d, hi - d);
    if (dy < 0) return -1;
    deduced += dx + dy;
  }
  return deduced;
}

export interface MosaicSolveResult {
  solved: boolean;
  contradiction: boolean;
  rounds: number;
  deducedPerRound: number[];
  pairwiseUses: number;
  state: Uint8Array;
}

export function mosaicPropagate(spec: MosaicSpec, start: Uint8Array, maxRounds = Number.POSITIVE_INFINITY, pairwise = true): MosaicSolveResult {
  const { rows, cols } = spec.config;
  const blocks = buildBlocks(rows, cols, spec.clues);
  const state = Uint8Array.from(start);
  const deducedPerRound: number[] = [];
  let pairwiseUses = 0;
  let contradiction = false;
  while (deducedPerRound.length < maxRounds) {
    let d = passSingles(state, blocks);
    if (d === 0 && pairwise) {
      d = passPairs(state, blocks);
      if (d > 0) pairwiseUses += d;
    }
    if (d < 0) {
      contradiction = true;
      break;
    }
    if (d === 0) break;
    deducedPerRound.push(d);
  }
  const solved = !contradiction && state.every((v) => v !== 0);
  return { solved, contradiction, rounds: deducedPerRound.length, deducedPerRound, pairwiseUses, state };
}

export function mosaicSolveByLogic(spec: MosaicSpec, pairwise = true): MosaicSolveResult {
  return mosaicPropagate(spec, new Uint8Array(spec.config.rows * spec.config.cols), Number.POSITIVE_INFINITY, pairwise);
}

export function isMosaicLogicSolvable(spec: MosaicSpec, pairwise = true): boolean {
  return mosaicSolveByLogic(spec, pairwise).solved;
}

export interface MosaicDifficultyReport {
  score: number;
  rounds: number;
  firstRoundRatio: number;
  pairwiseUses: number;
  cells: number;
}

export function mosaicDifficultyReport(spec: MosaicSpec): MosaicDifficultyReport {
  const { rows, cols } = spec.config;
  const cells = rows * cols;
  const r = mosaicSolveByLogic(spec);
  const firstRoundRatio = (r.deducedPerRound[0] ?? 0) / cells;
  const pairwiseRatio = r.pairwiseUses / cells;
  const score = r.rounds * 3 + (1 - firstRoundRatio) * 20 + pairwiseRatio * 60 + Math.log2(cells) * 3;
  return {
    score: Math.round(score * 10) / 10,
    rounds: r.rounds,
    firstRoundRatio: Math.round(firstRoundRatio * 1000) / 1000,
    pairwiseUses: r.pairwiseUses,
    cells,
  };
}

type Transform = (r: number, c: number) => [number, number];

export function mosaicCanonicalKey(spec: MosaicSpec): string {
  const { rows, cols } = spec.config;
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
        const i = sr * cols + sc;
        const clue = spec.clues[i]!;
        key += `${spec.solution[i]}${clue < 0 ? '.' : clue}`;
      }
    }
    if (best === '' || key < best) best = key;
  }
  return `${rows}x${cols}|${best}`;
}
