import { readSetting, writeSetting } from './storage.ts';

function readAnnounced(key: string): string[] {
  try {
    const raw = readSetting(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

// Pure, so the one piece of real reasoning here can be tested on its own. An id in the announced
// list that is no longer current is dropped rather than kept: an achievement's epoch can move
// forward, or a flair can fall out of ownership, and either has to be earnable — and celebrated —
// a second time.
export function pendingAnnouncements(
  current: Set<string>,
  announced: readonly string[],
): { toAnnounce: string[]; nextAnnounced: string[] } {
  const known = new Set(announced.filter((id) => current.has(id)));
  const toAnnounce = [...current].filter((id) => !known.has(id));
  return { toAnnounce, nextAnnounced: [...known, ...toAnnounce] };
}

// Shared by syncAchievements and syncFlairs. Diffs `current()` against the ids already announced
// under `key`, writes the updated list only when it actually changes (a sync that changes
// nothing — notably the very first launch, before anything is unlocked or earned — must not
// write at all: writing an empty key on a clean install makes isBackedUp() see it as already
// present, and restoreBackup() then refuses to ever restore a native backup), and calls
// `announce` once per newly-current id, in `order`'s catalogue order rather than whatever order
// `current()` happens to return.
//
// `current` is a thunk, not a value, so a throw while computing it is still caught here: this
// must never throw, or a player loses their finished-puzzle screen, or their session start, over
// a collectible.
export function syncAnnouncements(
  key: string,
  current: () => Set<string>,
  order: readonly string[],
  announce: (id: string) => void,
): void {
  try {
    const previouslyAnnounced = readAnnounced(key);
    const { toAnnounce, nextAnnounced } = pendingAnnouncements(current(), previouslyAnnounced);
    // Order is deterministic (nextAnnounced is [...kept, ...new] in the same relative order as
    // previouslyAnnounced), so a positional compare is enough to detect no-op syncs.
    const unchanged =
      nextAnnounced.length === previouslyAnnounced.length &&
      nextAnnounced.every((id, i) => id === previouslyAnnounced[i]);
    if (!unchanged) writeSetting(key, JSON.stringify(nextAnnounced));
    // Sorted explicitly by catalog position rather than trusting the order toAnnounce already
    // happens to arrive in: pendingAnnouncements is deliberately generic and does not know about
    // any particular catalogue, so nothing upstream guarantees an order a future refactor
    // couldn't silently disturb.
    const catalogOrder = new Map(order.map((id, i) => [id, i]));
    const ordered = [...toAnnounce].sort((a, b) => (catalogOrder.get(a) ?? 0) - (catalogOrder.get(b) ?? 0));
    for (const id of ordered) announce(id);
  } catch {
    /* a collectible is never worth interrupting anything */
  }
}
