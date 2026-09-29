import { describe, expect, it } from 'vitest';
import { hustleDifficulty, hustleMilestoneCoins, hustleSlot, hustleType, HUSTLE_ROUND } from '../src/hustle.ts';
import { PUZZLE_TYPES } from '../src/types.ts';

describe('hustle sequence', () => {
  it('climbs through the tiers at 40, 120 and 300', () => {
    expect([1, 40, 41, 120, 121, 300, 301, 5000].map(hustleDifficulty)).toEqual(['easy', 'easy', 'medium', 'medium', 'hard', 'hard', 'genius', 'genius']);
  });

  it('plays every type once per round and never the same type twice in a row', () => {
    for (let round = 0; round < 100; round++) {
      const types = Array.from({ length: HUSTLE_ROUND }, (_, i) => hustleType(round * HUSTLE_ROUND + i + 1));
      expect(new Set(types).size).toBe(PUZZLE_TYPES.length);
    }
    for (let n = 2; n <= 1000; n++) expect(hustleType(n), `stage ${n}`).not.toBe(hustleType(n - 1));
  });

  it('is the same for everyone', () => {
    expect(Array.from({ length: 30 }, (_, i) => hustleSlot(i + 1))).toEqual(Array.from({ length: 30 }, (_, i) => hustleSlot(i + 1)));
  });

  it('pays coins every ten stages, growing to 100', () => {
    expect(hustleMilestoneCoins(9)).toBe(0);
    expect(hustleMilestoneCoins(10)).toBe(25);
    expect(hustleMilestoneCoins(50)).toBe(45);
    expect(hustleMilestoneCoins(100)).toBe(70);
    expect(hustleMilestoneCoins(160)).toBe(100);
    expect(hustleMilestoneCoins(1000)).toBe(100);
  });
});
