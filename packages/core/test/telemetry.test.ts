import { describe, expect, it } from 'vitest';
import { ageBucket, parseTelemetryEvent } from '../src/telemetry.ts';

const base = { day: '2026-09-28', platform: 'android', build: 'a1b2c3d', age: 0 };
const attempt = {
  ...base,
  kind: 'attempt',
  type: 'shapes',
  difficulty: 'hard',
  mode: 'daily',
  level: null,
  outcome: 'left',
  seconds: 42,
  moves: 7,
  hints: 1,
  resumed: false,
  first: true,
};

describe('ageBucket', () => {
  it('keeps the first days exact and coarsens later ones', () => {
    expect([0, 1, 2, 5, 13, 29, 89, 400].map(ageBucket)).toEqual([0, 1, 2, 3, 7, 14, 30, 90]);
  });
});

describe('parseTelemetryEvent', () => {
  it('accepts each kind', () => {
    expect(parseTelemetryEvent({ ...base, kind: 'launch' })).toEqual({ ...base, kind: 'launch' });
    expect(parseTelemetryEvent({ ...base, kind: 'intro', step: 2, outcome: 'done' })?.kind).toBe('intro');
    expect(parseTelemetryEvent(attempt)).toEqual(attempt);
  });

  it('drops fields it does not know', () => {
    expect(parseTelemetryEvent({ ...base, kind: 'launch', deviceId: 'x' })).toEqual({ ...base, kind: 'launch' });
  });

  it('rejects anything that could tell devices apart or is malformed', () => {
    expect(parseTelemetryEvent({ ...base, kind: 'launch', age: 5 })).toBeNull();
    expect(parseTelemetryEvent({ ...base, kind: 'launch', day: '2026-09-28T10:00' })).toBeNull();
    expect(parseTelemetryEvent({ ...base, kind: 'launch', build: 'x'.repeat(40) })).toBeNull();
    expect(parseTelemetryEvent({ ...attempt, type: 'chess' })).toBeNull();
    expect(parseTelemetryEvent({ ...attempt, seconds: -1 })).toBeNull();
    expect(parseTelemetryEvent({ ...attempt, level: 1.5 })).toBeNull();
    expect(parseTelemetryEvent({ ...base, kind: 'crash' })).toBeNull();
    expect(parseTelemetryEvent(null)).toBeNull();
  });
});
