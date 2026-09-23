import { toast } from '../components/Toast.tsx';
import { adsAvailable, showRewardedAd } from './ads.ts';
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

// AdMob policy: a rewarded ad may only run after an explicit opt in. Tapping Hint is not
// one, so dropping `confirm` would be a policy violation, not just a shortcut.
// `waiting` brackets the stretch between the opt in and the end of the video, while the ad loads
// and the puzzle underneath must not take input.
export function currentHintProvider(used: number, confirm: () => Promise<boolean>, waiting?: (on: boolean) => void): HintProvider {
  if (!adsAvailable || hasUnlimitedHints() || used === 0) return freeHints;
  return {
    label: 'Watch ad',
    async request() {
      if (!(await confirm())) return false;
      waiting?.(true);
      let rewarded: boolean;
      try {
        rewarded = await showRewardedAd();
      } finally {
        waiting?.(false);
      }
      if (!rewarded) toast('Closed early, no hint this time');
      return rewarded;
    },
  };
}
