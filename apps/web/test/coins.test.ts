import { beforeEach, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS_EPOCH, levelList } from '@puzzle-hustle/core';
import { readSetting, recordSolve, rehydrate, resetProgress } from '../src/lib/storage.ts';
import { balance, buyItem, canAffordHint, doubleOffer, equip, markDoubled, owned, readDoubled, readEquipped, readSpent, spendHint, toggleShowcase } from '../src/lib/coins.ts';

const NONE = { badge: null, badges: [], flair: null, theme: null, nameplate: null };

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
  expect(readEquipped()).toEqual(NONE);
  earnBasicZipper();
  localStorage.setItem('ph:cosmetics', JSON.stringify({ badge: 'crown', flair: 'basic-zipper' }));
  expect(readEquipped()).toEqual({ ...NONE, flair: 'basic-zipper' });
});

it('unequips a cosmetic once it falls out of ownership because the epoch moved past its purchase', () => {
  earnSome(50);
  buyItem('bolt');
  equip('badge', 'bolt');
  expect(readEquipped()).toEqual({ ...NONE, badge: 'bolt', badges: ['bolt'] });
  const rewritten = readSpent().map((e) => (e.kind === 'item' && e.item === 'bolt' ? { ...e, at: ACHIEVEMENTS_EPOCH - 1 } : e));
  localStorage.setItem('ph:coins:spent', JSON.stringify(rewritten));
  expect(readEquipped()).toEqual(NONE);
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

it('refuses to buy an earned-only badge, whatever the balance', () => {
  earnSome(50);
  expect(buyItem('hustle-mountain')).toBe(false);
  expect(readSpent()).toEqual([]);
  expect(localStorage.getItem('ph:coins:spent')).toBeNull();
});

it('owns a Hustle theme once its stage is reached, and never sells it', () => {
  expect(buyItem('ocean')).toBe(false);
  for (let n = 1; n <= 333; n++) recordSolve(`hustle:${n}`, { solvedAt: '2026-09-23T10:00:00.000Z', seconds: 60, hints: 0, moves: 10 });
  expect(owned().has('ocean')).toBe(true);
  expect(owned().has('inferno')).toBe(false);
  expect(buyItem('inferno')).toBe(false);
  expect(readSpent()).toEqual([]);
  expect(equip('theme', 'ocean')).toBe(true);
  expect(readEquipped().theme).toBe('ocean');
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
  expect(readEquipped()).toEqual({ ...NONE, badge: 'bolt', badges: ['bolt'] });
  expect(equip('badge', null)).toBe(true);
  expect(readEquipped()).toEqual(NONE);
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
  expect(readEquipped()).toEqual(NONE);
  expect(balance()).toBe(0);
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
  expect(body).toEqual({ badge: 'bolt', badges: ['bolt'], flair: null, nameplate: null });
  vi.unstubAllGlobals();
});

it('reads a badge stored before the showcase as a showcase of one', () => {
  earnSome(50);
  buyItem('bolt');
  localStorage.setItem('ph:cosmetics', JSON.stringify({ badge: 'bolt', flair: null }));
  expect(readEquipped()).toEqual({ ...NONE, badge: 'bolt', badges: ['bolt'] });
});

it('fills the showcase up to three owned badges, the first one shown in the standings', () => {
  earnSome(70);
  for (const id of ['bolt', 'leaf', 'dice', 'note', 'wave']) expect(buyItem(id)).toBe(true);
  expect(toggleShowcase('bolt')).toBe('added');
  expect(toggleShowcase('leaf')).toBe('added');
  expect(toggleShowcase('dice')).toBe('added');
  expect(toggleShowcase('note')).toBe('full');
  expect(toggleShowcase('cat')).toBe('refused');
  expect(readEquipped().badges).toEqual(['bolt', 'leaf', 'dice']);
  expect(toggleShowcase('bolt')).toBe('removed');
  expect(readEquipped().badge).toBe('leaf');
  // Equipping a badge makes it the one the standings show and keeps the others behind it.
  expect(equip('badge', 'note')).toBe(true);
  expect(readEquipped().badges).toEqual(['note', 'leaf', 'dice']);
  expect(equip('badge', 'wave')).toBe(true);
  expect(readEquipped().badges).toEqual(['wave', 'note', 'leaf']);
});

it('buys a nameplate for its price and equips it, but never a Hustle one', () => {
  earnSome(50);
  const before = balance();
  expect(equip('nameplate', 'plate-paper')).toBe(false);
  expect(buyItem('plate-paper')).toBe(true);
  expect(balance()).toBe(before - 300);
  expect(equip('nameplate', 'plate-paper')).toBe(true);
  expect(readEquipped().nameplate).toBe('plate-paper');
  expect(buyItem('plate-tracks')).toBe(false);
  expect(equip('nameplate', 'plate-tracks')).toBe(false);
  expect(equip('nameplate', 'bolt')).toBe(false);
});

it('owns a Hustle nameplate from stage 80', () => {
  for (let n = 1; n <= 80; n++) recordSolve(`hustle:${n}`, { solvedAt: '2026-09-30T10:00:00.000Z', seconds: 60, hints: 0, moves: 10 });
  expect(owned().has('plate-tracks')).toBe(true);
  expect(owned().has('plate-mosaic')).toBe(false);
  expect(equip('nameplate', 'plate-tracks')).toBe(true);
});

it('doubles a running daily once, adds it to the balance and forgets it on reset', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-02T12:00:00+02:00'));
  const id = 'zip:daily:2026-10-02';
  recordSolve(id, { solvedAt: new Date().toISOString(), seconds: 30, hints: 0, moves: 10 });
  const before = balance();
  expect(doubleOffer(id)).toBe(15);
  markDoubled(id);
  expect(balance()).toBe(before + 15);
  expect(doubleOffer(id)).toBe(0);
  resetProgress();
  expect(readDoubled().size).toBe(0);
});

it('offers nothing for a past daily, a level or an unsolved puzzle', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-02T12:00:00+02:00'));
  recordSolve('zip:daily:2026-10-01', { solvedAt: '2026-10-01T12:00:00+02:00', seconds: 30, hints: 0, moves: 10 });
  recordSolve('zip:level:easy:1', { solvedAt: new Date().toISOString(), seconds: 30, hints: 0, moves: 10 });
  expect(doubleOffer('zip:daily:2026-10-01')).toBe(0);
  expect(doubleOffer('zip:level:easy:1')).toBe(0);
  expect(doubleOffer('crowns:daily:2026-10-02')).toBe(0);
  markDoubled('zip:level:easy:1');
  expect(readDoubled().size).toBe(0);
});

it('stamps the equipment with the time it was chosen', () => {
  earnSome(50);
  expect(buyItem('plate-paper')).toBe(true);
  const before = Date.now();
  expect(equip('nameplate', 'plate-paper')).toBe(true);
  const stored = JSON.parse(readSetting('ph:cosmetics') ?? '{}') as { at?: number };
  expect(stored.at).toBeGreaterThanOrEqual(before);
});
