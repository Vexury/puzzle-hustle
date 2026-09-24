import { DIFFICULTIES, PUZZLE_TYPES, type Difficulty, type PuzzleTypeId } from './types.ts';

export type CosmeticKind = 'badge' | 'flair';

export type FlairRequirement = { pack: PuzzleTypeId; difficulty: Difficulty } | { achievement: string };

export type Cosmetic =
  | { id: string; kind: 'badge'; title: string; price: number }
  | { id: string; kind: 'flair'; title: string; requires: FlairRequirement };

export type BadgeCosmetic = Extract<Cosmetic, { kind: 'badge' }>;
export type FlairCosmetic = Extract<Cosmetic, { kind: 'flair' }>;

// Ids are forever: a board row carries them to clients of every age, so an id may be added but
// never renamed or removed. No crown (place 1 wears one) and no flame (the streak colour).
const BADGES: readonly Cosmetic[] = [
  { id: 'bolt', kind: 'badge', title: 'Bolt', price: 100 },
  { id: 'leaf', kind: 'badge', title: 'Leaf', price: 100 },
  { id: 'cat', kind: 'badge', title: 'Cat', price: 150 },
  { id: 'moon', kind: 'badge', title: 'Moon', price: 150 },
  { id: 'sun', kind: 'badge', title: 'Sun', price: 150 },
  { id: 'ghost', kind: 'badge', title: 'Ghost', price: 200 },
  { id: 'rocket', kind: 'badge', title: 'Rocket', price: 250 },
  { id: 'diamond', kind: 'badge', title: 'Diamond', price: 300 },
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
];

export const COSMETICS: readonly Cosmetic[] = [
  ...BADGES,
  ...PUZZLE_TYPES.flatMap((type) => FLAIRS_BY_TYPE[type]),
  ...ACTIVITY_FLAIRS,
];

const BY_ID = new Map(COSMETICS.map((c) => [c.id, c]));

export function findCosmetic(id: unknown): Cosmetic | undefined {
  return typeof id === 'string' ? BY_ID.get(id) : undefined;
}

export function isCosmeticOf(id: unknown, kind: CosmeticKind): id is string {
  return findCosmetic(id)?.kind === kind;
}
