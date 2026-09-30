import { expect, it } from 'vitest';
import { adapter, dailyRef, periodKey, primeScheduledRefs, storedScheduledRefs } from '../src/index.ts';

// A day no other test touches, so this file sees the cache for it empty.
const DAY = new Date('2031-05-14T10:00:00Z');
const KEY = periodKey('daily', DAY);

it('keeps a primed seed that still matches and searches again when it does not', () => {
  const found = dailyRef('shapes', DAY);
  const stored = storedScheduledRefs((period, key) => period === 'daily' && key === KEY);
  expect(stored).toContainEqual(['shapes', 'daily', KEY, found.difficulty, adapter('shapes').version, found.seed]);

  const other = new Date('2031-05-15T10:00:00Z');
  const otherKey = periodKey('daily', other);
  primeScheduledRefs([
    ['mosaic', 'daily', otherKey, dailyRef('mosaic', DAY).difficulty, adapter('mosaic').version, 12345],
    ['nonogram', 'daily', otherKey, 'medium', adapter('nonogram').version - 1, 999],
    ['zip', 'daily', otherKey, 'genius', adapter('zip').version, 777],
    'junk',
  ]);
  expect(dailyRef('mosaic', other).seed).toBe(12345);
  expect(dailyRef('nonogram', other).seed).not.toBe(999);
  expect(dailyRef('zip', other).seed).not.toBe(777);
});

it('ignores anything that is not a list of entries', () => {
  expect(() => primeScheduledRefs({ a: 1 })).not.toThrow();
  expect(() => primeScheduledRefs(null)).not.toThrow();
});
