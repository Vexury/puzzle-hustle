import { Capacitor, registerPlugin } from '@capacitor/core';
import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { findCosmetic, type ThemeCosmetic } from '@puzzle-hustle/core';
import { equip, readEquipped } from './coins.ts';
import { storedAccent } from './accent.ts';
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

// Our own plugin on both platforms: StatusBarStylePlugin.java and StatusBarStylePlugin.swift.
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

// A try-on shows a pack without buying or saving it; the shop clears it on the way out.
let trying: string | null = null;

export function activePack(): ThemeCosmetic | null {
  const item = findCosmetic(trying ?? readEquipped().theme);
  return item?.kind === 'theme' ? item : null;
}

function apply() {
  const root = document.documentElement;
  const pack = activePack();
  const theme = pack ? pack.mode : resolve(pref());
  root.dataset['theme'] = theme;
  if (pack) {
    root.dataset['pack'] = pack.id;
    delete root.dataset['accent'];
  } else {
    delete root.dataset['pack'];
    root.dataset['accent'] = storedAccent();
  }
  if (Capacitor.isNativePlatform()) {
    void StatusBarStyle.setStyle({ style: theme === 'dark' ? 'DARK' : 'LIGHT' });
  }
  for (const l of listeners) l();
}

export function refreshAppearance() {
  apply();
}

export function tryOnPack(id: string | null, origin?: Origin) {
  trying = findCosmetic(id)?.kind === 'theme' ? id : null;
  reveal(origin, apply);
}

export function equipPack(id: string | null, origin?: Origin): boolean {
  trying = null;
  if (!equip('theme', id)) return false;
  reveal(origin, apply);
  return true;
}

export function usePack(): ThemeCosmetic | null {
  // Same reason as useBalance()/useEquipped() in coins.ts: activePack() takes no arguments and
  // reads module state the compiler can't see, so without this it gets cached forever and a
  // pack change never shows without a reload.
  'use no memo';
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  useSyncExternalStore(subscribe, () => activePack()?.id ?? null);
  return activePack();
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
