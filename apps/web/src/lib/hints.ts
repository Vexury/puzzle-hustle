import { periodKey } from '@puzzle-hustle/core';
import { toast } from '../components/Toast.tsx';
import { adsAvailable, showRewardedAd } from './ads.ts';
import { canAffordHint, spendHint } from './coins.ts';
import { hasUnlimitedHints } from './entitlement.ts';
import { readSetting, writeSetting } from './storage.ts';

// The Berlin day of the last free hint. One free hint a day across all puzzles; it comes back at
// midnight, the same boundary as the dailies.
const FREE_KEY = 'ph:freeHint';

export function freeHintLeft(now: Date = new Date()): boolean {
  return readSetting(FREE_KEY) !== periodKey('daily', now);
}

// What the hint card can offer right now.
export interface HintOffer {
  unlimited: boolean;
  free: boolean;
  canPay: boolean;
  video: boolean;
}

export type HintChoice = 'free' | 'coins' | 'video' | null;

export function hintOffer(): HintOffer {
  const unlimited = hasUnlimitedHints();
  return { unlimited, free: !unlimited && freeHintLeft(), canPay: canAffordHint(), video: adsAvailable };
}

// The video mark on the Hint button: shown once the free hint is gone and a video is one of the
// ways to the next. Not memoised, like useBalance(): it reads storage the compiler cannot see.
export function useHintBadge(): boolean {
  'use no memo';
  const offer = hintOffer();
  return offer.video && !offer.unlimited && !offer.free;
}

// Every hint goes through the card, so a stray tap on Hint costs nothing. AdMob policy also
// wants an explicit opt in before a rewarded ad; tapping Hint is not one. `waiting` brackets the
// stretch between the opt in and the end of the video, while the ad loads and the puzzle
// underneath must not take input.
export async function requestHint(puzzle: string, ask: (offer: HintOffer) => Promise<HintChoice>, waiting?: (on: boolean) => void): Promise<boolean> {
  const offer = hintOffer();
  const choice = await ask(offer);
  if (choice === null) return false;
  if (choice === 'free') {
    if (offer.unlimited) return true;
    if (!freeHintLeft()) {
      toast("Today's free hint is already used");
      return false;
    }
    writeSetting(FREE_KEY, periodKey('daily'));
    return true;
  }
  if (choice === 'coins') {
    if (spendHint(puzzle)) return true;
    toast('Not enough coins for a hint');
    return false;
  }
  waiting?.(true);
  let rewarded: boolean;
  try {
    rewarded = await showRewardedAd();
  } finally {
    waiting?.(false);
  }
  if (!rewarded) toast('The video gave no reward, no hint this time');
  return rewarded;
}
