import { useSyncExternalStore } from 'react';
import {
  coinBalance,
  coinsEarned,
  earnedFlairs,
  findCosmetic,
  HINT_PRICE,
  ownedItems,
  type CoinAward,
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

// Bought badges plus earned flairs: a flair is never in ph:coins:spent (buyItem refuses it), so
// the two sources never overlap.
export function owned(): Set<string> {
  return new Set([...ownedItems(readSpent()), ...earnedFlairs(storedSolves())]);
}

export function buyItem(id: string): boolean {
  const item = findCosmetic(id);
  if (!item || item.kind !== 'badge' || owned().has(id) || balance() < item.price) return false;
  appendSpent({ kind: 'item', item: id, coins: item.price, at: Date.now() });
  return true;
}

export interface Equipped {
  badge: string | null;
  flair: string | null;
}

export function readEquipped(): Equipped {
  try {
    const raw = readSetting(EQUIPPED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    const v = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    const ownedIds = owned();
    return {
      badge: findCosmetic(v.badge)?.kind === 'badge' && ownedIds.has(v.badge as string) ? (v.badge as string) : null,
      flair: findCosmetic(v.flair)?.kind === 'flair' && ownedIds.has(v.flair as string) ? (v.flair as string) : null,
    };
  } catch {
    return { badge: null, flair: null };
  }
}

export function useEquipped(): Equipped {
  'use no memo';
  useSolves();
  useSyncExternalStore(subscribe, () => version, () => version);
  return readEquipped();
}

export function equip(kind: CosmeticKind, id: string | null): boolean {
  if (id !== null && (findCosmetic(id)?.kind !== kind || !owned().has(id))) return false;
  writeSetting(EQUIPPED_KEY, JSON.stringify({ ...readEquipped(), [kind]: id }));
  changed();
  void pushCosmetics();
  return true;
}

const EXTRA_LABEL: Partial<Record<CoinAward['reason'], string>> = { 'no-hints': 'no hints', 'clean-sweep': 'clean sweep' };

// A replay keeps its one entry in ph:solves, so the core still lists its awards; only the
// caller knows whether this run was the first.
export function solveCoinLine(awards: CoinAward[], firstSolve: boolean): string | null {
  if (!firstSolve || awards.length === 0) return null;
  const base = awards.filter((a) => !EXTRA_LABEL[a.reason]).reduce((n, a) => n + a.coins, 0);
  const extras = awards.filter((a) => EXTRA_LABEL[a.reason]).map((a) => `+${a.coins} ${EXTRA_LABEL[a.reason]}`);
  return [`+${base} coins`, ...extras].join(' · ');
}

// Same path as the name: no queue. A failed push is simply repeated after the next sign-in.
export async function pushCosmetics(): Promise<void> {
  if (!readSession()) return;
  try {
    await apiFetch('/cosmetics', { method: 'POST', body: JSON.stringify(readEquipped()), auth: true });
  } catch {
    /* next sign-in sends it again */
  }
}
