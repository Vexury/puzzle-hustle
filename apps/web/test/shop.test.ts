import { expect, it } from 'vitest';
import { itemState } from '../src/pages/Shop.tsx';

const none = { badge: null, flair: null };

it('names the state of each shop item', () => {
  expect(itemState('bolt', new Set(['bolt']), { badge: 'bolt', flair: null }, 0)).toBe('equipped');
  expect(itemState('bolt', new Set(['bolt']), none, 0)).toBe('owned');
  expect(itemState('bolt', new Set(), none, 100)).toBe('buyable');
  expect(itemState('bolt', new Set(), none, 99)).toBe('locked');
});
