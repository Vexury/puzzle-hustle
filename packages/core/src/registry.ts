import { generateMosaic, MOSAIC_VERSION, type MosaicOptions } from './mosaic/puzzle.ts';
import { mosaicCanonicalKey, mosaicDifficultyReport, mosaicFamilyKey } from './mosaic/solver.ts';
import { generateNonogram, NONOGRAM_VERSION, type NonogramOptions } from './nonogram/puzzle.ts';
import { nonogramCanonicalKey, nonogramDifficultyReport, nonogramFamilyKey } from './nonogram/solver.ts';
import { generateCrowns, generateStars, REGIONS_BUDGET, REGIONS_VERSION, type RegionsOptions, type RegionsSpec } from './regions/puzzle.ts';
import { regionsCanonicalKey, regionsDifficultyReport, regionsFamilyKey } from './regions/solver.ts';
import { generateShapes, SHAPES_VERSION, type ShapesOptions } from './shapes/puzzle.ts';
import { generateKiller, generateSudoku, KILLER_VERSION, SUDOKU_VERSION, type SudokuOptions, type SudokuSpec } from './sudoku/puzzle.ts';
import { killerFamilyKey, sudokuCanonicalKey, sudokuDifficultyReport } from './sudoku/solver.ts';
import { canonicalKey, difficultyReport, isUnique, shapesFamilyKey } from './shapes/solver.ts';
import { generateSlabs, SLABS_VERSION } from './slabs/puzzle.ts';
import { slabsCanonicalKey, slabsDifficultyReport, slabsFamilyKey } from './slabs/solver.ts';
import { generateTracks, TRACKS_VERSION } from './tracks/puzzle.ts';
import { tracksCanonicalKey, tracksDifficultyReport, tracksFamilyKey } from './tracks/solver.ts';
import { generateZip, ZIP_VERSION, type ZipOptions } from './zip/puzzle.ts';
import { zipCanonicalKey, zipDifficultyReport, zipFamilyKey } from './zip/solver.ts';
import type { Difficulty, Period, PuzzleTypeId } from './types.ts';

export const RUNTIME_BUDGET = 3_000_000;

export interface PuzzleAdapter<TOptions> {
  version: number;
  options(period: Period | undefined): TOptions;
  accepts(seed: number, difficulty: Difficulty, options: TOptions, budget?: number): boolean;
  key(seed: number, difficulty: Difficulty): string;
  score(seed: number, difficulty: Difficulty, budget?: number): number;
  // Two puzzles sharing a family key use the same building blocks in the same counts and
  // differ only in where those sit. The level generator keeps such levels apart. Absent
  // for types whose puzzles have no vocabulary to compare, see killerFamilyKey.
  family?(seed: number, difficulty: Difficulty): string;
}

// accepts, key, score and family each ask the generator for the same puzzle, so one seed
// used to cost four generator runs. Generators are pure functions of seed, difficulty and
// options, so remembering the last few is safe. A budget only decides whether a generator
// gives up, never what it returns, so it stays out of the key. Callers of spec() share the
// cached object and must not mutate it.
const REUSE_SLOTS = 4;

function reuse<TSpec, TOptions>(
  generate: (seed: number, difficulty: Difficulty, options?: TOptions, budget?: number) => TSpec,
): (seed: number, difficulty: Difficulty, options?: TOptions, budget?: number) => TSpec {
  const recent = new Map<string, TSpec>();
  return (seed, difficulty, options, budget) => {
    const key = `${seed}|${difficulty}|${JSON.stringify(options ?? {})}`;
    let spec = recent.get(key);
    if (spec === undefined) {
      spec = generate(seed, difficulty, options, budget);
      if (recent.size >= REUSE_SLOTS) recent.delete(recent.keys().next().value!);
    } else {
      recent.delete(key);
    }
    recent.set(key, spec);
    return spec;
  };
}

const shapes = reuse(generateShapes);
const nonogram = reuse(generateNonogram);
const mosaic = reuse(generateMosaic);
const zip = reuse(generateZip);

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
    return isUnique(shapes(seed, difficulty, options), budget);
  },
  key(seed, difficulty) {
    return canonicalKey(shapes(seed, difficulty));
  },
  score(seed, difficulty, budget = 5_000_000) {
    return difficultyReport(shapes(seed, difficulty), budget).score;
  },
  family(seed, difficulty) {
    return shapesFamilyKey(shapes(seed, difficulty));
  },
};

export const nonogramAdapter: PuzzleAdapter<NonogramOptions> = {
  version: NONOGRAM_VERSION,
  options(period) {
    switch (period) {
      case 'weekly':
        return { rowDelta: 2 };
      case 'monthly':
        return { rowDelta: 4 };
      default:
        return {};
    }
  },
  accepts(seed, difficulty, options) {
    try {
      nonogram(seed, difficulty, options);
      return true;
    } catch {
      return false;
    }
  },
  key(seed, difficulty) {
    return nonogramCanonicalKey(nonogram(seed, difficulty));
  },
  score(seed, difficulty) {
    return nonogramDifficultyReport(nonogram(seed, difficulty)).score;
  },
  family(seed, difficulty) {
    return nonogramFamilyKey(nonogram(seed, difficulty));
  },
};

export const mosaicAdapter: PuzzleAdapter<MosaicOptions> = {
  version: MOSAIC_VERSION,
  options(period) {
    switch (period) {
      case 'weekly':
        return { rowDelta: 2 };
      case 'monthly':
        return { rowDelta: 4 };
      default:
        return {};
    }
  },
  accepts(seed, difficulty, options) {
    try {
      mosaic(seed, difficulty, options);
      return true;
    } catch {
      return false;
    }
  },
  key(seed, difficulty) {
    return mosaicCanonicalKey(mosaic(seed, difficulty));
  },
  score(seed, difficulty) {
    return mosaicDifficultyReport(mosaic(seed, difficulty)).score;
  },
  family(seed, difficulty) {
    return mosaicFamilyKey(mosaic(seed, difficulty));
  },
};

function sudokuLikeAdapter(generate: typeof generateSudoku, version: number, familyKey?: (spec: SudokuSpec) => string): PuzzleAdapter<SudokuOptions> {
  const build = reuse(generate);
  const puzzle: PuzzleAdapter<SudokuOptions> = {
    version,
    options() {
      return {};
    },
    accepts(seed, difficulty) {
      try {
        build(seed, difficulty);
        return true;
      } catch {
        return false;
      }
    },
    key(seed, difficulty) {
      return sudokuCanonicalKey(build(seed, difficulty));
    },
    score(seed, difficulty) {
      return sudokuDifficultyReport(build(seed, difficulty)).score;
    },
  };
  if (familyKey) puzzle.family = (seed, difficulty) => familyKey(build(seed, difficulty));
  return puzzle;
}

export interface RegionsAdapter extends PuzzleAdapter<RegionsOptions> {
  // The spec accepts just built for this seed, from the cache when it is still there. Play
  // uses it so a scheduled or random pick is not generated a second time.
  spec(seed: number, difficulty: Difficulty, options: RegionsOptions): RegionsSpec;
}

function regionsAdapter(generate: typeof generateCrowns, options: PuzzleAdapter<RegionsOptions>['options']): RegionsAdapter {
  const build = reuse(generate);
  return {
    version: REGIONS_VERSION,
    options,
    // Always REGIONS_BUDGET, whatever the caller passes: the budget is part of which seed a
    // period gets. key, score, family and spec serve seeds already picked, such as level
    // seeds chosen before the budget existed, so they run without one.
    accepts(seed, difficulty, opts) {
      try {
        build(seed, difficulty, opts, REGIONS_BUDGET);
        return true;
      } catch {
        return false;
      }
    },
    key(seed, difficulty) {
      return regionsCanonicalKey(build(seed, difficulty));
    },
    score(seed, difficulty) {
      return regionsDifficultyReport(build(seed, difficulty)).score;
    },
    family(seed, difficulty) {
      return regionsFamilyKey(build(seed, difficulty));
    },
    spec(seed, difficulty, opts) {
      return build(seed, difficulty, opts);
    },
  };
}

export const crownsAdapter = regionsAdapter(generateCrowns, (period) => {
  switch (period) {
    case 'weekly':
      return { sizeDelta: 1 };
    case 'monthly':
      return { sizeDelta: 2 };
    default:
      return {};
  }
});
export const starsAdapter = regionsAdapter(generateStars, () => ({}));

export const sudokuAdapter = sudokuLikeAdapter(generateSudoku, SUDOKU_VERSION);
export const killerAdapter = sudokuLikeAdapter(generateKiller, KILLER_VERSION, killerFamilyKey);

export const zipAdapter: PuzzleAdapter<ZipOptions> = {
  version: ZIP_VERSION,
  options(period) {
    switch (period) {
      case 'weekly':
        return { sizeDelta: 1 };
      case 'monthly':
        return { sizeDelta: 2 };
      default:
        return {};
    }
  },
  accepts(seed, difficulty, options) {
    try {
      zip(seed, difficulty, options);
      return true;
    } catch {
      return false;
    }
  },
  key(seed, difficulty) {
    return zipCanonicalKey(zip(seed, difficulty));
  },
  score(seed, difficulty) {
    return zipDifficultyReport(zip(seed, difficulty)).score;
  },
  family(seed, difficulty) {
    return zipFamilyKey(zip(seed, difficulty));
  },
};

const tracks = reuse(generateTracks);

// No period options yet: hard and genius are not in the weekly/monthly rotation.
export const tracksAdapter: PuzzleAdapter<Record<string, never>> = {
  version: TRACKS_VERSION,
  options() {
    return {};
  },
  accepts(seed, difficulty) {
    try {
      tracks(seed, difficulty);
      return true;
    } catch {
      return false;
    }
  },
  key(seed, difficulty) {
    return tracksCanonicalKey(tracks(seed, difficulty));
  },
  score(seed, difficulty) {
    return tracksDifficultyReport(tracks(seed, difficulty)).score;
  },
  family(seed, difficulty) {
    return tracksFamilyKey(tracks(seed, difficulty));
  },
};

const slabs = reuse(generateSlabs);

// No period options yet: hard and genius are not in the weekly/monthly rotation.
export const slabsAdapter: PuzzleAdapter<Record<string, never>> = {
  version: SLABS_VERSION,
  options() {
    return {};
  },
  accepts(seed, difficulty) {
    try {
      slabs(seed, difficulty);
      return true;
    } catch {
      return false;
    }
  },
  key(seed, difficulty) {
    return slabsCanonicalKey(slabs(seed, difficulty));
  },
  score(seed, difficulty) {
    return slabsDifficultyReport(slabs(seed, difficulty)).score;
  },
  family(seed, difficulty) {
    return slabsFamilyKey(slabs(seed, difficulty));
  },
};

export const ADAPTERS: { [K in PuzzleTypeId]: PuzzleAdapter<never> } = {
  shapes: shapesAdapter as PuzzleAdapter<never>,
  nonogram: nonogramAdapter as PuzzleAdapter<never>,
  mosaic: mosaicAdapter as PuzzleAdapter<never>,
  crowns: crownsAdapter as PuzzleAdapter<RegionsOptions> as PuzzleAdapter<never>,
  stars: starsAdapter as PuzzleAdapter<RegionsOptions> as PuzzleAdapter<never>,
  sudoku: sudokuAdapter as PuzzleAdapter<never>,
  killer: killerAdapter as PuzzleAdapter<never>,
  zip: zipAdapter as PuzzleAdapter<never>,
  tracks: tracksAdapter as PuzzleAdapter<never>,
  slabs: slabsAdapter as PuzzleAdapter<never>,
};

export function adapter(type: PuzzleTypeId): PuzzleAdapter<never> {
  return ADAPTERS[type];
}
