import { AdMob, AdmobConsentStatus, MaxAdContentRating, RewardAdPluginEvents } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';

const REWARD_UNIT = 'ca-app-pub-3552688457242630/8666936384';

// Geraete, die statt echter Anzeigen immer Testanzeigen bekommen. Ein Klick von hier
// zaehlt nicht als ungueltiger Traffic. Die ID steht beim ersten Anzeigenaufruf im Logcat.
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

// Nichts hiervon laeuft beim Start: das SDK wird erst wach, wenn der Spieler
// zum ersten Mal eine Anzeige anfordert, damit der Einwilligungsdialog nicht
// ungefragt den ersten Eindruck der App bestimmt.
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
    // Das Plugin exportiert PrivacyOptionsRequirementStatus nicht, daher der String.
    privacyOptions = String(info.privacyOptionsRequirementStatus) === 'REQUIRED';
    for (const l of listeners) l();
    return info.canRequestAds;
  })().catch(() => false);
  return ready;
}

export async function showPrivacyOptions(): Promise<void> {
  if (!native) return;
  await prepare();
  await AdMob.showPrivacyOptionsForm();
}

export async function showRewardedAd(): Promise<boolean> {
  if (!native) return false;
  if (!(await prepare())) return false;

  let rewarded = false;
  const handle = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
    rewarded = true;
  });

  try {
    await AdMob.prepareRewardVideoAd({ adId: REWARD_UNIT });
    const reward = await AdMob.showRewardVideoAd();
    if (reward && reward.amount > 0) rewarded = true;
  } catch {
    rewarded = false;
  } finally {
    await handle.remove();
  }

  return rewarded;
}
