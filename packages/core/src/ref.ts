import { PERIOD_DIFFICULTY, periodKey, periodPuzzleType, periodSeed } from './schedule.ts';
import { isDifficulty, isPeriod, isPuzzleTypeId, type Difficulty, type Period, type PuzzleTypeId } from './types.ts';

export interface PuzzleRef {
  type: PuzzleTypeId;
  difficulty: Difficulty;
  seed: number;
  period?: Period;
  key?: string;
}

export function periodRef(period: Period, date: Date = new Date()): PuzzleRef {
  const key = periodKey(period, date);
  const type = periodPuzzleType(period, key);
  return { type, difficulty: PERIOD_DIFFICULTY[period], seed: periodSeed(type, period, key), period, key };
}

export function periodOptions(period: Period | undefined): { sizeDelta: number; pieceDelta: number } {
  switch (period) {
    case 'weekly':
      return { sizeDelta: 1, pieceDelta: 1 };
    case 'monthly':
      return { sizeDelta: 2, pieceDelta: 3 };
    default:
      return { sizeDelta: 0, pieceDelta: 0 };
  }
}

export function encodeRef(ref: PuzzleRef): string {
  const params = new URLSearchParams({ t: ref.type, d: ref.difficulty, s: ref.seed.toString(36) });
  if (ref.period && ref.key) {
    params.set('p', ref.period);
    params.set('k', ref.key);
  }
  return params.toString();
}

export function decodeRef(query: string | URLSearchParams): PuzzleRef | null {
  const params = typeof query === 'string' ? new URLSearchParams(query) : query;
  const type = params.get('t');
  const difficulty = params.get('d');
  const seedRaw = params.get('s');
  if (!isPuzzleTypeId(type) || !isDifficulty(difficulty) || seedRaw === null) return null;
  const seed = parseInt(seedRaw, 36);
  if (!Number.isFinite(seed) || seed < 0) return null;
  const ref: PuzzleRef = { type, difficulty, seed };
  const period = params.get('p');
  const key = params.get('k');
  if (isPeriod(period) && key) {
    ref.period = period;
    ref.key = key;
  }
  return ref;
}

export function refId(ref: PuzzleRef): string {
  return ref.period && ref.key ? `${ref.type}:${ref.period}:${ref.key}` : `${ref.type}:${ref.difficulty}:${ref.seed.toString(36)}`;
}
