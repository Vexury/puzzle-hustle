import { describe, expect, it } from 'vitest';
import { countSlabsSolutions, ruleBroken, ruleHolds, slabCells, solveSlabs, type SlabsPuzzle, type SlabsRule } from '../src/slabs/solver.ts';

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
