import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../src/types.ts';
import { MARKED_EMPTY, gridClues, lineClues } from '../src/nonogram/clues.ts';
import {
  NONOGRAM_VERSION,
  emptyState,
  generateNonogram,
  isNonogramSolved,
  lineSatisfied,
  nonogramHint,
  nonogramProgress,
  type NonogramSpec,
} from '../src/nonogram/puzzle.ts';
import { isLineSolvable, nonogramCanonicalKey, nonogramDifficultyReport, solveByLines, solveLine } from '../src/nonogram/solver.ts';

function specFromGrid(rows: number, cols: number, colors: number, cells: number[]): NonogramSpec {
  const solution = Uint8Array.from(cells);
  return {
    version: NONOGRAM_VERSION,
    seed: 0,
    difficulty: 'easy',
    config: { rows, cols, colors, density: 0.5 },
    solution,
    ...gridClues(solution, rows, cols),
  };
}

describe('clues', () => {
  it('computes runs on a mono line', () => {
    expect(lineClues([1, 1, 0, 1, 0, 0, 1, 1, 1])).toEqual([
      { len: 2, color: 1 },
      { len: 1, color: 1 },
      { len: 3, color: 1 },
    ]);
    expect(lineClues([0, 0, 0])).toEqual([]);
    expect(lineClues([MARKED_EMPTY, 1, MARKED_EMPTY])).toEqual([{ len: 1, color: 1 }]);
  });

  it('splits adjacent blocks of different colors without a gap', () => {
    expect(lineClues([1, 1, 2, 2, 2, 0, 2, 1])).toEqual([
      { len: 2, color: 1 },
      { len: 3, color: 2 },
      { len: 1, color: 2 },
      { len: 1, color: 1 },
    ]);
  });

  it('builds row and column clues from a grid', () => {
    const { rowClues, colClues } = gridClues(Uint8Array.from([1, 0, 1, 1, 1, 0]), 2, 3);
    expect(rowClues).toEqual([[{ len: 1, color: 1 }, { len: 1, color: 1 }], [{ len: 2, color: 1 }]]);
    expect(colClues).toEqual([[{ len: 2, color: 1 }], [{ len: 1, color: 1 }], [{ len: 1, color: 1 }]]);
  });
});

describe('line solver', () => {
  it('deduces the overlap of a long block', () => {
    const cells = new Uint8Array(10);
    const deduced = solveLine(cells, [{ len: 7, color: 1 }], 1);
    expect(deduced).toBe(4);
    expect([...cells]).toEqual([0, 0, 0, 1, 1, 1, 1, 0, 0, 0]);
  });

  it('fills a fully determined line', () => {
    const cells = new Uint8Array(5);
    solveLine(cells, [{ len: 2, color: 1 }, { len: 2, color: 1 }], 1);
    expect([...cells]).toEqual([1, 1, MARKED_EMPTY, 1, 1]);
  });

  it('places adjacent colored blocks without a gap', () => {
    const cells = new Uint8Array(5);
    solveLine(cells, [{ len: 2, color: 1 }, { len: 3, color: 2 }], 2);
    expect([...cells]).toEqual([1, 1, 2, 2, 2]);
  });

  it('marks the rest empty when the clue is empty', () => {
    const cells = new Uint8Array(4);
    solveLine(cells, [], 1);
    expect([...cells]).toEqual([MARKED_EMPTY, MARKED_EMPTY, MARKED_EMPTY, MARKED_EMPTY]);
  });

  it('reports a contradiction', () => {
    const cells = Uint8Array.from([MARKED_EMPTY, 0, 0]);
    expect(solveLine(cells, [{ len: 3, color: 1 }], 1)).toBe(-1);
  });

  it('solves a known puzzle', () => {
    const spec = specFromGrid(3, 3, 1, [1, 1, 1, 1, 0, 1, 1, 1, 1]);
    const r = solveByLines(spec);
    expect(r.solved).toBe(true);
    expect([...r.state].map((v) => (v === MARKED_EMPTY ? 0 : v))).toEqual([...spec.solution]);
  });

  it('rejects an ambiguous puzzle', () => {
    const spec = specFromGrid(2, 2, 1, [1, 0, 0, 1]);
    expect(isLineSolvable(spec)).toBe(false);
    expect(solveByLines(spec).solved).toBe(false);
  });

  it('solves a colored puzzle with same-color gaps', () => {
    const spec = specFromGrid(2, 5, 2, [1, 0, 1, 2, 2, 2, 2, 1, 0, 1]);
    expect(spec.rowClues[0]).toEqual([{ len: 1, color: 1 }, { len: 1, color: 1 }, { len: 2, color: 2 }]);
    expect(isLineSolvable(spec)).toBe(true);
  });
});

describe('generateNonogram', () => {
  it('is deterministic per seed', () => {
    const a = generateNonogram(42, 'hard');
    const b = generateNonogram(42, 'hard');
    expect([...a.solution]).toEqual([...b.solution]);
    expect(a.rowClues).toEqual(b.rowClues);
    expect(a.colClues).toEqual(b.colClues);
    expect([...a.solution]).not.toEqual([...generateNonogram(43, 'hard').solution]);
  });

  it('produces line-solvable puzzles for every difficulty and many seeds', () => {
    for (const difficulty of DIFFICULTIES) {
      const t0 = performance.now();
      for (let seed = 1; seed <= 50; seed++) {
        const spec = generateNonogram(seed, difficulty);
        const { rows, cols, colors } = spec.config;
        expect(spec.solution.length).toBe(rows * cols);
        expect(spec.rowClues.length).toBe(rows);
        expect(spec.colClues.length).toBe(cols);
        expect(Math.max(...spec.solution)).toBe(colors);
        expect(isLineSolvable(spec)).toBe(true);
        expect(isNonogramSolved(spec, spec.solution)).toBe(true);
        expect(isNonogramSolved(spec, emptyState(spec))).toBe(false);
      }
      expect(performance.now() - t0).toBeLessThan(15_000);
    }
  });

  it('has no empty lines on easy and medium', () => {
    for (const difficulty of ['easy', 'medium'] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        const spec = generateNonogram(seed, difficulty);
        expect(spec.rowClues.every((c) => c.length > 0)).toBe(true);
        expect(spec.colClues.every((c) => c.length > 0)).toBe(true);
      }
    }
  });

  it('honours size and color bumps', () => {
    const spec = generateNonogram(7, 'medium', { sizeDelta: 2, colorDelta: 1 });
    expect(spec.config.rows).toBe(12);
    expect(spec.config.cols).toBe(12);
    expect(spec.config.colors).toBe(2);
    expect(isLineSolvable(spec)).toBe(true);
  });
});

describe('state', () => {
  it('treats marked and unknown cells as empty', () => {
    const spec = specFromGrid(2, 2, 1, [1, 0, 0, 1]);
    expect(isNonogramSolved(spec, Uint8Array.from([1, 0, 0, 1]))).toBe(true);
    expect(isNonogramSolved(spec, Uint8Array.from([1, MARKED_EMPTY, MARKED_EMPTY, 1]))).toBe(true);
    expect(isNonogramSolved(spec, Uint8Array.from([1, 1, 0, 1]))).toBe(false);
    expect(isNonogramSolved(spec, Uint8Array.from([1, 0, 0, 0]))).toBe(false);
  });

  it('requires the right color', () => {
    const spec = specFromGrid(1, 2, 2, [1, 2]);
    expect(isNonogramSolved(spec, Uint8Array.from([2, 1]))).toBe(false);
    expect(isNonogramSolved(spec, Uint8Array.from([1, 2]))).toBe(true);
  });

  it('reports progress and satisfied lines', () => {
    const spec = specFromGrid(2, 2, 1, [1, 1, 0, 1]);
    const state = Uint8Array.from([1, 0, 0, 0]);
    expect(nonogramProgress(spec, state)).toEqual({ matching: 1, total: 3 });
    expect(lineSatisfied(spec, state, 'row', 0)).toBe(false);
    expect(lineSatisfied(spec, state, 'col', 0)).toBe(true);
    expect(lineSatisfied(spec, Uint8Array.from([1, 1, MARKED_EMPTY, 0]), 'row', 0)).toBe(true);
  });
});

describe('hint', () => {
  it('walks from the empty state to the solution', () => {
    const spec = generateNonogram(99, 'hard');
    const state = emptyState(spec);
    let steps = 0;
    while (!isNonogramSolved(spec, state)) {
      const h = nonogramHint(spec, state);
      expect(h).not.toBeNull();
      expect(state[h!.r * spec.config.cols + h!.c]).toBe(0);
      state[h!.r * spec.config.cols + h!.c] = h!.value;
      steps++;
      expect(steps).toBeLessThanOrEqual(state.length);
    }
    expect(nonogramHint(spec, state)).toBeNull();
  });

  it('fixes a wrong cell first', () => {
    const spec = generateNonogram(5, 'medium');
    const state = emptyState(spec);
    const wrong = spec.solution.findIndex((v) => v === 0);
    state[wrong] = 1;
    const h = nonogramHint(spec, state);
    expect(h).toEqual({ r: Math.floor(wrong / spec.config.cols), c: wrong % spec.config.cols, value: MARKED_EMPTY });
  });
});

describe('reports', () => {
  it('difficulty grows with the preset', () => {
    const avg = (d: 'easy' | 'medium' | 'genius') => {
      let sum = 0;
      for (let seed = 1; seed <= 15; seed++) sum += nonogramDifficultyReport(generateNonogram(seed, d)).score;
      return sum / 15;
    };
    expect(avg('easy')).toBeLessThan(avg('medium'));
    expect(avg('medium')).toBeLessThan(avg('genius'));
  });

  it('canonical key is invariant under flips and rotations', () => {
    const spec = generateNonogram(11, 'medium');
    const n = spec.config.rows;
    const rotated = structuredClone(spec);
    const flipped = structuredClone(spec);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        rotated.solution[c * n + (n - 1 - r)] = spec.solution[r * n + c]!;
        flipped.solution[r * n + (n - 1 - c)] = spec.solution[r * n + c]!;
      }
    }
    expect(nonogramCanonicalKey(rotated)).toBe(nonogramCanonicalKey(spec));
    expect(nonogramCanonicalKey(flipped)).toBe(nonogramCanonicalKey(spec));
    expect(nonogramCanonicalKey(generateNonogram(12, 'medium'))).not.toBe(nonogramCanonicalKey(spec));
  });
});
