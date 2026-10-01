import { expect, it } from 'vitest';
import { itemState } from '../src/pages/Shop.tsx';

const none = { badge: null, badges: [], flair: null, theme: null, nameplate: null };

it('names the state of each badge', () => {
  expect(itemState('bolt', new Set(['bolt']), { ...none, badge: 'bolt', badges: ['bolt'] }, 0)).toBe('equipped');
  expect(itemState('bolt', new Set(['bolt']), none, 0)).toBe('owned');
  expect(itemState('bolt', new Set(), none, 100)).toBe('buyable');
  expect(itemState('bolt', new Set(), none, 99)).toBe('locked');
});

it('a flair is locked until earned, whatever the balance, and never buyable', () => {
  expect(itemState('hustler', new Set(), none, 1_000_000)).toBe('locked');
  expect(itemState('basic-zipper', new Set(), none, 1_000_000)).toBe('locked');
});

it('never offers an earned-only badge for coins', () => {
  expect(itemState('hustle-mountain', new Set(), none, 1_000_000)).toBe('locked');
  expect(itemState('hustle-mountain', new Set(['hustle-mountain']), none, 0)).toBe('owned');
});

it('an earned flair is owned, and equips once worn', () => {
  expect(itemState('hustler', new Set(['hustler']), none, 0)).toBe('owned');
  expect(itemState('hustler', new Set(['hustler']), { ...none, flair: 'hustler' }, 0)).toBe('equipped');
});

it('treats an unknown id as locked', () => {
  expect(itemState('nope', new Set(), none, 1000)).toBe('locked');
});

it('never offers a Hustle theme for coins, and owns it once earned', () => {
  expect(itemState('ocean', new Set(), none, 1_000_000)).toBe('locked');
  expect(itemState('ocean', new Set(['ocean']), none, 0)).toBe('owned');
  expect(itemState('ocean', new Set(['ocean']), { ...none, theme: 'ocean' }, 0)).toBe('equipped');
});

it('names the state of each theme pack', () => {
  expect(itemState('paper', new Set(['paper']), { ...none, theme: 'paper' }, 0)).toBe('equipped');
  expect(itemState('paper', new Set(['paper']), none, 0)).toBe('owned');
  expect(itemState('paper', new Set(), none, 400)).toBe('buyable');
  expect(itemState('paper', new Set(), none, 399)).toBe('locked');
});

it('counts every showcase badge as equipped, not only the first', () => {
  const shown = { ...none, badge: 'bolt', badges: ['bolt', 'leaf'] };
  expect(itemState('leaf', new Set(['bolt', 'leaf']), shown, 0)).toBe('equipped');
});

it('names the state of each nameplate, and never sells a Hustle one', () => {
  expect(itemState('plate-zip', new Set(['plate-zip']), { ...none, nameplate: 'plate-zip' }, 0)).toBe('equipped');
  expect(itemState('plate-zip', new Set(['plate-zip']), none, 0)).toBe('owned');
  expect(itemState('plate-zip', new Set(), none, 400)).toBe('buyable');
  expect(itemState('plate-zip', new Set(), none, 399)).toBe('locked');
  expect(itemState('plate-gold', new Set(), none, 1_000_000)).toBe('locked');
});
