import { hashString } from './rng.ts';
import { PUZZLE_TYPES, type Difficulty, type Period, type PuzzleTypeId } from './types.ts';

export const TIME_ZONE = 'Europe/Berlin';

const dateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export function localDateParts(date: Date = new Date()): DateParts {
  const [y, m, d] = dateFormat.format(date).split('-');
  return { year: Number(y), month: Number(m), day: Number(d) };
}

export function isoWeek(parts: DateParts): { year: number; week: number } {
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(utc.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((utc.getTime() - yearStart) / 86400000 + 1) / 7);
  return { year: utc.getUTCFullYear(), week };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function periodKey(period: Period, date: Date = new Date()): string {
  const parts = localDateParts(date);
  switch (period) {
    case 'daily':
      return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
    case 'weekly': {
      const { year, week } = isoWeek(parts);
      return `${year}-W${pad(week)}`;
    }
    case 'monthly':
      return `${parts.year}-${pad(parts.month)}`;
  }
}

export const PERIOD_DIFFICULTY: Record<Period, Difficulty> = {
  daily: 'medium',
  weekly: 'hard',
  monthly: 'genius',
};

const DAILY_DIFFICULTY: Partial<Record<PuzzleTypeId, Difficulty>> = {
  shapes: 'hard',
  stars: 'easy',
  sudoku: 'easy',
};

export function periodDifficulty(type: PuzzleTypeId, period: Period): Difficulty {
  return (period === 'daily' ? DAILY_DIFFICULTY[type] : undefined) ?? PERIOD_DIFFICULTY[period];
}

// The dailies, in the order PUZZLE_TYPES gives them. Killer Sudoku sits out: plain Sudoku
// carries the daily and Killer is the one for experts, reachable through its levels and
// through the weekly and monthly rotation below. Unlike PERIOD_TYPES this is derived, because
// nothing here depends on the position, only on membership.
export const DAILY_TYPES: readonly PuzzleTypeId[] = PUZZLE_TYPES.filter((type) => type !== 'killer');

// Deliberately not derived from PUZZLE_TYPES: the position here decides which type a weekly
// or monthly is. Reordering rewrites every past period and orphans the solves recorded
// under the old type. Zip is absent because it has no period options.
export const PERIOD_TYPES: readonly PuzzleTypeId[] = ['shapes', 'nonogram', 'mosaic', 'crowns', 'stars', 'sudoku', 'killer'];

export function periodPuzzleType(period: Period, key: string): PuzzleTypeId {
  const index = hashString(`type|${period}|${key}`) % PERIOD_TYPES.length;
  return PERIOD_TYPES[index] as PuzzleTypeId;
}

export function periodSeed(type: PuzzleTypeId, period: Period, key: string): number {
  return hashString(`${type}|${period}|${key}`) % 0xffffffff;
}

export function nextPeriodStart(period: Period, date: Date = new Date()): Date {
  const parts = localDateParts(date);
  let probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  const key = periodKey(period, date);
  for (let i = 0; i < 40; i++) {
    probe = new Date(probe.getTime() + 86400000);
    if (periodKey(period, probe) !== key) break;
  }
  const next = localDateParts(probe);
  return zonedMidnight(next);
}

function zonedMidnight(parts: DateParts): Date {
  const guess = Date.UTC(parts.year, parts.month - 1, parts.day, 0);
  for (const offsetHours of [1, 2, 0]) {
    const candidate = new Date(guess - offsetHours * 3600000);
    const back = localDateParts(candidate);
    const hour = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', hourCycle: 'h23' }).format(candidate);
    if (back.day === parts.day && back.month === parts.month && hour === '00') return candidate;
  }
  return new Date(guess);
}
