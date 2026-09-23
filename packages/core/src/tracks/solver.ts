import type { TracksSpec } from './puzzle.ts';

export const TRACK_N = 1;
export const TRACK_E = 2;
export const TRACK_S = 4;
export const TRACK_W = 8;
const DIR_BITS = [TRACK_N, TRACK_E, TRACK_S, TRACK_W] as const;

export interface TracksPuzzle {
  config: { cols: number; rows: number };
  rowCounts: Uint8Array;
  colCounts: Uint8Array;
  entryRow: number;
  exitCol: number;
  given: Uint8Array;
}

export interface TracksSolveResult {
  solved: boolean;
  contradiction: boolean;
  steps: [number, number, number];
  masks: Uint8Array;
}

const UNKNOWN = 0;
const YES = 1;
const NO = 2;
const TRACK = 1;
const EMPTY = 2;

// Horizontal edges first, (r,c)-(r,c+1) at r*(cols-1)+c, then vertical ones, (r,c)-(r+1,c) at
// base + r*cols + c. cellEdges lists each cell's edge per direction N, E, S, W, -1 at the rim.
interface Grid {
  cols: number;
  rows: number;
  cells: number;
  edgeCount: number;
  cellEdges: Int32Array;
  edgeCells: Int32Array;
  outside: Uint8Array;
}

export function tracksOutside(p: TracksPuzzle, cell: number): number {
  const { cols, rows } = p.config;
  let m = 0;
  if (cell === p.entryRow * cols) m |= TRACK_W;
  if (cell === (rows - 1) * cols + p.exitCol) m |= TRACK_S;
  return m;
}

function buildGrid(p: TracksPuzzle): Grid {
  const { cols, rows } = p.config;
  const cells = cols * rows;
  const base = rows * (cols - 1);
  const edgeCount = base + (rows - 1) * cols;
  const cellEdges = new Int32Array(cells * 4).fill(-1);
  const edgeCells = new Int32Array(edgeCount * 2);
  const outside = new Uint8Array(cells);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      outside[i] = tracksOutside(p, i);
      if (r > 0) cellEdges[i * 4] = base + (r - 1) * cols + c;
      if (c < cols - 1) cellEdges[i * 4 + 1] = r * (cols - 1) + c;
      if (r < rows - 1) cellEdges[i * 4 + 2] = base + r * cols + c;
      if (c > 0) cellEdges[i * 4 + 3] = r * (cols - 1) + c - 1;
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const e = r * (cols - 1) + c;
      edgeCells[e * 2] = r * cols + c;
      edgeCells[e * 2 + 1] = r * cols + c + 1;
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const e = base + r * cols + c;
      edgeCells[e * 2] = r * cols + c;
      edgeCells[e * 2 + 1] = (r + 1) * cols + c;
    }
  }
  return { cols, rows, cells, edgeCount, cellEdges, edgeCells, outside };
}

function popcount(m: number): number {
  let n = 0;
  for (; m; m &= m - 1) n++;
  return n;
}

class Propagator {
  assigned = 0;
  private readonly total: number;
  readonly g: Grid;
  readonly p: TracksPuzzle;
  readonly edges: Uint8Array;
  readonly cells: Uint8Array;

  constructor(g: Grid, p: TracksPuzzle, edges: Uint8Array, cells: Uint8Array) {
    this.g = g;
    this.p = p;
    this.edges = edges;
    this.cells = cells;
    let t = 0;
    for (const n of p.rowCounts) t += n;
    this.total = t;
  }

  clone(): Propagator {
    return new Propagator(this.g, this.p, this.edges.slice(), this.cells.slice());
  }

  setEdge(e: number, v: number): boolean {
    const cur = this.edges[e]!;
    if (cur === v) return true;
    if (cur !== UNKNOWN) return false;
    this.edges[e] = v;
    this.assigned++;
    return true;
  }

  setCell(i: number, v: number): boolean {
    const cur = this.cells[i]!;
    if (cur === v) return true;
    if (cur !== UNKNOWN) return false;
    this.cells[i] = v;
    this.assigned++;
    return true;
  }

  // Tier 1a: a track cell has exactly two connections, an empty one none.
  private cellRule(i: number): boolean {
    const { cellEdges, outside } = this.g;
    let yes = popcount(outside[i]!);
    let unk = 0;
    for (let d = 0; d < 4; d++) {
      const e = cellEdges[i * 4 + d]!;
      if (e < 0) continue;
      const v = this.edges[e]!;
      if (v === YES) yes++;
      else if (v === UNKNOWN) unk++;
    }
    if (yes > 2) return false;
    if (yes > 0 && !this.setCell(i, TRACK)) return false;
    const state = this.cells[i]!;
    let fill = UNKNOWN;
    if (state === EMPTY) fill = NO;
    else if (state === TRACK) {
      if (yes + unk < 2) return false;
      if (yes === 2) fill = NO;
      else if (yes + unk === 2) fill = YES;
    } else if (yes + unk < 2) {
      if (!this.setCell(i, EMPTY)) return false;
      fill = NO;
    }
    if (fill === UNKNOWN || unk === 0) return true;
    for (let d = 0; d < 4; d++) {
      const e = cellEdges[i * 4 + d]!;
      if (e >= 0 && this.edges[e] === UNKNOWN && !this.setEdge(e, fill)) return false;
    }
    return true;
  }

  // Tier 1b: a row or column holds exactly its number of track cells.
  private lineRule(members: number[], clue: number): boolean {
    let track = 0;
    let unk = 0;
    for (const i of members) {
      const v = this.cells[i]!;
      if (v === TRACK) track++;
      else if (v === UNKNOWN) unk++;
    }
    if (track > clue || track + unk < clue) return false;
    if (unk === 0) return true;
    const fill = track === clue ? EMPTY : track + unk === clue ? TRACK : UNKNOWN;
    if (fill === UNKNOWN) return true;
    for (const i of members) if (this.cells[i] === UNKNOWN && !this.setCell(i, fill)) return false;
    return true;
  }

  private tier1(): boolean {
    const { cols, rows, cells } = this.g;
    for (let i = 0; i < cells; i++) if (!this.cellRule(i)) return false;
    for (let r = 0; r < rows; r++) {
      const members: number[] = [];
      for (let c = 0; c < cols; c++) members.push(r * cols + c);
      if (!this.lineRule(members, this.p.rowCounts[r]!)) return false;
    }
    for (let c = 0; c < cols; c++) {
      const members: number[] = [];
      for (let r = 0; r < rows; r++) members.push(r * cols + c);
      if (!this.lineRule(members, this.p.colCounts[c]!)) return false;
    }
    return true;
  }

  // Tier 2a: the track is one path. An edge inside one piece of track closes a loop, and an
  // edge joining the piece from A to the piece from B finishes the track, which is only
  // allowed if that uses every track cell.
  private loopRule(): boolean {
    const { cells, edgeCount, edgeCells, cols, rows } = this.g;
    const parent = new Int32Array(cells);
    const size = new Int32Array(cells).fill(1);
    for (let i = 0; i < cells; i++) parent[i] = i;
    const find = (x: number): number => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]!]!;
        x = parent[x]!;
      }
      return x;
    };
    for (let e = 0; e < edgeCount; e++) {
      if (this.edges[e] !== YES) continue;
      const a = find(edgeCells[e * 2]!);
      const b = find(edgeCells[e * 2 + 1]!);
      if (a === b) return false;
      parent[a] = b;
      size[b]! += size[a]!;
    }
    const aCell = this.p.entryRow * cols;
    const bCell = (rows - 1) * cols + this.p.exitCol;
    if (find(aCell) === find(bCell) && size[find(aCell)]! < this.total) return false;
    for (let e = 0; e < edgeCount; e++) {
      if (this.edges[e] !== UNKNOWN) continue;
      const a = find(edgeCells[e * 2]!);
      const b = find(edgeCells[e * 2 + 1]!);
      if (a === b) {
        if (!this.setEdge(e, NO)) return false;
        continue;
      }
      const ra = find(aCell);
      const rb = find(bCell);
      const joinsEnds = (a === ra && b === rb) || (a === rb && b === ra);
      if (joinsEnds && size[a]! + size[b]! < this.total && !this.setEdge(e, NO)) return false;
    }
    return true;
  }

  // Tier 2b: a cut across the board is crossed an odd number of times when A and B lie on
  // different sides of it, an even number otherwise. A sits left of every column cut and
  // above the row cuts from its own row down; B sits below every row cut.
  private parityRule(): boolean {
    const { cols, rows } = this.g;
    const base = rows * (cols - 1);
    const check = (edgeIds: number[], odd: boolean): boolean => {
      let yes = 0;
      let open = -1;
      let unk = 0;
      for (const e of edgeIds) {
        const v = this.edges[e]!;
        if (v === YES) yes++;
        else if (v === UNKNOWN) {
          unk++;
          open = e;
        }
      }
      if (unk === 0) return (yes % 2 === 1) === odd;
      if (unk === 1) return this.setEdge(open, (yes % 2 === 1) === odd ? NO : YES);
      return true;
    };
    for (let r = 0; r < rows - 1; r++) {
      const ids: number[] = [];
      for (let c = 0; c < cols; c++) ids.push(base + r * cols + c);
      if (!check(ids, this.p.entryRow <= r)) return false;
    }
    for (let c = 0; c < cols - 1; c++) {
      const ids: number[] = [];
      for (let r = 0; r < rows; r++) ids.push(r * (cols - 1) + c);
      if (!check(ids, this.p.exitCol > c)) return false;
    }
    return true;
  }

  // Tier 3: assume a value for one open edge, run tiers 1 and 2, and keep the opposite if the
  // assumption breaks. One step of lookahead, never deeper.
  private probe(): 'changed' | 'stuck' | 'contradiction' {
    for (let e = 0; e < this.g.edgeCount; e++) {
      if (this.edges[e] !== UNKNOWN) continue;
      for (const v of [YES, NO]) {
        const trial = this.clone();
        trial.setEdge(e, v);
        if (trial.propagate(2, [0, 0, 0])) continue;
        return this.setEdge(e, v === YES ? NO : YES) ? 'changed' : 'contradiction';
      }
    }
    return 'stuck';
  }

  propagate(maxTier: 1 | 2 | 3, steps: [number, number, number]): boolean {
    for (;;) {
      let before = this.assigned;
      if (!this.tier1()) return false;
      if (this.assigned !== before) {
        steps[0] += this.assigned - before;
        continue;
      }
      if (maxTier < 2) return true;
      before = this.assigned;
      if (!this.loopRule() || !this.parityRule()) return false;
      if (this.assigned !== before) {
        steps[1] += this.assigned - before;
        continue;
      }
      if (maxTier < 3) return true;
      const outcome = this.probe();
      if (outcome === 'contradiction') return false;
      if (outcome === 'stuck') return true;
      steps[2]++;
    }
  }

  open(): number {
    return this.edges.indexOf(UNKNOWN);
  }

  masks(): Uint8Array {
    const { cells, cellEdges, outside } = this.g;
    const out = new Uint8Array(cells);
    for (let i = 0; i < cells; i++) {
      let m = outside[i]!;
      for (let d = 0; d < 4; d++) {
        const e = cellEdges[i * 4 + d]!;
        if (e >= 0 && this.edges[e] === YES) m |= DIR_BITS[d]!;
      }
      out[i] = m;
    }
    return out;
  }
}

function start(p: TracksPuzzle): { prop: Propagator; ok: boolean } {
  const g = buildGrid(p);
  const prop = new Propagator(g, p, new Uint8Array(g.edgeCount), new Uint8Array(g.cells));
  let ok = true;
  for (let i = 0; i < g.cells && ok; i++) {
    const m = p.given[i]!;
    if (!m) continue;
    ok = prop.setCell(i, TRACK);
    for (let d = 0; d < 4 && ok; d++) {
      const e = g.cellEdges[i * 4 + d]!;
      if (e < 0) continue;
      ok = prop.setEdge(e, m & DIR_BITS[d]! ? YES : NO);
    }
  }
  prop.assigned = 0;
  return { prop, ok };
}

export function solveTracks(p: TracksPuzzle, maxTier: 1 | 2 | 3): TracksSolveResult {
  const steps: [number, number, number] = [0, 0, 0];
  const { prop, ok } = start(p);
  if (!ok || !prop.propagate(maxTier, steps)) return { solved: false, contradiction: true, steps, masks: prop.masks() };
  return { solved: prop.open() < 0, contradiction: false, steps, masks: prop.masks() };
}

export function countTracksSolutions(p: TracksPuzzle, limit = 2, maxNodes = 200_000): { count: number; complete: boolean } {
  const { prop, ok } = start(p);
  if (!ok) return { count: 0, complete: true };
  let count = 0;
  let nodes = 0;
  const walk = (s: Propagator): void => {
    if (count >= limit || nodes >= maxNodes) return;
    nodes++;
    if (!s.propagate(2, [0, 0, 0])) return;
    const e = s.open();
    if (e < 0) {
      count++;
      return;
    }
    for (const v of [YES, NO]) {
      const next = s.clone();
      next.setEdge(e, v);
      walk(next);
    }
  };
  walk(prop);
  return { count, complete: nodes < maxNodes };
}

export function tracksGivenCount(spec: TracksPuzzle): number {
  let n = 0;
  for (const m of spec.given) if (m) n++;
  return n;
}

export interface TracksDifficultyReport {
  score: number;
  steps: [number, number, number];
  cells: number;
  givens: number;
  length: number;
  turns: number;
}

function pathTurns(path: ArrayLike<number>): number {
  let turns = 0;
  for (let i = 2; i < path.length; i++) if (path[i]! - path[i - 1]! !== path[i - 1]! - path[i - 2]!) turns++;
  return turns;
}

export function tracksDifficultyReport(spec: TracksSpec): TracksDifficultyReport {
  const res = solveTracks(spec, 3);
  const [t1, t2, t3] = res.steps;
  const cells = spec.config.cols * spec.config.rows;
  const givens = tracksGivenCount(spec);
  const turns = pathTurns(spec.path);
  const score = t1 * 0.2 + t2 * 1.5 + t3 * 6 + Math.log2(cells) * 2 + spec.path.length * 0.3 + turns * 0.2 - givens * 2;
  return { score: Math.round(score * 10) / 10, steps: res.steps, cells, givens, length: spec.path.length, turns };
}

// A and B pin the orientation, so no board has a mirror twin to fold onto.
export function tracksCanonicalKey(spec: TracksPuzzle): string {
  const { cols, rows } = spec.config;
  const given = [...spec.given].map((m) => m.toString(16)).join('');
  return `tracks${cols}x${rows}|${spec.entryRow}|${spec.exitCol}|${[...spec.rowCounts].join('.')}|${[...spec.colCounts].join('.')}|${given}`;
}

// Vocabulary: how winding the track is, how long it runs, how many pieces are handed over.
export function tracksFamilyKey(spec: TracksSpec): string {
  const r = tracksDifficultyReport(spec);
  return `t${r.turns}/l${Math.round(r.length / 3)}/g${r.givens}`;
}
