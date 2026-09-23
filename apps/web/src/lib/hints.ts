import { toast } from '../components/Toast.tsx';
import { adsAvailable, showRewardedAd } from './ads.ts';
import { canAffordHint, spendHint } from './coins.ts';
import { hasUnlimitedHints } from './entitlement.ts';

export interface HintProvider {
  readonly label: string;
  request(): Promise<boolean>;
}

export const freeHints: HintProvider = {
  label: 'Hint',
  async request() {
    return true;
  },
};

export type HintChoice = 'coins' | 'video' | null;

// AdMob policy: a rewarded ad may only run after an explicit opt in. Tapping Hint is not
// one, so dropping `ask` would be a policy violation, not just a shortcut. The same card offers
// coins when the balance covers a hint; the coin path needs neither network nor ad SDK.
// `waiting` brackets the stretch between the opt in and the end of the video, while the ad loads
// and the puzzle underneath must not take input.
export function currentHintProvider(
  used: number,
  puzzle: string,
  ask: (canPay: boolean) => Promise<HintChoice>,
  waiting?: (on: boolean) => void,
): HintProvider {
  if (!adsAvailable || hasUnlimitedHints() || used === 0) return freeHints;
  return {
    label: 'Watch ad',
    async request() {
      const choice = await ask(canAffordHint());
      if (choice === null) return false;
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
    },
  };
}
