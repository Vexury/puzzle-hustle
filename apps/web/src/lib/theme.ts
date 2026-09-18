import { useSyncExternalStore } from 'react';
import { readSetting, writeSetting } from './storage.ts';

export type Theme = 'light' | 'dark';
export type ThemePref = Theme | 'system';
export const THEME_PREFS: ThemePref[] = ['system', 'light', 'dark'];

const listeners = new Set<() => void>();
const media = matchMedia('(prefers-color-scheme: dark)');

function pref(): ThemePref {
  const saved = readSetting('theme');
  return saved === 'light' || saved === 'dark' ? saved : 'system';
}

function resolve(p: ThemePref): Theme {
  return p === 'system' ? (media.matches ? 'dark' : 'light') : p;
}

function apply() {
  document.documentElement.dataset['theme'] = resolve(pref());
  for (const l of listeners) l();
}

export function useTheme(): { pref: ThemePref; theme: Theme; setPref(p: ThemePref): void; toggle(): void } {
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  const p = useSyncExternalStore(subscribe, pref);
  const theme = useSyncExternalStore(subscribe, () => resolve(pref()));
  const setPref = (next: ThemePref) => {
    writeSetting('theme', next);
    apply();
  };
  return { pref: p, theme, setPref, toggle: () => setPref(theme === 'dark' ? 'light' : 'dark') };
}

export function initTheme() {
  apply();
  media.addEventListener('change', apply);
}
