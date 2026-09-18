import { describe, expect, it } from 'vitest';
import { nextPeriodStart, periodKey } from '../src/schedule.ts';
import { decodeRef, encodeRef, periodRef } from '../src/ref.ts';

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

  it('rejects garbage', () => {
    expect(decodeRef('t=nope&d=easy&s=1')).toBeNull();
    expect(decodeRef('t=shapes&d=easy')).toBeNull();
  });
});
