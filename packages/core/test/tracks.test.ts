import { describe, expect, it } from 'vitest';
import { Rng } from '../src/rng.ts';
import { DIFFICULTIES } from '../src/types.ts';
import { TRACKS_PRESETS, generateTracks } from '../src/tracks/puzzle.ts';
import {
  TRACK_E,
  TRACK_N,
  TRACK_S,
  TRACK_W,
  countTracksSolutions,
  solveTracks,
  tracksCanonicalKey,
  tracksDifficultyReport,
  tracksGivenCount,
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

  it('uses a given piece to resolve an otherwise ambiguous puzzle', () => {
    // 3x3, A at row 0, B at column 2, path visiting every cell: rowCounts and colCounts alone are
    // [3,3,3]/[3,3,3], which just says every cell is track and leaves two different routings
    // between A and B, so the clues alone must not pin down a unique solution.
    const path = [0, 1, 2, 5, 4, 3, 6, 7, 8];
    const base = puzzleFromPath(3, 3, 0, 2, path);
    expect(countTracksSolutions(base, 5).count).toBe(2);
    const baseRes = solveTracks(base, 3);
    expect(baseRes.solved).toBe(false);
    expect(baseRes.contradiction).toBe(false);

    // Revealing the center cell's given piece (it runs straight through, W-E) rules out the other
    // routing and the puzzle solves to exactly this path.
    const masks = masksOf(3, 3, 0, 2, path);
    const given = new Uint8Array(9);
    given[4] = masks[4]!;
    const res = solveTracks({ ...base, given }, 3);
    expect(res.solved).toBe(true);
    expect([...res.masks]).toEqual([...masks]);
  });

  it('reports a contradiction when a given piece cannot be part of any solution', () => {
    // 3x3, A at row 0, B at column 2: the path runs along the top row and down the right column,
    // which leaves the center cell empty in the only solution.
    const path = [0, 1, 2, 5, 8];
    const base = puzzleFromPath(3, 3, 0, 2, path);
    expect(solveTracks(base, 3).solved).toBe(true);

    // Force the center cell to be a track piece running N-S, which the puzzle cannot fit anywhere.
    const given = new Uint8Array(9);
    given[4] = TRACK_N | TRACK_S;
    const withGiven = { ...base, given };
    expect(solveTracks(withGiven, 3).contradiction).toBe(true);
    expect(countTracksSolutions(withGiven, 2).count).toBe(0);
  });

  it('reports contradictory clues', () => {
    const p = puzzleFromPath(3, 3, 0, 2, [0, 1, 2, 5, 8]);
    p.rowCounts[1] = 3;
    expect(solveTracks(p, 3).contradiction).toBe(true);
    expect(countTracksSolutions(p, 2).count).toBe(0);
  });

  it('needs tier 2 for some unique puzzles and tier 3 for others, never doing more work than the ceiling allows', () => {
    const rng = new Rng(17);
    let sawTier2Needed = false;
    let sawTier3Needed = false;
    for (let t = 0; t < 300 && !(sawTier2Needed && sawTier3Needed); t++) {
      const entryRow = rng.int(4);
      const exitCol = 1 + rng.int(4);
      const paths = allPaths(5, 5, entryRow, exitCol);
      const pick = paths[rng.int(paths.length)]!;
      const p = puzzleFromPath(5, 5, entryRow, exitCol, pick);
      if (countTracksSolutions(p, 2).count !== 1) continue;
      const r1 = solveTracks(p, 1);
      if (r1.solved) continue;
      // Tier 1 alone was insufficient: the tiers above it must never have run.
      expect(r1.steps[1]).toBe(0);
      expect(r1.steps[2]).toBe(0);
      const r2 = solveTracks(p, 2);
      if (!sawTier2Needed && r2.solved) {
        expect(r2.steps[2]).toBe(0);
        sawTier2Needed = true;
      }
      if (!sawTier3Needed && !r2.solved) {
        expect(solveTracks(p, 3).solved).toBe(true);
        sawTier3Needed = true;
      }
    }
    expect(sawTier2Needed).toBe(true);
    expect(sawTier3Needed).toBe(true);
  });
});

describe('tracks generator', () => {
  it('keeps every board at most ten columns wide', () => {
    for (const d of DIFFICULTIES) expect(TRACKS_PRESETS[d].cols).toBeLessThanOrEqual(10);
  });

  for (const difficulty of ['easy', 'medium'] as const) {
    it(`builds valid, unique ${difficulty} puzzles`, () => {
      const cfg = TRACKS_PRESETS[difficulty];
      for (let seed = 1; seed <= 6; seed++) {
        const spec = generateTracks(seed, difficulty);
        const { cols, rows } = spec.config;
        expect(spec.path[0]).toBe(spec.entryRow * cols);
        expect(spec.path.at(-1)).toBe((rows - 1) * cols + spec.exitCol);
        expect(new Set(spec.path).size).toBe(spec.path.length);
        expect(spec.path.length).toBeGreaterThanOrEqual(cfg.minPath);
        expect(spec.path.length).toBeLessThanOrEqual(cfg.maxPath);
        for (let i = 1; i < spec.path.length; i++) {
          const a = spec.path[i - 1]!;
          const b = spec.path[i]!;
          const adjacent = (Math.abs(a - b) === 1 && Math.floor(a / cols) === Math.floor(b / cols)) || Math.abs(a - b) === cols;
          expect(adjacent).toBe(true);
        }
        let sum = 0;
        for (const n of spec.rowCounts) sum += n;
        expect(sum).toBe(spec.path.length);
        expect(tracksGivenCount(spec)).toBeLessThanOrEqual(cfg.maxGivens);
        const res = solveTracks(spec, cfg.maxTier);
        expect(res.solved).toBe(true);
        expect([...res.masks]).toEqual([...spec.solution]);
        expect(countTracksSolutions(spec, 2).count).toBe(1);
      }
    });
  }

  it('needs the top tier on medium, not just the basic rules', () => {
    const spec = generateTracks(4, 'medium');
    expect(solveTracks(spec, 1).solved).toBe(false);
    expect(tracksDifficultyReport(spec).steps[1]).toBeGreaterThan(0);
  });

  it('is deterministic per seed and differs across seeds', () => {
    expect(tracksCanonicalKey(generateTracks(9, 'medium'))).toBe(tracksCanonicalKey(generateTracks(9, 'medium')));
    expect(tracksCanonicalKey(generateTracks(9, 'medium'))).not.toBe(tracksCanonicalKey(generateTracks(10, 'medium')));
  });

  it('builds a genius board of 10 by 15', () => {
    const spec = generateTracks(1, 'genius');
    expect([spec.config.cols, spec.config.rows]).toEqual([10, 15]);
    expect(solveTracks(spec, 3).solved).toBe(true);
  }, 60_000);
});
