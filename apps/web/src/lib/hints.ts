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
export function currentHintProvider(used: number, confirm: () => Promise<boolean>): HintProvider {
  if (!adsAvailable || hasUnlimitedHints() || used === 0) return freeHints;
  return {
    label: 'Watch ad',
    async request() {
      if (!(await confirm())) return false;
      return showRewardedAd();
    },
  };
}
