import type { Difficulty, PuzzleTypeId } from './types.ts';

// Seconds a level of this type should take on medium for its third star. First guesses from the
// daily medians of the report (2026-09-30), meant to be tuned against it: the star should take
// a good run, not a lucky one.
const MEDIUM_TARGET: Record<PuzzleTypeId, number> = {
  zip: 40,
  shapes: 20,
  nonogram: 150,
  mosaic: 90,
  crowns: 60,
  stars: 120,
  sudoku: 300,
  killer: 480,
  tracks: 120,
  slabs: 120,
};

const DIFFICULTY_FACTOR: Record<Difficulty, number> = { easy: 0.5, medium: 1, hard: 2, genius: 3.5 };

export function starTarget(type: PuzzleTypeId, difficulty: Difficulty): number {
  return Math.round(MEDIUM_TARGET[type] * DIFFICULTY_FACTOR[difficulty]);
}

// Stars of a solved level, from its best run: one for solving it, one for no hint, one for
// finishing within the target. The stored record is the fastest run that did not take more
// hints, so a hinted replay never costs a star.
export function levelStars(type: PuzzleTypeId, difficulty: Difficulty, solve: { seconds: number; hints: number } | undefined): 0 | 1 | 2 | 3 {
  if (!solve) return 0;
  return (1 + (solve.hints === 0 ? 1 : 0) + (solve.seconds <= starTarget(type, difficulty) ? 1 : 0)) as 1 | 2 | 3;
}
