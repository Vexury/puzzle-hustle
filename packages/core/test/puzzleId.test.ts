import { describe, expect, it } from 'vitest';
import { parsePuzzleId, periodEndsAt } from '../src/puzzleId.ts';

describe('parsePuzzleId', () => {
  it('reads a daily id and resolves its difficulty', () => {
    expect(parsePuzzleId('sudoku:daily:2026-09-21')).toEqual({
      type: 'sudoku',
      period: 'daily',
      key: '2026-09-21',
      difficulty: 'easy',
    });
  });

  it('resolves the period difficulty for types without a daily override', () => {
    expect(parsePuzzleId('nonogram:daily:2026-09-21')?.difficulty).toBe('medium');
    expect(parsePuzzleId('nonogram:weekly:2026-W39')?.difficulty).toBe('hard');
    expect(parsePuzzleId('nonogram:monthly:2026-09')?.difficulty).toBe('genius');
  });

  it('rejects anything that is not a period puzzle', () => {
    expect(parsePuzzleId('sudoku:level:easy:3')).toBeNull();
    expect(parsePuzzleId('sudoku:medium:1a2b')).toBeNull();
    expect(parsePuzzleId('kakuro:daily:2026-09-21')).toBeNull();
    expect(parsePuzzleId('sudoku:yearly:2026')).toBeNull();
    expect(parsePuzzleId('')).toBeNull();
  });

  it('rejects malformed period keys', () => {
    expect(parsePuzzleId('sudoku:daily:2026-9-21')).toBeNull();
    expect(parsePuzzleId('sudoku:daily:2026-02-30')).toBeNull();
    expect(parsePuzzleId('sudoku:weekly:2026-W54')).toBeNull();
    expect(parsePuzzleId('sudoku:weekly:2025-W53')).toBeNull(); // 2025 has 52 ISO weeks
    expect(parsePuzzleId('sudoku:monthly:2026-13')).toBeNull();
  });

  it('accepts 2026-W53, the valid neighbour of the rejected 2025-W53', () => {
    // 2026 genuinely has 53 ISO weeks, and that puzzle runs this December. A roundtrip check
    // that over-corrected for the 2025-W53 rejection above would reject this too.
    expect(parsePuzzleId('sudoku:weekly:2026-W53')).toEqual({
      type: 'sudoku',
      period: 'weekly',
      key: '2026-W53',
      difficulty: 'hard',
    });
  });
});

describe('periodEndsAt', () => {
  it('ends a daily at the next local midnight', () => {
    const end = periodEndsAt('daily', '2026-09-21')!;
    expect(end.toISOString()).toBe('2026-09-21T22:00:00.000Z');
  });

  it('ends a weekly after its Sunday and a monthly after its last day', () => {
    expect(periodEndsAt('weekly', '2026-W39')!.toISOString()).toBe('2026-09-27T22:00:00.000Z');
    expect(periodEndsAt('monthly', '2026-09')!.toISOString()).toBe('2026-09-30T22:00:00.000Z');
  });

  it('returns null for a malformed key', () => {
    expect(periodEndsAt('daily', 'nonsense')).toBeNull();
  });
});
