import { describe, expect, it } from 'vitest';
import { MAX_MOVES_PER_SECOND, MIN_SECONDS, implausible } from '../src/plausibility.ts';

describe('implausible', () => {
  it('accepts a genuinely fast solve', () => {
    // Measured, not imagined: a daily Shapes solved in 3 seconds with 8 moves and no hints
    // on 2026-09-22. The per-type floors this replaced threw that result away.
    expect(implausible(3, 8)).toBe(false);
  });

  it('accepts a slow solve with many moves', () => {
    expect(implausible(69, 199)).toBe(false);
  });

  it('rejects a solve with no time or no moves', () => {
    expect(implausible(0, 40)).toBe(true);
    expect(implausible(-1, 40)).toBe(true);
    expect(implausible(40, 0)).toBe(true);
  });

  it('rejects more moves than a person can physically make', () => {
    expect(implausible(2, 45)).toBe(true);
    expect(implausible(1, MAX_MOVES_PER_SECOND + 1)).toBe(true);
  });

  it('allows exactly the fastest human rate', () => {
    expect(implausible(MIN_SECONDS, MAX_MOVES_PER_SECOND)).toBe(false);
    expect(implausible(10, 10 * MAX_MOVES_PER_SECOND)).toBe(false);
  });
});
