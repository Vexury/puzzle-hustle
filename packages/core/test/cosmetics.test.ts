import { expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../src/achievements.ts';
import { HUSTLE_MILESTONE } from '../src/hustle.ts';
import {
  COSMETICS,
  HUSTLE_BADGES,
  HUSTLE_FLAIRS,
  HUSTLE_NAMEPLATES,
  HUSTLE_THEMES,
  NAMEPLATES,
  THEMES,
  badgeRarity,
  findCosmetic,
  isCosmeticOf,
  type Cosmetic,
} from '../src/cosmetics.ts';
import { levelList } from '../src/levels.ts';

const isBadge = (c: Cosmetic): c is Extract<Cosmetic, { kind: 'badge' }> => c.kind === 'badge';
const isFlair = (c: Cosmetic): c is Extract<Cosmetic, { kind: 'flair' }> => c.kind === 'flair';
const badges = COSMETICS.filter(isBadge);
const flairs = COSMETICS.filter(isFlair);
const achievementIds = new Set(ACHIEVEMENTS.map((a) => a.id));

it('has thirty-seven badges (five earned in Hustle), the first eight unchanged, and fifty-five flairs, all with unique ids', () => {
  expect(badges).toHaveLength(37);
  expect(badges.slice(0, 8).map((b) => [b.id, b.price])).toEqual([
    ['bolt', 100],
    ['leaf', 100],
    ['cat', 150],
    ['moon', 150],
    ['sun', 150],
    ['ghost', 200],
    ['rocket', 250],
    ['diamond', 300],
  ]);
  expect(flairs).toHaveLength(55);
  expect(new Set(COSMETICS.map((c) => c.id)).size).toBe(COSMETICS.length);
});

it('prices every bought badge as a positive whole number, every earned one at 0, and gives no flair a price', () => {
  for (const b of badges) expect(b.requires ? b.price === 0 : Number.isInteger(b.price) && b.price > 0).toBe(true);
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
    } else if ('hustle' in req) {
      expect(Number.isInteger(req.hustle) && req.hustle > 0).toBe(true);
    } else {
      expect(levelList(req.pack, req.difficulty).length).toBeGreaterThan(0);
    }
  }
});

it('grants exactly the ten milestone flairs from achievements', () => {
  const byAchievement = Object.fromEntries(
    flairs.filter((f) => 'achievement' in f.requires).map((f) => [(f.requires as { achievement: string }).achievement, f.id]),
  );
  expect(byAchievement).toEqual({
    'every-type': 'puzzler',
    'night-owl': 'night-shift',
    'early-bird': 'morning-person',
    'perfect-10': 'sweeper',
    'streak-30': 'hustler',
    'streak-100': 'relentless',
    'streak-365': 'puzzle-legend',
    'perfect-day-no-hint': 'immaculate',
    'solved-1000': 'veteran',
    'weekly-10': 'regular',
  });
  for (const id of Object.keys(byAchievement)) expect(achievementIds.has(id)).toBe(true);
});

it('never gives an achievement and a flair the same title', () => {
  const flairTitles = new Set(flairs.map((f) => f.title));
  for (const a of ACHIEVEMENTS) expect(flairTitles.has(a.title), a.title).toBe(false);
});

it('offers six theme packs with their prices and fixed modes, in shop order', () => {
  expect(THEMES.map((t) => [t.id, t.price, t.mode])).toEqual([
    ['paper', 400, 'light'],
    ['sakura', 400, 'light'],
    ['midnight', 500, 'dark'],
    ['cat-cafe', 600, 'light'],
    ['terminal', 900, 'dark'],
    ['synthwave', 1200, 'dark'],
  ]);
  for (const t of THEMES) expect(findCosmetic(t.id)).toBe(t);
});

it('offers three Hustle themes, never sold, each on the stage of a Hustle achievement', () => {
  expect(HUSTLE_THEMES.map((t) => [t.id, t.price, t.mode, t.requires?.hustle])).toEqual([
    ['ocean', 0, 'light', 333],
    ['inferno', 0, 'dark', 666],
    ['casino', 0, 'dark', 777],
  ]);
  for (const t of HUSTLE_THEMES) {
    expect(findCosmetic(t.id)).toBe(t);
    expect(achievementIds.has(`hustle-${t.requires!.hustle}`)).toBe(true);
  }
});

it('keeps theme ids apart from badge and flair ids', () => {
  expect(isCosmeticOf('paper', 'theme')).toBe(true);
  expect(isCosmeticOf('paper', 'badge')).toBe(false);
  expect(isCosmeticOf('bolt', 'theme')).toBe(false);
});

it('sells seven nameplates and gives five more in Hustle, never sold', () => {
  expect(NAMEPLATES.map((n) => [n.id, n.price])).toEqual([
    ['plate-paper', 300],
    ['plate-zip', 400],
    ['plate-pixel', 400],
    ['plate-sakura', 500],
    ['plate-cat-nap', 600],
    ['plate-midnight', 600],
    ['plate-terminal', 800],
  ]);
  expect(HUSTLE_NAMEPLATES.map((n) => [n.id, n.price, n.requires?.hustle])).toEqual([
    ['plate-tracks', 0, 80],
    ['plate-mosaic', 0, 150],
    ['plate-weaver', 0, 250],
    ['plate-synthwave', 0, 550],
    ['plate-gold', 0, 900],
  ]);
  for (const n of [...NAMEPLATES, ...HUSTLE_NAMEPLATES]) expect(findCosmetic(n.id)).toBe(n);
  expect(isCosmeticOf('plate-zip', 'nameplate')).toBe(true);
  expect(isCosmeticOf('plate-zip', 'badge')).toBe(false);
});

it('puts each Hustle nameplate on a milestone stage that no other Hustle reward uses', () => {
  const taken = new Set([...HUSTLE_BADGES, ...HUSTLE_THEMES].map((c) => c.requires!.hustle));
  for (const f of HUSTLE_FLAIRS) if ('hustle' in f.requires) taken.add(f.requires.hustle);
  for (const n of HUSTLE_NAMEPLATES) {
    expect(n.requires!.hustle % HUSTLE_MILESTONE).toBe(0);
    expect(taken.has(n.requires!.hustle), n.id).toBe(false);
  }
});

it('derives a badge rarity from its price, and Hustle badges have their own', () => {
  const rarity = (id: string) => badgeRarity(findCosmetic(id) as Extract<Cosmetic, { kind: 'badge' }>);
  expect(rarity('bolt')).toBe('common');
  expect(rarity('cat')).toBe('uncommon');
  expect(rarity('ghost')).toBe('uncommon');
  expect(rarity('rocket')).toBe('rare');
  expect(rarity('diamond')).toBe('rare');
  expect(rarity('fox')).toBe('epic');
  expect(rarity('owl')).toBe('legendary');
  expect(rarity('hustle-crown')).toBe('hustle');
});
