export const DIFFICULTIES = ['easy', 'medium', 'hard', 'genius'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const PERIODS = ['daily', 'weekly', 'monthly'] as const;
export type Period = (typeof PERIODS)[number];

export const PUZZLE_TYPES = ['shapes', 'nonogram', 'mosaic', 'crowns', 'stars', 'sudoku', 'killer', 'kakuro', 'zip'] as const;
export type PuzzleTypeId = (typeof PUZZLE_TYPES)[number];

export interface PuzzleMeta {
  id: PuzzleTypeId;
  name: string;
  tagline: string;
}

export const PUZZLE_META: Record<PuzzleTypeId, PuzzleMeta> = {
  shapes: {
    id: 'shapes',
    name: 'Shapes',
    tagline: 'Slide shapes over each other. Overlaps cancel out. Match the target.',
  },
  nonogram: {
    id: 'nonogram',
    name: 'Nonogram',
    tagline: 'Fill cells so every row and column matches its clues.',
  },
  mosaic: {
    id: 'mosaic',
    name: 'Mosaic',
    tagline: 'Each number counts the filled cells in its 3x3 block. Paint the picture.',
  },
  crowns: {
    id: 'crowns',
    name: 'Crowns',
    tagline: 'One crown per row, column and colour. Crowns never touch.',
  },
  stars: {
    id: 'stars',
    name: 'Stars',
    tagline: 'Two stars per row, column and colour. Stars never touch.',
  },
  sudoku: {
    id: 'sudoku',
    name: 'Sudoku',
    tagline: 'Fill the grid so every row, column and box holds 1 to 9.',
  },
  killer: {
    id: 'killer',
    name: 'Killer Sudoku',
    tagline: 'No givens, just cages. Each dashed cage adds up to its number.',
  },
  kakuro: {
    id: 'kakuro',
    name: 'Kakuro',
    tagline: 'Cross sums. Each run adds up to its clue, digits never repeat within a run.',
  },
  zip: {
    id: 'zip',
    name: 'Zip',
    tagline: 'One path from 1 to the last number through every cell. Walls block the way.',
  },
};

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value);
}

export function isPeriod(value: unknown): value is Period {
  return typeof value === 'string' && (PERIODS as readonly string[]).includes(value);
}

export function isPuzzleTypeId(value: unknown): value is PuzzleTypeId {
  return typeof value === 'string' && (PUZZLE_TYPES as readonly string[]).includes(value);
}
