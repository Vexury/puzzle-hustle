import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const BACKUP_KEY = 'ph:backup';
const DEBOUNCE_MS = 2000;
const native = Capacitor.isNativePlatform();

export function isBackedUp(key: string): boolean {
  if (key === 'theme') return true;
  return key.startsWith('ph:') && !key.startsWith('ph:view:');
}

function snapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !isBackedUp(key)) continue;
    const value = localStorage.getItem(key);
    if (value !== null) out[key] = value;
  }
  return out;
}

let timer: number | undefined;

function flush() {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
  void Preferences.set({ key: BACKUP_KEY, value: JSON.stringify(snapshot()) });
}

export function scheduleBackup() {
  if (!native) return;
  if (timer !== undefined) clearTimeout(timer);
  timer = window.setTimeout(flush, DEBOUNCE_MS);
}

export async function restoreBackup(): Promise<void> {
  if (!native) return;
  try {
    if (Object.keys(snapshot()).length > 0) return;
    const { value } = await Preferences.get({ key: BACKUP_KEY });
    if (!value) return;
    const stored = JSON.parse(value) as Record<string, string>;
    for (const [key, entry] of Object.entries(stored)) {
      if (isBackedUp(key) && typeof entry === 'string') localStorage.setItem(key, entry);
    }
  } catch {
    /* backup unavailable */
  }
}

if (native) {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && timer !== undefined) flush();
  });
}
