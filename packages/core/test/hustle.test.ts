import { describe, expect, it } from 'vitest';
import { hustleBoss, hustleDifficulty, hustleMilestoneCoins, hustleSlot, hustleType, HUSTLE_ROUND } from '../src/hustle.ts';
import { PUZZLE_TYPES } from '../src/types.ts';
import { decodeRef, encodeRef, hustleRef, hustleSeed, refId } from '../src/ref.ts';
import { parseSolveId } from '../src/solveId.ts';
import { POOL_SEEDS } from '../src/boards/pools.ts';
import { generateBoard } from '../src/boards.ts';

describe('hustle sequence', () => {
  it('climbs through the tiers at 40, 120 and 300', () => {
    expect([1, 40, 41, 120, 121, 300, 301, 5000].map(hustleDifficulty)).toEqual(['easy', 'easy', 'medium', 'medium', 'hard', 'hard', 'genius', 'genius']);
  });

  it('plays every fast type once per round and never the same type twice in a row', () => {
    const fast = PUZZLE_TYPES.length - 2;
    const stages = Array.from({ length: 2000 }, (_, i) => i + 1).filter((n) => hustleBoss(n) === null);
    for (let i = 0; i + fast <= stages.length; i += fast) {
      const types = stages.slice(i, i + fast).map(hustleType);
      expect(new Set(types).size).toBe(fast);
      expect(types).not.toContain('sudoku');
      expect(types).not.toContain('killer');
    }
    for (let n = 2; n <= 1000; n++) expect(hustleType(n), `stage ${n}`).not.toBe(hustleType(n - 1));
  });

  it('brings Sudoku every 25th stage and Sumdoku every 50th as bosses', () => {
    expect([25, 50, 75, 100, 125, 150].map(hustleType)).toEqual(['sudoku', 'killer', 'sudoku', 'killer', 'sudoku', 'killer']);
    expect([24, 26, 49, 51].map(hustleBoss)).toEqual([null, null, null, null]);
  });

  it('keeps stage types fixed, so every player climbs the same sequence', () => {
    // Snapshot of hustleType(1..12) to guard against silent RNG/seed changes that would reshuffle progression
    const expected = ['nonogram', 'stars', 'zip', 'mosaic', 'tracks', 'slabs', 'crowns', 'shapes', 'mosaic', 'shapes', 'crowns', 'tracks'] as const;
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
    const ref = hustleRef(48);
    expect(ref).toMatchObject({ hustle: 48, ...{ type: ref.type, difficulty: 'medium' } });
    expect(refId(ref)).toBe('hustle:48');
    expect(encodeRef(ref)).toBe('h=48');
    expect(decodeRef('h=48')).toEqual(ref);
    expect(decodeRef('h=48&t=zip&d=genius&s=abc')).toEqual(ref);
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

describe('hustle balance', () => {
  it('plays Killer and Stars a tier below the stage and Shapes a tier above, within easy and genius', () => {
    const at = (type: string, from: number) => {
      for (let n = from; ; n++) if (hustleSlot(n).type === type) return hustleSlot(n).difficulty;
    };
    expect(at('killer', 41)).toBe('easy');
    expect(at('stars', 41)).toBe('easy');
    expect(at('shapes', 41)).toBe('hard');
    expect(at('killer', 1)).toBe('easy');
    expect(at('shapes', 301)).toBe('genius');
    expect(at('killer', 301)).toBe('hard');
    expect(at('tracks', 41)).toBe('medium');
  });
});
