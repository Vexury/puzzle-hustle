import { beforeEach, expect, it, vi } from 'vitest';
import { rehydrate } from '../src/lib/storage.ts';
import { balance, equip, owned, readEquipped, readSpent } from '../src/lib/coins.ts';

vi.mock('@puzzle-hustle/core', async (original) => ({ ...(await original<typeof import('@puzzle-hustle/core')>()), THEMES_FREE: true }));

beforeEach(() => {
  localStorage.clear();
  rehydrate();
});

it('lets anyone wear a theme before launch without buying it', () => {
  expect(balance()).toBe(0);
  expect(equip('theme', 'synthwave')).toBe(true);
  expect(readEquipped().theme).toBe('synthwave');
  expect(readSpent()).toEqual([]);
  expect(owned().has('synthwave')).toBe(false);
});

it('still refuses an unknown id or a badge in the theme slot', () => {
  expect(equip('theme', 'nope')).toBe(false);
  expect(equip('theme', 'bolt')).toBe(false);
});

it('keeps badges paid while themes are free', () => {
  expect(equip('badge', 'bolt')).toBe(false);
});
