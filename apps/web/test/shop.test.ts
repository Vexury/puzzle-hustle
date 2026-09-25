import { expect, it } from 'vitest';
import { itemState } from '../src/pages/Shop.tsx';

const none = { badge: null, flair: null, theme: null };

it('names the state of each badge', () => {
  expect(itemState('bolt', new Set(['bolt']), { badge: 'bolt', flair: null, theme: null }, 0)).toBe('equipped');
  expect(itemState('bolt', new Set(['bolt']), none, 0)).toBe('owned');
  expect(itemState('bolt', new Set(), none, 100)).toBe('buyable');
  expect(itemState('bolt', new Set(), none, 99)).toBe('locked');
});

it('a flair is locked until earned, whatever the balance, and never buyable', () => {
  expect(itemState('hustler', new Set(), none, 1_000_000)).toBe('locked');
  expect(itemState('basic-zipper', new Set(), none, 1_000_000)).toBe('locked');
});

it('an earned flair is owned, and equips once worn', () => {
  expect(itemState('hustler', new Set(['hustler']), none, 0)).toBe('owned');
  expect(itemState('hustler', new Set(['hustler']), { badge: null, flair: 'hustler', theme: null }, 0)).toBe('equipped');
});

it('treats an unknown id as locked', () => {
  expect(itemState('nope', new Set(), none, 1000)).toBe('locked');
});
