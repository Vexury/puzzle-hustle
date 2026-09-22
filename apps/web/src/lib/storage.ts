import { useSyncExternalStore } from 'react';
import { isBackedUp, scheduleBackup } from './backup.ts';

export interface SolveRecord {
  solvedAt: string;
  seconds: number;
  hints: number;
  moves: number;
}

const KEY = 'ph:solves';
const listeners = new Set<() => void>();
let cache: Record<string, SolveRecord> = load();

function load(): Record<string, SolveRecord> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, SolveRecord>) : {};
  } catch {
    return {};
  }
}

export function rehydrate() {
  cache = load();
  for (const l of listeners) l();
}

export function allSolves(): Record<string, SolveRecord> {
  return cache;
}

export function getSolve(id: string): SolveRecord | undefined {
  return cache[id];
}

const PERIOD_ID = /:(daily|weekly|monthly):/;

export function recordSolve(id: string, record: SolveRecord) {
  const previous = cache[id];
  // Dailies, Weeklies and Monthlies keep their first run, that is the time the leaderboard got.
  // Everything else is repeatable, so a faster run replaces the old one. The first solve date
  // stays, otherwise replaying an old level would drag it past the achievements epoch.
  if (previous && (PERIOD_ID.test(id) || record.seconds >= previous.seconds)) return;
  cache = { ...cache, [id]: previous ? { ...record, solvedAt: previous.solvedAt } : record };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
    scheduleBackup();
  } catch {
    /* storage unavailable */
  }
  for (const l of listeners) l();
}

export function useSolves(): Record<string, SolveRecord> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => cache,
  );
}

export interface Progress {
  state: number[];
  seconds: number;
  moves: number;
  hints: number;
}

const PROGRESS_PREFIX = 'ph:progress:';

export function readProgress(id: string): Progress | null {
  try {
    const raw = localStorage.getItem(PROGRESS_PREFIX + id);
    return raw ? (JSON.parse(raw) as Progress) : null;
  } catch {
    return null;
  }
}

export function writeProgress(id: string, progress: Progress) {
  try {
    localStorage.setItem(PROGRESS_PREFIX + id, JSON.stringify(progress));
    scheduleBackup();
  } catch {
    /* storage unavailable */
  }
}

export function clearProgress(id: string) {
  try {
    localStorage.removeItem(PROGRESS_PREFIX + id);
    scheduleBackup();
  } catch {
    /* storage unavailable */
  }
}

// Deliberately leaves ph:queue untouched: those are solves the player genuinely earned, often
// while offline, and dropping them to honour a local reset would destroy real data to avoid
// mild surprise. Decided, not an oversight.
export function resetProgress() {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        k &&
        (k === KEY ||
          k === 'ph:achievements' ||
          k.startsWith(PROGRESS_PREFIX) ||
          k.startsWith('ph:howto:') ||
          k.startsWith('ph:difficulty:'))
      )
        doomed.push(k);
    }
    for (const k of doomed) localStorage.removeItem(k);
    scheduleBackup();
  } catch {
    /* storage unavailable */
  }
  cache = {};
  for (const l of listeners) l();
}

export function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    if (isBackedUp(key)) scheduleBackup();
  } catch {
    /* storage unavailable */
  }
}

export function removeSetting(key: string) {
  try {
    localStorage.removeItem(key);
    if (isBackedUp(key)) scheduleBackup();
  } catch {
    /* storage unavailable */
  }
}
