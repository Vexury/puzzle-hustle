import { SHAPES, atomIndex, type ShapeKind } from './shapes.ts';
import { coverage, litMask, type Placement, type ShapesSpec } from './puzzle.ts';

export interface SolveResult {
  solutions: number;
  nodes: number;
  exhausted: boolean;
}

interface Candidate {
  placement: Placement;
  atoms: number[];
}

function candidates(size: number, kind: ShapeKind): Candidate[] {
  const s = SHAPES[kind];
  const out: Candidate[] = [];
  for (let r = 0; r + s.height <= size; r++) {
    for (let c = 0; c + s.width <= size; c++) {
      out.push({ placement: { r, c }, atoms: s.atoms.map(([dr, dc, dir]) => atomIndex(size, r + dr, c + dc, dir)) });
    }
  }
  return out;
}

export function countSolutions(spec: ShapesSpec, limit = 2, nodeBudget = 5_000_000): SolveResult {
  const size = spec.config.size;
  const total = size * size * 4;
  const order = spec.pieces
    .map((p, i) => ({ i, kind: p.kind, area: SHAPES[p.kind].atoms.length }))
    .sort((a, b) => b.area - a.area || a.kind.localeCompare(b.kind) || a.i - b.i);
  const n = order.length;
  const cands = order.map((o) => candidates(size, o.kind));
  const reach: Uint8Array[] = Array.from({ length: n + 1 }, () => new Uint8Array(total));
  for (let i = n - 1; i >= 0; i--) {
    reach[i]!.set(reach[i + 1]!);
    for (const c of cands[i]!) for (const a of c.atoms) reach[i]![a] = 1;
  }
  const frozen: number[][] = [];
  for (let i = 0; i < n; i++) {
    const f: number[] = [];
    for (let a = 0; a < total; a++) if (reach[i]![a] && !reach[i + 1]![a]) f.push(a);
    frozen.push(f);
  }
  const target = spec.target;
  for (let a = 0; a < total; a++) if (target[a] && !reach[0]![a]) return { solutions: 0, nodes: 0, exhausted: false };

  const remainingArea = new Int32Array(n + 1);
  for (let i = n - 1; i >= 0; i--) remainingArea[i] = remainingArea[i + 1]! + order[i]!.area;

  const parity = new Uint8Array(total);
  let wrong = 0;
  for (let a = 0; a < total; a++) if (target[a]) wrong++;
  let solutions = 0;
  let nodes = 0;
  let exhausted = false;
  const chosen = new Int32Array(n).fill(-1);

  function flip(atoms: number[]) {
    for (const a of atoms) {
      const v = (parity[a]! ^ 1) as 0 | 1;
      parity[a] = v;
      wrong += v === target[a] ? -1 : 1;
    }
  }

  function dfs(i: number): boolean {
    if (i === n) {
      solutions++;
      return solutions >= limit;
    }
    const sameAsPrev = i > 0 && order[i]!.kind === order[i - 1]!.kind;
    const startIdx = sameAsPrev ? chosen[i - 1]! : 0;
    const list = cands[i]!;
    const f = frozen[i]!;
    for (let k = startIdx; k < list.length; k++) {
      nodes++;
      if (nodes > nodeBudget) {
        exhausted = true;
        return true;
      }
      const atoms = list[k]!.atoms;
      flip(atoms);
      let ok = wrong <= remainingArea[i + 1]!;
      if (ok) {
        for (const a of f) {
          if (parity[a] !== target[a]) {
            ok = false;
            break;
          }
        }
      }
      if (ok) {
        chosen[i] = k;
        if (dfs(i + 1)) {
          flip(atoms);
          return true;
        }
      }
      flip(atoms);
    }
    return false;
  }

  dfs(0);
  return { solutions, nodes, exhausted };
}

export function isUnique(spec: ShapesSpec, nodeBudget = 5_000_000): boolean {
  const r = countSolutions(spec, 2, nodeBudget);
  return r.solutions === 1 && !r.exhausted;
}

export interface DifficultyReport {
  score: number;
  nodes: number;
  overlapRatio: number;
  fragmented: number;
}

export function difficultyReport(spec: ShapesSpec, nodeBudget = 5_000_000): DifficultyReport {
  const size = spec.config.size;
  const counts = coverage(size, spec.pieces, spec.solution);
  let overlap = 0;
  let lit = 0;
  for (const c of counts) {
    if (c >= 2) overlap++;
    if (c & 1) lit++;
  }
  const overlapRatio = lit === 0 ? 0 : overlap / lit;
  let fragmented = 0;
  const target = litMask(counts);
  spec.pieces.forEach((piece, i) => {
    const p = spec.solution[i]!;
    const atoms = SHAPES[piece.kind].atoms;
    const visible = atoms.filter(([dr, dc, dir]) => target[atomIndex(size, p.r + dr, p.c + dc, dir)] === 1).length;
    if (visible < atoms.length / 2) fragmented++;
  });
  const { nodes } = countSolutions(spec, Number.MAX_SAFE_INTEGER, nodeBudget);
  const score = Math.log2(nodes + 1) * 10 + overlapRatio * 25 + fragmented * 4;
  return { score: Math.round(score * 10) / 10, nodes, overlapRatio, fragmented };
}

type Sym = (r: number, c: number, dir: number, n: number) => [number, number, number];

const rotCw: Sym = (r, c, dir, n) => [c, n - 1 - r, (dir + 1) % 4];
const flipH: Sym = (r, c, dir, n) => [r, n - 1 - c, dir === 1 ? 3 : dir === 3 ? 1 : dir];

const KIND_ROT: Record<ShapeKind, ShapeKind> = {
  sq1: 'sq1', sq2: 'sq2', dia1: 'dia1', dia2: 'dia2',
  'tri-nw': 'tri-ne', 'tri-ne': 'tri-se', 'tri-se': 'tri-sw', 'tri-sw': 'tri-nw',
  'tri2-nw': 'tri2-ne', 'tri2-ne': 'tri2-se', 'tri2-se': 'tri2-sw', 'tri2-sw': 'tri2-nw',
};
const KIND_FLIP: Record<ShapeKind, ShapeKind> = {
  sq1: 'sq1', sq2: 'sq2', dia1: 'dia1', dia2: 'dia2',
  'tri-nw': 'tri-ne', 'tri-ne': 'tri-nw', 'tri-se': 'tri-sw', 'tri-sw': 'tri-se',
  'tri2-nw': 'tri2-ne', 'tri2-ne': 'tri2-nw', 'tri2-se': 'tri2-sw', 'tri2-sw': 'tri2-se',
};

export function canonicalKey(spec: ShapesSpec): string {
  const n = spec.config.size;
  const total = n * n * 4;
  let best = '';
  let kinds = spec.pieces.map((p) => p.kind);
  let map = (r: number, c: number, dir: number): [number, number, number] => [r, c, dir];
  const variants: { kinds: ShapeKind[]; map: typeof map }[] = [];
  for (let flip = 0; flip < 2; flip++) {
    for (let rot = 0; rot < 4; rot++) {
      variants.push({ kinds, map });
      const prev = map;
      map = (r, c, dir) => {
        const [r1, c1, d1] = prev(r, c, dir);
        return rotCw(r1, c1, d1, n);
      };
      kinds = kinds.map((k) => KIND_ROT[k]);
    }
    const prev = map;
    map = (r, c, dir) => {
      const [r1, c1, d1] = prev(r, c, dir);
      return flipH(r1, c1, d1, n);
    };
    kinds = kinds.map((k) => KIND_FLIP[k]);
  }
  for (const v of variants) {
    const bits = new Uint8Array(total);
    for (let a = 0; a < total; a++) {
      if (!spec.target[a]) continue;
      const cell = Math.floor(a / 4);
      const [r, c, d] = v.map(Math.floor(cell / n), cell % n, a % 4);
      bits[atomIndex(n, r, c, d as 0 | 1 | 2 | 3)] = 1;
    }
    const key = `${n}|${[...v.kinds].sort().join(',')}|${Array.from(bits).join('')}`;
    if (best === '' || key < best) best = key;
  }
  return best;
}
