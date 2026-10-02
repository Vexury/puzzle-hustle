import { DIFFICULTIES, PUZZLE_TYPES, type Difficulty, type PuzzleTypeId } from './types.ts';

export type CosmeticKind = 'badge' | 'flair' | 'theme' | 'nameplate';

export type FlairRequirement = { pack: PuzzleTypeId; difficulty: Difficulty } | { achievement: string } | { hustle: number };

export type Cosmetic =
  | { id: string; kind: 'badge'; title: string; price: number; requires?: { hustle: number } }
  | { id: string; kind: 'flair'; title: string; requires: FlairRequirement }
  | { id: string; kind: 'theme'; title: string; price: number; mode: 'light' | 'dark'; requires?: { hustle: number } }
  | { id: string; kind: 'nameplate'; title: string; price: number; dark: boolean; requires?: { hustle: number } };

export type BadgeCosmetic = Extract<Cosmetic, { kind: 'badge' }>;
export type FlairCosmetic = Extract<Cosmetic, { kind: 'flair' }>;
export type ThemeCosmetic = Extract<Cosmetic, { kind: 'theme' }>;
export type NameplateCosmetic = Extract<Cosmetic, { kind: 'nameplate' }>;

// Ids are forever: a board row carries them to clients of every age, so an id may be added but
// never renamed or removed. No crown (place 1 wears one; earned Hustle badges are the exception) and no flame (the streak colour).
const BADGES: readonly Cosmetic[] = [
  { id: 'bolt', kind: 'badge', title: 'Bolt', price: 100 },
  { id: 'leaf', kind: 'badge', title: 'Leaf', price: 100 },
  { id: 'cat', kind: 'badge', title: 'Cat', price: 150 },
  { id: 'moon', kind: 'badge', title: 'Moon', price: 150 },
  { id: 'sun', kind: 'badge', title: 'Sun', price: 150 },
  { id: 'ghost', kind: 'badge', title: 'Ghost', price: 200 },
  { id: 'rocket', kind: 'badge', title: 'Rocket', price: 250 },
  { id: 'diamond', kind: 'badge', title: 'Diamond', price: 300 },
  { id: 'puzzle', kind: 'badge', title: 'Puzzle', price: 300 },
  { id: 'dice', kind: 'badge', title: 'Dice', price: 100 },
  { id: 'key', kind: 'badge', title: 'Key', price: 200 },
  { id: 'hourglass', kind: 'badge', title: 'Hourglass', price: 100 },
  { id: 'bulb', kind: 'badge', title: 'Bulb', price: 200 },
  { id: 'compass', kind: 'badge', title: 'Compass', price: 300 },
  { id: 'mushroom', kind: 'badge', title: 'Mushroom', price: 200 },
  { id: 'cactus', kind: 'badge', title: 'Cactus', price: 100 },
  { id: 'snowflake', kind: 'badge', title: 'Snowflake', price: 200 },
  { id: 'wave', kind: 'badge', title: 'Wave', price: 100 },
  { id: 'clover', kind: 'badge', title: 'Clover', price: 200 },
  { id: 'bean', kind: 'badge', title: 'Coffee Bean', price: 300 },
  { id: 'fox', kind: 'badge', title: 'Fox', price: 400 },
  { id: 'owl', kind: 'badge', title: 'Owl', price: 500 },
  { id: 'fish', kind: 'badge', title: 'Fish', price: 300 },
  { id: 'bird', kind: 'badge', title: 'Bird', price: 300 },
  { id: 'frog', kind: 'badge', title: 'Frog', price: 400 },
  { id: 'umbrella', kind: 'badge', title: 'Umbrella', price: 400 },
  { id: 'coffee', kind: 'badge', title: 'Coffee', price: 200 },
  { id: 'headphones', kind: 'badge', title: 'Headphones', price: 300 },
  { id: 'anchor', kind: 'badge', title: 'Anchor', price: 200 },
  { id: 'note', kind: 'badge', title: 'Note', price: 100 },
  { id: 'planet', kind: 'badge', title: 'Planet', price: 400 },
  { id: 'paw', kind: 'badge', title: 'Paw', price: 500 },
];

// One id/title pair per type and difficulty, kept as a compact table rather than 32 hand-written
// flair literals. Ids and titles are forever, same as the badges above.
const PACK_FLAIRS: Record<PuzzleTypeId, Record<Difficulty, { id: string; title: string }>> = {
  zip: {
    easy: { id: 'basic-zipper', title: 'Basic Zipper' },
    medium: { id: 'line-drawer', title: 'Line Drawer' },
    hard: { id: 'zip-addict', title: 'Zip Addict' },
    genius: { id: 'zipping-all-day', title: 'Zipping All Day' },
  },
  shapes: {
    easy: { id: 'shape-spotter', title: 'Shape Spotter' },
    medium: { id: 'shape-shuffler', title: 'Shape Shuffler' },
    hard: { id: 'shape-shifter', title: 'Shape Shifter' },
    genius: { id: 'shape-master', title: 'Shape Master' },
  },
  nonogram: {
    easy: { id: 'pixel-picker', title: 'Pixel Picker' },
    medium: { id: 'pixel-painter', title: 'Pixel Painter' },
    hard: { id: 'grid-whisperer', title: 'Grid Whisperer' },
    genius: { id: 'nonogram-nerd', title: 'Nonogram Nerd' },
  },
  mosaic: {
    easy: { id: 'tile-setter', title: 'Tile Setter' },
    medium: { id: 'mosaic-maker', title: 'Mosaic Maker' },
    hard: { id: 'pattern-seeker', title: 'Pattern Seeker' },
    genius: { id: 'mosaic-master', title: 'Mosaic Master' },
  },
  crowns: {
    easy: { id: 'crown-collector', title: 'Kitten Sitter' },
    medium: { id: 'crown-keeper', title: 'Cat Whisperer' },
    hard: { id: 'royal-advisor', title: 'Cat Herder' },
    genius: { id: 'crowned-head', title: 'Top Cat' },
  },
  stars: {
    easy: { id: 'stargazer', title: 'Soft Heart' },
    medium: { id: 'star-chaser', title: 'Heart Collector' },
    hard: { id: 'constellation', title: 'Heartbreaker' },
    genius: { id: 'supernova', title: 'Lionheart' },
  },
  sudoku: {
    easy: { id: 'number-cruncher', title: 'Number Cruncher' },
    medium: { id: 'grid-solver', title: 'Grid Solver' },
    hard: { id: 'sudoku-sage', title: 'Sudoku Sage' },
    genius: { id: 'sudoku-sensei', title: 'Sudoku Sensei' },
  },
  killer: {
    easy: { id: 'cage-rookie', title: 'Cage Rookie' },
    medium: { id: 'cage-fighter', title: 'Cage Fighter' },
    hard: { id: 'cage-breaker', title: 'Cage Breaker' },
    genius: { id: 'killer-instinct', title: 'Killer Instinct' },
  },
  tracks: {
    easy: { id: 'track-layer', title: 'Track Layer' },
    medium: { id: 'signal-keeper', title: 'Signal Keeper' },
    hard: { id: 'switchman', title: 'Switchman' },
    genius: { id: 'railway-baron', title: 'Railway Baron' },
  },
  slabs: {
    easy: { id: 'stone-setter', title: 'Stone Setter' },
    medium: { id: 'slab-stacker', title: 'Slab Stacker' },
    hard: { id: 'mason', title: 'Mason' },
    genius: { id: 'master-builder', title: 'Master Builder' },
  },
};

function packFlair(type: PuzzleTypeId, difficulty: Difficulty): FlairCosmetic {
  const { id, title } = PACK_FLAIRS[type][difficulty];
  return { id, kind: 'flair', title, requires: { pack: type, difficulty } };
}

// One block per puzzle type, Easy to Genius, in the order the shop lists them.
export const FLAIRS_BY_TYPE: Readonly<Record<PuzzleTypeId, readonly FlairCosmetic[]>> = Object.fromEntries(
  PUZZLE_TYPES.map((type) => [type, DIFFICULTIES.map((difficulty) => packFlair(type, difficulty))]),
) as unknown as Record<PuzzleTypeId, readonly FlairCosmetic[]>;

// Earned when the named achievement unlocks, rather than by finishing a pack.
export const ACTIVITY_FLAIRS: readonly FlairCosmetic[] = [
  { id: 'puzzler', kind: 'flair', title: 'Puzzler', requires: { achievement: 'every-type' } },
  { id: 'night-shift', kind: 'flair', title: 'Night Shift', requires: { achievement: 'night-owl' } },
  { id: 'morning-person', kind: 'flair', title: 'Morning Person', requires: { achievement: 'early-bird' } },
  { id: 'sweeper', kind: 'flair', title: 'Clean Sweeper', requires: { achievement: 'perfect-10' } },
  { id: 'hustler', kind: 'flair', title: 'Hustler', requires: { achievement: 'streak-30' } },
  { id: 'relentless', kind: 'flair', title: 'Relentless', requires: { achievement: 'streak-100' } },
  { id: 'puzzle-legend', kind: 'flair', title: 'Puzzle Legend', requires: { achievement: 'streak-365' } },
  { id: 'immaculate', kind: 'flair', title: 'Immaculate', requires: { achievement: 'perfect-day-no-hint' } },
  { id: 'veteran', kind: 'flair', title: 'Veteran', requires: { achievement: 'solved-1000' } },
  { id: 'regular', kind: 'flair', title: 'Regular', requires: { achievement: 'weekly-10' } },
];

// Earned only by climbing Hustle, never bought: price 0 and a stage to reach.
export const HUSTLE_BADGES: readonly BadgeCosmetic[] = [
  { id: 'hustle-mountain', kind: 'badge', title: 'Mountain', price: 0, requires: { hustle: 50 } },
  { id: 'hustle-ladder', kind: 'badge', title: 'Ladder', price: 0, requires: { hustle: 100 } },
  { id: 'hustle-arrow', kind: 'badge', title: 'Flame Arrow', price: 0, requires: { hustle: 200 } },
  { id: 'hustle-crown', kind: 'badge', title: 'Crown', price: 0, requires: { hustle: 400 } },
  { id: 'hustle-summit', kind: 'badge', title: 'Summit', price: 0, requires: { hustle: 750 } },
];

export const HUSTLE_FLAIRS: readonly FlairCosmetic[] = [
  { id: 'hustle-starter', kind: 'flair', title: 'Hustle Starter', requires: { hustle: 40 } },
  { id: 'hustle-addict', kind: 'flair', title: 'Hustle Addict', requires: { hustle: 120 } },
  { id: 'hustle-grinder', kind: 'flair', title: 'Hustle Grinder', requires: { hustle: 300 } },
  { id: 'hustle-pro', kind: 'flair', title: 'Hustle Pro', requires: { hustle: 500 } },
  { id: 'hustle-legend', kind: 'flair', title: 'Hustle Legend', requires: { hustle: 1000 } },
];

// Until launch every theme can be worn without buying it, so testers see them all; prices still
// show. Turn off together with moving ACHIEVEMENTS_EPOCH, and unbought themes fall back to Vexury.
export const THEMES_FREE = true;

// Whole-app looks, each with one fixed mode. Only this device sees them, the worker never does.
export const THEMES: readonly ThemeCosmetic[] = [
  { id: 'paper', kind: 'theme', title: 'Paper', price: 400, mode: 'light' },
  { id: 'sakura', kind: 'theme', title: 'Sakura', price: 400, mode: 'light' },
  { id: 'midnight', kind: 'theme', title: 'Midnight', price: 500, mode: 'dark' },
  { id: 'cat-cafe', kind: 'theme', title: 'Cat Café', price: 600, mode: 'light' },
  { id: 'terminal', kind: 'theme', title: 'Terminal', price: 900, mode: 'dark' },
  { id: 'synthwave', kind: 'theme', title: 'Synthwave', price: 1200, mode: 'dark' },
];

// Earned only by climbing Hustle, like HUSTLE_BADGES; each comes with the achievement of its stage.
export const HUSTLE_THEMES: readonly ThemeCosmetic[] = [
  { id: 'ocean', kind: 'theme', title: 'Ocean', price: 0, mode: 'light', requires: { hustle: 333 } },
  { id: 'inferno', kind: 'theme', title: 'Inferno', price: 0, mode: 'dark', requires: { hustle: 666 } },
  { id: 'casino', kind: 'theme', title: 'Casino', price: 0, mode: 'dark', requires: { hustle: 777 } },
];

// The strip behind the name in every standings row and the banner of the player card. Ids are
// forever, like the badges; `dark` says which text colour reads on it.
export const NAMEPLATES: readonly NameplateCosmetic[] = [
  { id: 'plate-paper', kind: 'nameplate', title: 'Paper Grid', price: 300, dark: false },
  { id: 'plate-zip', kind: 'nameplate', title: 'Zip Trail', price: 400, dark: false },
  { id: 'plate-pixel', kind: 'nameplate', title: 'Pixel Heart', price: 400, dark: false },
  { id: 'plate-sakura', kind: 'nameplate', title: 'Sakura Drift', price: 500, dark: false },
  { id: 'plate-cat-nap', kind: 'nameplate', title: 'Cat Nap', price: 600, dark: false },
  { id: 'plate-midnight', kind: 'nameplate', title: 'Midnight Sky', price: 600, dark: true },
  { id: 'plate-terminal', kind: 'nameplate', title: 'Terminal', price: 800, dark: true },
];

// Earned only by climbing Hustle, like HUSTLE_BADGES, on stages no other reward uses.
export const HUSTLE_NAMEPLATES: readonly NameplateCosmetic[] = [
  { id: 'plate-tracks', kind: 'nameplate', title: 'Tracks', price: 0, dark: false, requires: { hustle: 80 } },
  { id: 'plate-mosaic', kind: 'nameplate', title: 'Mosaic', price: 0, dark: true, requires: { hustle: 150 } },
  { id: 'plate-weaver', kind: 'nameplate', title: 'Thread Weaver', price: 0, dark: false, requires: { hustle: 250 } },
  { id: 'plate-synthwave', kind: 'nameplate', title: 'Synthwave', price: 0, dark: true, requires: { hustle: 550 } },
  { id: 'plate-gold', kind: 'nameplate', title: 'Genius Gold', price: 0, dark: true, requires: { hustle: 900 } },
];

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'hustle';

// The frame a badge wears as an avatar follows its price, so the catalogue needs no new field.
export function badgeRarity(badge: BadgeCosmetic): Rarity {
  if (badge.requires) return 'hustle';
  if (badge.price >= 500) return 'legendary';
  if (badge.price >= 400) return 'epic';
  if (badge.price >= 250) return 'rare';
  if (badge.price >= 150) return 'uncommon';
  return 'common';
}

// How many badges the player card shows; the first is the one the standings show.
export const SHOWCASE_SIZE = 4;

// A display name must fit the first line of a standings row on a phone, podium included
// (2026-10-02: 14 of mixed letters measured fit there; before, 24 were allowed).
export const NAME_MIN = 2;
export const NAME_MAX = 14;

export const COSMETICS: readonly Cosmetic[] = [
  ...BADGES,
  ...HUSTLE_BADGES,
  ...PUZZLE_TYPES.flatMap((type) => FLAIRS_BY_TYPE[type]),
  ...ACTIVITY_FLAIRS,
  ...HUSTLE_FLAIRS,
  ...THEMES,
  ...HUSTLE_THEMES,
  ...NAMEPLATES,
  ...HUSTLE_NAMEPLATES,
];

const BY_ID = new Map(COSMETICS.map((c) => [c.id, c]));

export function findCosmetic(id: unknown): Cosmetic | undefined {
  return typeof id === 'string' ? BY_ID.get(id) : undefined;
}

export function isCosmeticOf(id: unknown, kind: CosmeticKind): id is string {
  return findCosmetic(id)?.kind === kind;
}
