import { expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../src/achievements.ts';
import { COSMETICS, findCosmetic, isCosmeticOf, type Cosmetic } from '../src/cosmetics.ts';
import { levelList } from '../src/levels.ts';

const isBadge = (c: Cosmetic): c is Extract<Cosmetic, { kind: 'badge' }> => c.kind === 'badge';
const isFlair = (c: Cosmetic): c is Extract<Cosmetic, { kind: 'flair' }> => c.kind === 'flair';
const badges = COSMETICS.filter(isBadge);
const flairs = COSMETICS.filter(isFlair);
const achievementIds = new Set(ACHIEVEMENTS.map((a) => a.id));

it('has eight badges, unchanged, and forty-one flairs, all with unique ids', () => {
  expect(badges).toHaveLength(8);
  expect(flairs).toHaveLength(41);
  expect(new Set(COSMETICS.map((c) => c.id)).size).toBe(COSMETICS.length);
});

it('prices every badge as a positive whole number and gives no flair a price', () => {
  for (const b of badges) expect(Number.isInteger(b.price) && b.price > 0).toBe(true);
  for (const f of flairs) expect('price' in f).toBe(false);
});

it('keeps the ids and titles of the flairs that existed before earned flairs', () => {
  const carried = {
    'zip-addict': 'Zip Addict',
    'grid-whisperer': 'Grid Whisperer',
    'sudoku-sage': 'Sudoku Sage',
    puzzler: 'Puzzler',
    'night-shift': 'Night Shift',
    'morning-person': 'Morning Person',
    sweeper: 'Clean Sweeper',
    hustler: 'Hustler',
  };
  for (const [id, title] of Object.entries(carried)) {
    const item = findCosmetic(id);
    expect(item).toMatchObject({ kind: 'flair', title });
  }
});

it('leaves out the crown and the flame, which already mean something on the board', () => {
  expect(findCosmetic('crown')).toBeUndefined();
  expect(findCosmetic('flame')).toBeUndefined();
});

it('finds an item by id and refuses anything else', () => {
  expect(findCosmetic('bolt')).toMatchObject({ kind: 'badge', price: 100 });
  expect(findCosmetic('hustler')).toMatchObject({ kind: 'flair', title: 'Hustler' });
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

it('every flair requirement is well formed: a real achievement id, or a pack with levels to solve', () => {
  for (const f of flairs) {
    const req = f.requires;
    if ('achievement' in req) {
      expect(achievementIds.has(req.achievement)).toBe(true);
    } else {
      expect(levelList(req.pack, req.difficulty).length).toBeGreaterThan(0);
    }
  }
});
