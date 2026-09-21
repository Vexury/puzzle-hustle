import type { SudokuSpec } from '@puzzle-hustle/core';

// One outline per cage, in cell units, so the board can draw it as a single SVG path: a dashed
// line only runs around a corner without a seam if the corner belongs to the same path.
export interface CageShape {
  path: string;
  colour: number;
}

const N = 9;
const INSET = 0.11;
const RADIUS = 0.13;
const COLOURS = 5;

type Pt = [number, number];

const key = (p: Pt) => `${p[0]},${p[1]}`;

// Every boundary segment runs so that the cage lies to the right of it, which makes the loops
// turn the same way and the inset point the same way with them.
function segments(cells: Set<number>): Map<string, Pt[][]> {
  const out = new Map<string, Pt[][]>();
  const add = (a: Pt, b: Pt) => {
    const list = out.get(key(a));
    if (list) list.push([a, b]);
    else out.set(key(a), [[a, b]]);
  };
  for (const i of cells) {
    const r = Math.floor(i / N);
    const c = i % N;
    if (r === 0 || !cells.has(i - N)) add([c, r], [c + 1, r]);
    if (c === N - 1 || !cells.has(i + 1)) add([c + 1, r], [c + 1, r + 1]);
    if (r === N - 1 || !cells.has(i + N)) add([c + 1, r + 1], [c, r + 1]);
    if (c === 0 || !cells.has(i - 1)) add([c, r + 1], [c, r]);
  }
  return out;
}

function loops(cells: Set<number>): Pt[][] {
  const segs = segments(cells);
  const out: Pt[][] = [];
  for (;;) {
    let start: Pt[] | undefined;
    for (const list of segs.values()) {
      if (list.length) {
        start = list.shift();
        break;
      }
    }
    if (!start) return out;
    const first = start[0]!;
    const loop: Pt[] = [first];
    let cur = start[1]!;
    while (key(cur) !== key(first)) {
      loop.push(cur);
      const next = segs.get(key(cur))?.shift();
      if (!next) break;
      cur = next[1]!;
    }
    if (loop.length > 2) out.push(loop);
  }
}

// Keep the corners, drop the points where the line only continues straight.
function corners(loop: Pt[]): Pt[] {
  const n = loop.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p = loop[i]!;
    const a = loop[(i - 1 + n) % n]!;
    const b = loop[(i + 1) % n]!;
    if ((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0) out.push(p);
  }
  return out;
}

// Both edges at a corner are axis aligned and perpendicular, so their inset lines meet at the
// corner shifted by one inset along each inward normal.
function inset(loop: Pt[], by: number): Pt[] {
  const n = loop.length;
  return loop.map((p, i) => {
    const a = loop[(i - 1 + n) % n]!;
    const b = loop[(i + 1) % n]!;
    const inN = normal(a, p);
    const outN = normal(p, b);
    return [p[0] + by * (inN[0] + outN[0]), p[1] + by * (inN[1] + outN[1])] as Pt;
  });
}

function normal(a: Pt, b: Pt): Pt {
  const dx = Math.sign(b[0] - a[0]);
  const dy = Math.sign(b[1] - a[1]);
  return [-dy, dx];
}

function between(from: Pt, to: Pt, distance: number): Pt {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy) || 1;
  const t = Math.min(distance, length / 2) / length;
  return [from[0] + dx * t, from[1] + dy * t];
}

const fmt = (p: Pt) => `${round(p[0])} ${round(p[1])}`;
const round = (v: number) => Math.round(v * 1000) / 1000;

function path(loop: Pt[], radius: number): string {
  const n = loop.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const cur = loop[i]!;
    const from = between(cur, loop[(i - 1 + n) % n]!, radius);
    const to = between(cur, loop[(i + 1) % n]!, radius);
    d += `${i === 0 ? 'M' : 'L'}${fmt(from)}Q${fmt(cur)} ${fmt(to)}`;
  }
  return `${d}Z`;
}

// Neighbouring cages never share a colour, otherwise the line would read as one cage.
function colours(cageOf: Int16Array, count: number): number[] {
  const adjacent: Set<number>[] = Array.from({ length: count }, () => new Set<number>());
  for (let i = 0; i < N * N; i++) {
    const k = cageOf[i]!;
    if (k < 0) continue;
    for (const n of [i % N === N - 1 ? -1 : i + 1, i + N]) {
      const j = n >= 0 && n < N * N ? cageOf[n]! : -1;
      if (j >= 0 && j !== k) {
        adjacent[k]!.add(j);
        adjacent[j]!.add(k);
      }
    }
  }
  const out = Array.from({ length: count }, () => 0);
  for (let k = 0; k < count; k++) {
    const taken = new Set<number>();
    for (const j of adjacent[k]!) if (j < k) taken.add(out[j]!);
    // Start the search at a rotating offset, otherwise the low indices carry every board and the
    // last colours never appear.
    let c = k % COLOURS;
    for (let step = 0; step < COLOURS && taken.has(c); step++) c = (c + 1) % COLOURS;
    out[k] = c;
  }
  return out;
}

export interface CageLayout {
  shapes: CageShape[];
  colourOfCell: number[];
}

export function cageLayout(spec: SudokuSpec): CageLayout {
  const cageOf = new Int16Array(N * N).fill(-1);
  spec.cages.forEach((cage, k) => {
    for (const i of cage.cells) cageOf[i] = k;
  });
  const colour = colours(cageOf, spec.cages.length);
  return {
    shapes: spec.cages.map((cage, k) => ({
      colour: colour[k]!,
      path: loops(new Set(cage.cells))
        .map((loop) => path(inset(corners(loop), INSET), RADIUS))
        .join(''),
    })),
    colourOfCell: Array.from(cageOf, (k) => (k < 0 ? 0 : colour[k]!)),
  };
}
