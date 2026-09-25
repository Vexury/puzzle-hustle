import { describe, expect, it } from 'vitest';
import { scheduledRef } from '../src/ref.ts';
import { starsAdapter } from '../src/registry.ts';
import {
  CROWNS_PRESETS,
  REGIONS_BUDGET,
  REGIONS_MARKED_EMPTY,
  REGIONS_VERSION,
  STARS_PRESETS,
  emptyRegionsState,
  generateCrowns,
  generateRegions,
  generateStars,
  isRegionsSolved,
  regionsConflicts,
  regionsHint,
  regionsLineCounts,
  regionsProgress,
  type RegionsSpec,
} from '../src/regions/puzzle.ts';
import {
  countRegionsSolutions,
  enumerateRegionsSolutions,
  isRegionsUnique,
  regionsCanonicalKey,
  regionsDifficultyReport,
  regionsNeighbors,
  regionsSolveByLogic,
} from '../src/regions/solver.ts';

function stripes(n: number, stars: number): RegionsSpec {
  const regions = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) regions[i] = Math.floor(i / n);
  return { version: REGIONS_VERSION, seed: 0, difficulty: 'easy', config: { size: n, stars }, regions, solution: new Uint8Array(n * n) };
}

function assertValid(spec: RegionsSpec): void {
  const n = spec.config.size;
  const k = spec.config.stars;
  const counts = regionsLineCounts(spec, spec.solution);
  for (let i = 0; i < n; i++) {
    expect(counts.rows[i]).toBe(k);
    expect(counts.cols[i]).toBe(k);
    expect(counts.regions[i]).toBe(k);
  }
  for (let i = 0; i < n * n; i++) {
    if (!spec.solution[i]) continue;
    for (const j of regionsNeighbors(n, i)) expect(spec.solution[j]).toBe(0);
  }
  expect(regionsConflicts(spec, spec.solution).every((v) => v === 0)).toBe(true);
  const seen = new Uint8Array(n * n);
  for (let reg = 0; reg < n; reg++) {
    const cells = Array.from(spec.regions, (v, i) => (v === reg ? i : -1)).filter((i) => i >= 0);
    expect(cells.length).toBeGreaterThan(0);
    const stack = [cells[0]!];
    seen[cells[0]!] = 1;
    let reached = 0;
    while (stack.length > 0) {
      const cur = stack.pop()!;
      reached++;
      for (const j of regionsNeighbors(n, cur)) {
        const sameRowOrCol = Math.floor(j / n) === Math.floor(cur / n) || j % n === cur % n;
        if (!sameRowOrCol || seen[j] || spec.regions[j] !== reg) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    expect(reached).toBe(cells.length);
  }
}

const PRESET_SEEDS = { easy: 30, medium: 30, hard: 3, genius: 3 } as const;

describe('generation', () => {
  it('is deterministic per seed', () => {
    const a = generateCrowns(42, 'medium');
    const b = generateCrowns(42, 'medium');
    expect([...a.regions]).toEqual([...b.regions]);
    expect([...a.solution]).toEqual([...b.solution]);
    expect([...a.regions]).not.toEqual([...generateCrowns(43, 'medium').regions]);
    expect([...generateStars(7, 'easy').regions]).toEqual([...generateStars(7, 'easy').regions]);
  });

  it('uses the presets', () => {
    expect(generateCrowns(1, 'easy').config).toEqual(CROWNS_PRESETS.easy);
    expect(generateStars(1, 'easy').config).toEqual(STARS_PRESETS.easy);
    expect(generateCrowns(1, 'easy', { sizeDelta: 1 }).config.size).toBe(7);
  });

  for (const [name, gen] of [
    ['crowns', generateCrowns],
    ['stars', generateStars],
  ] as const) {
    for (const [difficulty, seeds] of Object.entries(PRESET_SEEDS) as ['easy' | 'medium' | 'hard' | 'genius', number][]) {
      it(`${name} ${difficulty}: ${seeds} seeds give valid unique puzzles`, () => {
        const t0 = performance.now();
        for (let seed = 1; seed <= seeds; seed++) {
          const spec = gen(seed, difficulty);
          expect(spec.regions.length).toBe(spec.config.size ** 2);
          assertValid(spec);
          expect(isRegionsUnique(spec)).toBe(true);
          expect(isRegionsSolved(spec, spec.solution)).toBe(true);
          expect(isRegionsSolved(spec, emptyRegionsState(spec))).toBe(false);
        }
        expect(performance.now() - t0).toBeLessThan(60_000);
      });
    }
  }
});

describe('solver', () => {
  it('counts one solution on generated puzzles', () => {
    for (let seed = 1; seed <= 5; seed++) {
      expect(countRegionsSolutions(generateCrowns(seed, 'medium'), 10).solutions).toBe(1);
      expect(countRegionsSolutions(generateStars(seed, 'easy'), 10).solutions).toBe(1);
    }
  });

  it('counts many solutions on stripe layouts', () => {
    expect(countRegionsSolutions(stripes(4, 1), 100).solutions).toBe(2);
    expect(countRegionsSolutions(stripes(5, 1), 100).solutions).toBe(14);
    expect(isRegionsUnique(stripes(6, 1))).toBe(false);
  });

  it('solves generated puzzles by logic or leaves them consistent', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const spec = generateCrowns(seed, 'easy');
      const r = regionsSolveByLogic(spec);
      expect(r.contradiction).toBe(false);
      r.state.forEach((v, i) => {
        if (v === 1) expect(spec.solution[i]).toBe(1);
        if (v === REGIONS_MARKED_EMPTY) expect(spec.solution[i]).toBe(0);
      });
    }
  });

  it('reports difficulty and a solver node count', () => {
    const r = regionsDifficultyReport(generateStars(3, 'easy'));
    expect(r.score).toBeGreaterThan(0);
    expect(r.nodes).toBeGreaterThan(0);
    expect(r.cells).toBe(64);
  });
});

describe('state helpers', () => {
  it('flags touching stars and overfull lines', () => {
    const spec = generateCrowns(2, 'easy');
    const n = spec.config.size;
    const state = emptyRegionsState(spec);
    state[0] = 1;
    state[n + 1] = 1;
    const touching = regionsConflicts(spec, state);
    expect(touching[0]).toBe(1);
    expect(touching[n + 1]).toBe(1);
    const rowDup = emptyRegionsState(spec);
    rowDup[0] = 1;
    rowDup[3] = 1;
    const flags = regionsConflicts(spec, rowDup);
    expect(flags[0]).toBe(1);
    expect(flags[3]).toBe(1);
    expect([...flags].filter((v) => v === 1).length).toBe(2);
    expect(regionsConflicts(spec, spec.solution).some((v) => v === 1)).toBe(false);
  });

  it('treats marked and unknown cells as empty', () => {
    const spec = generateCrowns(3, 'easy');
    const state = Uint8Array.from(spec.solution, (v) => (v ? 1 : REGIONS_MARKED_EMPTY));
    expect(isRegionsSolved(spec, state)).toBe(true);
    expect(regionsProgress(spec, emptyRegionsState(spec))).toEqual({ matching: 0, total: spec.config.size });
    expect(regionsProgress(spec, state).matching).toBe(spec.config.size);
  });
});

describe('hint', () => {
  it('walks from the empty state to the solution', () => {
    for (const spec of [generateCrowns(99, 'medium'), generateStars(99, 'easy')]) {
      const n = spec.config.size;
      const state = emptyRegionsState(spec);
      let steps = 0;
      while (!isRegionsSolved(spec, state)) {
        const h = regionsHint(spec, state);
        expect(h).not.toBeNull();
        expect(state[h!.r * n + h!.c]).toBe(0);
        state[h!.r * n + h!.c] = h!.value;
        steps++;
        expect(steps).toBeLessThanOrEqual(state.length);
      }
      expect(regionsHint(spec, state)).toBeNull();
    }
  });

  it('fixes a wrong star first', () => {
    const spec = generateCrowns(5, 'medium');
    const state = emptyRegionsState(spec);
    const wrong = spec.solution.findIndex((v) => v === 0);
    state[wrong] = 1;
    const h = regionsHint(spec, state);
    expect(h).toEqual({ r: Math.floor(wrong / spec.config.size), c: wrong % spec.config.size, value: REGIONS_MARKED_EMPTY });
  });
});

describe('canonical key', () => {
  it('is invariant under rotation and flips, sensitive to layout', () => {
    const spec = generateCrowns(11, 'medium');
    const n = spec.config.size;
    const rotated = structuredClone(spec);
    const flipped = structuredClone(spec);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        rotated.regions[c * n + (n - 1 - r)] = spec.regions[r * n + c]!;
        flipped.regions[r * n + (n - 1 - c)] = spec.regions[r * n + c]!;
      }
    }
    expect(regionsCanonicalKey(rotated)).toBe(regionsCanonicalKey(spec));
    expect(regionsCanonicalKey(flipped)).toBe(regionsCanonicalKey(spec));
    expect(regionsCanonicalKey(generateCrowns(12, 'medium'))).not.toBe(regionsCanonicalKey(spec));
    expect(regionsCanonicalKey(generateRegions(11, { size: n, stars: 1 }))).toBe(regionsCanonicalKey(spec));
  });
});

describe('work budget', () => {
  it('stops the enumeration once it passes the node cap', () => {
    const full = countRegionsSolutions(stripes(6, 1), 1000);
    const capped = enumerateRegionsSolutions(stripes(6, 1), 1000, () => {}, 10);
    expect(capped.nodes).toBe(11);
    expect(capped.solutions).toBeLessThan(full.solutions);
  });

  it('never changes a puzzle it lets through', () => {
    for (const seed of [1, 2, 3]) {
      const free = generateStars(seed, 'medium');
      const bounded = generateStars(seed, 'medium', {}, REGIONS_BUDGET);
      expect(bounded.regions).toEqual(free.regions);
      expect(bounded.solution).toEqual(free.solution);
    }
  });

  it('gives up on a seed that needs more', () => {
    expect(() => generateStars(1, 'medium', {}, 0)).toThrow(/budget/);
  });

  it('moves slow monthlies to the next attempt seed and keeps published ones', () => {
    // 2028-03 took about 18 million nodes, several seconds on a desktop.
    expect(starsAdapter.accepts(2162830524, 'genius', {})).toBe(false);
    const march = scheduledRef('stars', 'monthly', '2028-03');
    expect(march.seed).toBe(1070019089);
    expect(scheduledRef('stars', 'monthly', '2026-12').seed).toBe(1580581492);
    // The heaviest weekly through 2028, about 260k nodes.
    expect(scheduledRef('stars', 'weekly', '2028-W17').seed).toBe(1537297863);
    const spec = starsAdapter.spec(march.seed, march.difficulty, starsAdapter.options('monthly'));
    expect(starsAdapter.spec(march.seed, march.difficulty, {})).toBe(spec);
    expect(spec.regions).toEqual(generateStars(march.seed, march.difficulty).regions);
  });
});
