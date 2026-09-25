import { useSyncExternalStore } from 'react';
import { readSetting, writeSetting } from './storage.ts';

export const ACCENTS = ['amber', 'lagoon', 'cobalt', 'iris', 'rose', 'slate'] as const;
export type Accent = (typeof ACCENTS)[number];

export const ACCENT_NAMES: Record<Accent, string> = {
  amber: 'Amber',
  lagoon: 'Lagoon',
  cobalt: 'Cobalt',
  iris: 'Iris',
  rose: 'Rose',
  slate: 'Slate',
};

const listeners = new Set<() => void>();

export function storedAccent(): Accent {
  const saved = readSetting('ph:accent') ?? '';
  return (ACCENTS as readonly string[]).includes(saved) ? (saved as Accent) : 'amber';
}

// Under a pack the accent attribute stays off, so no accent rule competes with the pack's tokens.
function apply() {
  const root = document.documentElement;
  if (!root.dataset['pack']) root.dataset['accent'] = storedAccent();
  for (const l of listeners) l();
}

export function useAccent(): { accent: Accent; setAccent(a: Accent): void } {
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  const accent = useSyncExternalStore(subscribe, storedAccent);
  return {
    accent,
    setAccent: (a: Accent) => {
      writeSetting('ph:accent', a);
      apply();
    },
  };
}

export function initAccent() {
  apply();
}
