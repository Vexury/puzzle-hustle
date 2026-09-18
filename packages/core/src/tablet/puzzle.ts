import { Rng } from '../rng.ts';
import type { Difficulty } from '../types.ts';
import { SHAPES, atomIndex, type ShapeKind } from './shapes.ts';

export const TABLET_VERSION = 1;

export interface TabletConfig {
  size: number;
  pieceCount: number;
  kinds: readonly ShapeKind[];
  minOverlapAtoms: number;
  maxLitRatio: number;
}

export interface Placement {
  r: number;
  c: number;
}

export interface TabletPiece {
  id: number;
  kind: ShapeKind;
}

export interface TabletSpec {
  version: number;
  seed: number;
  difficulty: Difficulty;
  config: TabletConfig;
  pieces: TabletPiece[];
  target: Uint8Array;
  solution: Placement[];
}

export type TabletState = (Placement | null)[];

const SMALL: ShapeKind[] = ['sq1', 'tri-nw', 'tri-ne', 'tri-se', 'tri-sw', 'dia1'];
const MEDIUM: ShapeKind[] = [...SMALL, 'sq2', 'tri2-nw', 'tri2-ne', 'tri2-se', 'tri2-sw'];
const ALL: ShapeKind[] = [...MEDIUM, 'dia2'];

export const TABLET_PRESETS: Record<Difficulty, TabletConfig> = {
  easy: { size: 3, pieceCount: 3, kinds: SMALL, minOverlapAtoms: 1, maxLitRatio: 0.8 },
  medium: { size: 4, pieceCount: 4, kinds: MEDIUM, minOverlapAtoms: 2, maxLitRatio: 0.75 },
  hard: { size: 5, pieceCount: 6, kinds: MEDIUM, minOverlapAtoms: 6, maxLitRatio: 0.7 },
  genius: { size: 6, pieceCount: 8, kinds: ALL, minOverlapAtoms: 12, maxLitRatio: 0.7 },
};

export interface TabletOptions {
  sizeDelta?: number;
  pieceDelta?: number;
}

export function tabletConfig(difficulty: Difficulty, options: TabletOptions = {}): TabletConfig {
  const base = TABLET_PRESETS[difficulty];
  const size = base.size + (options.sizeDelta ?? 0);
  const pieceCount = base.pieceCount + (options.pieceDelta ?? 0);
  return { ...base, size, pieceCount, minOverlapAtoms: Math.round(base.minOverlapAtoms * (pieceCount / base.pieceCount)) };
}

export function coverage(size: number, pieces: readonly TabletPiece[], placements: readonly (Placement | null)[]): Uint8Array {
  const counts = new Uint8Array(size * size * 4);
  pieces.forEach((piece, i) => {
    const p = placements[i];
    if (!p) return;
    for (const [dr, dc, dir] of SHAPES[piece.kind].atoms) {
      counts[atomIndex(size, p.r + dr, p.c + dc, dir)]!++;
    }
  });
  return counts;
}

export function litMask(counts: Uint8Array): Uint8Array {
  return counts.map((n) => n & 1);
}

export function fitsBoard(size: number, kind: ShapeKind, p: Placement): boolean {
  const s = SHAPES[kind];
  return p.r >= 0 && p.c >= 0 && p.r + s.height <= size && p.c + s.width <= size;
}

export function generateTablet(seed: number, difficulty: Difficulty, options: TabletOptions = {}): TabletSpec {
  const config = tabletConfig(difficulty, options);
  const rng = new Rng(seed);
  const kinds = config.kinds.filter((k) => SHAPES[k].width <= config.size);
  for (let attempt = 0; attempt < 5000; attempt++) {
    const pieces: TabletPiece[] = [];
    const solution: Placement[] = [];
    for (let i = 0; i < config.pieceCount; i++) {
      const kind = rng.pick(kinds);
      const s = SHAPES[kind];
      pieces.push({ id: i, kind });
      solution.push({ r: rng.int(config.size - s.height + 1), c: rng.int(config.size - s.width + 1) });
    }
    if (!validCandidate(config, pieces, solution)) continue;
    const target = litMask(coverage(config.size, pieces, solution));
    return { version: TABLET_VERSION, seed, difficulty, config, pieces, target, solution };
  }
  throw new Error(`could not generate tablet for seed ${seed} / ${difficulty}`);
}

function validCandidate(config: TabletConfig, pieces: TabletPiece[], solution: Placement[]): boolean {
  const seen = new Set<string>();
  for (let i = 0; i < pieces.length; i++) {
    const key = `${pieces[i]!.kind}@${solution[i]!.r},${solution[i]!.c}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  const counts = coverage(config.size, pieces, solution);
  let overlap = 0;
  let lit = 0;
  for (const n of counts) {
    if (n >= 2) overlap++;
    if (n & 1) lit++;
  }
  if (lit === 0 || overlap < config.minOverlapAtoms) return false;
  if (lit > config.maxLitRatio * counts.length) return false;
  for (let i = 0; i < pieces.length; i++) {
    const p = solution[i]!;
    const visible = SHAPES[pieces[i]!.kind].atoms.some(([dr, dc, dir]) => (counts[atomIndex(config.size, p.r + dr, p.c + dc, dir)]! & 1) === 1);
    if (!visible) return false;
  }
  return true;
}

export function isSolved(spec: TabletSpec, state: TabletState): boolean {
  if (state.some((p) => p === null)) return false;
  const lit = litMask(coverage(spec.config.size, spec.pieces, state));
  return lit.every((v, i) => v === spec.target[i]);
}

export function progress(spec: TabletSpec, state: TabletState): { matching: number; total: number } {
  const lit = litMask(coverage(spec.config.size, spec.pieces, state));
  let matching = 0;
  let total = 0;
  for (let i = 0; i < lit.length; i++) {
    if (spec.target[i]) {
      total++;
      if (lit[i]) matching++;
    }
  }
  return { matching, total };
}

export interface Hint {
  pieceId: number;
  placement: Placement;
}

export function hint(spec: TabletSpec, state: TabletState): Hint | null {
  const unmatched = new Set<number>(spec.solution.map((_, i) => i));
  const wrong: number[] = [];
  for (let i = 0; i < spec.pieces.length; i++) {
    const p = state[i];
    if (!p) {
      wrong.push(i);
      continue;
    }
    const kind = spec.pieces[i]!.kind;
    const match = [...unmatched].find((j) => spec.pieces[j]!.kind === kind && spec.solution[j]!.r === p.r && spec.solution[j]!.c === p.c);
    if (match === undefined) wrong.push(i);
    else unmatched.delete(match);
  }
  const pieceId = wrong.find((i) => state[i] !== null) ?? wrong[0];
  if (pieceId === undefined) return null;
  const kind = spec.pieces[pieceId]!.kind;
  const slot = [...unmatched].find((j) => spec.pieces[j]!.kind === kind);
  if (slot === undefined) return null;
  return { pieceId, placement: spec.solution[slot]! };
}
