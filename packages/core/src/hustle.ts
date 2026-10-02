import { hashString, Rng } from './rng.ts';
import { balancedDifficulty } from './schedule.ts';
import { PUZZLE_TYPES, type Difficulty, type PuzzleTypeId } from './types.ts';

// Hustle: one endless sequence, the same for every player. Stage n (from 1) has a fixed type
// and difficulty; the seed is found where the board is built (see hustleRef in ref.ts).
export const HUSTLE_MAX_STAGE = 100_000;
// The stretch the Clean Round achievement counts, not the type rounds below.
export const HUSTLE_ROUND = 10;

// The slow types come only as bosses (2026-10-02, tester feedback: a Sudoku breaks the flow):
// Sudoku on every 25th stage, Sumdoku on every 50th. All other stages cycle the fast types.
const BOSS_EVERY = 25;
const FAST_TYPES: readonly PuzzleTypeId[] = PUZZLE_TYPES.filter((t) => t !== 'sudoku' && t !== 'killer');

export function hustleBoss(n: number): PuzzleTypeId | null {
  if (n % (2 * BOSS_EVERY) === 0) return 'killer';
  return n % BOSS_EVERY === 0 ? 'sudoku' : null;
}

const TIERS: readonly { upTo: number; difficulty: Difficulty }[] = [
  { upTo: 40, difficulty: 'easy' },
  { upTo: 120, difficulty: 'medium' },
  { upTo: 300, difficulty: 'hard' },
  { upTo: Number.POSITIVE_INFINITY, difficulty: 'genius' },
];

export function hustleDifficulty(n: number): Difficulty {
  return TIERS.find((t) => n <= t.upTo)!.difficulty;
}

// Each round plays every fast type once in its own shuffled order. A round never opens with
// the type the previous one closed on, so no type comes twice in a row.
function roundOrder(round: number): PuzzleTypeId[] {
  const order = new Rng(hashString(`hustle-round|${round}`)).shuffle([...FAST_TYPES]);
  if (round > 0) {
    const before = new Rng(hashString(`hustle-round|${round - 1}`)).shuffle([...FAST_TYPES]);
    if (order[0] === before[before.length - 1]) [order[0], order[1]] = [order[1]!, order[0]!];
  }
  return order;
}

export function hustleType(n: number): PuzzleTypeId {
  const boss = hustleBoss(n);
  if (boss) return boss;
  const k = n - 1 - Math.floor(n / BOSS_EVERY);
  return roundOrder(Math.floor(k / FAST_TYPES.length))[k % FAST_TYPES.length]!;
}

// The tier of the stage, balanced per type like the dailies (2026-09-30: Killer medium at stages
// 49 and 56 took testers far longer than the stages around it).
export function hustleSlot(n: number): { type: PuzzleTypeId; difficulty: Difficulty } {
  const type = hustleType(n);
  return { type, difficulty: balancedDifficulty(type, hustleDifficulty(n)) };
}

// The Hustle level: the highest stage of the unbroken run from 1. A gap stops the count there.
export function hustleRun(stages: ReadonlySet<number>): number {
  let n = 0;
  while (stages.has(n + 1)) n++;
  return n;
}

export const HUSTLE_MILESTONE = 10;

export function hustleMilestoneCoins(n: number): number {
  return n % HUSTLE_MILESTONE === 0 ? Math.min(100, 20 + 5 * (n / HUSTLE_MILESTONE)) : 0;
}
