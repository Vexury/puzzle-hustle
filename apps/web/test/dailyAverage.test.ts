import { expect, it } from 'vitest';
import { dailyAverageSeconds } from '../src/lib/stats.ts';

const rec = (seconds: number) => ({ solvedAt: '2026-09-27T10:00:00Z', seconds, hints: 0, moves: 1 });

it('averages only the dailies of one type', () => {
  const solves = {
    'zip:daily:2026-09-25': rec(100),
    'zip:daily:2026-09-26': rec(151),
    'zip:level:easy:1': rec(10),
    'zip:weekly:2026-W39': rec(900),
    'shapes:daily:2026-09-26': rec(30),
  };
  expect(dailyAverageSeconds(solves, 'zip')).toBe(126);
  expect(dailyAverageSeconds(solves, 'tracks')).toBeNull();
});
