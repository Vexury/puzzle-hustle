import { describe, expect, it } from 'vitest';
import {
  ZIP_PRESETS,
  ZIP_VERSION,
  emptyZipState,
  generateZip,
  isZipSolved,
  zipConfig,
  zipHint,
  zipNumberCount,
  zipPathValid,
  zipProgress,
  zipStart,
  zipStepAllowed,
  type ZipSpec,
} from '../src/zip/puzzle.ts';
import { countZipSolutions, isZipUnique, zipCanonicalKey, zipDifficultyReport, zipWallCount } from '../src/zip/solver.ts';

function assertValid(spec: ZipSpec): void {
  const n = spec.config.size;
  const total = n * n;
  const path = [...spec.solution];
  expect(path.length).toBe(total);
  expect(new Set(path).size).toBe(total);
  expect(spec.numbers[path[0]!]).toBe(1);
  const k = zipNumberCount(spec);
  expect(k).toBeGreaterThanOrEqual(spec.config.numbers);
  expect(spec.numbers[path[total - 1]!]).toBe(k);
  let next = 1;
  for (let i = 0; i < total; i++) {
    const cell = path[i]!;
    if (i > 0) {
      const prev = path[i - 1]!;
      const dr = Math.abs(Math.floor(cell / n) - Math.floor(prev / n));
      const dc = Math.abs((cell % n) - (prev % n));
      expect(dr + dc).toBe(1);
      expect(zipStepAllowed(spec, prev, cell)).toBe(true);
    }
    const v = spec.numbers[cell]!;
    if (v) expect(v).toBe(next++);
  }
  expect(next - 1).toBe(k);
  for (let i = 0; i < total; i++) {
    const w = spec.walls[i]!;
    expect(w & ~15).toBe(0);
    const r = Math.floor(i / n);
    const c = i % n;
    if (w & 1) expect(spec.walls[(r - 1) * n + c]! & 4).toBe(4);
    if (w & 2) expect(spec.walls[r * n + c + 1]! & 8).toBe(8);
    if (w & 4) expect(spec.walls[(r + 1) * n + c]! & 1).toBe(1);
    if (w & 8) expect(spec.walls[r * n + c - 1]! & 2).toBe(2);
  }
  expect(zipWallCount(spec)).toBe(spec.config.walls);
  expect(zipPathValid(spec, path)).toBe(true);
  expect(isZipSolved(spec, path)).toBe(true);
}

const PRESET_SEEDS = { easy: 30, medium: 15, hard: 2, genius: 1 } as const;

describe('generation', () => {
  it('is deterministic per seed', () => {
    const a = generateZip(42, 'easy');
    const b = generateZip(42, 'easy');
    expect([...a.numbers]).toEqual([...b.numbers]);
    expect([...a.walls]).toEqual([...b.walls]);
    expect([...a.solution]).toEqual([...b.solution]);
    expect([...a.solution]).not.toEqual([...generateZip(43, 'easy').solution]);
  });

  it('uses the presets and size delta', () => {
    const spec = generateZip(1, 'easy');
    expect(spec.version).toBe(ZIP_VERSION);
    expect(spec.config).toEqual(ZIP_PRESETS.easy);
    expect(zipConfig('easy', { sizeDelta: 1 }).size).toBe(7);
    expect(zipConfig('medium', { sizeDelta: 2 }).size).toBe(9);
    const weekly = generateZip(3, 'easy', { sizeDelta: 1 });
    expect(weekly.config.size).toBe(7);
    assertValid(weekly);
  });

  for (const [difficulty, seeds] of Object.entries(PRESET_SEEDS) as ['easy' | 'medium' | 'hard' | 'genius', number][]) {
    it(`${difficulty}: ${seeds} seeds give valid unique puzzles`, () => {
      for (let seed = 1; seed <= seeds; seed++) {
        const spec = generateZip(seed, difficulty);
        expect(spec.config).toEqual(ZIP_PRESETS[difficulty]);
        assertValid(spec);
        expect(isZipUnique(spec)).toBe(true);
        expect(isZipSolved(spec, emptyZipState())).toBe(false);
      }
    });
  }

  it('avoids trivial serpentines', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const spec = generateZip(seed, 'easy');
      let turns = 0;
      const p = spec.solution;
      for (let i = 2; i < p.length; i++) if (p[i - 1]! - p[i - 2]! !== p[i]! - p[i - 1]!) turns++;
      expect(turns).toBeGreaterThan(p.length * 0.3);
    }
  });
});

describe('solver', () => {
  it('counts one solution on generated puzzles', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const r = countZipSolutions(generateZip(seed, 'medium'), 10);
      expect(r.solutions).toBe(1);
      expect(r.exhausted).toBe(false);
    }
  });

  it('counts several solutions when constraints are dropped', () => {
    const spec = generateZip(4, 'easy');
    const loose = { config: spec.config, numbers: new Uint8Array(spec.numbers.length), walls: new Uint8Array(spec.walls.length) };
    loose.numbers[spec.solution[0]!] = 1;
    loose.numbers[spec.solution[spec.solution.length - 1]!] = 2;
    expect(countZipSolutions(loose, 50).solutions).toBeGreaterThan(1);
  });

  it('reports a node budget exhaustion', () => {
    const spec = generateZip(2, 'easy');
    const r = countZipSolutions(spec, 2, 3);
    expect(r.exhausted).toBe(true);
  });

  it('reports difficulty with a monotone-ish score', () => {
    const easy = zipDifficultyReport(generateZip(5, 'easy'));
    const medium = zipDifficultyReport(generateZip(5, 'medium'));
    expect(easy.score).toBeGreaterThan(0);
    expect(easy.nodes).toBeGreaterThan(0);
    expect(easy.cells).toBe(36);
    expect(easy.walls).toBe(1);
    expect(medium.cells).toBe(49);
    let easySum = 0;
    let mediumSum = 0;
    for (let seed = 1; seed <= 6; seed++) {
      easySum += zipDifficultyReport(generateZip(seed, 'easy')).score;
      mediumSum += zipDifficultyReport(generateZip(seed, 'medium')).score;
    }
    expect(easySum).toBeLessThan(mediumSum);
  });
});

describe('state helpers', () => {
  it('validates partial paths', () => {
    const spec = generateZip(7, 'easy');
    const sol = [...spec.solution];
    expect(zipPathValid(spec, [])).toBe(true);
    expect(zipPathValid(spec, sol.slice(0, 5))).toBe(true);
    expect(zipPathValid(spec, [sol[1]!])).toBe(false);
    expect(zipPathValid(spec, [sol[0]!, sol[0]!])).toBe(false);
    expect(zipPathValid(spec, [sol[0]!, sol[5]!])).toBe(false);
    expect(zipStart(spec)).toBe(sol[0]);
    expect(zipProgress(spec, sol.slice(0, 9))).toEqual({ matching: 9, total: 36 });
    expect(zipProgress(spec, [sol[0]!, sol[2]!])).toEqual({ matching: 1, total: 36 });
  });

  it('detects the solved state', () => {
    const spec = generateZip(8, 'easy');
    const sol = [...spec.solution];
    expect(isZipSolved(spec, sol)).toBe(true);
    expect(isZipSolved(spec, sol.slice(0, -1))).toBe(false);
    expect(isZipSolved(spec, [...sol].reverse())).toBe(false);
  });

  it('respects walls in step checks', () => {
    const spec = generateZip(9, 'medium');
    const n = spec.config.size;
    const i = spec.walls.findIndex((w) => (w & 2) !== 0);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(zipStepAllowed(spec, i, i + 1)).toBe(false);
    expect(zipStepAllowed(spec, i + 1, i)).toBe(false);
    expect(zipStepAllowed(spec, 0, n + 5)).toBe(false);
    expect(zipStepAllowed(spec, 0, 0)).toBe(false);
  });
});

describe('hint', () => {
  it('extends the empty state to the start and then the second cell', () => {
    const spec = generateZip(10, 'easy');
    const sol = [...spec.solution];
    const h0 = zipHint(spec, []);
    expect(h0).toEqual({ index: sol[0], truncate: null, reason: 'start' });
    const h1 = zipHint(spec, [sol[0]!]);
    expect(h1).toEqual({ index: sol[1], truncate: null, reason: 'next' });
    expect(zipHint(spec, sol)).toBeNull();
  });

  it('returns the deviation index after a wrong path', () => {
    const spec = generateZip(11, 'easy');
    const sol = [...spec.solution];
    const wrong = [sol[0]!, sol[1]!, sol[2]!, sol[10]!, sol[11]!];
    const h = zipHint(spec, wrong);
    expect(h).toEqual({ index: sol[3], truncate: 3, reason: 'deviation' });
  });

  it('walks from the empty state to the solution', () => {
    const spec = generateZip(12, 'easy');
    const state: number[] = [];
    let steps = 0;
    while (!isZipSolved(spec, state)) {
      const h = zipHint(spec, state)!;
      expect(h).not.toBeNull();
      if (h.truncate !== null) state.length = h.truncate;
      state.push(h.index);
      steps++;
      expect(steps).toBeLessThanOrEqual(36);
    }
  });
});

describe('canonical key', () => {
  it('is invariant under rotation and flips, sensitive to layout', () => {
    const spec = generateZip(13, 'medium');
    const n = spec.config.size;
    const rotated = { config: spec.config, numbers: new Uint8Array(n * n), walls: new Uint8Array(n * n) };
    const flipped = { config: spec.config, numbers: new Uint8Array(n * n), walls: new Uint8Array(n * n) };
    const rotBits = (w: number) => ((w << 1) & 15) | (w >> 3);
    const flipBits = (w: number) => (w & 5) | ((w & 2) << 2) | ((w & 8) >> 2);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const i = r * n + c;
        rotated.numbers[c * n + (n - 1 - r)] = spec.numbers[i]!;
        rotated.walls[c * n + (n - 1 - r)] = rotBits(spec.walls[i]!);
        flipped.numbers[r * n + (n - 1 - c)] = spec.numbers[i]!;
        flipped.walls[r * n + (n - 1 - c)] = flipBits(spec.walls[i]!);
      }
    }
    expect(countZipSolutions(rotated, 2).solutions).toBe(1);
    expect(zipCanonicalKey(rotated)).toBe(zipCanonicalKey(spec));
    expect(zipCanonicalKey(flipped)).toBe(zipCanonicalKey(spec));
    expect(zipCanonicalKey(generateZip(14, 'medium'))).not.toBe(zipCanonicalKey(spec));
  });
});
