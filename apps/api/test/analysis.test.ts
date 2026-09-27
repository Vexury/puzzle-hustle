import { expect, it } from 'vitest';
import { dailySection, quantile, retentionSection, stickyLevelsSection, type AttemptRow } from '../scripts/analysis.ts';

function attempt(over: Partial<AttemptRow>): AttemptRow {
  return {
    day: '2026-09-28',
    platform: 'android',
    build: 'abc1234',
    age: 0,
    type: 'zip',
    difficulty: 'medium',
    mode: 'daily',
    level: null,
    outcome: 'solved',
    seconds: 100,
    moves: 10,
    hints: 0,
    resumed: 0,
    first: 0,
    ...over,
  };
}

it('takes quantiles from the sorted values', () => {
  expect(quantile([5, 1, 3], 0.5)).toBe(3);
  expect(quantile([], 0.5)).toBeNull();
});

it('flags a daily whose hint-free median runs past the target', () => {
  const slow = Array.from({ length: 10 }, () => attempt({ type: 'tracks', seconds: 400 }));
  const out = dailySection([...slow, attempt({ type: 'tracks', outcome: 'left', seconds: 30 })]);
  expect(out).toContain('| tracks | 11 | 91 % | 6:40 |');
  expect(out).toContain('tracks: Median 6:40 ueber 4:00');
});

it('does not flag a small sample', () => {
  expect(dailySection([attempt({ seconds: 900 })])).not.toContain('ueber');
});

it('ranks levels by how often they are left', () => {
  const rows = [
    ...Array.from({ length: 3 }, () => attempt({ mode: 'level', level: 7, outcome: 'left' })),
    attempt({ mode: 'level', level: 7 }),
    ...Array.from({ length: 4 }, () => attempt({ mode: 'level', level: 2 })),
  ];
  expect(stickyLevelsSection(rows)).toContain('| zip medium #7 | 4 | 75 % |');
  expect(stickyLevelsSection(rows)).not.toContain('#2');
});

it('computes next-day retention against the previous day', () => {
  const out = retentionSection([
    { day: '2026-09-26', age: 0, n: 10 },
    { day: '2026-09-27', age: 1, n: 4 },
    { day: '2026-09-27', age: 0, n: 5 },
    { day: '2026-09-28', age: 1, n: 1 },
  ]);
  expect(out).toContain('Am Folgetag zurueck: 33 % (5 von 15)');
});
