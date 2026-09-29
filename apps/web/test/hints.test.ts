import { afterEach, beforeEach, expect, it, vi } from 'vitest';

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

import { freeHintLeft, hintOffer, requestHint, type HintChoice, type HintOffer } from '../src/lib/hints.ts';

const PUZZLE = 'zip:daily:2026-09-23';

beforeEach(() => {
  ads.available = true;
  ads.rewarded = true;
  coins.affordable = true;
  coins.spent = [];
  entitlement.unlimited = false;
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-29T10:00:00+02:00'));
});

afterEach(() => vi.useRealTimers());

const answer = (choice: HintChoice) => vi.fn(async (_offer: HintOffer) => choice);

it('always asks, even for the free hint', async () => {
  const ask = answer(null);
  expect(await requestHint(PUZZLE, ask)).toBe(false);
  expect(ask).toHaveBeenCalledOnce();
  expect(freeHintLeft()).toBe(true);
});

it('gives one free hint a day across all puzzles', async () => {
  expect(hintOffer().free).toBe(true);
  expect(await requestHint(PUZZLE, answer('free'))).toBe(true);
  expect(hintOffer().free).toBe(false);
  expect(await requestHint('nonogram:daily:2026-09-29', answer('free'))).toBe(false);
  expect(coins.spent).toEqual([]);
});

it('brings the free hint back at Berlin midnight', async () => {
  await requestHint(PUZZLE, answer('free'));
  vi.setSystemTime(new Date('2026-09-29T23:59:00+02:00'));
  expect(freeHintLeft()).toBe(false);
  vi.setSystemTime(new Date('2026-09-30T00:01:00+02:00'));
  expect(freeHintLeft()).toBe(true);
});

it('charges coins once the free hint is gone', async () => {
  await requestHint(PUZZLE, answer('free'));
  const ask = answer('coins');
  expect(await requestHint(PUZZLE, ask)).toBe(true);
  expect(ask).toHaveBeenCalledWith({ unlimited: false, free: false, canPay: true, video: true });
  expect(coins.spent).toEqual([PUZZLE]);
});

it('offers the video only where ads exist', async () => {
  ads.available = false;
  expect(hintOffer().video).toBe(false);
  ads.available = true;
  coins.affordable = false;
  expect(await requestHint(PUZZLE, answer('video'))).toBe(true);
  expect(coins.spent).toEqual([]);
});

it('lets the purchase through the card without using the free hint', async () => {
  entitlement.unlimited = true;
  const ask = answer('free');
  expect(await requestHint(PUZZLE, ask)).toBe(true);
  expect(ask).toHaveBeenCalledWith(expect.objectContaining({ unlimited: true, free: false }));
  entitlement.unlimited = false;
  expect(freeHintLeft()).toBe(true);
});
