import { describe, expect, it } from 'vitest';
import { Rng } from '../src/rng.ts';
import {
  TRACK_E,
  TRACK_N,
  TRACK_S,
  TRACK_W,
  countTracksSolutions,
  solveTracks,
  type TracksPuzzle,
} from '../src/tracks/solver.ts';

const DIRS: [number, number, number][] = [
  [-1, 0, TRACK_N],
  [0, 1, TRACK_E],
  [1, 0, TRACK_S],
  [0, -1, TRACK_W],
];
const OPPOSITE: Record<number, number> = { [TRACK_N]: TRACK_S, [TRACK_S]: TRACK_N, [TRACK_E]: TRACK_W, [TRACK_W]: TRACK_E };

// Every simple path from the A cell to the B cell, as ordered cell lists. Only for tiny boards.
function allPaths(cols: number, rows: number, entryRow: number, exitCol: number): number[][] {
  const start = entryRow * cols;
  const goal = (rows - 1) * cols + exitCol;
  const out: number[][] = [];
  const used = new Uint8Array(cols * rows);
  const path = [start];
  used[start] = 1;
  const walk = (cur: number) => {
    if (cur === goal) {
      out.push([...path]);
      return;
    }
    const r = Math.floor(cur / cols);
    const c = cur % cols;
    for (const [dr, dc] of DIRS) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
      const next = rr * cols + cc;
      if (used[next]) continue;
      used[next] = 1;
      path.push(next);
      walk(next);
      path.pop();
      used[next] = 0;
    }
  };
  walk(start);
  return out;
}

function puzzleFromPath(cols: number, rows: number, entryRow: number, exitCol: number, path: number[]): TracksPuzzle {
  const rowCounts = new Uint8Array(rows);
  const colCounts = new Uint8Array(cols);
  for (const cell of path) {
    rowCounts[Math.floor(cell / cols)]!++;
    colCounts[cell % cols]!++;
  }
  return { config: { cols, rows }, rowCounts, colCounts, entryRow, exitCol, given: new Uint8Array(cols * rows) };
}

function countsKey(cols: number, path: number[], rows: number): string {
  const p = puzzleFromPath(cols, rows, 0, 0, path);
  return `${[...p.rowCounts].join('.')}|${[...p.colCounts].join('.')}`;
}

function masksOf(cols: number, rows: number, entryRow: number, exitCol: number, path: number[]): Uint8Array {
  const masks = new Uint8Array(cols * rows);
  masks[entryRow * cols]! |= TRACK_W;
  masks[(rows - 1) * cols + exitCol]! |= TRACK_S;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const d = b - a === 1 ? TRACK_E : b - a === -1 ? TRACK_W : b - a === cols ? TRACK_S : TRACK_N;
    masks[a]! |= d;
    masks[b]! |= OPPOSITE[d]!;
  }
  return masks;
}

describe('tracks solver', () => {
  // The propagator's rules are only useful if they are sound (never cut a real solution) and the
  // search is complete. Brute force over every A-to-B path on small boards is the ground truth.
  it('counts exactly the paths that match the clues on 4x4 boards', () => {
    const rng = new Rng(7);
    for (let t = 0; t < 12; t++) {
      const entryRow = rng.int(3);
      const exitCol = 1 + rng.int(3);
      const paths = allPaths(4, 4, entryRow, exitCol);
      const pick = paths[rng.int(paths.length)]!;
      const p = puzzleFromPath(4, 4, entryRow, exitCol, pick);
      const want = countsKey(4, pick, 4);
      const expected = paths.filter((q) => countsKey(4, q, 4) === want).length;
      const got = countTracksSolutions(p, 1000, 1_000_000);
      expect(got.complete).toBe(true);
      expect(got.count).toBe(expected);
    }
  });

  it('solves a unique puzzle to its path', () => {
    const rng = new Rng(11);
    let checked = 0;
    for (let t = 0; t < 60 && checked < 5; t++) {
      const entryRow = rng.int(4);
      const exitCol = 1 + rng.int(4);
      const paths = allPaths(5, 5, entryRow, exitCol);
      const pick = paths[rng.int(paths.length)]!;
      const p = puzzleFromPath(5, 5, entryRow, exitCol, pick);
      if (countTracksSolutions(p, 2).count !== 1) continue;
      const res = solveTracks(p, 3);
      if (!res.solved) continue;
      expect([...res.masks]).toEqual([...masksOf(5, 5, entryRow, exitCol, pick)]);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('never reports a contradiction for a puzzle that has a solution', () => {
    const rng = new Rng(3);
    for (let t = 0; t < 20; t++) {
      const entryRow = rng.int(4);
      const exitCol = 1 + rng.int(4);
      const paths = allPaths(5, 5, entryRow, exitCol);
      const p = puzzleFromPath(5, 5, entryRow, exitCol, paths[rng.int(paths.length)]!);
      expect(solveTracks(p, 3).contradiction).toBe(false);
    }
  });

  it('uses the given pieces', () => {
    // 3x3, A at row 0, B at column 2: the path runs along the top row and down the right column.
    const path = [0, 1, 2, 5, 8];
    const p = puzzleFromPath(3, 3, 0, 2, path);
    const res = solveTracks(p, 3);
    expect(res.solved).toBe(true);
    expect([...res.masks]).toEqual([...masksOf(3, 3, 0, 2, path)]);
  });

  it('reports contradictory clues', () => {
    const p = puzzleFromPath(3, 3, 0, 2, [0, 1, 2, 5, 8]);
    p.rowCounts[1] = 3;
    expect(solveTracks(p, 3).contradiction).toBe(true);
    expect(countTracksSolutions(p, 2).count).toBe(0);
  });
});
