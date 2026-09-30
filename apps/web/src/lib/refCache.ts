import { periodKey, primeScheduledRefs, storedScheduledRefs } from '@puzzle-hustle/core';
import { readSetting, writeSetting } from './storage.ts';

export const REF_CACHE_KEY = 'ph:refs';

// Today's daily, weekly and monthly seeds, so a cold start does not search them again: that
// search was about 0.6 s of the 1.4 s before the first frame on an S23. Core checks every entry
// against the adapter version and difficulty before using it.
export function loadRefCache() {
  try {
    const raw = readSetting(REF_CACHE_KEY);
    if (raw) primeScheduledRefs(JSON.parse(raw));
  } catch {
    // A broken entry only means one more search.
  }
}

// Only the current periods are kept, so the entry never grows past a dozen seeds.
export function saveRefCache(now = new Date()) {
  const refs = storedScheduledRefs((period, key) => key === periodKey(period, now));
  const raw = JSON.stringify(refs);
  if (refs.length > 0 && raw !== readSetting(REF_CACHE_KEY)) writeSetting(REF_CACHE_KEY, raw);
}
