import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { readSetting } from './storage.ts';
import type { Cue } from './sound.ts';

export const HAPTICS_KEY = 'ph:haptics';
export const hapticsAvailable = Capacitor.isNativePlatform();

const enabled = () => hapticsAvailable && readSetting(HAPTICS_KEY) !== '0';

export function tap() {
  if (enabled()) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}

export function press() {
  if (enabled()) void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
}

export function solved() {
  if (enabled()) void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
}

// Firm cues get the heavier impact: an X, a piece set down, a refused turn.
export function forCue(cue: Cue) {
  if (cue === 'cross' || cue === 'drop' || cue === 'blocked') press();
  else tap();
}
