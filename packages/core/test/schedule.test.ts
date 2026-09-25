import { describe, expect, it } from 'vitest';
import { DAILY_TYPES, PERIOD_TYPES, nextPeriodStart, periodKey, periodPuzzleType } from '../src/schedule.ts';
import { decodeRef, encodeRef, periodRef, refId, scheduledRef } from '../src/ref.ts';
import { PUZZLE_TYPES } from '../src/types.ts';

describe('DAILY_TYPES', () => {
  it('is every type but plain Sudoku, in the order of PUZZLE_TYPES', () => {
    expect(DAILY_TYPES).toEqual(PUZZLE_TYPES.filter((t) => t !== 'sudoku'));
    expect(DAILY_TYPES).not.toContain('sudoku');
    expect(DAILY_TYPES).toContain('killer');
  });

  it('leaves the weekly and monthly rotation alone: both Sudokus still show up there', () => {
    expect(PERIOD_TYPES).toContain('killer');
    expect(PERIOD_TYPES).toContain('sudoku');
  });
});

describe('periodKey (Europe/Berlin)', () => {
  it('rolls the day at Berlin midnight, not UTC', () => {
    const lateUtc = new Date('2026-09-18T22:30:00Z');
    expect(periodKey('daily', lateUtc)).toBe('2026-09-19');
    expect(periodKey('monthly', new Date('2026-08-31T22:30:00Z'))).toBe('2026-09');
  });

  it('uses ISO weeks', () => {
    expect(periodKey('weekly', new Date('2026-09-18T10:00:00Z'))).toBe('2026-W38');
    expect(periodKey('weekly', new Date('2027-01-01T10:00:00Z'))).toBe('2026-W53');
  });

  it('computes the next period start', () => {
    const next = nextPeriodStart('daily', new Date('2026-09-18T10:00:00Z'));
    expect(next.toISOString()).toBe('2026-09-18T22:00:00.000Z');
    const winter = nextPeriodStart('daily', new Date('2026-12-10T10:00:00Z'));
    expect(winter.toISOString()).toBe('2026-12-10T23:00:00.000Z');
  });
});

describe('refs', () => {
  it('round-trips through the query string', () => {
    const ref = periodRef('weekly', new Date('2026-09-18T10:00:00Z'));
    const decoded = decodeRef(encodeRef(ref));
    expect(decoded).toEqual(ref);
  });

  it('schedules every type deterministically', () => {
    const a = scheduledRef('nonogram', 'monthly', '2026-09');
    const b = scheduledRef('nonogram', 'monthly', '2026-09');
    expect(a.seed).toBe(b.seed);
    expect(scheduledRef('shapes', 'weekly', '2026-W38').seed).not.toBe(scheduledRef('shapes', 'weekly', '2026-W39').seed);
  });

  it('takes seed and difficulty of a period link from the schedule, not the URL', () => {
    const real = scheduledRef('killer', 'daily', '2026-09-25');
    const decoded = decodeRef(`t=killer&d=hard&s=${(real.seed + 1).toString(36)}&p=daily&k=2026-09-25`);
    expect(decoded).toEqual({ ...real, period: 'daily', key: '2026-09-25' });
    const monthly = periodRef('monthly', new Date('2026-09-18T10:00:00Z'));
    expect(decodeRef(`t=${monthly.type}&d=easy&s=1&p=monthly&k=${monthly.key}`)).toEqual(monthly);
  });

  it('treats a period link with a bad key or the wrong type as a random ref', () => {
    const plain = { type: 'killer', difficulty: 'easy', seed: 1 };
    expect(decodeRef('t=killer&d=easy&s=1&p=daily&k=2026-02-30')).toEqual(plain);
    expect(decodeRef('t=killer&d=easy&s=1&p=daily&k=')).toEqual(plain);
    expect(decodeRef('t=killer&d=easy&s=1&p=yearly&k=2026')).toEqual(plain);
    expect(decodeRef('t=killer&d=easy&s=1&k=2026-09-25')).toEqual(plain);
    const owner = periodPuzzleType('weekly', '2026-W39');
    const other = PERIOD_TYPES.find((t) => t !== owner)!;
    const foreign = decodeRef(`t=${other}&d=hard&s=1&p=weekly&k=2026-W39`)!;
    expect(foreign).toEqual({ type: other, difficulty: 'hard', seed: 1 });
    expect(refId(foreign)).not.toContain('weekly');
  });

  it('rejects garbage', () => {
    expect(decodeRef('t=nope&d=easy&s=1')).toBeNull();
    expect(decodeRef('t=shapes&d=easy')).toBeNull();
  });
});
