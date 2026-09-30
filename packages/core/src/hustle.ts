import { hashString, Rng } from './rng.ts';
import { PUZZLE_TYPES, type Difficulty, type PuzzleTypeId } from './types.ts';

// Hustle: one endless sequence, the same for every player. Stage n (from 1) has a fixed type
// and difficulty; the seed is found where the board is built (see hustleRef in ref.ts).
export const HUSTLE_MAX_STAGE = 100_000;
export const HUSTLE_ROUND = PUZZLE_TYPES.length;

const TIERS: readonly { upTo: number; difficulty: Difficulty }[] = [
  { upTo: 40, difficulty: 'easy' },
  { upTo: 120, difficulty: 'medium' },
  { upTo: 300, difficulty: 'hard' },
  { upTo: Number.POSITIVE_INFINITY, difficulty: 'genius' },
];

export function hustleDifficulty(n: number): Difficulty {
  return TIERS.find((t) => n <= t.upTo)!.difficulty;
}

// Each round of ten plays every type once in its own shuffled order. A round never opens with
// the type the previous one closed on, so no type comes twice in a row.
function roundOrder(round: number): PuzzleTypeId[] {
  const order = new Rng(hashString(`hustle-round|${round}`)).shuffle([...PUZZLE_TYPES]);
  if (round > 0) {
    const before = new Rng(hashString(`hustle-round|${round - 1}`)).shuffle([...PUZZLE_TYPES]);
    if (order[0] === before[before.length - 1]) [order[0], order[1]] = [order[1]!, order[0]!];
  }
  return order;
}

export function hustleType(n: number): PuzzleTypeId {
  return roundOrder(Math.floor((n - 1) / HUSTLE_ROUND))[(n - 1) % HUSTLE_ROUND]!;
}

export function hustleSlot(n: number): { type: PuzzleTypeId; difficulty: Difficulty } {
  return { type: hustleType(n), difficulty: hustleDifficulty(n) };
}

export const HUSTLE_MILESTONE = 10;

export function hustleMilestoneCoins(n: number): number {
  return n % HUSTLE_MILESTONE === 0 ? Math.min(100, 20 + 5 * (n / HUSTLE_MILESTONE)) : 0;
}
