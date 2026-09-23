import { Capacitor, registerPlugin } from '@capacitor/core';
import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { readSetting, writeSetting } from './storage.ts';

export interface Origin {
  x: number;
  y: number;
}

export function centerOf(element: Element): Origin {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

export type Theme = 'light' | 'dark';
export type ThemePref = Theme | 'system';
export const THEME_PREFS: ThemePref[] = ['system', 'light', 'dark'];

// Android only. iOS has no counterpart yet, see the open item in the wiki.
const StatusBarStyle = registerPlugin<{ setStyle(options: { style: 'DARK' | 'LIGHT' }): Promise<void> }>('StatusBarStyle');

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
  const theme = resolve(pref());
  document.documentElement.dataset['theme'] = theme;
  if (Capacitor.getPlatform() === 'android') {
    void StatusBarStyle.setStyle({ style: theme === 'dark' ? 'DARK' : 'LIGHT' });
  }
  for (const l of listeners) l();
}

// The new theme grows out of the button that was pressed. Without view transitions, or when the
// system asks for less motion, the swap stays instant.
function reveal(origin: Origin | undefined, swap: () => void) {
  const root = document.documentElement;
  if (!origin || !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    swap();
    return;
  }
  // Percentages of the snapshot, not pixels: Android WebView 151 lays the snapshot out in device
  // pixels, so a pixel origin landed at a third of the way to the button on a 3x screen. A
  // circle radius in percent is measured against the box diagonal divided by the square root of 2.
  const radius = Math.hypot(Math.max(origin.x, innerWidth - origin.x), Math.max(origin.y, innerHeight - origin.y));
  root.style.setProperty('--reveal-x', `${(origin.x / innerWidth) * 100}%`);
  root.style.setProperty('--reveal-y', `${(origin.y / innerHeight) * 100}%`);
  root.style.setProperty('--reveal-r', `${(radius / (Math.hypot(innerWidth, innerHeight) / Math.SQRT2)) * 100}%`);
  root.dataset['reveal'] = 'on';
  const done = () => delete root.dataset['reveal'];
  document.startViewTransition(() => flushSync(swap)).finished.then(done, done);
}

export function useTheme(): { pref: ThemePref; theme: Theme; setPref(p: ThemePref, origin?: Origin): void; toggle(origin?: Origin): void } {
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  const p = useSyncExternalStore(subscribe, pref);
  const theme = useSyncExternalStore(subscribe, () => resolve(pref()));
  const setPref = (next: ThemePref, origin?: Origin) => {
    writeSetting('theme', next);
    reveal(origin, apply);
  };
  return { pref: p, theme, setPref, toggle: (origin?: Origin) => setPref(theme === 'dark' ? 'light' : 'dark', origin) };
}

export function initTheme() {
  apply();
  media.addEventListener('change', apply);
}
