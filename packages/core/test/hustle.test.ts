import { describe, expect, it } from 'vitest';
import { hustleDifficulty, hustleMilestoneCoins, hustleSlot, hustleType, HUSTLE_ROUND } from '../src/hustle.ts';
import { PUZZLE_TYPES } from '../src/types.ts';
import { decodeRef, encodeRef, hustleRef, hustleSeed, refId } from '../src/ref.ts';
import { parseSolveId } from '../src/solveId.ts';
import { POOL_SEEDS } from '../src/boards/pools.ts';
import { generateBoard } from '../src/boards.ts';

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

  it('keeps stage types fixed, so every player climbs the same sequence', () => {
    // Snapshot of hustleType(1..12) to guard against silent RNG/seed changes that would reshuffle progression
    const expected = ['zip', 'mosaic', 'crowns', 'killer', 'shapes', 'sudoku', 'tracks', 'slabs', 'stars', 'nonogram', 'sudoku', 'nonogram'] as const;
    const actual = Array.from({ length: 12 }, (_, i) => hustleType(i + 1));
    expect(actual).toEqual(expected);
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

describe('hustle refs', () => {
  it('names a stage by its number alone', () => {
    const ref = hustleRef(47);
    expect(ref).toMatchObject({ hustle: 47, ...{ type: ref.type, difficulty: 'medium' } });
    expect(refId(ref)).toBe('hustle:47');
    expect(encodeRef(ref)).toBe('h=47');
    expect(decodeRef('h=47')).toEqual(ref);
    expect(decodeRef('h=47&t=zip&d=genius&s=abc')).toEqual(ref);
    expect(decodeRef('h=0')).toBeNull();
    expect(decodeRef('h=x')).toBeNull();
  });

  it('parses a hustle solve with its slot', () => {
    const ref = hustleRef(301);
    expect(parseSolveId('hustle:301')).toEqual({ type: ref.type, mode: 'hustle', difficulty: 'genius', level: 301 });
    expect(parseSolveId('hustle:0')).toBeNull();
  });

  it('takes Zip hard and genius from the pool, one after another', () => {
    const zipStages: number[] = [];
    for (let n = 121; zipStages.length < 3; n++) if (hustleRef(n).type === 'zip') zipStages.push(n);
    const pool = POOL_SEEDS.zip!.hard!;
    expect(zipStages.map((n) => hustleRef(n).seed)).toEqual(pool.slice(0, 3));
  });

  it('builds the same board for a stage everywhere', () => {
    const ref = hustleRef(3);
    expect(generateBoard(ref)).toEqual(generateBoard({ ...ref }));
  });
});

describe('hustle guards and pins', () => {
  it('rejects a stage beyond the server bound quickly', () => {
    const t = performance.now();
    expect(decodeRef('h=1000000000')).toBeNull();
    expect(performance.now() - t).toBeLessThan(500);
    expect(decodeRef('h=100000')?.hustle).toBe(100000);
  });

  it('pins the seeds of stages 1 and 50', () => {
    expect([hustleSeed(1), hustleSeed(50)]).toEqual([2122481030, 1394498158]);
  });
});
