import { beforeEach, expect, it, vi } from 'vitest';

const ads = vi.hoisted(() => ({ available: true, rewarded: true }));
const coins = vi.hoisted(() => ({ affordable: true, spent: [] as string[] }));
const entitlement = vi.hoisted(() => ({ unlimited: false }));

vi.mock('../src/lib/ads.ts', () => ({
  get adsAvailable() {
    return ads.available;
  },
  showRewardedAd: vi.fn(async () => ads.rewarded),
}));
vi.mock('../src/lib/entitlement.ts', () => ({ hasUnlimitedHints: () => entitlement.unlimited }));
vi.mock('../src/lib/coins.ts', () => ({
  canAffordHint: () => coins.affordable,
  spendHint: (id: string) => {
    if (!coins.affordable) return false;
    coins.spent.push(id);
    return true;
  },
}));

import { currentHintProvider, freeHints } from '../src/lib/hints.ts';

const PUZZLE = 'zip:daily:2026-09-23';

beforeEach(() => {
  ads.available = true;
  ads.rewarded = true;
  coins.affordable = true;
  coins.spent = [];
  entitlement.unlimited = false;
});

it('gives the first hint free and never asks', () => {
  expect(currentHintProvider(0, PUZZLE, async () => 'coins')).toBe(freeHints);
});

it('keeps the web and the purchase free of coins', () => {
  ads.available = false;
  expect(currentHintProvider(1, PUZZLE, async () => 'coins')).toBe(freeHints);
  ads.available = true;
  entitlement.unlimited = true;
  expect(currentHintProvider(1, PUZZLE, async () => 'coins')).toBe(freeHints);
});

it('tells the card whether coins can pay and spends them on that choice', async () => {
  const ask = vi.fn(async (_canPay: boolean) => 'coins' as const);
  expect(await currentHintProvider(1, PUZZLE, ask).request()).toBe(true);
  expect(ask).toHaveBeenCalledWith(true);
  expect(coins.spent).toEqual([PUZZLE]);
});

it('falls back to the video when the player picks it', async () => {
  coins.affordable = false;
  const ask = vi.fn(async (_canPay: boolean) => 'video' as const);
  expect(await currentHintProvider(1, PUZZLE, ask).request()).toBe(true);
  expect(ask).toHaveBeenCalledWith(false);
  expect(coins.spent).toEqual([]);
});

it('gives nothing when the card is dismissed', async () => {
  expect(await currentHintProvider(1, PUZZLE, async () => null).request()).toBe(false);
  expect(coins.spent).toEqual([]);
});
