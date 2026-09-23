export type CosmeticKind = 'badge' | 'flair';

export interface Cosmetic {
  id: string;
  kind: CosmeticKind;
  title: string;
  price: number;
}

// Ids are forever: a board row carries them to clients of every age, so an id may be added but
// never renamed or removed. No crown (place 1 wears one) and no flame (the streak colour).
export const COSMETICS: readonly Cosmetic[] = [
  { id: 'bolt', kind: 'badge', title: 'Bolt', price: 100 },
  { id: 'leaf', kind: 'badge', title: 'Leaf', price: 100 },
  { id: 'cat', kind: 'badge', title: 'Cat', price: 150 },
  { id: 'moon', kind: 'badge', title: 'Moon', price: 150 },
  { id: 'sun', kind: 'badge', title: 'Sun', price: 150 },
  { id: 'ghost', kind: 'badge', title: 'Ghost', price: 200 },
  { id: 'rocket', kind: 'badge', title: 'Rocket', price: 250 },
  { id: 'diamond', kind: 'badge', title: 'Diamond', price: 300 },

  { id: 'puzzler', kind: 'flair', title: 'Puzzler', price: 150 },
  { id: 'night-shift', kind: 'flair', title: 'Night Shift', price: 200 },
  { id: 'morning-person', kind: 'flair', title: 'Morning Person', price: 200 },
  { id: 'zip-addict', kind: 'flair', title: 'Zip Addict', price: 250 },
  { id: 'grid-whisperer', kind: 'flair', title: 'Grid Whisperer', price: 300 },
  { id: 'sudoku-sage', kind: 'flair', title: 'Sudoku Sage', price: 300 },
  { id: 'sweeper', kind: 'flair', title: 'Clean Sweeper', price: 400 },
  { id: 'hustler', kind: 'flair', title: 'Hustler', price: 500 },
];

const BY_ID = new Map(COSMETICS.map((c) => [c.id, c]));

export function findCosmetic(id: unknown): Cosmetic | undefined {
  return typeof id === 'string' ? BY_ID.get(id) : undefined;
}

export function isCosmeticOf(id: unknown, kind: CosmeticKind): id is string {
  return findCosmetic(id)?.kind === kind;
}
