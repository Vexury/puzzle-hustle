import { ACHIEVEMENTS_EPOCH, unlockedAchievements, type SolveEntry } from './achievements.ts';
import { findCosmetic } from './cosmetics.ts';
import { DAILY_TYPES, periodKey } from './schedule.ts';
import { parseSolveId } from './solveId.ts';
import type { Difficulty, Period, PuzzleTypeId } from './types.ts';

export const HINT_PRICE = 20;
export const ACHIEVEMENT_COINS = 25;
export const CLEAN_SWEEP_COINS = 20;
export const RANDOM_COINS = 1;
// Random is endless, so without a cap it would be a coin farm.
export const RANDOM_DAILY_CAP = 10;

const PERIOD_COINS: Record<Period, { base: number; noHints: number }> = {
  daily: { base: 10, noHints: 5 },
  weekly: { base: 30, noHints: 10 },
  monthly: { base: 75, noHints: 25 },
};

const LEVEL_COINS: Record<Difficulty, number> = { easy: 2, medium: 3, hard: 5, genius: 8 };

export type CoinReason = Period | 'no-hints' | 'level' | 'random' | 'clean-sweep';

export interface CoinAward {
  reason: CoinReason;
  coins: number;
}

// Each entry carries the price paid, so a later price change never rewrites an old balance.
export type SpendEntry =
  | { kind: 'hint'; puzzle: string; coins: number; at: number }
  | { kind: 'item'; item: string; coins: number; at: number };

// One pass in solve order, because two rules depend on what came before on the same Berlin
// day: the random cap and which daily completes a clean sweep.
function awardsBySolve(solves: readonly SolveEntry[], epoch: number): Map<string, CoinAward[]> {
  const ordered = solves
    .filter((s) => s.solvedAt >= epoch)
    .sort((a, b) => a.solvedAt - b.solvedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const out = new Map<string, CoinAward[]>();
  const randomsByDay = new Map<string, number>();
  const dailiesByDay = new Map<string, Set<PuzzleTypeId>>();
  const swept = new Set<string>();

  for (const entry of ordered) {
    const parsed = parseSolveId(entry.id);
    if (!parsed) continue;
    const awards: CoinAward[] = [];

    if (parsed.mode === 'period' && parsed.period && parsed.key) {
      const rate = PERIOD_COINS[parsed.period];
      awards.push({ reason: parsed.period, coins: rate.base });
      if (entry.hints === 0) awards.push({ reason: 'no-hints', coins: rate.noHints });
      if (parsed.period === 'daily') {
        const types = dailiesByDay.get(parsed.key) ?? new Set<PuzzleTypeId>();
        types.add(parsed.type);
        dailiesByDay.set(parsed.key, types);
        if (!swept.has(parsed.key) && DAILY_TYPES.every((t) => types.has(t))) {
          swept.add(parsed.key);
          awards.push({ reason: 'clean-sweep', coins: CLEAN_SWEEP_COINS });
        }
      }
    } else if (parsed.mode === 'level') {
      awards.push({ reason: 'level', coins: LEVEL_COINS[parsed.difficulty] });
    } else {
      const day = periodKey('daily', new Date(entry.solvedAt));
      const count = randomsByDay.get(day) ?? 0;
      if (count < RANDOM_DAILY_CAP) {
        randomsByDay.set(day, count + 1);
        awards.push({ reason: 'random', coins: RANDOM_COINS });
      }
    }

    if (awards.length > 0) out.set(entry.id, awards);
  }
  return out;
}

export function coinsForSolve(id: string, solves: readonly SolveEntry[], epoch: number = ACHIEVEMENTS_EPOCH): CoinAward[] {
  return awardsBySolve(solves, epoch).get(id) ?? [];
}

export function coinsEarned(solves: readonly SolveEntry[], epoch: number = ACHIEVEMENTS_EPOCH): number {
  let sum = 0;
  for (const awards of awardsBySolve(solves, epoch).values()) for (const a of awards) sum += a.coins;
  return sum + unlockedAchievements(solves, epoch).size * ACHIEVEMENT_COINS;
}

// A flair is never bought (it is earned), so a flair spend entry left over from before that
// change is refunded: it never counts against the balance and never grants ownership below.
function isFlairSpend(entry: SpendEntry): boolean {
  return entry.kind === 'item' && findCosmetic(entry.item)?.kind === 'flair';
}

export function coinBalance(earned: number, spent: readonly SpendEntry[], epoch: number = ACHIEVEMENTS_EPOCH): number {
  let out = earned;
  for (const entry of spent) if (entry.at >= epoch && !isFlairSpend(entry)) out -= entry.coins;
  return Math.max(0, out);
}

export function ownedItems(spent: readonly SpendEntry[], epoch: number = ACHIEVEMENTS_EPOCH): Set<string> {
  const owned = new Set<string>();
  for (const entry of spent) if (entry.kind === 'item' && entry.at >= epoch && !isFlairSpend(entry)) owned.add(entry.item);
  return owned;
}
