import type { SudokuSpec } from '@puzzle-hustle/core';

// One outline per cage loop, in cell units, so the board can draw it as a single SVG path: a
// dashed line only runs around a corner without a seam if the corner belongs to the same path.
export interface CageShape {
  outlines: Outline[];
  colour: number;
  sum: CageSum;
}

export interface Outline {
  d: string;
  dash: string;
}

// The sum stands in a gap of the outline on the top edge of the cage's first cell, so it takes
// almost nothing from the digit or the marks below it. All values in cell units.
export interface CageSum {
  cell: number;
  value: number;
  left: number;
  top: number;
  width: number;
}

const N = 9;
const INSET = 0.11;
const RADIUS = 0.13;
const COLOURS = 5;
export const SUM_FONT = 0.27;
// Nunito's digits are a little under 0.6 em wide; the pad keeps the dashes off the number.
const DIGIT_WIDTH = 0.6 * SUM_FONT;
const SUM_PAD = 0.04;
// About 4.5 and 3.5 px on a phone-sized board; each outline stretches them slightly to fit.
const DASH = 0.1;
const GAP = 0.078;

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

// A quadratic corner from p0 over the cell corner c to p1, measured in a few straight steps.
function curveLength(p0: Pt, c: Pt, p1: Pt): number {
  let length = 0;
  let prev = p0;
  for (let k = 1; k <= 8; k++) {
    const t = k / 8;
    const u = 1 - t;
    const p: Pt = [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
    length += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }
  return length;
}

// With a gap, the outline stays open between x = a and x = b on the edge from loop[0] to
// loop[1] and starts at the far side of it, so both of its ends sit next to the number.
function outline(loop: Pt[], radius: number, gap?: [number, number]): Outline {
  const n = loop.length;
  let d = '';
  let length = 0;
  let at: Pt | undefined;
  const lineTo = (p: Pt) => {
    d += `${at ? 'L' : 'M'}${fmt(p)}`;
    if (at) length += Math.hypot(p[0] - at[0], p[1] - at[1]);
    at = p;
  };
  if (gap) lineTo([gap[1], loop[0]![1]]);
  const first = gap ? 1 : 0;
  for (let k = first; k < first + n; k++) {
    const i = k % n;
    const cur = loop[i]!;
    const from = between(cur, loop[(i - 1 + n) % n]!, radius);
    const to = between(cur, loop[(i + 1) % n]!, radius);
    lineTo(from);
    d += `Q${fmt(cur)} ${fmt(to)}`;
    length += curveLength(from, cur, to);
    at = to;
  }
  if (gap) {
    lineTo([gap[0], loop[0]![1]]);
    return { d, dash: dashes(length, false) };
  }
  const start = between(loop[0]!, loop[n - 1]!, radius);
  length += Math.hypot(start[0] - at![0], start[1] - at![1]);
  return { d: `${d}Z`, dash: dashes(length, true) };
}

// Stretch the pattern so a whole number of dashes fits: a closed outline meets itself without a
// seam, an open one starts and ends on a full dash at the number.
function dashes(length: number, closed: boolean): string {
  const period = DASH + GAP;
  const count = Math.max(1, Math.round((closed ? length : length + GAP) / period));
  const scale = (closed ? length : length + GAP) / (count * period);
  return `${round(DASH * scale)} ${round(GAP * scale)}`;
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
    shapes: spec.cages.map((cage, k) => {
      // The lowest index is the leftmost cell of the cage's top row, so its top left corner is
      // always a corner of the outline with the top edge running right from it.
      const cell = Math.min(...cage.cells);
      const x = (cell % N) + INSET;
      const y = Math.floor(cell / N) + INSET;
      const width = String(cage.sum).length * DIGIT_WIDTH + 2 * SUM_PAD;
      const outlines = loops(new Set(cage.cells)).map((loop) => {
        const pts = inset(corners(loop), INSET);
        const at = pts.findIndex((p) => Math.abs(p[0] - x) < 1e-9 && Math.abs(p[1] - y) < 1e-9);
        if (at < 0) return outline(pts, RADIUS);
        const rotated = [...pts.slice(at), ...pts.slice(0, at)];
        return outline(rotated, RADIUS, [x + RADIUS, Math.min(x + RADIUS + width, rotated[1]![0] - RADIUS)]);
      });
      return {
        colour: colour[k]!,
        outlines,
        sum: { cell, value: cage.sum, left: INSET + RADIUS, top: INSET, width },
      };
    }),
    colourOfCell: Array.from(cageOf, (k) => (k < 0 ? 0 : colour[k]!)),
  };
}
