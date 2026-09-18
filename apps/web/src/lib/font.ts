import { useSyncExternalStore } from 'react';
import { readSetting, writeSetting } from './storage.ts';

export interface FontOption {
  id: string;
  label: string;
  family: string;
  google: string | null;
}

export const FONT_OPTIONS: readonly FontOption[] = [
  { id: 'inconsolata', label: 'Mono', family: "'Inconsolata', ui-monospace, monospace", google: null },
  { id: 'nunito', label: 'Nunito', family: "'Nunito', system-ui, sans-serif", google: 'Nunito:wght@400..900' },
  { id: 'jakarta', label: 'Jakarta', family: "'Plus Jakarta Sans', system-ui, sans-serif", google: 'Plus+Jakarta+Sans:wght@400..800' },
  { id: 'outfit', label: 'Outfit', family: "'Outfit', system-ui, sans-serif", google: 'Outfit:wght@400..900' },
];

const KEY = 'ph:font';
const listeners = new Set<() => void>();

function current(): string {
  const saved = readSetting(KEY);
  return FONT_OPTIONS.some((f) => f.id === saved) ? saved! : 'inconsolata';
}

function load(font: FontOption) {
  if (!font.google) return;
  const id = `font-${font.id}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`;
  document.head.appendChild(link);
}

export function preloadFonts() {
  for (const f of FONT_OPTIONS) load(f);
}

function apply() {
  const font = FONT_OPTIONS.find((f) => f.id === current())!;
  const root = document.documentElement;
  root.dataset['font'] = font.id;
  root.style.setProperty('--font-text', font.family);
  load(font);
  for (const l of listeners) l();
}

export function useFont(): [string, (id: string) => void] {
  const id = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    current,
  );
  return [
    id,
    (next) => {
      writeSetting(KEY, next);
      apply();
    },
  ];
}

export function initFont() {
  apply();
}
