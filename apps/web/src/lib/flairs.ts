import { COSMETICS, earnedFlairs } from '@puzzle-hustle/core';
import { announceAchievement } from '../components/AchievementBanner.tsx';
import { pendingAnnouncements, storedSolves } from './achievements.ts';
import { readSetting, writeSetting } from './storage.ts';

const KEY = 'ph:flairs';

function announced(): string[] {
  try {
    const raw = readSetting(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

const CATALOG_ORDER = new Map(COSMETICS.filter((c) => c.kind === 'flair').map((c, i) => [c.id, i]));

// Called after a solve and on app start, same as syncAchievements, and for the same reason:
// must never throw, or a player loses their finished-puzzle screen or their session start over
// a collectible.
export function syncFlairs(): void {
  try {
    const earned = earnedFlairs(storedSolves());
    const previouslyAnnounced = announced();
    const { toAnnounce, nextAnnounced } = pendingAnnouncements(earned, previouslyAnnounced);
    const unchanged =
      nextAnnounced.length === previouslyAnnounced.length &&
      nextAnnounced.every((id, i) => id === previouslyAnnounced[i]);
    if (!unchanged) writeSetting(KEY, JSON.stringify(nextAnnounced));
    const ordered = [...toAnnounce].sort((a, b) => (CATALOG_ORDER.get(a) ?? 0) - (CATALOG_ORDER.get(b) ?? 0));
    for (const id of ordered) {
      const flair = COSMETICS.find((c) => c.id === id);
      if (flair) announceAchievement(`Flair unlocked: ${flair.title}`);
    }
  } catch {
    /* a collectible is never worth interrupting anything */
  }
}
