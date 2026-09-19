import { Rng } from '../rng.ts';
import type { Difficulty } from '../types.ts';
import { SHAPES, atomIndex, type AtomOffset, type ShapeKind } from './shapes.ts';

export const SHAPES_VERSION = 2;

export interface ShapesPreset {
  inner: number;
  pieceCount: number;
  kinds: readonly ShapeKind[];
  minOverlapAtoms: number;
  maxLitRatio: number;
}

export interface ShapesConfig extends ShapesPreset {
  size: number;
  margin: number;
}

export interface Placement {
  r: number;
  c: number;
}

export interface ShapesPiece {
  id: number;
  kind: ShapeKind;
}

export interface ShapesSpec {
  version: number;
  seed: number;
  difficulty: Difficulty;
  config: ShapesConfig;
  pieces: ShapesPiece[];
  target: Uint8Array;
  solution: Placement[];
  start: Placement[];
}

export type ShapesState = Placement[];

const SMALL: ShapeKind[] = ['sq1', 'tri-nw', 'tri-ne', 'tri-se', 'tri-sw', 'dia1'];
const MEDIUM: ShapeKind[] = [...SMALL, 'sq2', 'tri2-nw', 'tri2-ne', 'tri2-se', 'tri2-sw'];
const ALL: ShapeKind[] = [...MEDIUM, 'dia2'];

export const SHAPES_MARGIN = 1;

export const SHAPES_PRESETS: Record<Difficulty, ShapesPreset> = {
  easy: { inner: 3, pieceCount: 3, kinds: SMALL, minOverlapAtoms: 1, maxLitRatio: 0.8 },
  medium: { inner: 4, pieceCount: 4, kinds: MEDIUM, minOverlapAtoms: 2, maxLitRatio: 0.75 },
  hard: { inner: 5, pieceCount: 6, kinds: MEDIUM, minOverlapAtoms: 6, maxLitRatio: 0.7 },
  genius: { inner: 6, pieceCount: 8, kinds: ALL, minOverlapAtoms: 12, maxLitRatio: 0.7 },
};

export interface ShapesOptions {
  sizeDelta?: number;
  pieceDelta?: number;
}

export function shapesConfig(difficulty: Difficulty, options: ShapesOptions = {}): ShapesConfig {
  const base = SHAPES_PRESETS[difficulty];
  const inner = base.inner + (options.sizeDelta ?? 0);
  const pieceCount = base.pieceCount + (options.pieceDelta ?? 0);
  return {
    ...base,
    inner,
    margin: SHAPES_MARGIN,
    size: inner + 2 * SHAPES_MARGIN,
    pieceCount,
    minOverlapAtoms: Math.round(base.minOverlapAtoms * (pieceCount / base.pieceCount)),
  };
}

export function coverage(size: number, pieces: readonly ShapesPiece[], placements: readonly (Placement | null)[]): Uint8Array {
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

export function generateShapes(seed: number, difficulty: Difficulty, options: ShapesOptions = {}): ShapesSpec {
  const config = shapesConfig(difficulty, options);
  const rng = new Rng(seed);
  const kinds = config.kinds.filter((k) => SHAPES[k].width <= config.inner);
  const m = config.margin;
  for (let attempt = 0; attempt < 5000; attempt++) {
    const pieces: ShapesPiece[] = [];
    const solution: Placement[] = [];
    for (let i = 0; i < config.pieceCount; i++) {
      const kind = rng.pick(kinds);
      const s = SHAPES[kind];
      pieces.push({ id: i, kind });
      solution.push({ r: m + rng.int(config.inner - s.height + 1), c: m + rng.int(config.inner - s.width + 1) });
    }
    if (!validCandidate(config, pieces, solution)) continue;
    const target = litMask(coverage(config.size, pieces, solution));
    const start = startLayout(config, pieces, target, rng);
    return { version: SHAPES_VERSION, seed, difficulty, config, pieces, target, solution, start };
  }
  throw new Error(`could not generate shapes for seed ${seed} / ${difficulty}`);
}

export function inInner(config: ShapesConfig, r: number, c: number): boolean {
  return r >= config.margin && c >= config.margin && r < config.margin + config.inner && c < config.margin + config.inner;
}

function startLayout(config: ShapesConfig, pieces: ShapesPiece[], target: Uint8Array, rng: Rng): Placement[] {
  const size = config.size;
  const order = rng.shuffle(pieces.map((_, i) => i));
  const occupied = new Uint8Array(size * size * 4);
  const start: Placement[] = pieces.map(() => ({ r: 0, c: 0 }));
  for (const i of order) {
    const s = SHAPES[pieces[i]!.kind];
    const ring: Placement[] = [];
    const clear: Placement[] = [];
    const free: Placement[] = [];
    for (let r = 0; r + s.height <= size; r++) {
      for (let c = 0; c + s.width <= size; c++) {
        if (!s.atoms.every(([dr, dc, dir]) => occupied[atomIndex(size, r + dr, c + dc, dir)] === 0)) continue;
        free.push({ r, c });
        if (s.atoms.every(([dr, dc]) => !inInner(config, r + dr, c + dc))) ring.push({ r, c });
        else if (s.atoms.every(([dr, dc, dir]) => target[atomIndex(size, r + dr, c + dc, dir)] === 0)) clear.push({ r, c });
      }
    }
    const p =
      ring.length > 0 ? rng.pick(ring)
      : clear.length > 0 ? rng.pick(clear)
      : free.length > 0 ? rng.pick(leastCovering(size, s.atoms, target, free))
      : { r: rng.int(size - s.height + 1), c: rng.int(size - s.width + 1) };
    start[i] = p;
    for (const [dr, dc, dir] of s.atoms) occupied[atomIndex(size, p.r + dr, p.c + dc, dir)] = 1;
  }
  const lit = litMask(coverage(size, pieces, start));
  if (lit.every((v, i) => v === target[i])) {
    const i = order[0]!;
    const s = SHAPES[pieces[i]!.kind];
    const p = start[i]!;
    start[i] = p.c + s.width < size ? { r: p.r, c: p.c + 1 } : p.r + s.height < size ? { r: p.r + 1, c: p.c } : { r: 0, c: 0 };
  }
  return start;
}

function leastCovering(size: number, atoms: readonly AtomOffset[], target: Uint8Array, places: Placement[]): Placement[] {
  let best = Infinity;
  let out: Placement[] = [];
  for (const p of places) {
    const n = atoms.reduce((k, [dr, dc, dir]) => k + target[atomIndex(size, p.r + dr, p.c + dc, dir)]!, 0);
    if (n < best) { best = n; out = [p]; } else if (n === best) out.push(p);
  }
  return out;
}

function validCandidate(config: ShapesConfig, pieces: ShapesPiece[], solution: Placement[]): boolean {
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
  if (lit > config.maxLitRatio * config.inner * config.inner * 4) return false;
  for (let i = 0; i < pieces.length; i++) {
    const p = solution[i]!;
    const visible = SHAPES[pieces[i]!.kind].atoms.some(([dr, dc, dir]) => (counts[atomIndex(config.size, p.r + dr, p.c + dc, dir)]! & 1) === 1);
    if (!visible) return false;
  }
  return true;
}

export function isSolved(spec: ShapesSpec, state: ShapesState): boolean {
  const lit = litMask(coverage(spec.config.size, spec.pieces, state));
  return lit.every((v, i) => v === spec.target[i]);
}

export function progress(spec: ShapesSpec, state: ShapesState): { matching: number; total: number } {
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

export function hint(spec: ShapesSpec, state: ShapesState): Hint | null {
  const unmatched = new Set<number>(spec.solution.map((_, i) => i));
  const wrong: number[] = [];
  for (let i = 0; i < spec.pieces.length; i++) {
    const p = state[i]!;
    const kind = spec.pieces[i]!.kind;
    const match = [...unmatched].find((j) => spec.pieces[j]!.kind === kind && spec.solution[j]!.r === p.r && spec.solution[j]!.c === p.c);
    if (match === undefined) wrong.push(i);
    else unmatched.delete(match);
  }
  const pieceId = wrong[0];
  if (pieceId === undefined) return null;
  const kind = spec.pieces[pieceId]!.kind;
  const slot = [...unmatched].find((j) => spec.pieces[j]!.kind === kind);
  if (slot === undefined) return null;
  return { pieceId, placement: spec.solution[slot]! };
}
