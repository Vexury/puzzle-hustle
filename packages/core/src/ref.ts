import { levelEntry } from './levels.ts';
import { adapter } from './registry.ts';
import { hashString, randomSeed } from './rng.ts';
import { periodDifficulty, periodKey, periodPuzzleType } from './schedule.ts';
import { isDifficulty, isPeriod, isPuzzleTypeId, type Difficulty, type Period, type PuzzleTypeId } from './types.ts';

export interface PuzzleRef {
  type: PuzzleTypeId;
  difficulty: Difficulty;
  seed: number;
  period?: Period;
  key?: string;
  level?: number;
}

const PERIOD_ATTEMPTS = 24;

// Each entry costs a generator run per attempt, about 180 ms for all eight dailies. Once a
// day is fine, once per render is not.
const scheduledCache = new Map<string, PuzzleRef>();

export function periodRef(period: Period, date: Date = new Date()): PuzzleRef {
  const key = periodKey(period, date);
  return { ...scheduledRef(periodPuzzleType(period, key), period, key), period, key };
}

export function dailyRef(type: PuzzleTypeId, date: Date = new Date()): PuzzleRef {
  const key = periodKey('daily', date);
  return { ...scheduledRef(type, 'daily', key), period: 'daily', key };
}

export function scheduledRef(type: PuzzleTypeId, period: Period, key: string): PuzzleRef {
  const cacheKey = `${type}|${period}|${key}`;
  const cached = scheduledCache.get(cacheKey);
  if (cached) return cached;
  const difficulty = periodDifficulty(type, period);
  const a = adapter(type);
  const options = a.options(period);
  let seed = 0;
  for (let attempt = 0; attempt < PERIOD_ATTEMPTS; attempt++) {
    seed = hashString(`${type}|${period}|${key}|${attempt}`) % 0xffffffff;
    if (a.accepts(seed, difficulty, options)) break;
  }
  const ref: PuzzleRef = { type, difficulty, seed, period, key };
  scheduledCache.set(cacheKey, ref);
  return ref;
}

export function randomRef(type: PuzzleTypeId, difficulty: Difficulty): PuzzleRef {
  const a = adapter(type);
  for (let attempt = 0; attempt < 50; attempt++) {
    const seed = randomSeed();
    if (a.accepts(seed, difficulty, a.options(undefined))) return { type, difficulty, seed };
  }
  return { type, difficulty, seed: randomSeed() };
}

export function levelRef(type: PuzzleTypeId, difficulty: Difficulty, level: number): PuzzleRef | null {
  const entry = levelEntry(type, difficulty, level);
  return entry ? { type, difficulty, seed: entry.seed, level } : null;
}

export function encodeRef(ref: PuzzleRef): string {
  const params = new URLSearchParams({ t: ref.type, d: ref.difficulty, s: ref.seed.toString(36) });
  if (ref.period && ref.key) {
    params.set('p', ref.period);
    params.set('k', ref.key);
  }
  if (ref.level) params.set('l', String(ref.level));
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
  const level = Number(params.get('l'));
  if (level > 0) {
    const ref = levelRef(type, difficulty, level);
    if (ref) return ref;
  }
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
  if (ref.period && ref.key) return `${ref.type}:${ref.period}:${ref.key}`;
  if (ref.level) return `${ref.type}:level:${ref.difficulty}:${ref.level}`;
  return `${ref.type}:${ref.difficulty}:${ref.seed.toString(36)}`;
}
