export const DIFFICULTIES = ['easy', 'medium', 'hard', 'genius'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const PERIODS = ['daily', 'weekly', 'monthly'] as const;
export type Period = (typeof PERIODS)[number];

export const PUZZLE_TYPES = ['shapes', 'nonogram'] as const;
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
