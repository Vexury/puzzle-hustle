import { describe, expect, it } from 'vitest';
import { PERIODS, PUZZLE_TYPES } from '../src/types.ts';
import { minimumSeconds } from '../src/plausibility.ts';

describe('minimumSeconds', () => {
  it('covers every type and period with a positive floor', () => {
    for (const type of PUZZLE_TYPES) {
      for (const period of PERIODS) {
        const floor = minimumSeconds(type, period);
        expect(floor).toBeGreaterThan(0);
        expect(floor).toBeLessThan(120);
      }
    }
  });

  it('asks for more on longer periods', () => {
    expect(minimumSeconds('sudoku', 'weekly')).toBeGreaterThan(minimumSeconds('sudoku', 'daily'));
    expect(minimumSeconds('sudoku', 'monthly')).toBeGreaterThan(minimumSeconds('sudoku', 'weekly'));
  });

  it('asks for more on a full sudoku than on a small shapes board', () => {
    expect(minimumSeconds('sudoku', 'daily')).toBeGreaterThan(minimumSeconds('shapes', 'daily'));
  });
});
