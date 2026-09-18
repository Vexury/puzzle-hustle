import { useSyncExternalStore } from 'react';
import { readSetting, writeSetting } from './storage.ts';

type Theme = 'light' | 'dark';
const listeners = new Set<() => void>();

function current(): Theme {
  return document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light';
}

export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    current,
  );
  const toggle = () => {
    const next: Theme = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset['theme'] = next;
    writeSetting('theme', next);
    for (const l of listeners) l();
  };
  return [theme, toggle];
}

export function initTheme() {
  const saved = readSetting('theme');
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset['theme'] = saved;
}
