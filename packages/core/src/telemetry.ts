import { HUSTLE_MAX_STAGE } from './hustle.ts';
import { isDifficulty, isPuzzleTypeId, type Difficulty, type PuzzleTypeId } from './types.ts';

// Anonymous usage events. No event carries anything that tells two devices apart: no id, no
// timestamp finer than the day, and the install age only as a coarse bucket.
export const PLATFORMS = ['android', 'ios', 'web'] as const;
export type Platform = (typeof PLATFORMS)[number];

// A Hustle attempt carries its stage in `level` (since 2026-09-30; before, Hustle counted as random).
export const ATTEMPT_MODES = ['daily', 'weekly', 'monthly', 'level', 'random', 'hustle'] as const;
export type AttemptMode = (typeof ATTEMPT_MODES)[number];

// Lower bounds in days since install. 0 and 1 stay exact, they carry next-day retention.
export const AGE_BUCKETS = [0, 1, 2, 3, 7, 14, 30, 90] as const;

export function ageBucket(days: number): number {
  let bucket: number = AGE_BUCKETS[0];
  for (const b of AGE_BUCKETS) if (days >= b) bucket = b;
  return bucket;
}

interface Base {
  day: string;
  platform: Platform;
  build: string;
  age: number;
}

export type TelemetryEvent =
  | (Base & { kind: 'launch' })
  | (Base & { kind: 'intro'; step: number; outcome: 'done' | 'skipped' })
  | (Base & {
      kind: 'attempt';
      type: PuzzleTypeId;
      difficulty: Difficulty;
      mode: AttemptMode;
      level: number | null;
      outcome: 'solved' | 'left';
      seconds: number;
      moves: number;
      hints: number;
      resumed: boolean;
      first: boolean;
    });

// What a caller supplies; the telemetry module stamps the Base fields.
export type TelemetryPayload = TelemetryEvent extends infer E ? (E extends unknown ? Omit<E, keyof Base> : never) : never;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const BUILD = /^[a-z0-9.-]{1,16}$/;

const count = (v: unknown, max: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

export function parseTelemetryEvent(value: unknown): TelemetryEvent | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.day !== 'string' || !DAY.test(v.day)) return null;
  if (!oneOf(PLATFORMS, v.platform)) return null;
  if (typeof v.build !== 'string' || !BUILD.test(v.build)) return null;
  if (!(AGE_BUCKETS as readonly unknown[]).includes(v.age)) return null;
  const base: Base = { day: v.day, platform: v.platform, build: v.build, age: v.age as number };

  if (v.kind === 'launch') return { ...base, kind: 'launch' };
  if (v.kind === 'intro') {
    if (!count(v.step, 9) || (v.outcome !== 'done' && v.outcome !== 'skipped')) return null;
    return { ...base, kind: 'intro', step: v.step, outcome: v.outcome };
  }
  if (v.kind === 'attempt') {
    if (!isPuzzleTypeId(v.type) || !isDifficulty(v.difficulty) || !oneOf(ATTEMPT_MODES, v.mode)) return null;
    if (v.level !== null && !count(v.level, v.mode === 'hustle' ? HUSTLE_MAX_STAGE : 999)) return null;
    if (v.outcome !== 'solved' && v.outcome !== 'left') return null;
    if (!count(v.seconds, 86_400) || !count(v.moves, 100_000) || !count(v.hints, 999)) return null;
    if (typeof v.resumed !== 'boolean' || typeof v.first !== 'boolean') return null;
    return {
      ...base,
      kind: 'attempt',
      type: v.type,
      difficulty: v.difficulty,
      mode: v.mode,
      level: v.level as number | null,
      outcome: v.outcome,
      seconds: v.seconds,
      moves: v.moves,
      hints: v.hints,
      resumed: v.resumed,
      first: v.first,
    };
  }
  return null;
}
