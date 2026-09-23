import { expect, it } from 'vitest';
import { percentileText, rowCosmetics } from '../src/components/Board.tsx';

it('hides the line when there is no percentile at all', () => {
  expect(percentileText(null, 'daily')).toBeNull();
});

it('hides the line just under the 20-submission floor', () => {
  expect(percentileText({ total: 19, faster: 0 }, 'daily')).toBeNull();
});

it('shows the line right at the 20-submission floor', () => {
  expect(percentileText({ total: 20, faster: 5 }, 'daily')).not.toBeNull();
});

it('excludes the player from both sides of the fraction', () => {
  // 21 submissions total, 5 faster than the player: the other 20 players are the field,
  // 15 of them the player beat, so 15/20 = 75%, not 15/21 or 16/21.
  expect(percentileText({ total: 21, faster: 5 }, 'daily')).toBe('Faster than 75% of all players today');
});

it('reads 0% for the slowest run in a field of exactly 20', () => {
  expect(percentileText({ total: 20, faster: 19 }, 'daily')).toBe('Faster than 0% of all players today');
});

it('reads 100% for the fastest run once the field passes 20', () => {
  expect(percentileText({ total: 21, faster: 0 }, 'daily')).toBe('Faster than 100% of all players today');
});

it('says "this week" for a weekly board and "this month" for a monthly one', () => {
  expect(percentileText({ total: 21, faster: 5 }, 'weekly')).toBe('Faster than 75% of all players this week');
  expect(percentileText({ total: 21, faster: 5 }, 'monthly')).toBe('Faster than 75% of all players this month');
});

it('resolves known cosmetics and hides unknown ones, missing fields and wrong kinds', () => {
  expect(rowCosmetics({ badge: 'cat', flair: 'puzzler' })).toMatchObject({ badge: { id: 'cat' }, flair: { title: 'Puzzler' } });
  expect(rowCosmetics({ badge: 'from-the-future', flair: null })).toEqual({ badge: undefined, flair: undefined });
  expect(rowCosmetics({})).toEqual({ badge: undefined, flair: undefined });
  expect(rowCosmetics({ badge: 'puzzler', flair: 'cat' })).toEqual({ badge: undefined, flair: undefined });
});
