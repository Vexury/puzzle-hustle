import { describe, expect, it } from 'vitest';
import { parseSolveId } from '../src/solveId.ts';

describe('parseSolveId', () => {
  it('reads a period solve and resolves its difficulty', () => {
    expect(parseSolveId('killer:daily:2026-09-22')).toEqual({
      type: 'killer',
      mode: 'period',
      difficulty: 'easy',
      period: 'daily',
      key: '2026-09-22',
    });
    expect(parseSolveId('nonogram:weekly:2026-W39')?.difficulty).toBe('hard');
    expect(parseSolveId('nonogram:monthly:2026-09')?.difficulty).toBe('genius');
  });

  it('reads a level solve', () => {
    expect(parseSolveId('shapes:level:genius:12')).toEqual({
      type: 'shapes',
      mode: 'level',
      difficulty: 'genius',
      level: 12,
    });
  });

  it('reads a random solve', () => {
    expect(parseSolveId('zip:medium:1a2b3c')).toEqual({
      type: 'zip',
      mode: 'random',
      difficulty: 'medium',
    });
  });

  it('rejects ids it cannot account for', () => {
    expect(parseSolveId('')).toBeNull();
    expect(parseSolveId('kakuro:daily:2026-09-22')).toBeNull();
    expect(parseSolveId('sudoku:daily:2026-02-30')).toBeNull();
    expect(parseSolveId('sudoku:level:easy:0')).toBeNull();
    expect(parseSolveId('sudoku:level:easy:x')).toBeNull();
    expect(parseSolveId('sudoku:nonsense:1a2b')).toBeNull();
    expect(parseSolveId('sudoku:easy:1a2b:extra')).toBeNull();
  });
});
