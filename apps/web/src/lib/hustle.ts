import { earnedHustleBadges, earnedHustleNameplates, HUSTLE_BADGES, HUSTLE_NAMEPLATES, hustleSolved } from '@puzzle-hustle/core';
import { announceUnlock } from '../components/UnlockModal.tsx';
import { storedSolves } from './achievements.ts';
import { apiFetch, readSession } from './api.ts';
import { syncAnnouncements } from './announce.ts';

const BADGES_KEY = 'ph:hustle-badges';
const NAMEPLATES_KEY = 'ph:hustle-nameplates';

// Like syncFlairs: after a solve and on app start, never throws.
export function syncHustleRewards(): void {
  syncAnnouncements(BADGES_KEY, () => earnedHustleBadges(storedSolves()), HUSTLE_BADGES.map((b) => b.id), (id) => announceUnlock({ kind: 'badge', id }));
  syncAnnouncements(NAMEPLATES_KEY, () => earnedHustleNameplates(storedSolves()), HUSTLE_NAMEPLATES.map((n) => n.id), (id) => announceUnlock({ kind: 'nameplate', id }));
}

// Same path as the cosmetics: no queue. The server keeps the highest value it saw, so a failed
// push is simply repeated after the next Hustle solve or sign-in.
export async function pushHustle(): Promise<void> {
  if (!readSession()) return;
  const level = hustleSolved(storedSolves());
  if (level === 0) return;
  try {
    await apiFetch('/hustle', { method: 'POST', body: JSON.stringify({ level }), auth: true });
  } catch {
    /* next solve or sign-in sends it again */
  }
}
