import { ACHIEVEMENTS, COSMETICS, earnedFlairs, levelList, PUZZLE_META, type FlairCosmetic } from '@puzzle-hustle/core';
import { announceUnlock } from '../components/UnlockModal.tsx';
import { storedSolves } from './achievements.ts';
import { syncAnnouncements } from './announce.ts';

const KEY = 'ph:flairs';
const CATALOG_ORDER = COSMETICS.filter((c) => c.kind === 'flair').map((c) => c.id);

// Shared by Shop.tsx (the toast on a locked flair) and UnlockModal.tsx (a flair row's
// description): the same wording either way, so it lives here once rather than twice.
export function requirementText(item: FlairCosmetic): string {
  const req = item.requires;
  if ('achievement' in req) return ACHIEVEMENTS.find((a) => a.id === req.achievement)?.description ?? '';
  const difficulty = req.difficulty.charAt(0).toUpperCase() + req.difficulty.slice(1);
  return `Finish all ${levelList(req.pack, req.difficulty).length} ${PUZZLE_META[req.pack].name} levels on ${difficulty}.`;
}

// Called after a solve and on app start, same as syncAchievements, and for the same reason:
// must never throw, or a player loses their finished-puzzle screen or their session start over
// a collectible.
export function syncFlairs(): void {
  syncAnnouncements(KEY, () => earnedFlairs(storedSolves()), CATALOG_ORDER, (id) => announceUnlock({ kind: 'flair', id }));
}
