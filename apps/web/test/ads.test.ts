import { beforeEach, expect, it, vi } from 'vitest';

type Listener = (payload?: unknown) => void;

const admob = vi.hoisted(() => ({
  listeners: new Map<string, Listener>(),
  show: null as null | (() => Promise<unknown>),
  privacy: 'REQUIRED',
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}));
vi.mock('@capacitor-community/admob', () => ({
  AdmobConsentStatus: { REQUIRED: 'REQUIRED' },
  MaxAdContentRating: { General: 'General' },
  RewardAdPluginEvents: { Rewarded: 'rewarded', Dismissed: 'dismissed', FailedToShow: 'failedToShow' },
  AdMob: {
    initialize: vi.fn(async () => {}),
    requestConsentInfo: vi.fn(async () => ({
      status: 'OBTAINED',
      isConsentFormAvailable: false,
      canRequestAds: true,
      privacyOptionsRequirementStatus: admob.privacy,
    })),
    showConsentForm: vi.fn(),
    showPrivacyOptionsForm: vi.fn(async () => {}),
    prepareRewardVideoAd: vi.fn(async () => {}),
    showRewardVideoAd: vi.fn(() => admob.show!()),
    addListener: vi.fn(async (event: string, fn: Listener) => {
      admob.listeners.set(event, fn);
      return { remove: async () => void admob.listeners.delete(event) };
    }),
  },
}));

const never = () => new Promise<never>(() => {});
const emit = (event: string) => admob.listeners.get(event)?.();

async function load() {
  vi.resetModules();
  return import('../src/lib/ads.ts');
}

beforeEach(() => {
  localStorage.clear();
  admob.listeners.clear();
  admob.privacy = 'REQUIRED';
  vi.useRealTimers();
});

it('grants the hint when the video pays out', async () => {
  const ads = await load();
  admob.show = async () => ({ type: 'coins', amount: 1 });
  expect(await ads.showRewardedAd()).toBe(true);
  expect(admob.listeners.size).toBe(0);
});

it('gives nothing when the video is closed before the reward', async () => {
  const ads = await load();
  admob.show = () => {
    queueMicrotask(() => emit('dismissed'));
    return never();
  };
  expect(await ads.showRewardedAd()).toBe(false);
  expect(admob.listeners.size).toBe(0);
});

it('counts a reward that arrives before the dismiss', async () => {
  const ads = await load();
  admob.show = () => {
    queueMicrotask(() => {
      emit('rewarded');
      emit('dismissed');
    });
    return never();
  };
  expect(await ads.showRewardedAd()).toBe(true);
});

it('grants the hint when the video cannot be shown', async () => {
  const ads = await load();
  admob.show = () => {
    queueMicrotask(() => emit('failedToShow'));
    return never();
  };
  expect(await ads.showRewardedAd()).toBe(true);
  expect(admob.listeners.size).toBe(0);
});

it('lets go of the overlay when the video never reports back', async () => {
  const ads = await load();
  vi.useFakeTimers();
  admob.show = never;
  const result = ads.showRewardedAd();
  await vi.advanceTimersByTimeAsync(120_000);
  expect(await result).toBe(true);
  expect(admob.listeners.size).toBe(0);
});

it('remembers across starts that ad privacy settings are needed', async () => {
  let ads = await load();
  expect(ads.privacyOptionsAvailable()).toBe(false);
  admob.show = async () => ({ amount: 1 });
  await ads.showRewardedAd();
  expect(ads.privacyOptionsAvailable()).toBe(true);
  ads = await load();
  expect(ads.privacyOptionsAvailable()).toBe(true);
  admob.privacy = 'NOT_REQUIRED';
  await ads.showPrivacyOptions();
  ads = await load();
  expect(ads.privacyOptionsAvailable()).toBe(false);
});
