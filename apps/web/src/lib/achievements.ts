import { ACHIEVEMENTS, unlockedAchievements, type SolveEntry } from '@puzzle-hustle/core';
import { toast } from '../components/Toast.tsx';
import { allSolves, readSetting, writeSetting } from './storage.ts';

const KEY = 'ph:achievements';

// Reads the in-memory solve cache, not localStorage: recordSolve() updates the cache before it
// writes localStorage (inside its own try/catch), and syncAchievements() runs immediately after
// a solve, so a localStorage read here could miss the very solve that triggered it. The cache is
// typed as SolveRecord, but it started as a JSON.parse with no validation, so each entry is still
// checked as if it were unknown.
function storedSolves(): SolveEntry[] {
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

function announced(): string[] {
  try {
    const raw = readSetting(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function currentUnlocked(): Set<string> {
  return unlockedAchievements(storedSolves());
}

// Pure, so the one piece of real reasoning here can be tested on its own. An id in the announced
// list that is no longer unlocked is dropped rather than kept: the epoch moves forward once, at
// the production release, and an achievement that re-locks has to be earnable, and celebrated, a
// second time.
export function pendingAnnouncements(
  unlocked: Set<string>,
  announcedIds: readonly string[],
): { toAnnounce: string[]; nextAnnounced: string[] } {
  const known = new Set(announcedIds.filter((id) => unlocked.has(id)));
  const toAnnounce = [...unlocked].filter((id) => !known.has(id));
  return { toAnnounce, nextAnnounced: [...known, ...toAnnounce] };
}

const CATALOG_ORDER = new Map(ACHIEVEMENTS.map((a, i) => [a.id, i]));

// Called after a solve and on app start. Must never throw: a player does not lose their
// finished-puzzle screen, or their session start, over a collectible.
export function syncAchievements(): void {
  try {
    const unlocked = currentUnlocked();
    const { toAnnounce, nextAnnounced } = pendingAnnouncements(unlocked, announced());
    // Written even when nothing is new. When the epoch moves forward an achievement re-locks,
    // and its id has to leave the stored list right then, or it is still there when the player
    // earns it again and the second unlock passes silently.
    writeSetting(KEY, JSON.stringify(nextAnnounced));
    // Sorted explicitly by catalog position rather than trusting the order toAnnounce already
    // happens to arrive in: pendingAnnouncements is deliberately generic and does not know about
    // ACHIEVEMENTS, so nothing upstream guarantees an order a future core refactor couldn't
    // silently disturb.
    const ordered = [...toAnnounce].sort((a, b) => (CATALOG_ORDER.get(a) ?? 0) - (CATALOG_ORDER.get(b) ?? 0));
    for (const id of ordered) {
      const achievement = ACHIEVEMENTS.find((a) => a.id === id);
      if (achievement) toast(`Achievement unlocked: ${achievement.title}`);
    }
  } catch {
    /* a collectible is never worth interrupting anything */
  }
}
