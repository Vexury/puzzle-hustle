import { useSyncExternalStore } from 'react';
import {
  coinBalance,
  coinsEarned,
  earnedFlairs,
  earnedHustleBadges,
  earnedHustleNameplates,
  earnedHustleThemes,
  findCosmetic,
  HINT_PRICE,
  ownedItems,
  SHOWCASE_SIZE,
  THEMES_FREE,
  type CosmeticKind,
  type SpendEntry,
} from '@puzzle-hustle/core';
import { apiFetch, readSession } from './api.ts';
import { storedSolves } from './achievements.ts';
import { readSetting, useSolves, writeSetting } from './storage.ts';

const SPENT_KEY = 'ph:coins:spent';
const EQUIPPED_KEY = 'ph:cosmetics';

// No cache: every read goes to storage, so a progress reset or a restored backup can never
// leave a stale balance behind. The version only tells React to look again after a write.
let version = 0;
const listeners = new Set<() => void>();
function changed() {
  version++;
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function isSpendEntry(value: unknown): value is SpendEntry {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.coins !== 'number' || !Number.isInteger(v.coins) || v.coins < 0 || typeof v.at !== 'number') return false;
  if (v.kind === 'hint') return typeof v.puzzle === 'string';
  if (v.kind === 'item') return typeof v.item === 'string';
  return false;
}

export function readSpent(): SpendEntry[] {
  try {
    const raw = readSetting(SPENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter(isSpendEntry) : [];
  } catch {
    return [];
  }
}

function appendSpent(entry: SpendEntry) {
  writeSetting(SPENT_KEY, JSON.stringify([...readSpent(), entry]));
  changed();
}

export function balance(): number {
  try {
    return coinBalance(coinsEarned(storedSolves()), readSpent());
  } catch {
    return 0;
  }
}

// Both hooks read storage directly and use the subscriptions only to re-render. The React
// Compiler sees no inputs to balance()/readEquipped() and would cache the first result forever,
// so a purchase never showed until a reload.
export function useBalance(): number {
  'use no memo';
  useSolves();
  useSyncExternalStore(subscribe, () => version, () => version);
  return balance();
}

export function canAffordHint(): boolean {
  return balance() >= HINT_PRICE;
}

export function spendHint(puzzle: string): boolean {
  if (!canAffordHint()) return false;
  appendSpent({ kind: 'hint', puzzle, coins: HINT_PRICE, at: Date.now() });
  return true;
}

// Bought badges, themes and nameplates plus earned flairs and Hustle rewards: those are never
// in ph:coins:spent (buyItem refuses them), so the sources never overlap.
export function owned(): Set<string> {
  const solves = storedSolves();
  return new Set([
    ...ownedItems(readSpent()),
    ...earnedFlairs(solves),
    ...earnedHustleBadges(solves),
    ...earnedHustleThemes(solves),
    ...earnedHustleNameplates(solves),
  ]);
}

export function buyItem(id: string): boolean {
  const item = findCosmetic(id);
  if (!item || item.kind === 'flair' || item.requires || owned().has(id) || balance() < item.price) return false;
  appendSpent({ kind: 'item', item: id, coins: item.price, at: Date.now() });
  return true;
}

// `badges` is the showcase on the player card, at most SHOWCASE_SIZE; its first entry is `badge`,
// the one the standings show. Stored before the showcase, a lone `badge` reads as a showcase of one.
export interface Equipped {
  badge: string | null;
  badges: string[];
  flair: string | null;
  theme: string | null;
  nameplate: string | null;
}

const NOTHING: Equipped = { badge: null, badges: [], flair: null, theme: null, nameplate: null };

// Owned, or a theme or nameplate while THEMES_FREE holds before launch.
function wearable(kind: CosmeticKind, id: string, ownedIds: Set<string>): boolean {
  return ownedIds.has(id) || ((kind === 'theme' || kind === 'nameplate') && THEMES_FREE);
}

export function readEquipped(): Equipped {
  try {
    const raw = readSetting(EQUIPPED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    const v = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    const ownedIds = owned();
    const fits = (kind: CosmeticKind, id: unknown): id is string => findCosmetic(id)?.kind === kind && wearable(kind, id as string, ownedIds);
    const pick = (kind: CosmeticKind) => (fits(kind, v[kind]) ? (v[kind] as string) : null);
    const listed: unknown[] = Array.isArray(v.badges) ? v.badges : [v.badge];
    const badges = [...new Set(listed.filter((id) => fits('badge', id)))].slice(0, SHOWCASE_SIZE);
    return { badge: badges[0] ?? null, badges, flair: pick('flair'), theme: pick('theme'), nameplate: pick('nameplate') };
  } catch {
    return NOTHING;
  }
}

export function useEquipped(): Equipped {
  'use no memo';
  useSolves();
  useSyncExternalStore(subscribe, () => version, () => version);
  return readEquipped();
}

function writeEquipped(before: Equipped, next: Equipped) {
  const { badges, flair, theme, nameplate } = next;
  writeSetting(EQUIPPED_KEY, JSON.stringify({ badges, flair, theme, nameplate }));
  changed();
  // The server never holds the theme, so a theme change has nothing to send.
  if (flair !== before.flair || nameplate !== before.nameplate || badges.join() !== before.badges.join()) void pushCosmetics();
}

// For a badge, equipping makes it the one the standings show: first in the showcase, which keeps
// the others behind it. Null clears the showcase.
export function equip(kind: CosmeticKind, id: string | null): boolean {
  if (id !== null && (findCosmetic(id)?.kind !== kind || !wearable(kind, id, owned()))) return false;
  const current = readEquipped();
  if (kind === 'badge') {
    const badges = id === null ? [] : [id, ...current.badges.filter((b) => b !== id)].slice(0, SHOWCASE_SIZE);
    writeEquipped(current, { ...current, badge: badges[0] ?? null, badges });
  } else {
    writeEquipped(current, { ...current, [kind]: id });
  }
  return true;
}

// Adds an owned badge to the end of the showcase or takes it out. 'full' when all slots are used.
export function toggleShowcase(id: string): 'added' | 'removed' | 'full' | 'refused' {
  if (findCosmetic(id)?.kind !== 'badge' || !owned().has(id)) return 'refused';
  const current = readEquipped();
  if (current.badges.includes(id)) {
    const badges = current.badges.filter((b) => b !== id);
    writeEquipped(current, { ...current, badge: badges[0] ?? null, badges });
    return 'removed';
  }
  if (current.badges.length >= SHOWCASE_SIZE) return 'full';
  const badges = [...current.badges, id];
  writeEquipped(current, { ...current, badge: badges[0] ?? null, badges });
  return 'added';
}

// Same path as the name: no queue. A failed push is simply repeated after the next sign-in.
export async function pushCosmetics(): Promise<void> {
  if (!readSession()) return;
  try {
    // `badge` too, for a server from before the showcase, which reads only that.
    const { badge, badges, flair, nameplate } = readEquipped();
    await apiFetch('/cosmetics', { method: 'POST', body: JSON.stringify({ badge, badges, flair, nameplate }), auth: true });
  } catch {
    /* next sign-in sends it again */
  }
}
