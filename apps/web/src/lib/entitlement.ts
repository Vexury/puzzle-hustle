import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { NativePurchases, PURCHASE_TYPE, type Transaction } from '@capgo/native-purchases';
import { readSetting, writeSetting } from './storage.ts';

export const UNLIMITED_HINTS = 'unlimited_hints';

const CACHE_KEY = 'ph:unlimited';
const native = Capacitor.isNativePlatform();
const android = Capacitor.getPlatform() === 'android';

let owned = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (owned === next) return;
  owned = next;
  writeSetting(CACHE_KEY, next ? '1' : '');
  for (const l of listeners) l();
}

export function hasUnlimitedHints(): boolean {
  return owned;
}

export function onEntitlement(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Android also lists pending purchases (purchaseState '2'), iOS keeps refunded ones with a revocationDate.
function paid(p: Transaction): boolean {
  return p.productIdentifier === UNLIMITED_HINTS && !p.revocationDate && (!android || p.purchaseState === '1');
}

// Play refunds a purchase that stays unacknowledged for three days, and the plugin's own
// acknowledge can die with its billing connection, so every check retries it.
async function acknowledge(purchases: readonly Transaction[]) {
  if (!android) return;
  for (const p of purchases) {
    if (paid(p) && !p.isAcknowledged && p.purchaseToken) {
      await NativePurchases.acknowledgePurchase({ purchaseToken: p.purchaseToken }).catch(() => {});
    }
  }
}

// Throws when the store cannot be asked at all.
async function check(): Promise<void> {
  const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP, onlyCurrentEntitlements: true });
  await acknowledge(purchases);
  if (purchases.some(paid)) {
    set(true);
    return;
  }
  // The Android plugin answers a failed query with an empty list, and without the network the
  // player keeps what they paid for, so only a non-empty list takes back an unlock.
  if (android && purchases.length === 0) return;
  set(false);
}

let refreshing: Promise<void> | null = null;
let storeCalls = 0;

// Every Android plugin call replaces the one billing client, and with it the listener a running
// purchase waits on, so purchases and restores run alone and end with their own check.
async function exclusive<T>(run: () => Promise<T>): Promise<T> {
  await refreshing;
  storeCalls++;
  try {
    return await run();
  } finally {
    storeCalls--;
  }
}

export function refreshEntitlement(): Promise<void> {
  if (!native || storeCalls > 0) return Promise.resolve();
  set(readSetting(CACHE_KEY) === '1');
  refreshing ??= check()
    .catch(() => {
      /* store unreachable, the cached answer stands until the next check */
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// Ask to Buy and pending payments can complete while the app is open or in the background.
export function initEntitlement(): void {
  if (!native) return;
  void refreshEntitlement();
  void NativePurchases.addListener('transactionUpdated', () => void refreshEntitlement());
  void App.addListener('resume', () => void refreshEntitlement());
}

// Throws when the store cannot be reached.
export async function restoreUnlimitedHints(): Promise<boolean> {
  if (!native) return false;
  return exclusive(async () => {
    await NativePurchases.restorePurchases();
    await check();
    return owned;
  });
}

export type PurchaseOutcome = 'owned' | 'pending' | 'cancelled' | 'failed';

export async function buyUnlimitedHints(): Promise<PurchaseOutcome> {
  if (!native) return 'failed';
  return exclusive(purchase);
}

async function purchase(): Promise<PurchaseOutcome> {
  try {
    await NativePurchases.purchaseProduct({ productIdentifier: UNLIMITED_HINTS, productType: PURCHASE_TYPE.INAPP });
  } catch (err) {
    // Android rejects an item that is already owned the same way, so ask the store before giving up.
    await check().catch(() => {});
    if (owned) return 'owned';
    const message = err instanceof Error ? err.message : String(err);
    if (/pending/i.test(message)) return 'pending';
    if (/cancel/i.test(message)) return 'cancelled';
    return 'failed';
  }
  set(true);
  await check().catch(() => {});
  return owned ? 'owned' : 'failed';
}
