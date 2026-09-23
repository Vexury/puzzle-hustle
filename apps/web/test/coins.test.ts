import { beforeEach, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS_EPOCH } from '@puzzle-hustle/core';
import { recordSolve, rehydrate, resetProgress } from '../src/lib/storage.ts';
import { balance, buyItem, canAffordHint, equip, owned, readEquipped, readSpent, solveCoinLine, spendHint } from '../src/lib/coins.ts';

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

it('reads a missing or malformed spend log as empty', () => {
  expect(readSpent()).toEqual([]);
  localStorage.setItem('ph:coins:spent', '{not json');
  expect(readSpent()).toEqual([]);
  localStorage.setItem('ph:coins:spent', JSON.stringify([{ kind: 'hint' }, 7, { kind: 'item', item: 'bolt', coins: 100, at: 1e13 }]));
  expect(readSpent()).toEqual([{ kind: 'item', item: 'bolt', coins: 100, at: 1e13 }]);
});

it('reads malformed equipped cosmetics as nothing equipped', () => {
  localStorage.setItem('ph:cosmetics', '"bolt"');
  expect(readEquipped()).toEqual({ badge: null, flair: null });
  localStorage.setItem('ph:coins:spent', JSON.stringify([{ kind: 'item', item: 'hustler', coins: 500, at: Date.now() }]));
  localStorage.setItem('ph:cosmetics', JSON.stringify({ badge: 'crown', flair: 'hustler' }));
  expect(readEquipped()).toEqual({ badge: null, flair: 'hustler' });
});

it('unequips a cosmetic once it falls out of ownership because the epoch moved past its purchase', () => {
  earnSome(50);
  buyItem('bolt');
  equip('badge', 'bolt');
  expect(readEquipped()).toEqual({ badge: 'bolt', flair: null });
  const rewritten = readSpent().map((e) => (e.kind === 'item' && e.item === 'bolt' ? { ...e, at: ACHIEVEMENTS_EPOCH - 1 } : e));
  localStorage.setItem('ph:coins:spent', JSON.stringify(rewritten));
  expect(readEquipped()).toEqual({ badge: null, flair: null });
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

it('equips only owned items of the right kind and unequips with null', () => {
  earnSome(50);
  expect(equip('badge', 'bolt')).toBe(false);
  buyItem('bolt');
  expect(equip('flair', 'bolt')).toBe(false);
  expect(equip('badge', 'bolt')).toBe(true);
  expect(readEquipped()).toEqual({ badge: 'bolt', flair: null });
  expect(equip('badge', null)).toBe(true);
  expect(readEquipped()).toEqual({ badge: null, flair: null });
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
  expect(readEquipped()).toEqual({ badge: null, flair: null });
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
