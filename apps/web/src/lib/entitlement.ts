import { Capacitor } from '@capacitor/core';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { readSetting, writeSetting } from './storage.ts';

export const UNLIMITED_HINTS = 'unlimited_hints';

const CACHE_KEY = 'ph:unlimited';
const native = Capacitor.isNativePlatform();

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

async function ownsIt(): Promise<boolean> {
  const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
  return purchases.some((p) => p.productIdentifier === UNLIMITED_HINTS);
}

export async function refreshEntitlement(): Promise<void> {
  if (!native) return;
  set(readSetting(CACHE_KEY) === '1');
  try {
    set(await ownsIt());
  } catch {
    /* Play unreachable, the cached answer stands until the next start */
  }
}

export async function buyUnlimitedHints(): Promise<boolean> {
  if (!native) return false;
  try {
    await NativePurchases.purchaseProduct({ productIdentifier: UNLIMITED_HINTS, productType: PURCHASE_TYPE.INAPP });
  } catch {
    return hasUnlimitedHints();
  }
  try {
    set(await ownsIt());
  } catch {
    set(true);
  }
  return hasUnlimitedHints();
}
