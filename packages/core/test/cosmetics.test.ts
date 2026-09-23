import { expect, it } from 'vitest';
import { COSMETICS, findCosmetic, isCosmeticOf } from '../src/cosmetics.ts';

it('has eight badges and eight flairs with unique ids across both kinds', () => {
  expect(COSMETICS.filter((c) => c.kind === 'badge')).toHaveLength(8);
  expect(COSMETICS.filter((c) => c.kind === 'flair')).toHaveLength(8);
  expect(new Set(COSMETICS.map((c) => c.id)).size).toBe(COSMETICS.length);
});

it('prices every item as a positive whole number', () => {
  for (const c of COSMETICS) expect(Number.isInteger(c.price) && c.price > 0).toBe(true);
});

it('leaves out the crown and the flame, which already mean something on the board', () => {
  expect(findCosmetic('crown')).toBeUndefined();
  expect(findCosmetic('flame')).toBeUndefined();
});

it('finds an item by id and refuses anything else', () => {
  expect(findCosmetic('bolt')).toMatchObject({ kind: 'badge', price: 100 });
  expect(findCosmetic('hustler')).toMatchObject({ kind: 'flair', title: 'Hustler', price: 500 });
  expect(findCosmetic('nope')).toBeUndefined();
  expect(findCosmetic(42)).toBeUndefined();
  expect(findCosmetic(null)).toBeUndefined();
});

it('checks the kind as well as the id', () => {
  expect(isCosmeticOf('bolt', 'badge')).toBe(true);
  expect(isCosmeticOf('bolt', 'flair')).toBe(false);
  expect(isCosmeticOf('puzzler', 'flair')).toBe(true);
  expect(isCosmeticOf(undefined, 'badge')).toBe(false);
});
