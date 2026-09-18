export const DIFFICULTIES = ['easy', 'medium', 'hard', 'genius'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const PERIODS = ['daily', 'weekly', 'monthly'] as const;
export type Period = (typeof PERIODS)[number];

export const PUZZLE_TYPES = ['tablet'] as const;
export type PuzzleTypeId = (typeof PUZZLE_TYPES)[number];

export interface PuzzleMeta {
  id: PuzzleTypeId;
  name: string;
  tagline: string;
}

export const PUZZLE_META: Record<PuzzleTypeId, PuzzleMeta> = {
  tablet: {
    id: 'tablet',
    name: 'Prophecy Tablet',
    tagline: 'Overlap fragments. Overlaps cancel out. Match the prophecy.',
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
