import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, PUZZLE_TYPES } from '../src/types.ts';
import { LEVEL_PACK, levelList } from '../src/levels.ts';
import { SHAPES_VERSION, generateShapes, isSolved } from '../src/shapes/puzzle.ts';
import { canonicalKey, isUnique } from '../src/shapes/solver.ts';
import { NONOGRAM_VERSION, generateNonogram } from '../src/nonogram/puzzle.ts';
import { isLineSolvable, nonogramCanonicalKey } from '../src/nonogram/solver.ts';
import { MOSAIC_VERSION, generateMosaic } from '../src/mosaic/puzzle.ts';
import { isMosaicLogicSolvable, mosaicCanonicalKey } from '../src/mosaic/solver.ts';
import { KILLER_VERSION, SUDOKU_VERSION, generateKiller, generateSudoku } from '../src/sudoku/puzzle.ts';
import { isSudokuUnique, sudokuCanonicalKey } from '../src/sudoku/solver.ts';
import { REGIONS_VERSION, generateCrowns, generateStars } from '../src/regions/puzzle.ts';
import { isRegionsUnique, regionsCanonicalKey } from '../src/regions/solver.ts';
import { ZIP_VERSION, generateZip } from '../src/zip/puzzle.ts';
import { isZipUnique, zipCanonicalKey } from '../src/zip/solver.ts';
import { TRACKS_PRESETS, TRACKS_VERSION, generateTracks } from '../src/tracks/puzzle.ts';
import { solveTracks, tracksCanonicalKey } from '../src/tracks/solver.ts';
import { SLABS_PRESETS, SLABS_VERSION, generateSlabs } from '../src/slabs/puzzle.ts';
import { slabsCanonicalKey, solveSlabs } from '../src/slabs/solver.ts';
import { decodeRef, encodeRef, levelRef, refId } from '../src/ref.ts';

describe('level pack', () => {
  it('matches the current generator version', () => {
    expect(LEVEL_PACK.versions.shapes).toBe(SHAPES_VERSION);
    expect(LEVEL_PACK.versions.nonogram).toBe(NONOGRAM_VERSION);
    expect(LEVEL_PACK.versions.mosaic).toBe(MOSAIC_VERSION);
    expect(LEVEL_PACK.versions.sudoku).toBe(SUDOKU_VERSION);
    expect(LEVEL_PACK.versions.killer).toBe(KILLER_VERSION);
    expect(LEVEL_PACK.versions.crowns).toBe(REGIONS_VERSION);
    expect(LEVEL_PACK.versions.stars).toBe(REGIONS_VERSION);
    expect(LEVEL_PACK.versions.zip).toBe(ZIP_VERSION);
    expect(LEVEL_PACK.versions.tracks).toBe(TRACKS_VERSION);
    expect(LEVEL_PACK.versions.slabs).toBe(SLABS_VERSION);
  });

  // Every type and difficulty, without generating anything: a short or unsorted pack is
  // caught here even for the types whose generators are too slow to re-verify in CI.
  it('ships 50 levels per type and difficulty, ascending by score', () => {
    for (const type of PUZZLE_TYPES) {
      for (const difficulty of DIFFICULTIES) {
        const list = levelList(type, difficulty);
        expect(`${type}/${difficulty}: ${list.length}`).toBe(`${type}/${difficulty}: 50`);
        list.forEach((entry, i) => {
          if (i > 0) expect(entry.score).toBeGreaterThanOrEqual(list[i - 1]!.score);
        });
      }
    }
  });

  // Zip hard and genius cost 1.4 s and 4.3 s per puzzle, so re-verifying their 100 levels
  // would add six minutes to every CI run. The generator only ever returns unique zip
  // puzzles, and `pnpm levels` checks each one as it writes it.
  it('has 50 distinct, unique zip levels for easy and medium', () => {
    for (const difficulty of ['easy', 'medium'] as const) {
      const list = levelList('zip', difficulty);
      expect(list.length).toBe(50);
      const keys = new Set<string>();
      list.forEach((entry, i) => {
        const spec = generateZip(entry.seed, difficulty);
        expect(isZipUnique(spec)).toBe(true);
        keys.add(zipCanonicalKey(spec));
        if (i > 0) expect(entry.score).toBeGreaterThanOrEqual(list[i - 1]!.score);
      });
      expect(keys.size).toBe(list.length);
    }
  }, 180_000);

  // Hard and genius probe with lookahead and are too slow to re-verify in CI, like zip.
  it('has 50 distinct slabs levels per difficulty that the solver finishes', () => {
    for (const difficulty of DIFFICULTIES) {
      const list = levelList('slabs', difficulty);
      expect(list.length).toBe(50);
      const keys = new Set<string>();
      for (const entry of list) {
        const spec = generateSlabs(entry.seed, difficulty);
        expect(solveSlabs(spec, SLABS_PRESETS[difficulty].maxTier).solved).toBe(true);
        keys.add(slabsCanonicalKey(spec));
      }
      expect(keys.size).toBe(list.length);
    }
  }, 180_000);

  it('has 50 distinct tracks levels for easy and medium that the solver finishes', () => {
    for (const difficulty of ['easy', 'medium'] as const) {
      const list = levelList('tracks', difficulty);
      expect(list.length).toBe(50);
      const keys = new Set<string>();
      for (const entry of list) {
        const spec = generateTracks(entry.seed, difficulty);
        expect(solveTracks(spec, TRACKS_PRESETS[difficulty].maxTier).solved).toBe(true);
        keys.add(tracksCanonicalKey(spec));
      }
      expect(keys.size).toBe(list.length);
    }
  }, 120_000);

  it('has 50 distinct, line-solvable, ascending nonogram levels per difficulty', () => {
    for (const difficulty of DIFFICULTIES) {
      const list = levelList('nonogram', difficulty);
      expect(list.length).toBe(50);
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

  it('has 50 unique, distinct shapes levels per difficulty', () => {
    for (const difficulty of DIFFICULTIES) {
      const list = levelList('shapes', difficulty);
      expect(list.length).toBe(50);
      const keys = new Set<string>();
      for (let i = 0; i < list.length; i++) {
        const entry = list[i]!;
        const spec = generateShapes(entry.seed, difficulty);
        expect(isSolved(spec, spec.solution)).toBe(true);
        if (difficulty !== 'genius') expect(isUnique(spec)).toBe(true);
        keys.add(canonicalKey(spec));
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
