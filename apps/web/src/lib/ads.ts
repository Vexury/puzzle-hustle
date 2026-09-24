import { AdMob, AdmobConsentStatus, MaxAdContentRating, RewardAdPluginEvents } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';

const ios = Capacitor.getPlatform() === 'ios';

const REWARD_UNIT = ios ? 'ca-app-pub-3552688457242630/5760645401' : 'ca-app-pub-3552688457242630/8666936384';

// Devices that always get test ads. Drop one from this list and a tap on a real ad from
// that phone counts as invalid traffic, which can cost the AdMob account. The id is
// printed to logcat on the first ad request. It follows the app's signing key (Android 8+ scopes
// ANDROID_ID to it), so one phone has one id per build: 8CC7 is the S23 on the Play build, 95C0
// the same S23 on a local debug build.
const TEST_DEVICES = ['8CC764321F12FA067B339B812405EE50', '95C0AC4384CCB1548DE9108E4DD449F0'];

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

// A network that is there but lets nothing through leaves the consent SDK in its own long
// timeout while the player stares at a dead hint button. Give up after three seconds.
const PREPARE_TIMEOUT_MS = 3000;

function prepareOrGiveUp(): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), PREPARE_TIMEOUT_MS);
    void prepare().then((ok) => {
      clearTimeout(timer);
      resolve(ok);
    });
  });
}

export async function showPrivacyOptions(): Promise<void> {
  if (!native) return;
  await prepare();
  await AdMob.showPrivacyOptionsForm();
}

const LOAD_TIMEOUT_MS = 8000;

// Returns true when no ad could be delivered: the hint is granted anyway. That is
// deliberate, not a missing error path.
export async function showRewardedAd(): Promise<boolean> {
  if (!native) return false;
  if (!(await prepareOrGiveUp())) return true;

  let rewarded = false;
  const handle = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
    rewarded = true;
  }).catch(() => null);

  try {
    // The player waits behind a blocking overlay while the video loads, so a load that hangs
    // must not hold the puzzle hostage: past the limit it counts as no ad, and the hint is free.
    let timer = 0;
    await Promise.race([
      // iPhones are not in TEST_DEVICES yet, so iOS asks for test ads outright.
      AdMob.prepareRewardVideoAd({ adId: REWARD_UNIT, isTesting: ios }),
      new Promise((_, reject) => (timer = window.setTimeout(() => reject(new Error('ad load timeout')), LOAD_TIMEOUT_MS))),
    ]).finally(() => clearTimeout(timer));
    const reward = await AdMob.showRewardVideoAd();
    if (reward && reward.amount > 0) rewarded = true;
  } catch {
    rewarded = true;
  } finally {
    await handle?.remove().catch(() => {});
  }

  return rewarded;
}
