import type { ZipSpec } from './puzzle.ts';

export interface ZipPuzzle {
  config: { size: number };
  numbers: Uint8Array;
  walls: Uint8Array;
}

export const ZIP_DIRS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
];

export function zipNeighborTable(size: number, walls: Uint8Array): Int16Array {
  const table = new Int16Array(size * size * 4).fill(-1);
  for (let i = 0; i < size * size; i++) {
    const r = Math.floor(i / size);
    const c = i % size;
    for (let d = 0; d < 4; d++) {
      if (walls[i]! & (1 << d)) continue;
      const rr = r + ZIP_DIRS[d]![0];
      const cc = c + ZIP_DIRS[d]![1];
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
      table[i * 4 + d] = rr * size + cc;
    }
  }
  return table;
}

export interface ZipCount {
  solutions: number;
  nodes: number;
  exhausted: boolean;
}

export function enumerateZipSolutions(puzzle: ZipPuzzle, limit: number, maxNodes: number, onSolution: (path: readonly number[]) => void): ZipCount {
  const n = puzzle.config.size;
  const total = n * n;
  const numbers = puzzle.numbers;
  const nb = zipNeighborTable(n, puzzle.walls);
  let start = -1;
  let end = -1;
  let k = 0;
  for (let i = 0; i < total; i++) {
    const v = numbers[i]!;
    if (v === 1) start = i;
    if (v > k) {
      k = v;
      end = i;
    }
  }
  if (start < 0 || end < 0) return { solutions: 0, nodes: 0, exhausted: false };
  const visited = new Uint8Array(total);
  const path: number[] = [start];
  const queue = new Int32Array(total);
  const seen = new Uint32Array(total);
  let stamp = 0;
  let solutions = 0;
  let nodes = 0;
  let exhausted = false;

  function feasible(head: number, remaining: number): boolean {
    if (remaining === 0) return true;
    stamp++;
    let qh = 0;
    let qt = 0;
    let reached = 0;
    let leaves = 0;
    seen[head] = stamp;
    queue[qt++] = head;
    while (qh < qt) {
      const cur = queue[qh++]!;
      if (cur !== head) {
        reached++;
        let deg = 0;
        for (let d = 0; d < 4; d++) {
          const j = nb[cur * 4 + d]!;
          if (j >= 0 && (!visited[j] || j === head)) deg++;
        }
        if (deg === 0) return false;
        if (deg === 1) {
          if (cur !== end || ++leaves > 1) return false;
        }
      }
      for (let d = 0; d < 4; d++) {
        const j = nb[cur * 4 + d]!;
        if (j < 0 || visited[j] || seen[j] === stamp) continue;
        seen[j] = stamp;
        queue[qt++] = j;
      }
    }
    return reached === remaining;
  }

  function search(head: number, next: number, remaining: number): void {
    if (remaining === 0) {
      solutions++;
      onSolution(path);
      return;
    }
    if (!feasible(head, remaining)) return;
    for (let d = 0; d < 4; d++) {
      if (solutions >= limit || exhausted) return;
      const j = nb[head * 4 + d]!;
      if (j < 0 || visited[j]) continue;
      const v = numbers[j]!;
      let nextAfter = next;
      if (v !== 0) {
        if (v !== next) continue;
        if (v === k && remaining !== 1) continue;
        nextAfter = next + 1;
      } else if (remaining === 1) {
        continue;
      }
      if (++nodes > maxNodes) {
        exhausted = true;
        return;
      }
      visited[j] = 1;
      path.push(j);
      search(j, nextAfter, remaining - 1);
      path.pop();
      visited[j] = 0;
    }
  }

  visited[start] = 1;
  search(start, 2, total - 1);
  return { solutions, nodes, exhausted };
}

export function countZipSolutions(puzzle: ZipPuzzle, limit = 2, maxNodes = 2_000_000): ZipCount {
  return enumerateZipSolutions(puzzle, limit, maxNodes, () => {});
}

export function isZipUnique(puzzle: ZipPuzzle, maxNodes = 2_000_000): boolean {
  const r = countZipSolutions(puzzle, 2, maxNodes);
  return r.solutions === 1 && !r.exhausted;
}

export interface ZipDifficultyReport {
  score: number;
  nodes: number;
  cells: number;
  numbers: number;
  walls: number;
  turns: number;
}

export function zipWallCount(spec: ZipPuzzle): number {
  let bits = 0;
  for (let i = 0; i < spec.walls.length; i++) {
    let w = spec.walls[i]!;
    while (w) {
      bits += w & 1;
      w >>= 1;
    }
  }
  return bits / 2;
}

function pathTurns(path: ArrayLike<number>): number {
  let turns = 0;
  for (let i = 2; i < path.length; i++) {
    const a = path[i - 2]!;
    const b = path[i - 1]!;
    const c = path[i]!;
    const d1 = b - a;
    const d2 = c - b;
    if (d1 !== d2) turns++;
  }
  return turns;
}

export function zipDifficultyReport(spec: ZipSpec): ZipDifficultyReport {
  const n = spec.config.size;
  const cells = n * n;
  let numbers = 0;
  for (let i = 0; i < cells; i++) if (spec.numbers[i]) numbers++;
  const walls = zipWallCount(spec);
  const { nodes } = countZipSolutions(spec, 2, 5_000_000);
  const turns = pathTurns(spec.solution);
  const segment = cells / Math.max(1, numbers - 1);
  const score = Math.log2(nodes + 1) * 4 + segment * 1.5 + walls * 0.6 + Math.log2(cells) * 2 + (turns / cells) * 5;
  return { score: Math.round(score * 10) / 10, nodes, cells, numbers, walls, turns };
}

type Transform = (r: number, c: number) => [number, number];

function transforms(n: number): Transform[] {
  return [
    (r, c) => [r, c],
    (r, c) => [r, n - 1 - c],
    (r, c) => [n - 1 - r, c],
    (r, c) => [n - 1 - r, n - 1 - c],
    (r, c) => [c, r],
    (r, c) => [c, n - 1 - r],
    (r, c) => [n - 1 - c, r],
    (r, c) => [n - 1 - c, n - 1 - r],
  ];
}

function dirIndex(dr: number, dc: number): number {
  for (let d = 0; d < 4; d++) if (ZIP_DIRS[d]![0] === dr && ZIP_DIRS[d]![1] === dc) return d;
  throw new Error('bad direction');
}

export function zipCanonicalKey(spec: ZipPuzzle): string {
  const n = spec.config.size;
  let best = '';
  for (const t of transforms(n)) {
    const numbers = new Uint8Array(n * n);
    const walls = new Uint8Array(n * n);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const i = r * n + c;
        const [tr, tc] = t(r, c);
        const ti = tr * n + tc;
        numbers[ti] = spec.numbers[i]!;
        const w = spec.walls[i]!;
        for (let d = 0; d < 4; d++) {
          if (!(w & (1 << d))) continue;
          const [ar, ac] = t(r + ZIP_DIRS[d]![0], c + ZIP_DIRS[d]![1]);
          walls[ti]! |= 1 << dirIndex(ar - tr, ac - tc);
        }
      }
    }
    let key = '';
    for (let i = 0; i < n * n; i++) key += String.fromCharCode(48 + numbers[i]!) + walls[i]!.toString(16);
    if (best === '' || key < best) best = key;
  }
  return `zip${n}|${best}`;
}

// Vocabulary: how long the path runs between consecutive numbers, plus how often it turns.
export function zipFamilyKey(spec: ZipSpec): string {
  const at: number[] = [];
  spec.solution.forEach((cell, i) => {
    if (spec.numbers[cell]! > 0) at.push(i);
  });
  const gaps = at.slice(1).map((position, i) => position - at[i]!);
  return `t${zipDifficultyReport(spec).turns}/${gaps.sort((a, b) => a - b).join('.')}`;
}
