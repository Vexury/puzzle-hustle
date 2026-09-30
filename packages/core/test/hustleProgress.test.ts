import { describe, expect, it } from 'vitest';
import { coinsEarned, coinsForSolve } from '../src/coins.ts';
import { earnedFlairs } from '../src/flairs.ts';
import { earnedHustleBadges, hustleNext, hustleSolved } from '../src/hustleProgress.ts';

const EPOCH = 1_000;
const solve = (n: number, at = 2_000) => ({ id: `hustle:${n}`, solvedAt: at, seconds: 60, hints: 0, moves: 10 });
const upTo = (n: number) => Array.from({ length: n }, (_, i) => solve(i + 1, 2_000 + i));

describe('hustle progress', () => {
  it('counts the unbroken run from stage 1', () => {
    expect(hustleSolved([], EPOCH)).toBe(0);
    expect(hustleNext([], EPOCH)).toBe(1);
    expect(hustleSolved(upTo(46), EPOCH)).toBe(46);
    expect(hustleNext(upTo(46), EPOCH)).toBe(47);
    expect(hustleSolved([...upTo(10), solve(12)], EPOCH)).toBe(10);
  });

  it('ignores solves from before the epoch', () => {
    expect(hustleSolved([solve(1, 500), solve(2, 500)], EPOCH)).toBe(0);
  });

  it('pays coins only on milestones, and nothing per stage', () => {
    const solves = upTo(20);
    expect(coinsForSolve('hustle:9', solves, EPOCH)).toEqual([]);
    expect(coinsForSolve('hustle:10', solves, EPOCH)).toEqual([{ reason: 'hustle', coins: 25 }]);
    expect(coinsForSolve('hustle:20', solves, EPOCH)).toEqual([{ reason: 'hustle', coins: 30 }]);
  });

  it('earns badges and flairs at their stages', () => {
    expect(earnedHustleBadges(upTo(49), EPOCH).has('hustle-mountain')).toBe(false);
    expect(earnedHustleBadges(upTo(50), EPOCH)).toEqual(new Set(['hustle-mountain']));
    expect(earnedFlairs(upTo(39), EPOCH).has('hustle-starter')).toBe(false);
    expect(earnedFlairs(upTo(40), EPOCH).has('hustle-starter')).toBe(true);
    expect(coinsEarned(upTo(40), EPOCH)).toBeGreaterThan(0);
  });
});
