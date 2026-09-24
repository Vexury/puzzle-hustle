import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../src/types.ts';
import {
  MOSAIC_MARKED_EMPTY,
  MOSAIC_VERSION,
  emptyMosaicState,
  generateMosaic,
  isMosaicSolved,
  mosaicClueBroken,
  mosaicClueSatisfied,
  mosaicClues,
  mosaicHint,
  mosaicProgress,
  type MosaicSpec,
} from '../src/mosaic/puzzle.ts';
import { isMosaicLogicSolvable, mosaicCanonicalKey, mosaicDifficultyReport, mosaicSolveByLogic } from '../src/mosaic/solver.ts';

function specFromGrid(rows: number, cols: number, cells: number[], clueMask?: number[]): MosaicSpec {
  const solution = Uint8Array.from(cells);
  const clues = mosaicClues(solution, rows, cols);
  if (clueMask) clueMask.forEach((keep, i) => { if (!keep) clues[i] = -1; });
  return {
    version: MOSAIC_VERSION,
    seed: 0,
    difficulty: 'easy',
    config: { rows, cols, density: 0.5, clueRatio: 1 },
    solution,
    clues,
  };
}

function clueCount(spec: MosaicSpec): number {
  return spec.clues.filter((v) => v >= 0).length;
}

describe('clues', () => {
  it('counts the 3x3 block with border clipping', () => {
    const clues = mosaicClues(Uint8Array.from([1, 0, 1, 0, 1, 0, 1, 1, 0]), 3, 3);
    expect([...clues]).toEqual([2, 3, 2, 4, 5, 3, 3, 3, 2]);
  });

  it('handles a single row', () => {
    expect([...mosaicClues(Uint8Array.from([1, 1, 0, 1]), 1, 4)]).toEqual([2, 2, 2, 1]);
  });
});

describe('logic solver', () => {
  it('solves a tiny known puzzle', () => {
    const spec = specFromGrid(3, 3, [1, 1, 1, 1, 0, 1, 1, 1, 1], [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect([...spec.clues]).toEqual([3, -1, -1, -1, 8, -1, -1, -1, 3]);
    const r = mosaicSolveByLogic(spec);
    expect(r.solved).toBe(true);
    expect([...r.state].map((v) => (v === MOSAIC_MARKED_EMPTY ? 0 : v))).toEqual([...spec.solution]);
  });

  it('refuses an ambiguous puzzle', () => {
    const spec = specFromGrid(2, 2, [1, 0, 0, 1], [0, 0, 0, 0]);
    spec.clues[0] = 2;
    expect(isMosaicLogicSolvable(spec)).toBe(false);
    const r = mosaicSolveByLogic(spec);
    expect(r.solved).toBe(false);
    expect(r.contradiction).toBe(false);
  });

  it('reports a contradiction', () => {
    const spec = specFromGrid(2, 2, [1, 0, 0, 1], [1, 0, 0, 0]);
    spec.clues[0] = 5;
    expect(mosaicSolveByLogic(spec).contradiction).toBe(true);
  });

  it('uses pairwise reasoning where singles stall', () => {
    const spec = specFromGrid(3, 3, [0, 1, 0, 0, 0, 0, 0, 0, 0], [1, 0, 1, 0, 1, 0, 1, 0, 0]);
    expect(mosaicSolveByLogic(spec, false).solved).toBe(false);
    const r = mosaicSolveByLogic(spec, true);
    expect(r.solved).toBe(true);
    expect(r.pairwiseUses).toBeGreaterThan(0);
  });
});

describe('generateMosaic', () => {
  it('is deterministic per seed', () => {
    const a = generateMosaic(42, 'hard');
    const b = generateMosaic(42, 'hard');
    expect([...a.solution]).toEqual([...b.solution]);
    expect([...a.clues]).toEqual([...b.clues]);
    expect([...a.solution]).not.toEqual([...generateMosaic(43, 'hard').solution]);
  });

  it('produces logic-solvable puzzles for every difficulty and many seeds', () => {
    for (const difficulty of DIFFICULTIES) {
      const t0 = performance.now();
      for (let seed = 1; seed <= 50; seed++) {
        const spec = generateMosaic(seed, difficulty);
        const { rows, cols } = spec.config;
        expect(spec.solution.length).toBe(rows * cols);
        expect(spec.clues.length).toBe(rows * cols);
        expect(clueCount(spec)).toBeGreaterThan(0);
        expect(isMosaicLogicSolvable(spec)).toBe(true);
        expect(isMosaicSolved(spec, spec.solution)).toBe(true);
        expect(isMosaicSolved(spec, emptyMosaicState(spec))).toBe(false);
      }
      expect(performance.now() - t0).toBeLessThan(15_000);
    }
  });

  it('keeps easy and medium solvable without pairwise reasoning', () => {
    for (const difficulty of ['easy', 'medium'] as const) {
      for (let seed = 1; seed <= 20; seed++) expect(isMosaicLogicSolvable(generateMosaic(seed, difficulty), false)).toBe(true);
    }
  });

  it('removes clues down to a minimal set', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const spec = generateMosaic(seed, 'medium');
      const full = mosaicClues(spec.solution, spec.config.rows, spec.config.cols);
      spec.clues.forEach((v, i) => { if (v >= 0) expect(v).toBe(full[i]); });
      expect(clueCount(spec)).toBeLessThan(spec.clues.length);
      for (let i = 0; i < spec.clues.length; i++) {
        if (spec.clues[i]! < 0) continue;
        const reduced = { ...spec, clues: Int8Array.from(spec.clues) };
        reduced.clues[i] = -1;
        expect(isMosaicLogicSolvable(reduced, false)).toBe(false);
      }
    }
  });

  it('honours row bumps', () => {
    const spec = generateMosaic(7, 'medium', { rowDelta: 2 });
    expect(spec.config.rows).toBe(10);
    expect(spec.config.cols).toBe(8);
    expect(isMosaicLogicSolvable(spec)).toBe(true);
  });
});

describe('state', () => {
  it('treats marked and unknown cells as empty', () => {
    const spec = specFromGrid(2, 2, [1, 0, 0, 1]);
    expect(isMosaicSolved(spec, Uint8Array.from([1, 0, 0, 1]))).toBe(true);
    expect(isMosaicSolved(spec, Uint8Array.from([1, MOSAIC_MARKED_EMPTY, MOSAIC_MARKED_EMPTY, 1]))).toBe(true);
    expect(isMosaicSolved(spec, Uint8Array.from([1, 1, 0, 1]))).toBe(false);
    expect(isMosaicSolved(spec, Uint8Array.from([1, 0, 0, 0]))).toBe(false);
  });

  it('reports progress and satisfied clues', () => {
    const spec = specFromGrid(2, 2, [1, 1, 0, 1]);
    const state = Uint8Array.from([1, 0, 0, 0]);
    expect(mosaicProgress(spec, state)).toEqual({ matching: 1, total: 3 });
    expect(mosaicClueSatisfied(spec, state, 0, 0)).toBe(false);
    expect(mosaicClueSatisfied(spec, Uint8Array.from([1, 1, MOSAIC_MARKED_EMPTY, 1]), 0, 0)).toBe(true);
    expect(mosaicClueSatisfied(spec, Uint8Array.from([1, 1, 0, 1]), 0, 0)).toBe(true);
    const zero = specFromGrid(2, 2, [0, 0, 0, 0]);
    expect(mosaicClueSatisfied(zero, Uint8Array.from([0, 0, 0, 0]), 0, 0)).toBe(false);
    expect(mosaicClueSatisfied(zero, Uint8Array.from([MOSAIC_MARKED_EMPTY, MOSAIC_MARKED_EMPTY, MOSAIC_MARKED_EMPTY, 0]), 0, 0)).toBe(false);
    expect(mosaicClueSatisfied(zero, new Uint8Array(4).fill(MOSAIC_MARKED_EMPTY), 0, 0)).toBe(true);
    spec.clues[3] = -1;
    expect(mosaicClueSatisfied(spec, spec.solution, 1, 1)).toBe(false);
  });
  it('flags a clue that is overfilled or crossed out past reach', () => {
    const spec = specFromGrid(2, 2, [1, 1, 0, 1]);
    expect(mosaicClueBroken(spec, Uint8Array.from([1, 0, 0, 0]), 0, 0)).toBe(false);
    expect(mosaicClueBroken(spec, Uint8Array.from([1, 1, 1, 1]), 0, 0)).toBe(true);
    expect(mosaicClueBroken(spec, Uint8Array.from([MOSAIC_MARKED_EMPTY, MOSAIC_MARKED_EMPTY, 0, 0]), 0, 0)).toBe(true);
    expect(mosaicClueBroken(spec, Uint8Array.from([1, 1, MOSAIC_MARKED_EMPTY, 1]), 0, 0)).toBe(false);
  });
});

describe('hint', () => {
  it('walks from the empty state to the solution', () => {
    const spec = generateMosaic(99, 'hard');
    const state = emptyMosaicState(spec);
    let steps = 0;
    while (!isMosaicSolved(spec, state)) {
      const h = mosaicHint(spec, state);
      expect(h).not.toBeNull();
      expect(state[h!.r * spec.config.cols + h!.c]).toBe(0);
      state[h!.r * spec.config.cols + h!.c] = h!.value;
      steps++;
      expect(steps).toBeLessThanOrEqual(state.length);
    }
    expect(mosaicHint(spec, state)).toBeNull();
  });

  it('fixes a wrong cell first', () => {
    const spec = generateMosaic(5, 'medium');
    const state = emptyMosaicState(spec);
    const wrong = spec.solution.findIndex((v) => v === 0);
    state[wrong] = 1;
    const h = mosaicHint(spec, state);
    expect(h).toEqual({ r: Math.floor(wrong / spec.config.cols), c: wrong % spec.config.cols, value: MOSAIC_MARKED_EMPTY });
  });
});

describe('reports', () => {
  it('difficulty grows with the preset', () => {
    const avg = (d: 'easy' | 'medium' | 'genius') => {
      let sum = 0;
      for (let seed = 1; seed <= 15; seed++) sum += mosaicDifficultyReport(generateMosaic(seed, d)).score;
      return sum / 15;
    };
    expect(avg('easy')).toBeLessThan(avg('medium'));
    expect(avg('medium')).toBeLessThan(avg('genius'));
  });

  it('canonical key is invariant under flips and rotations', () => {
    const spec = generateMosaic(11, 'medium');
    const n = spec.config.rows;
    const rotated = structuredClone(spec);
    const flipped = structuredClone(spec);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        rotated.solution[c * n + (n - 1 - r)] = spec.solution[r * n + c]!;
        rotated.clues[c * n + (n - 1 - r)] = spec.clues[r * n + c]!;
        flipped.solution[r * n + (n - 1 - c)] = spec.solution[r * n + c]!;
        flipped.clues[r * n + (n - 1 - c)] = spec.clues[r * n + c]!;
      }
    }
    expect(mosaicCanonicalKey(rotated)).toBe(mosaicCanonicalKey(spec));
    expect(mosaicCanonicalKey(flipped)).toBe(mosaicCanonicalKey(spec));
    expect(mosaicCanonicalKey(generateMosaic(12, 'medium'))).not.toBe(mosaicCanonicalKey(spec));
    const otherClues = structuredClone(spec);
    otherClues.clues[spec.clues.findIndex((v) => v >= 0)] = -1;
    expect(mosaicCanonicalKey(otherClues)).not.toBe(mosaicCanonicalKey(spec));
  });
});
