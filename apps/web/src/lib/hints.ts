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

// Googles Richtlinie verlangt fuer Rewarded Ads ein ausdrueckliches Ja, bevor die
// Anzeige laeuft. Ein Tipp auf "Hint" ist keins, deshalb fragt `confirm` vorher nach.
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
