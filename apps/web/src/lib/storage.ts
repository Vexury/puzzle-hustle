import { useSyncExternalStore } from 'react';

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

export function getSolve(id: string): SolveRecord | undefined {
  return cache[id];
}

export function recordSolve(id: string, record: SolveRecord) {
  if (cache[id]) return;
  cache = { ...cache, [id]: record };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
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
  } catch {
    /* storage unavailable */
  }
}
