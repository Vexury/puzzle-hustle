import { AdMob, AdmobConsentStatus, RewardAdPluginEvents } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';

const REWARD_UNIT = 'ca-app-pub-3552688457242630/8666936384';

// Bis ein Testgeraet in AdMob registriert ist, fordert jede Anfrage eine Testanzeige an.
// Sonst zaehlt jeder eigene Klick als ungueltiger Traffic und gefaehrdet das Konto.
const TESTING = true;

const native = Capacitor.isNativePlatform();

let ready: Promise<void> | null = null;

async function consent(): Promise<void> {
  const info = await AdMob.requestConsentInfo();
  if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) {
    await AdMob.showConsentForm();
  }
}

function init(): Promise<void> {
  ready ??= (async () => {
    await AdMob.initialize();
    try {
      await consent();
    } catch {
      /* ohne Zustimmung laeuft die App weiter, nur die Anzeige bleibt aus */
    }
  })();
  return ready;
}

export function initAds(): void {
  if (!native) return;
  void init();
}

export const adsAvailable = native;

export async function showPrivacyOptions(): Promise<void> {
  if (!native) return;
  await init();
  await AdMob.showPrivacyOptionsForm();
}

export async function showRewardedAd(): Promise<boolean> {
  if (!native) return false;
  await init();

  let rewarded = false;
  const handle = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
    rewarded = true;
  });

  try {
    await AdMob.prepareRewardVideoAd({ adId: REWARD_UNIT, isTesting: TESTING });
    const reward = await AdMob.showRewardVideoAd();
    if (reward && reward.amount > 0) rewarded = true;
  } catch {
    rewarded = false;
  } finally {
    await handle.remove();
  }

  return rewarded;
}
