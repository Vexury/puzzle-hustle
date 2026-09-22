import { describe, expect, it } from 'vitest';
import { adjacentTwins, selectLevels, type Candidate } from '../scripts/select-levels.ts';

function pool(families: readonly string[]): Candidate[] {
  return families.map((family, i) => ({ seed: 1000 + i, score: i, family }));
}

// Families spread evenly across the score range, which is the normal case.
function mixed(size: number, familyCount: number): Candidate[] {
  return Array.from({ length: size }, (_, i) => ({ seed: 1000 + i, score: i, family: `f${i % familyCount}` }));
}

// Each family owns one contiguous stretch of the score range. The hard case: picking in
// ascending score order then has to walk through a stretch, and repeats inside it cannot
// be avoided at all.
function blocked(size: number, familyCount: number): Candidate[] {
  const width = Math.ceil(size / familyCount);
  return Array.from({ length: size }, (_, i) => ({ seed: 1000 + i, score: i, family: `f${Math.floor(i / width)}` }));
}

describe('selectLevels', () => {
  it('returns the requested count without repeating a candidate', () => {
    const picked = selectLevels(mixed(150, 40), 50);
    expect(picked.length).toBe(50);
    expect(new Set(picked.map((c) => c.seed)).size).toBe(50);
  });

  it('keeps the score climbing', () => {
    for (const candidates of [mixed(150, 12), blocked(150, 12), blocked(60, 5)]) {
      const picked = selectLevels(candidates, 20);
      picked.forEach((c, i) => {
        if (i > 0) expect(c.score).toBeGreaterThanOrEqual(picked[i - 1]!.score);
      });
    }
  });

  it('separates levels that share a family', () => {
    expect(adjacentTwins(selectLevels(mixed(150, 40), 50))).toBe(0);
    expect(adjacentTwins(selectLevels(mixed(150, 12), 50))).toBe(0);
    expect(adjacentTwins(selectLevels(mixed(60, 5), 20))).toBe(0);
  });

  it('leaves no avoidable twin when families sit in contiguous blocks', () => {
    // Ascending score forces a run through each block, so the best any rule can do is one
    // run per family. Anything above that would be the selection clumping needlessly.
    const picked = selectLevels(blocked(150, 12), 50);
    expect(adjacentTwins(picked)).toBe(picked.length - new Set(picked.map((c) => c.family)).size);
  });

  it('spreads a pool with fewer families than slots instead of clumping', () => {
    // Shapes easy in miniature: more slots than families, so repeats are forced.
    const picked = selectLevels(mixed(60, 5), 20);
    const counts = new Map<string, number>();
    for (const c of picked) counts.set(c.family, (counts.get(c.family) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(5);
  });

  it('still fills every slot when one family owns almost everything', () => {
    const picked = selectLevels(pool(Array.from({ length: 30 }, (_, i) => (i === 0 ? 'rare' : 'common'))), 20);
    expect(picked.length).toBe(20);
    expect(new Set(picked.map((c) => c.seed)).size).toBe(20);
    picked.forEach((c, i) => {
      if (i > 0) expect(c.score).toBeGreaterThanOrEqual(picked[i - 1]!.score);
    });
  });

  it('refuses a pool that cannot fill the pack', () => {
    expect(() => selectLevels(mixed(10, 4), 20)).toThrow();
  });
});
