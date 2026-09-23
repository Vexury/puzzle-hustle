import { ACHIEVEMENT_COINS, ACHIEVEMENTS, unlockedAchievements, type SolveEntry } from '@puzzle-hustle/core';
import { announceAchievement } from '../components/AchievementBanner.tsx';
import { pendingAnnouncements, syncAnnouncements } from './announce.ts';
import { allSolves } from './storage.ts';

export { pendingAnnouncements };

const KEY = 'ph:achievements';

// Reads the in-memory solve cache, not localStorage: recordSolve() updates the cache before it
// writes localStorage (inside its own try/catch), and syncAchievements() runs immediately after
// a solve, so a localStorage read here could miss the very solve that triggered it. The cache is
// typed as SolveRecord, but it started as a JSON.parse with no validation, so each entry is still
// checked as if it were unknown.
export function storedSolves(): SolveEntry[] {
  const out: SolveEntry[] = [];
  for (const [id, value] of Object.entries(allSolves())) {
    const record = value as unknown;
    if (!record || typeof record !== 'object') continue;
    const candidate = record as { solvedAt?: unknown; seconds?: unknown; hints?: unknown; moves?: unknown };
    if (typeof candidate.solvedAt !== 'string') continue;
    const solvedAt = Date.parse(candidate.solvedAt);
    if (!Number.isFinite(solvedAt)) continue;
    out.push({
      id,
      solvedAt,
      seconds: typeof candidate.seconds === 'number' ? candidate.seconds : 0,
      hints: typeof candidate.hints === 'number' ? candidate.hints : 0,
      moves: typeof candidate.moves === 'number' ? candidate.moves : 0,
    });
  }
  return out;
}

export function currentUnlocked(): Set<string> {
  return unlockedAchievements(storedSolves());
}

const CATALOG_ORDER = ACHIEVEMENTS.map((a) => a.id);

// Called after a solve and on app start. Must never throw: a player does not lose their
// finished-puzzle screen, or their session start, over a collectible.
export function syncAchievements(): void {
  syncAnnouncements(KEY, currentUnlocked, CATALOG_ORDER, (id) => {
    const achievement = ACHIEVEMENTS.find((a) => a.id === id);
    if (achievement) announceAchievement(`${achievement.title} · +${ACHIEVEMENT_COINS} coins`);
  });
}
