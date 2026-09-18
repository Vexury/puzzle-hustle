import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../src/types.ts';
import { LEVEL_PACK, levelList } from '../src/levels.ts';
import { SHAPES_VERSION, generateShapes, isSolved } from '../src/shapes/puzzle.ts';
import { canonicalKey, isUnique } from '../src/shapes/solver.ts';
import { decodeRef, encodeRef, levelRef, refId } from '../src/ref.ts';

describe('level pack', () => {
  it('matches the current generator version', () => {
    expect(LEVEL_PACK.versions.shapes).toBe(SHAPES_VERSION);
  });

  it('has 20 unique, distinct, ascending levels per difficulty', () => {
    for (const difficulty of DIFFICULTIES) {
      const list = levelList('shapes', difficulty);
      expect(list.length).toBe(20);
      const keys = new Set<string>();
      for (let i = 0; i < list.length; i++) {
        const entry = list[i]!;
        const spec = generateShapes(entry.seed, difficulty);
        expect(isSolved(spec, spec.solution)).toBe(true);
        if (difficulty !== 'genius') expect(isUnique(spec)).toBe(true);
        keys.add(canonicalKey(spec));
        if (i > 0) expect(entry.score).toBeGreaterThanOrEqual(list[i - 1]!.score);
      }
      expect(keys.size).toBe(list.length);
    }
  });

  it('level refs round-trip and ignore a stale seed', () => {
    const ref = levelRef('shapes', 'medium', 3)!;
    expect(ref).not.toBeNull();
    const decoded = decodeRef(encodeRef(ref));
    expect(decoded).toEqual(ref);
    expect(refId(ref)).toBe('shapes:level:medium:3');
    const tampered = decodeRef('t=shapes&d=medium&s=zzz&l=3');
    expect(tampered?.seed).toBe(ref.seed);
    expect(levelRef('shapes', 'medium', 99)).toBeNull();
  });
});
