import { AdMob, AdmobConsentStatus, MaxAdContentRating, RewardAdPluginEvents } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';

const REWARD_UNIT = 'ca-app-pub-3552688457242630/8666936384';

// Devices that always get test ads. Drop one from this list and a tap on a real ad from
// that phone counts as invalid traffic, which can cost the AdMob account. The id is
// printed to logcat on the first ad request.
const TEST_DEVICES = ['8CC764321F12FA067B339B812405EE50'];

const native = Capacitor.isNativePlatform();

export const adsAvailable = native;

let ready: Promise<boolean> | null = null;
let privacyOptions = false;
const listeners = new Set<() => void>();

export function onAdsConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function privacyOptionsAvailable(): boolean {
  return privacyOptions;
}

function prepare(): Promise<boolean> {
  ready ??= (async () => {
    await AdMob.initialize({
      testingDevices: TEST_DEVICES,
      initializeForTesting: true,
      maxAdContentRating: MaxAdContentRating.General,
    });
    let info = await AdMob.requestConsentInfo();
    if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) {
      info = await AdMob.showConsentForm();
    }
    // The plugin types this as an enum it never exports, hence the string compare.
    privacyOptions = String(info.privacyOptionsRequirementStatus) === 'REQUIRED';
    for (const l of listeners) l();
    return info.canRequestAds;
  })().catch(() => {
    ready = null;
    return false;
  });
  return ready;
}

export async function showPrivacyOptions(): Promise<void> {
  if (!native) return;
  await prepare();
  await AdMob.showPrivacyOptionsForm();
}

// Returns true when no ad could be delivered: the hint is granted anyway. That is
// deliberate, not a missing error path.
export async function showRewardedAd(): Promise<boolean> {
  if (!native) return false;
  if (!(await prepare())) return true;

  let rewarded = false;
  const handle = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
    rewarded = true;
  }).catch(() => null);

  try {
    await AdMob.prepareRewardVideoAd({ adId: REWARD_UNIT });
    const reward = await AdMob.showRewardVideoAd();
    if (reward && reward.amount > 0) rewarded = true;
  } catch {
    rewarded = true;
  } finally {
    await handle?.remove().catch(() => {});
  }

  return rewarded;
}
