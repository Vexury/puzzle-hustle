import { expect, it } from 'vitest';
import { levelStars, starTarget } from '../src/index.ts';

it('gives a star for solving, one for no hint and one within the target', () => {
  const target = starTarget('zip', 'easy');
  expect(levelStars('zip', 'easy', undefined)).toBe(0);
  expect(levelStars('zip', 'easy', { seconds: target + 1, hints: 2 })).toBe(1);
  expect(levelStars('zip', 'easy', { seconds: target + 1, hints: 0 })).toBe(2);
  expect(levelStars('zip', 'easy', { seconds: target, hints: 1 })).toBe(2);
  expect(levelStars('zip', 'easy', { seconds: target, hints: 0 })).toBe(3);
});

it('gives harder levels more time for the third star', () => {
  expect(starTarget('nonogram', 'genius')).toBeGreaterThan(starTarget('nonogram', 'hard'));
  expect(starTarget('nonogram', 'hard')).toBeGreaterThan(starTarget('nonogram', 'medium'));
  expect(starTarget('nonogram', 'medium')).toBeGreaterThan(starTarget('nonogram', 'easy'));
});
