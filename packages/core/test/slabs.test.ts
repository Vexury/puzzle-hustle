import { describe, expect, it } from 'vitest';
import { Rng } from '../src/rng.ts';
import { DIFFICULTIES } from '../src/types.ts';
import {
  SLABS_PRESETS,
  applySlabsHint,
  emptySlabsState,
  generateSlabs,
  isSlabsJerk,
  isSlabsSolved,
  slabsHint,
  slabsOccupancy,
  slabsPivotCell,
  slabsPlace,
  slabsRegionStatus,
  slabsRotate,
  validSlabsState,
  type SlabsSpec,
} from '../src/slabs/puzzle.ts';
import {
  countSlabsSolutions,
  ruleBroken,
  ruleHolds,
  slabCells,
  slabsDifficultyReport,
  solveSlabs,
  type SlabsPuzzle,
  type SlabsRule,
} from '../src/slabs/solver.ts';

function puzzle(cols: number, rows: number, slabs: [number, number][], regionOf: number[], rules: SlabsRule[], blocked: number[] = []): SlabsPuzzle {
  const b = new Uint8Array(cols * rows);
  for (const i of blocked) b[i] = 1;
  return { config: { cols, rows }, blocked: b, slabs, regionOf: Int16Array.from(regionOf), rules };
}

const sum = (target: number): SlabsRule => ({ kind: 'sum', target });

describe('slabs geometry and rules', () => {
  const p = puzzle(3, 2, [[0, 1]], [-1, -1, -1, -1, -1, -1], [], [2]);

  it('rejects placements off the board, across the row wrap and onto blocked cells', () => {
    expect(slabCells(p, 0, 0)).toEqual([0, 1]);
    expect(slabCells(p, 3, 1)).toBeNull();
    expect(slabCells(p, 0, 3)).toBeNull();
    expect(slabCells(p, 3, 2)).toBeNull();
    expect(slabCells(p, 1, 0)).toBeNull();
    expect(slabCells(p, 5, 1)).toBeNull();
    expect(slabCells(p, 4, 0)).toEqual([4, 5]);
    expect(slabCells(p, 4, 7)).toBeNull();
  });

  it('checks all five rule kinds', () => {
    expect(ruleHolds(sum(5), [2, 3])).toBe(true);
    expect(ruleHolds({ kind: 'lt', target: 5 }, [2, 3])).toBe(false);
    expect(ruleHolds({ kind: 'lt', target: 6 }, [2, 3])).toBe(true);
    expect(ruleHolds({ kind: 'gt', target: 4 }, [2, 3])).toBe(true);
    expect(ruleHolds({ kind: 'eq', target: 0 }, [4, 4, 4])).toBe(true);
    expect(ruleHolds({ kind: 'eq', target: 0 }, [4, 3])).toBe(false);
    expect(ruleHolds({ kind: 'neq', target: 0 }, [1, 2, 3])).toBe(true);
    expect(ruleHolds({ kind: 'neq', target: 0 }, [1, 2, 1])).toBe(false);
  });

  it('knows when a rule can no longer hold', () => {
    expect(ruleBroken(sum(5), [6], 1)).toBe(true);
    expect(ruleBroken(sum(13), [0], 2)).toBe(true);
    expect(ruleBroken(sum(12), [0], 2)).toBe(false);
    expect(ruleBroken({ kind: 'lt', target: 3 }, [3], 1)).toBe(true);
    expect(ruleBroken({ kind: 'gt', target: 12 }, [], 2)).toBe(true);
    expect(ruleBroken({ kind: 'gt', target: 11 }, [], 2)).toBe(false);
    expect(ruleBroken({ kind: 'eq', target: 0 }, [2, 3], 1)).toBe(true);
    expect(ruleBroken({ kind: 'neq', target: 0 }, [2, 2], 0)).toBe(true);
  });
});

describe('slabs solver', () => {
  // 1 2
  // 3 4
  const unique = puzzle(2, 2, [[1, 2], [3, 4]], [0, 1, 2, 3], [sum(1), sum(2), sum(3), sum(4)]);

  it('solves a unique puzzle at tier 1 and reports the placements', () => {
    const res = solveSlabs(unique, 1);
    expect(res.solved).toBe(true);
    expect(res.contradiction).toBe(false);
    expect(res.placements).toEqual([
      { anchor: 0, dir: 0 },
      { anchor: 2, dir: 0 },
    ]);
    expect([...res.order].sort()).toEqual([0, 1]);
  });

  it('places the first value on the anchor even when it lies to the right', () => {
    const p = puzzle(2, 1, [[1, 5]], [0, 1], [sum(5), sum(1)]);
    expect(solveSlabs(p, 1).placements).toEqual([{ anchor: 1, dir: 2 }]);
  });

  it('reports a contradiction when no placement fits the rules', () => {
    const p = puzzle(2, 1, [[1, 2]], [0, 0], [sum(5)]);
    const res = solveSlabs(p, 3);
    expect(res.solved).toBe(false);
    expect(res.contradiction).toBe(true);
  });

  it('does not claim a solution for an ambiguous puzzle', () => {
    const p = puzzle(2, 2, [[1, 1], [2, 2]], [0, 0, 0, 0], [sum(6)]);
    expect(solveSlabs(p, 3).solved).toBe(false);
  });

  it('counts solutions exactly', () => {
    expect(countSlabsSolutions(unique)).toEqual({ count: 1, complete: true });
    const p = puzzle(2, 2, [[1, 1], [2, 2]], [0, 0, 0, 0], [sum(6)]);
    expect(countSlabsSolutions(p).count).toBe(2);
    expect(countSlabsSolutions(p, 10).count).toBe(4);
  });

  it('solves with all-different and all-equal regions', () => {
    // 2 4    top: all different, left cell 2
    // 3 3    bottom: all equal
    const p = puzzle(2, 2, [[3, 3], [2, 4]], [1, 0, 2, 2], [{ kind: 'neq', target: 0 }, sum(2), { kind: 'eq', target: 0 }]);
    const res = solveSlabs(p, 3);
    expect(res.solved).toBe(true);
    expect(res.placements).toEqual([
      { anchor: 2, dir: 0 },
      { anchor: 0, dir: 0 },
    ]);
    expect(countSlabsSolutions(p, 10)).toEqual({ count: 1, complete: true });
  });
});

function tinySpec(p: SlabsPuzzle, solution: { anchor: number; dir: number }[]): SlabsSpec {
  return { ...p, version: 1, seed: 0, difficulty: 'easy', config: { ...SLABS_PRESETS.easy, ...p.config }, solution, order: solution.map((_, i) => i) };
}

describe('slabs generator', () => {
  const seeds = [1, 2, 3, 4, 5, 6];

  it('is deterministic', () => {
    expect(generateSlabs(42, 'medium')).toEqual(generateSlabs(42, 'medium'));
  });

  for (const difficulty of DIFFICULTIES) {
    it(`builds valid, logic-solvable ${difficulty} puzzles`, () => {
      const cfg = SLABS_PRESETS[difficulty];
      for (const seed of seeds) {
        const spec = generateSlabs(seed, difficulty);
        expect([...spec.blocked].filter((b) => !b).length).toBe(cfg.slabs * 2);
        expect(new Set(spec.slabs.map(([a, b]) => `${a}${b}`)).size).toBe(cfg.slabs);
        expect(isSlabsSolved(spec, spec.solution.flatMap((p) => [p.anchor, p.dir]))).toBe(true);
        const res = solveSlabs(spec, cfg.maxTier);
        expect(res.solved).toBe(true);
        expect(res.order.length).toBe(cfg.slabs);
        // Genius is proven unique by the logic solver alone; the brute-force count is too slow there.
        if (difficulty !== 'genius') expect(countSlabsSolutions(spec).count).toBe(1);
      }
    });
  }

  it('gets harder from easy to genius', () => {
    const mean = (d: (typeof DIFFICULTIES)[number]) => seeds.reduce((s, seed) => s + slabsDifficultyReport(generateSlabs(seed, d)).score, 0) / seeds.length;
    const scores = DIFFICULTIES.map(mean);
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThan(scores[i - 1]!);
  });

  it('never puts both halves of a non-double slab into one region', () => {
    for (const seed of seeds) {
      const spec = generateSlabs(seed, 'hard');
      spec.solution.forEach((p, s) => {
        const [a, b] = spec.slabs[s]!;
        const [x, y] = slabCells(spec, p.anchor, p.dir)!;
        if (a !== b && spec.regionOf[x]! >= 0) expect(spec.regionOf[x]).not.toBe(spec.regionOf[y]);
      });
    }
  });
});

describe('slabs player state', () => {
  const spec = generateSlabs(7, 'medium');
  const solution = spec.solution.flatMap((p) => [p.anchor, p.dir]);
  const empty = emptySlabsState(spec);
  const blockedCell = [...spec.blocked].findIndex((b) => b);

  it('loads a broken save as an empty tray', () => {
    expect(validSlabsState(spec, undefined)).toEqual(empty);
    expect(validSlabsState(spec, [1, 2])).toEqual(empty);
    expect(validSlabsState(spec, solution)).toEqual(solution);
    const badDir = [...solution];
    badDir[1] = 7;
    expect(validSlabsState(spec, badDir)).toEqual(empty);
    const onBlocked = [...empty];
    onBlocked[0] = blockedCell;
    expect(validSlabsState(spec, onBlocked)).toEqual(empty);
    const overlap = [...empty];
    overlap[0] = solution[0]!;
    overlap[1] = solution[1]!;
    overlap[2] = solution[0]!;
    overlap[3] = solution[1]!;
    expect(validSlabsState(spec, overlap)).toEqual(empty);
  });

  it('sends a covered slab back to the tray and never overlaps', () => {
    const one = slabsPlace(spec, empty, 0, solution[0]!, solution[1]!)!;
    const two = slabsPlace(spec, one, 1, solution[0]!, solution[1]!)!;
    expect(two[0]).toBe(-1);
    expect(two[2]).toBe(solution[0]);
    const occ = [...slabsOccupancy(spec, two)];
    expect(occ.filter((o) => o === 0)).toHaveLength(0);
    expect(occ.filter((o) => o === 1)).toHaveLength(2);
  });

  it('refuses placements on blocked cells or off the board', () => {
    expect(slabsPlace(spec, empty, 0, blockedCell, 0)).toBeNull();
    expect(slabsPlace(spec, empty, 0, spec.config.cols - 1, 0)).toBeNull();
  });

  it('rotates around the pressed half and never onto blocked or taken cells', () => {
    for (let s = 0; s < spec.slabs.length; s++) {
      const alone = slabsPlace(spec, empty, s, solution[s * 2]!, solution[s * 2 + 1]!)!;
      for (const pivot of [0, 1] as const) {
        const turned = slabsRotate(spec, alone, s, pivot);
        if (turned) expect(slabsPivotCell(spec, turned, s, pivot)).toBe(slabsPivotCell(spec, alone, s, pivot));
        const crowded = slabsRotate(spec, solution, s, pivot);
        if (!crowded) continue;
        expect(validSlabsState(spec, crowded)).toEqual(crowded);
        expect([...slabsOccupancy(spec, crowded)].filter((o) => o >= 0)).toHaveLength(spec.slabs.length * 2);
      }
    }
  });

  it('turns around the tapped half', () => {
    const tiny = tinySpec(puzzle(3, 3, [[1, 2]], new Array(9).fill(-1), []), [{ anchor: 4, dir: 0 }]);
    const start = [4, 0];
    // A tap on the right half turns the left half up above it (clockwise, skipping nothing).
    expect(slabsRotate(tiny, start, 0, 1)).toEqual([2, 1]);
  });

  it('counts a double laid the other way round as correct', () => {
    const tiny = tinySpec(puzzle(2, 1, [[3, 3]], [0, 0], [sum(6)]), [{ anchor: 0, dir: 0 }]);
    expect(isSlabsSolved(tiny, [1, 2])).toBe(true);
    expect(slabsHint(tiny, [1, 2])).toBeNull();
  });

  it('marks regions done, open and broken', () => {
    expect(slabsRegionStatus(spec, solution).every((s) => s === 'done')).toBe(true);
    expect(slabsRegionStatus(spec, empty).every((s) => s === 'open')).toBe(true);
    const tiny = tinySpec(puzzle(2, 1, [[5, 6]], [0, 0], [{ kind: 'lt', target: 4 }]), [{ anchor: 0, dir: 0 }]);
    expect(slabsRegionStatus(tiny, [0, 0])).toEqual(['broken']);
  });

  it('reaches the solved board by hints from messy boards', () => {
    const rng = new Rng(3);
    for (let trial = 0; trial < 20; trial++) {
      let state = emptySlabsState(spec);
      for (let k = 0; k < 12; k++) state = slabsPlace(spec, state, rng.int(spec.slabs.length), rng.int(spec.blocked.length), rng.int(4)) ?? state;
      for (let step = 0; step < spec.slabs.length * 3 && !isSlabsSolved(spec, state); step++) {
        const h = slabsHint(spec, state);
        expect(h).not.toBeNull();
        state = applySlabsHint(spec, state, h!);
      }
      expect(isSlabsSolved(spec, state)).toBe(true);
      expect(slabsHint(spec, state)).toBeNull();
    }
  });
});

describe('slabs gestures', () => {
  const cell = 40;

  it('spots a jerk while a slab is held', () => {
    const path = (...pts: [number, number, number][]) => pts.map(([x, y, t]) => ({ x, y, t }));
    // Out and back within a quarter second.
    expect(isSlabsJerk(path([100, 100, 0], [115, 100, 40], [130, 100, 80], [118, 100, 120], [104, 100, 160]), cell)).toBe(true);
    expect(isSlabsJerk(path([100, 100, 0], [100, 76, 60], [101, 97, 130]), cell)).toBe(true);
    // Held still first: no events come in, the rest position still counts as the start.
    expect(isSlabsJerk(path([100, 100, 0], [115, 100, 900], [130, 100, 930], [115, 100, 960], [100, 100, 990]), cell)).toBe(true);
    // A fast drag goes one way and never comes back.
    expect(isSlabsJerk(path([100, 100, 0], [130, 100, 40], [170, 100, 80], [210, 100, 120]), cell)).toBe(false);
    // Turning a corner is not coming back.
    expect(isSlabsJerk(path([100, 100, 0], [140, 100, 60], [140, 140, 120]), cell)).toBe(false);
    // Too small a wiggle.
    expect(isSlabsJerk(path([100, 100, 0], [110, 100, 40], [101, 100, 80]), cell)).toBe(false);
    // Only halfway back.
    expect(isSlabsJerk(path([100, 100, 0], [130, 100, 60], [116, 100, 120]), cell)).toBe(false);
    // Out and back, but slowly.
    expect(isSlabsJerk(path([100, 100, 0], [115, 100, 100], [130, 100, 200], [115, 100, 300], [102, 100, 400]), cell)).toBe(false);
    expect(isSlabsJerk([], cell)).toBe(false);
  });
});
