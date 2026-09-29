import { describe, expect, it } from 'vitest';
import { generateCrowns, generateStars, regionsPalette, type RegionsSpec } from '@puzzle-hustle/core';
import { REGION_PALETTES, colorDistance, regionPaletteId, type RegionPaletteId } from '../src/lib/regionColors.ts';

// Every Cats and Hearts size, a few seeds each.
const BOARDS: RegionsSpec[] = [];
for (const generate of [generateCrowns, generateStars]) for (const difficulty of ['easy', 'medium', 'hard', 'genius'] as const) for (let seed = 1; seed <= 3; seed++) BOARDS.push(generate(seed, difficulty));

// The closest pair of edge-sharing regions on a board, as the player sees it.
function closestTouching(spec: RegionsSpec, colors: readonly string[]): number {
  const distance = colors.map((a) => colors.map((b) => colorDistance(a, b)));
  const pal = regionsPalette(spec, distance);
  const n = spec.config.size;
  let min = Infinity;
  for (let i = 0; i < n * n; i++) {
    for (const j of [i % n < n - 1 ? i + 1 : -1, i + n < n * n ? i + n : -1]) {
      if (j < 0 || spec.regions[i] === spec.regions[j]) continue;
      min = Math.min(min, distance[pal[spec.regions[i]!]!]![pal[spec.regions[j]!]!]!);
    }
  }
  return min;
}

describe('region palettes', () => {
  // OKLab x100: about 2 is just noticeable. The old pastels came to about 1 to 3 here, which is
  // how Cats boards ended up with neighbours in near-identical blues.
  it.each(Object.keys(REGION_PALETTES) as RegionPaletteId[])('%s keeps touching regions clearly apart', (id) => {
    const closest = BOARDS.map((spec) => closestTouching(spec, REGION_PALETTES[id])).sort((a, b) => a - b);
    expect(closest[0]).toBeGreaterThanOrEqual(5);
    expect(closest[closest.length >> 1]).toBeGreaterThanOrEqual(8);
  });

  it('has twelve distinct colours per palette', () => {
    for (const colors of Object.values(REGION_PALETTES)) {
      expect(colors).toHaveLength(12);
      expect(new Set(colors).size).toBe(12);
    }
  });

  it('picks the pack palette where there is one, else the one for the mode', () => {
    expect(regionPaletteId('terminal', 'dark')).toBe('terminal');
    expect(regionPaletteId('sakura', 'light')).toBe('light');
    expect(regionPaletteId(undefined, 'dark')).toBe('dark');
  });
});
