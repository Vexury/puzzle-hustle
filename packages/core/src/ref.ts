import { POOL_SEEDS } from './boards/pools.ts';
import { HUSTLE_MAX_STAGE, hustleSlot } from './hustle.ts';
import { levelEntry } from './levels.ts';
import { parsePuzzleId } from './puzzleId.ts';
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
  hustle?: number;
}

const PERIOD_ATTEMPTS = 24;

// Each entry costs a generator run per attempt, about 160 ms for all seven dailies. Once a
// day is fine, once per render is not.
const scheduledCache = new Map<string, PuzzleRef>();

// The found seeds for a client to keep across cold starts (apps/web lib/refCache.ts), where
// the search is most of the time to the first frame. Each entry carries its adapter version and
// difficulty, and one that no longer matches is searched again, so a stored seed never makes a
// device disagree with the others about a daily.
export type StoredRef = [type: PuzzleTypeId, period: Period, key: string, difficulty: Difficulty, version: number, seed: number];

export function storedScheduledRefs(keep: (period: Period, key: string) => boolean): StoredRef[] {
  return [...scheduledCache.values()].filter((r) => keep(r.period!, r.key!)).map((r) => [r.type, r.period!, r.key!, r.difficulty, adapter(r.type).version, r.seed]);
}

export function primeScheduledRefs(entries: unknown) {
  if (!Array.isArray(entries)) return;
  for (const e of entries) {
    if (!Array.isArray(e) || e.length !== 6) continue;
    const [type, period, key, difficulty, version, seed] = e as unknown[];
    if (!isPuzzleTypeId(type) || !isPeriod(period) || typeof key !== 'string' || !isDifficulty(difficulty)) continue;
    if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0) continue;
    if (version !== adapter(type).version || difficulty !== periodDifficulty(type, period)) continue;
    scheduledCache.set(`${type}|${period}|${key}`, { type, difficulty, seed, period, key });
  }
}

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

// Cheap: type, difficulty and, where a Random pool exists, the pooled seed. Every other seed is
// found where the board is built (hustleSeed), because finding it runs the generator.
export function hustleRef(n: number): PuzzleRef {
  const { type, difficulty } = hustleSlot(n);
  const pool = POOL_SEEDS[type]?.[difficulty];
  let seed = 0;
  if (pool?.length) {
    let before = 0;
    for (let k = 1; k < n; k++) {
      const slot = hustleSlot(k);
      if (slot.type === type && slot.difficulty === difficulty) before++;
    }
    seed = pool[before % pool.length]!;
  }
  return { type, difficulty, seed, hustle: n };
}

// The first seed the adapter accepts for stage n, like a period's seed.
export function hustleSeed(n: number): number {
  const { type, difficulty } = hustleSlot(n);
  const a = adapter(type);
  let seed = 0;
  for (let attempt = 0; attempt < PERIOD_ATTEMPTS; attempt++) {
    seed = hashString(`hustle|${n}|${attempt}`) % 0xffffffff;
    if (a.accepts(seed, difficulty, a.options(undefined))) break;
  }
  return seed;
}

export function encodeRef(ref: PuzzleRef): string {
  if (ref.hustle) return new URLSearchParams({ h: String(ref.hustle) }).toString();
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
  const hustle = params.get('h');
  if (hustle !== null) {
    const n = Number(hustle);
    return Number.isInteger(n) && n >= 1 && n <= HUSTLE_MAX_STAGE ? hustleRef(n) : null;
  }
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
  // A period link names its puzzle by period and key alone. Seed and difficulty in the link
  // are ignored, so a stale or edited link cannot claim the period's solve slot for another
  // puzzle; a period this type does not own falls back to a plain random ref.
  const period = params.get('p');
  const key = params.get('k');
  if (isPeriod(period) && key && parsePuzzleId(`${type}:${period}:${key}`)) {
    if (period === 'daily' || type === periodPuzzleType(period, key)) return { ...scheduledRef(type, period, key), period, key };
  }
  return { type, difficulty, seed };
}

export function refId(ref: PuzzleRef): string {
  if (ref.hustle) return `hustle:${ref.hustle}`;
  if (ref.period && ref.key) return `${ref.type}:${ref.period}:${ref.key}`;
  if (ref.level) return `${ref.type}:level:${ref.difficulty}:${ref.level}`;
  return `${ref.type}:${ref.difficulty}:${ref.seed.toString(36)}`;
}
