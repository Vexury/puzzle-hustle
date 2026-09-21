import type { Period, PuzzleTypeId } from './types.ts';

// Lower bounds on how long a puzzle can physically take, in seconds. These exist to reject
// the impossible, not to judge a fast player: a rejected submission is lost data, a missed
// cheat costs a line in a list only friends see. Tune upwards from real submissions once
// the board has run for a few weeks.
const DAILY_FLOOR: Record<PuzzleTypeId, number> = {
  shapes: 4,
  zip: 5,
  nonogram: 10,
  mosaic: 8,
  crowns: 6,
  stars: 8,
  sudoku: 20,
  killer: 20,
};

// Rough scaling choice to be tuned from real data as the board runs
const PERIOD_FACTOR: Record<Period, number> = {
  daily: 1,
  weekly: 1.4,
  monthly: 2,
};

export function minimumSeconds(type: PuzzleTypeId, period: Period): number {
  return Math.round(DAILY_FLOOR[type] * PERIOD_FACTOR[period]);
}
