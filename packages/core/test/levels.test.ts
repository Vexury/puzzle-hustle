import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../src/types.ts';
import { LEVEL_PACK, levelList } from '../src/levels.ts';
import { SHAPES_VERSION, generateShapes, isSolved } from '../src/shapes/puzzle.ts';
import { canonicalKey, isUnique } from '../src/shapes/solver.ts';
import { NONOGRAM_VERSION, generateNonogram } from '../src/nonogram/puzzle.ts';
import { isLineSolvable, nonogramCanonicalKey } from '../src/nonogram/solver.ts';
import { MOSAIC_VERSION, generateMosaic } from '../src/mosaic/puzzle.ts';
import { isMosaicLogicSolvable, mosaicCanonicalKey } from '../src/mosaic/solver.ts';
import { SUDOKU_VERSION, generateKiller, generateSudoku } from '../src/sudoku/puzzle.ts';
import { isSudokuUnique, sudokuCanonicalKey } from '../src/sudoku/solver.ts';
import { REGIONS_VERSION, generateCrowns, generateStars } from '../src/regions/puzzle.ts';
import { isRegionsUnique, regionsCanonicalKey } from '../src/regions/solver.ts';
import { decodeRef, encodeRef, levelRef, refId } from '../src/ref.ts';

describe('level pack', () => {
  it('matches the current generator version', () => {
    expect(LEVEL_PACK.versions.shapes).toBe(SHAPES_VERSION);
    expect(LEVEL_PACK.versions.nonogram).toBe(NONOGRAM_VERSION);
    expect(LEVEL_PACK.versions.mosaic).toBe(MOSAIC_VERSION);
    expect(LEVEL_PACK.versions.sudoku).toBe(SUDOKU_VERSION);
    expect(LEVEL_PACK.versions.killer).toBe(SUDOKU_VERSION);
    expect(LEVEL_PACK.versions.crowns).toBe(REGIONS_VERSION);
    expect(LEVEL_PACK.versions.stars).toBe(REGIONS_VERSION);
  });

  it('has 20 distinct, unique crowns and stars levels per difficulty', () => {
    for (const [type, generate] of [['crowns', generateCrowns], ['stars', generateStars]] as const) {
      for (const difficulty of DIFFICULTIES) {
        const list = levelList(type, difficulty);
        expect(list.length).toBe(20);
        const keys = new Set<string>();
        list.forEach((entry, i) => {
          const spec = generate(entry.seed, difficulty);
          expect(isRegionsUnique(spec)).toBe(true);
          keys.add(regionsCanonicalKey(spec));
          if (i > 0) expect(entry.score).toBeGreaterThanOrEqual(list[i - 1]!.score);
        });
        expect(keys.size).toBe(list.length);
      }
    }
  }, 300_000);

  it('has 20 distinct, unique sudoku and killer levels per difficulty', () => {
    for (const [type, generate] of [['sudoku', generateSudoku], ['killer', generateKiller]] as const) {
      for (const difficulty of DIFFICULTIES) {
        const list = levelList(type, difficulty);
        expect(list.length).toBe(20);
        const keys = new Set<string>();
        list.forEach((entry, i) => {
          const spec = generate(entry.seed, difficulty);
          expect(isSudokuUnique(spec)).toBe(true);
          keys.add(sudokuCanonicalKey(spec));
          if (i > 0) expect(entry.score).toBeGreaterThanOrEqual(list[i - 1]!.score);
        });
        expect(keys.size).toBe(list.length);
      }
    }
  }, 120_000);

  it('has 20 distinct, logic-solvable, ascending mosaic levels per difficulty', () => {
    for (const difficulty of DIFFICULTIES) {
      const list = levelList('mosaic', difficulty);
      expect(list.length).toBe(20);
      const keys = new Set<string>();
      list.forEach((entry, i) => {
        const spec = generateMosaic(entry.seed, difficulty);
        expect(isMosaicLogicSolvable(spec)).toBe(true);
        keys.add(mosaicCanonicalKey(spec));
        if (i > 0) expect(entry.score).toBeGreaterThanOrEqual(list[i - 1]!.score);
      });
      expect(keys.size).toBe(list.length);
    }
  });

  it('has 20 distinct, line-solvable, ascending nonogram levels per difficulty', () => {
    for (const difficulty of DIFFICULTIES) {
      const list = levelList('nonogram', difficulty);
      expect(list.length).toBe(20);
      const keys = new Set<string>();
      list.forEach((entry, i) => {
        const spec = generateNonogram(entry.seed, difficulty);
        expect(isLineSolvable(spec)).toBe(true);
        keys.add(nonogramCanonicalKey(spec));
        if (i > 0) expect(entry.score).toBeGreaterThanOrEqual(list[i - 1]!.score);
      });
      expect(keys.size).toBe(list.length);
    }
  });

  it('has 20 unique, distinct, ascending levels per difficulty', () => {
    for (const difficulty of DIFFICULTIES) {
      const list = levelList('shapes', difficulty);
      expect(list.length).toBe(20);
      const keys = new Set<string>();
      for (let i = 0; i < list.length; i++) {
        const entry = list[i]!;
        const spec = generateShapes(entry.seed, difficulty);
        expect(isSolved(spec, spec.solution)).toBe(true);
        if (difficulty !== 'genius') expect(isUnique(spec)).toBe(true);
        keys.add(canonicalKey(spec));
        if (i > 0) expect(entry.score).toBeGreaterThanOrEqual(list[i - 1]!.score);
      }
      expect(keys.size).toBe(list.length);
    }
  });

  it('level refs round-trip and ignore a stale seed', () => {
    const ref = levelRef('shapes', 'medium', 3)!;
    expect(ref).not.toBeNull();
    const decoded = decodeRef(encodeRef(ref));
    expect(decoded).toEqual(ref);
    expect(refId(ref)).toBe('shapes:level:medium:3');
    const tampered = decodeRef('t=shapes&d=medium&s=zzz&l=3');
    expect(tampered?.seed).toBe(ref.seed);
    expect(levelRef('shapes', 'medium', 99)).toBeNull();
  });
});
