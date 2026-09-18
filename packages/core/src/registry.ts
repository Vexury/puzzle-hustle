import { generateMosaic, MOSAIC_VERSION, type MosaicOptions } from './mosaic/puzzle.ts';
import { mosaicCanonicalKey, mosaicDifficultyReport } from './mosaic/solver.ts';
import { generateNonogram, NONOGRAM_VERSION, type NonogramOptions } from './nonogram/puzzle.ts';
import { nonogramCanonicalKey, nonogramDifficultyReport } from './nonogram/solver.ts';
import { generateShapes, SHAPES_VERSION, type ShapesOptions } from './shapes/puzzle.ts';
import { canonicalKey, difficultyReport, isUnique } from './shapes/solver.ts';
import type { Difficulty, Period, PuzzleTypeId } from './types.ts';

export const RUNTIME_BUDGET = 3_000_000;

export interface PuzzleAdapter<TOptions> {
  version: number;
  options(period: Period | undefined): TOptions;
  accepts(seed: number, difficulty: Difficulty, options: TOptions, budget?: number): boolean;
  key(seed: number, difficulty: Difficulty): string;
  score(seed: number, difficulty: Difficulty, budget?: number): number;
}

export const shapesAdapter: PuzzleAdapter<ShapesOptions> = {
  version: SHAPES_VERSION,
  options(period) {
    switch (period) {
      case 'weekly':
        return { sizeDelta: 1, pieceDelta: 1 };
      case 'monthly':
        return { sizeDelta: 2, pieceDelta: 3 };
      default:
        return {};
    }
  },
  accepts(seed, difficulty, options, budget = RUNTIME_BUDGET) {
    return isUnique(generateShapes(seed, difficulty, options), budget);
  },
  key(seed, difficulty) {
    return canonicalKey(generateShapes(seed, difficulty));
  },
  score(seed, difficulty, budget = 5_000_000) {
    return difficultyReport(generateShapes(seed, difficulty), budget).score;
  },
};

export const nonogramAdapter: PuzzleAdapter<NonogramOptions> = {
  version: NONOGRAM_VERSION,
  options(period) {
    switch (period) {
      case 'weekly':
        return { sizeDelta: 2 };
      case 'monthly':
        return { sizeDelta: 5 };
      default:
        return {};
    }
  },
  accepts(seed, difficulty, options) {
    try {
      generateNonogram(seed, difficulty, options);
      return true;
    } catch {
      return false;
    }
  },
  key(seed, difficulty) {
    return nonogramCanonicalKey(generateNonogram(seed, difficulty));
  },
  score(seed, difficulty) {
    return nonogramDifficultyReport(generateNonogram(seed, difficulty)).score;
  },
};

export const mosaicAdapter: PuzzleAdapter<MosaicOptions> = {
  version: MOSAIC_VERSION,
  options(period) {
    switch (period) {
      case 'weekly':
        return { sizeDelta: 2 };
      case 'monthly':
        return { sizeDelta: 5 };
      default:
        return {};
    }
  },
  accepts(seed, difficulty, options) {
    try {
      generateMosaic(seed, difficulty, options);
      return true;
    } catch {
      return false;
    }
  },
  key(seed, difficulty) {
    return mosaicCanonicalKey(generateMosaic(seed, difficulty));
  },
  score(seed, difficulty) {
    return mosaicDifficultyReport(generateMosaic(seed, difficulty)).score;
  },
};

export const ADAPTERS: { [K in PuzzleTypeId]: PuzzleAdapter<never> } = {
  shapes: shapesAdapter as PuzzleAdapter<never>,
  nonogram: nonogramAdapter as PuzzleAdapter<never>,
  mosaic: mosaicAdapter as PuzzleAdapter<never>,
};

export function adapter(type: PuzzleTypeId): PuzzleAdapter<never> {
  return ADAPTERS[type];
}
