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

export const adHints: HintProvider = {
  label: 'Watch ad',
  request: showRewardedAd,
};

export function currentHintProvider(used: number): HintProvider {
  if (!adsAvailable || hasUnlimitedHints() || used === 0) return freeHints;
  return adHints;
}
