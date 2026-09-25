import { beforeEach, expect, it } from 'vitest';
import { recordSolve, rehydrate } from '../src/lib/storage.ts';
import { buyItem } from '../src/lib/coins.ts';
import { activePack, equipPack, refreshAppearance, tryOnPack } from '../src/lib/theme.ts';

const root = document.documentElement;

function earnSome(n: number) {
  for (let i = 1; i <= n; i++) {
    recordSolve(`zip:level:genius:${i}`, { solvedAt: '2026-09-23T10:00:00.000Z', seconds: 60, hints: 0, moves: 10 });
  }
}

beforeEach(() => {
  localStorage.clear();
  rehydrate();
  tryOnPack(null);
  equipPack(null);
  refreshAppearance();
});

it('without a pack keeps the stored mode and accent', () => {
  localStorage.setItem('theme', 'dark');
  localStorage.setItem('ph:accent', 'iris');
  refreshAppearance();
  expect(root.dataset['theme']).toBe('dark');
  expect(root.dataset['accent']).toBe('iris');
  expect(root.dataset['pack']).toBeUndefined();
});

it('an equipped pack forces its mode, sets data-pack and drops the accent', () => {
  localStorage.setItem('theme', 'dark');
  localStorage.setItem('ph:accent', 'iris');
  earnSome(50);
  buyItem('paper');
  expect(equipPack('paper')).toBe(true);
  expect(activePack()?.id).toBe('paper');
  expect(root.dataset['pack']).toBe('paper');
  expect(root.dataset['theme']).toBe('light');
  expect(root.dataset['accent']).toBeUndefined();
});

it('leaving the pack restores the stored mode and accent', () => {
  localStorage.setItem('theme', 'dark');
  localStorage.setItem('ph:accent', 'iris');
  earnSome(50);
  buyItem('paper');
  equipPack('paper');
  equipPack(null);
  expect(root.dataset['pack']).toBeUndefined();
  expect(root.dataset['theme']).toBe('dark');
  expect(root.dataset['accent']).toBe('iris');
});

it('a try-on shows a pack without owning or saving it, and ends cleanly', () => {
  // equipPack(null) in beforeEach already wrote the "nothing equipped" state; a try-on must not
  // touch it further, so compare against that snapshot rather than assuming the key is unset.
  const before = localStorage.getItem('ph:cosmetics');
  tryOnPack('synthwave');
  expect(root.dataset['pack']).toBe('synthwave');
  expect(root.dataset['theme']).toBe('dark');
  expect(localStorage.getItem('ph:cosmetics')).toBe(before);
  tryOnPack(null);
  expect(root.dataset['pack']).toBeUndefined();
});

it('ignores an unknown or non-theme id for a try-on', () => {
  tryOnPack('bolt');
  expect(root.dataset['pack']).toBeUndefined();
});
