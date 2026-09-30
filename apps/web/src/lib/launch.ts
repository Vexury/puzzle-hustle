import { Capacitor, registerPlugin } from '@capacitor/core';
import { periodKey } from '@puzzle-hustle/core';
import { readSetting, writeSetting } from './storage.ts';

export const LAUNCH_KEY = 'ph:launch';

// 'welcome' plays the piece snapping in and flying to the tab bar, 'page' only brings the page
// in, 'none' is everything after the first run of Launch.tsx (and tests, which never call
// initLaunch).
export type LaunchMode = 'welcome' | 'page' | 'none';

let mode: LaunchMode = 'none';

// Decided once per cold start, before the first render, so StrictMode's double calls cannot see
// the day already written. The full welcome is for the first open of a Berlin day.
export function initLaunch(path: string, now = new Date()) {
  if (path.startsWith('/delete-account')) return;
  const day = periodKey('daily', now);
  mode = readSetting(LAUNCH_KEY) === day ? 'page' : 'welcome';
  writeSetting(LAUNCH_KEY, day);
}

export function launchMode(): LaunchMode {
  return mode;
}

export function launchDone() {
  mode = 'none';
}

// Our own plugin (LaunchPlugin.java): MainActivity holds the splash until this call, made once
// the first frame is on screen, where Launch.tsx shows the same piece in the same place.
const LaunchPlugin = registerPlugin<{ ready(): Promise<void> }>('Launch');

export function signalLaunchReady() {
  if (Capacitor.getPlatform() !== 'android') return;
  requestAnimationFrame(() => requestAnimationFrame(() => void LaunchPlugin.ready().catch(() => {})));
}
