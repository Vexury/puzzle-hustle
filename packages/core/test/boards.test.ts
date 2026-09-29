import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { boardKey, decodeBoard, encodeBoard, generateBoard, storedBoard, type BoardPack } from '../src/boards.ts';
import { levelList } from '../src/levels.ts';
import { adapter } from '../src/registry.ts';
import { DIFFICULTIES, PUZZLE_TYPES, type Difficulty, type PuzzleTypeId } from '../src/types.ts';

const read = (type: PuzzleTypeId): BoardPack => JSON.parse(readFileSync(new URL(`../src/boards/${type}.json`, import.meta.url), 'utf8'));

// Rebuilding these from their seeds takes seconds each, minutes for the whole set; the first
// level stands in for the rest, the way levels.test.ts treats them.
const SLOW: Partial<Record<PuzzleTypeId, Difficulty[]>> = { zip: ['hard', 'genius'] };

describe('board packs', () => {
  it('round-trip every kind of board through the codec', () => {
    for (const type of PUZZLE_TYPES) {
      const seed = levelList(type, 'easy')[0]!.seed;
      const spec = generateBoard({ type, seed, difficulty: 'easy' });
      expect(decodeBoard(JSON.parse(JSON.stringify(encodeBoard(spec))))).toEqual(spec);
    }
  });

  it('hold a board for every level, built for the current generator version', () => {
    for (const type of PUZZLE_TYPES) {
      const pack = read(type);
      expect(`${type}: ${pack.version}`).toBe(`${type}: ${adapter(type).version}`);
      for (const difficulty of DIFFICULTIES) {
        for (const { seed } of levelList(type, difficulty)) expect(pack.boards[boardKey(difficulty, seed)], `${type} ${difficulty} ${seed}`).toBeDefined();
      }
    }
  });

  // The pack is only worth anything if a stored board is exactly what its seed generates.
  it('store exactly what the generator builds', () => {
    for (const type of PUZZLE_TYPES) {
      const pack = read(type);
      for (const difficulty of DIFFICULTIES) {
        const list = levelList(type, difficulty);
        const check = SLOW[type]?.includes(difficulty) ? list.slice(0, 1) : list;
        for (const { seed } of check) {
          expect(decodeBoard(pack.boards[boardKey(difficulty, seed)]!), `${type} ${difficulty} ${seed}`).toEqual(generateBoard({ type, seed, difficulty }));
        }
      }
    }
  }, 300_000);

  it('keep the random pool apart from the levels and stored', () => {
    const pack = read('zip');
    for (const difficulty of ['hard', 'genius'] as const) {
      const pool = pack.pool?.[difficulty] ?? [];
      expect(pool.length).toBeGreaterThanOrEqual(30);
      const levels = new Set(levelList('zip', difficulty).map((e) => e.seed));
      for (const seed of pool) {
        expect(levels.has(seed)).toBe(false);
        expect(pack.boards[boardKey(difficulty, seed)]).toBeDefined();
      }
    }
  });

  it('loads a stored board by ref, and leaves periods to the generator', async () => {
    const seed = levelList('zip', 'genius')[0]!.seed;
    expect(await storedBoard({ type: 'zip', seed, difficulty: 'genius' })).toEqual(generateBoard({ type: 'zip', seed, difficulty: 'genius' }));
    expect(await storedBoard({ type: 'zip', seed, difficulty: 'genius', period: 'daily' })).toBeNull();
    expect(await storedBoard({ type: 'zip', seed: 1, difficulty: 'genius' })).toBeNull();
  }, 60_000);
});
