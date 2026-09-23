import { COSMETICS, earnedFlairs } from '@puzzle-hustle/core';
import { announceAchievement } from '../components/AchievementBanner.tsx';
import { storedSolves } from './achievements.ts';
import { syncAnnouncements } from './announce.ts';

const KEY = 'ph:flairs';
const CATALOG_ORDER = COSMETICS.filter((c) => c.kind === 'flair').map((c) => c.id);

// Called after a solve and on app start, same as syncAchievements, and for the same reason:
// must never throw, or a player loses their finished-puzzle screen or their session start over
// a collectible.
export function syncFlairs(): void {
  syncAnnouncements(KEY, () => earnedFlairs(storedSolves()), CATALOG_ORDER, (id) => {
    const flair = COSMETICS.find((c) => c.id === id);
    if (flair) announceAchievement(`Flair unlocked: ${flair.title}`);
  });
}
