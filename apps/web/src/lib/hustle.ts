import { earnedHustleBadges, HUSTLE_BADGES } from '@puzzle-hustle/core';
import { announceUnlock } from '../components/UnlockModal.tsx';
import { storedSolves } from './achievements.ts';
import { syncAnnouncements } from './announce.ts';

const BADGES_KEY = 'ph:hustle-badges';
const ORDER = HUSTLE_BADGES.map((b) => b.id);

// Like syncFlairs: after a solve and on app start, never throws.
export function syncHustleBadges(): void {
  syncAnnouncements(BADGES_KEY, () => earnedHustleBadges(storedSolves()), ORDER, (id) => announceUnlock({ kind: 'badge', id }));
}
