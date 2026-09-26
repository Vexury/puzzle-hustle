import { beforeEach, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS_EPOCH, levelList } from '@puzzle-hustle/core';
import { recordSolve, rehydrate, resetProgress } from '../src/lib/storage.ts';
import { balance, buyItem, canAffordHint, equip, owned, readEquipped, readSpent, solveCoinLine, spendHint } from '../src/lib/coins.ts';

// The paid path, as it will run after launch; themesFree.test.ts covers the beta switch.
vi.mock('@puzzle-hustle/core', async (original) => ({ ...(await original<typeof import('@puzzle-hustle/core')>()), THEMES_FREE: false }));

beforeEach(() => {
  localStorage.clear();
  rehydrate();
  vi.useRealTimers();
});

// Hint-free Genius level after the epoch: 8 coins, plus 25 each for the achievements it unlocks.
function earnSome(n: number) {
  for (let i = 1; i <= n; i++) {
    recordSolve(`zip:level:genius:${i}`, { solvedAt: '2026-09-23T10:00:00.000Z', seconds: 60, hints: 0, moves: 10 });
  }
}

// Solves every level of the Zip Easy pack, which earns the 'basic-zipper' flair.
function earnBasicZipper() {
  const n = levelList('zip', 'easy').length;
  for (let i = 1; i <= n; i++) {
    recordSolve(`zip:level:easy:${i}`, { solvedAt: '2026-09-23T10:00:00.000Z', seconds: 60, hints: 0, moves: 10 });
  }
}

it('reads a missing or malformed spend log as empty', () => {
  expect(readSpent()).toEqual([]);
  localStorage.setItem('ph:coins:spent', '{not json');
  expect(readSpent()).toEqual([]);
  localStorage.setItem('ph:coins:spent', JSON.stringify([{ kind: 'hint' }, 7, { kind: 'item', item: 'bolt', coins: 100, at: 1e13 }]));
  expect(readSpent()).toEqual([{ kind: 'item', item: 'bolt', coins: 100, at: 1e13 }]);
});

it('reads malformed equipped cosmetics as nothing equipped', () => {
  localStorage.setItem('ph:cosmetics', '"bolt"');
  expect(readEquipped()).toEqual({ badge: null, flair: null, theme: null });
  earnBasicZipper();
  localStorage.setItem('ph:cosmetics', JSON.stringify({ badge: 'crown', flair: 'basic-zipper' }));
  expect(readEquipped()).toEqual({ badge: null, flair: 'basic-zipper', theme: null });
});

it('unequips a cosmetic once it falls out of ownership because the epoch moved past its purchase', () => {
  earnSome(50);
  buyItem('bolt');
  equip('badge', 'bolt');
  expect(readEquipped()).toEqual({ badge: 'bolt', flair: null, theme: null });
  const rewritten = readSpent().map((e) => (e.kind === 'item' && e.item === 'bolt' ? { ...e, at: ACHIEVEMENTS_EPOCH - 1 } : e));
  localStorage.setItem('ph:coins:spent', JSON.stringify(rewritten));
  expect(readEquipped()).toEqual({ badge: null, flair: null, theme: null });
});

it('spends 20 on a hint only when the balance covers it', () => {
  expect(canAffordHint()).toBe(false);
  expect(spendHint('zip:daily:2026-09-23')).toBe(false);
  earnSome(3);
  const before = balance();
  expect(canAffordHint()).toBe(true);
  expect(spendHint('zip:daily:2026-09-23')).toBe(true);
  expect(balance()).toBe(before - 20);
});

it('buys an item once with an exactly sufficient balance and then refuses', () => {
  earnSome(50);
  const have = balance();
  localStorage.setItem('ph:coins:spent', JSON.stringify([{ kind: 'hint', puzzle: 'x', coins: have - 100, at: Date.now() }]));
  expect(balance()).toBe(100);
  expect(buyItem('bolt')).toBe(true);
  expect(balance()).toBe(0);
  expect(owned().has('bolt')).toBe(true);
  expect(buyItem('bolt')).toBe(false);
  expect(buyItem('leaf')).toBe(false);
});

it('refuses to buy an unknown id', () => {
  earnSome(50);
  expect(buyItem('crown')).toBe(false);
});

it('refuses to buy a flair, whatever the balance: flairs are earned, never bought', () => {
  earnSome(50);
  expect(buyItem('hustler')).toBe(false);
  expect(buyItem('basic-zipper')).toBe(false);
  expect(readSpent()).toEqual([]);
});

it('owns a flair once it is earned by solving, with no spend entry involved', () => {
  expect(owned().has('basic-zipper')).toBe(false);
  earnBasicZipper();
  expect(owned().has('basic-zipper')).toBe(true);
  expect(readSpent()).toEqual([]);
});

it('refunds a flair bought before flairs became earned: not owned, and its coins are not spent', () => {
  earnSome(50);
  const before = balance();
  localStorage.setItem('ph:coins:spent', JSON.stringify([{ kind: 'item', item: 'hustler', coins: 500, at: Date.now() }]));
  expect(balance()).toBe(before);
  expect(owned().has('hustler')).toBe(false);
});

it('equips only owned items of the right kind and unequips with null', () => {
  earnSome(50);
  expect(equip('badge', 'bolt')).toBe(false);
  buyItem('bolt');
  expect(equip('flair', 'bolt')).toBe(false);
  expect(equip('badge', 'bolt')).toBe(true);
  expect(readEquipped()).toEqual({ badge: 'bolt', flair: null, theme: null });
  expect(equip('badge', null)).toBe(true);
  expect(readEquipped()).toEqual({ badge: null, flair: null, theme: null });
});

it('drops a spend entry with a negative coin amount', () => {
  localStorage.setItem(
    'ph:coins:spent',
    JSON.stringify([
      { kind: 'item', item: 'bolt', coins: -5, at: 1e13 },
      { kind: 'item', item: 'leaf', coins: 100, at: 1e13 },
    ]),
  );
  expect(readSpent()).toEqual([{ kind: 'item', item: 'leaf', coins: 100, at: 1e13 }]);
});

it('forgets spending and equipped items on a progress reset', () => {
  earnSome(50);
  buyItem('bolt');
  equip('badge', 'bolt');
  resetProgress();
  expect(readSpent()).toEqual([]);
  expect(readEquipped()).toEqual({ badge: null, flair: null, theme: null });
  expect(balance()).toBe(0);
});

it('writes the solve line from the awards', () => {
  expect(solveCoinLine([{ reason: 'daily', coins: 10 }, { reason: 'no-hints', coins: 5 }], true)).toBe('+10 coins · +5 no hints');
  expect(solveCoinLine([{ reason: 'level', coins: 3 }], true)).toBe('+3 coins');
  expect(
    solveCoinLine([{ reason: 'daily', coins: 10 }, { reason: 'clean-sweep', coins: 20 }], true),
  ).toBe('+10 coins · +20 clean sweep');
});

it('writes no line for nothing earned or a replay', () => {
  expect(solveCoinLine([], true)).toBeNull();
  expect(solveCoinLine([{ reason: 'level', coins: 3 }], false)).toBeNull();
});

it('buys a theme for its price and equips it', () => {
  earnSome(50);
  const before = balance();
  expect(buyItem('paper')).toBe(true);
  expect(balance()).toBe(before - 400);
  expect(owned().has('paper')).toBe(true);
  expect(equip('theme', 'paper')).toBe(true);
  expect(readEquipped().theme).toBe('paper');
  expect(equip('theme', null)).toBe(true);
  expect(readEquipped().theme).toBeNull();
});

it('refuses a theme it cannot afford, and one it does not own', () => {
  expect(buyItem('synthwave')).toBe(false);
  expect(equip('theme', 'synthwave')).toBe(false);
  expect(equip('theme', 'bolt')).toBe(false);
});

it('drops an equipped theme once the epoch moves past its purchase', () => {
  earnSome(50);
  buyItem('paper');
  equip('theme', 'paper');
  const rewritten = readSpent().map((e) => (e.kind === 'item' && e.item === 'paper' ? { ...e, at: ACHIEVEMENTS_EPOCH - 1 } : e));
  localStorage.setItem('ph:coins:spent', JSON.stringify(rewritten));
  expect(readEquipped().theme).toBeNull();
});

it('never sends the theme to the server', async () => {
  earnSome(70);
  buyItem('paper');
  buyItem('bolt');
  localStorage.setItem('ph:session', JSON.stringify({ token: 't', player: { id: 'p', name: 'Mo' } }));
  const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  equip('theme', 'paper');
  expect(fetchMock).not.toHaveBeenCalled();
  equip('badge', 'bolt');
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
  expect(body).toEqual({ badge: 'bolt', flair: null });
  vi.unstubAllGlobals();
});
