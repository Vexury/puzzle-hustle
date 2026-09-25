import { beforeEach, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ name: 'android' }));
const store = vi.hoisted(() => ({
  purchases: [] as Record<string, unknown>[],
  queryFails: false,
  purchase: null as Error | null,
  acknowledged: [] as string[],
  restored: 0,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => platform.name },
}));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(async () => ({ remove: async () => {} })) } }));
vi.mock('@capgo/native-purchases', () => ({
  PURCHASE_TYPE: { INAPP: 'inapp' },
  NativePurchases: {
    getPurchases: vi.fn(async () => {
      if (store.queryFails) throw new Error('offline');
      return { purchases: store.purchases };
    }),
    acknowledgePurchase: vi.fn(async ({ purchaseToken }: { purchaseToken: string }) => {
      store.acknowledged.push(purchaseToken);
    }),
    restorePurchases: vi.fn(async () => {
      store.restored++;
    }),
    purchaseProduct: vi.fn(async () => {
      if (store.purchase) throw store.purchase;
      return {};
    }),
    addListener: vi.fn(async () => ({ remove: async () => {} })),
  },
}));

const DAY = 24 * 60 * 60 * 1000;
const bought = (extra: Record<string, unknown> = {}) => ({
  productIdentifier: 'unlimited_hints',
  purchaseState: '1',
  isAcknowledged: true,
  purchaseToken: 'tok',
  ...extra,
});

async function load(name = 'android') {
  platform.name = name;
  vi.resetModules();
  return import('../src/lib/entitlement.ts');
}

beforeEach(() => {
  localStorage.clear();
  store.purchases = [];
  store.queryFails = false;
  store.purchase = null;
  store.acknowledged = [];
  store.restored = 0;
  vi.useRealTimers();
});

it('unlocks a completed purchase and acknowledges it when Play has not', async () => {
  const e = await load();
  store.purchases = [bought({ isAcknowledged: false })];
  await e.refreshEntitlement();
  expect(e.hasUnlimitedHints()).toBe(true);
  expect(store.acknowledged).toEqual(['tok']);
});

it('does not unlock or acknowledge a pending Android purchase', async () => {
  const e = await load();
  store.purchases = [bought({ purchaseState: '2', isAcknowledged: false })];
  await e.refreshEntitlement();
  expect(e.hasUnlimitedHints()).toBe(false);
  expect(store.acknowledged).toEqual([]);
});

it('ignores a refunded iOS purchase', async () => {
  const e = await load('ios');
  store.purchases = [{ productIdentifier: 'unlimited_hints', revocationDate: '2026-09-20T10:00:00Z' }];
  await e.refreshEntitlement();
  expect(e.hasUnlimitedHints()).toBe(false);
  store.purchases = [{ productIdentifier: 'unlimited_hints' }];
  await e.refreshEntitlement();
  expect(e.hasUnlimitedHints()).toBe(true);
});

it('keeps a cached unlock through an empty Android answer for a day', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  localStorage.setItem('ph:unlimited', '1');
  const e = await load();
  await e.refreshEntitlement();
  expect(e.hasUnlimitedHints()).toBe(true);
  vi.setSystemTime(Date.now() + DAY / 2);
  await e.refreshEntitlement();
  expect(e.hasUnlimitedHints()).toBe(true);
  vi.setSystemTime(Date.now() + DAY);
  await e.refreshEntitlement();
  expect(e.hasUnlimitedHints()).toBe(false);
});

it('starts the day over once the purchase shows up again', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  localStorage.setItem('ph:unlimited', '1');
  const e = await load();
  await e.refreshEntitlement();
  store.purchases = [bought()];
  await e.refreshEntitlement();
  store.purchases = [];
  vi.setSystemTime(Date.now() + DAY * 2);
  await e.refreshEntitlement();
  expect(e.hasUnlimitedHints()).toBe(true);
});

it('keeps the cached answer when the store cannot be asked', async () => {
  localStorage.setItem('ph:unlimited', '1');
  const e = await load();
  store.queryFails = true;
  await e.refreshEntitlement();
  expect(e.hasUnlimitedHints()).toBe(true);
});

it('restores through the store and reports what it found', async () => {
  const e = await load();
  expect(await e.restoreUnlimitedHints()).toBe(false);
  store.purchases = [bought()];
  expect(await e.restoreUnlimitedHints()).toBe(true);
  expect(store.restored).toBe(2);
  store.queryFails = true;
  await expect(e.restoreUnlimitedHints()).rejects.toThrow();
});

it('unlocks an item that is already owned when the purchase is rejected', async () => {
  const e = await load();
  store.purchase = new Error('Purchase is not purchased');
  store.purchases = [bought()];
  expect(await e.buyUnlimitedHints()).toBe('owned');
  expect(e.hasUnlimitedHints()).toBe(true);
});

it('tells pending, cancelled and failed purchases apart', async () => {
  const e = await load();
  store.purchase = new Error('Purchase is pending');
  store.purchases = [bought({ purchaseState: '2' })];
  expect(await e.buyUnlimitedHints()).toBe('pending');
  store.purchases = [];
  store.purchase = new Error('User cancelled');
  expect(await e.buyUnlimitedHints()).toBe('cancelled');
  store.purchase = new Error('Purchase is not purchased');
  expect(await e.buyUnlimitedHints()).toBe('failed');
  expect(e.hasUnlimitedHints()).toBe(false);
});

it('unlocks and acknowledges after a successful purchase', async () => {
  const e = await load();
  store.purchases = [bought({ isAcknowledged: false })];
  expect(await e.buyUnlimitedHints()).toBe('owned');
  expect(store.acknowledged).toEqual(['tok']);
});
