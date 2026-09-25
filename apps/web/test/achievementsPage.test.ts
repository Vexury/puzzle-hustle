import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { ACHIEVEMENTS, ACHIEVEMENTS_EPOCH } from '@puzzle-hustle/core';
import { Achievements } from '../src/pages/Achievements.tsx';
import { handleBackPress } from '../src/lib/back.ts';
import { rehydrate } from '../src/lib/storage.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const at = new Date(ACHIEVEMENTS_EPOCH + 86400000).toISOString();

function seed(solves: Record<string, { seconds?: number; hints?: number }>) {
  const out: Record<string, unknown> = {};
  for (const [id, s] of Object.entries(solves)) out[id] = { solvedAt: at, seconds: s.seconds ?? 600, hints: s.hints ?? 0, moves: 10 };
  localStorage.setItem('ph:solves', JSON.stringify(out));
  rehydrate();
}

function render() {
  act(() => root.render(createElement(Achievements)));
}

const badges = () => [...container.querySelectorAll('.ach-cabinet .ach-badge')];
// The title only: a puzzle icon can carry text of its own (Zip's numbers).
const title = (b: Element) => b.querySelector('.ach-badge-title')?.textContent;
const chip = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('.ach-chip')].find((c) => c.textContent === label)!;

beforeEach(() => {
  localStorage.clear();
  rehydrate();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it('fresh profile: all forty badges, none earned, no Almost there strip', () => {
  render();
  expect(badges()).toHaveLength(40);
  expect(container.querySelectorAll('.ach-disc.earned')).toHaveLength(0);
  expect(container.querySelector('.ach-next')).toBeNull();
  expect(container.textContent).toContain('0 of 40 earned');
});

it('marks earned badges and counts them in the head', () => {
  seed({ 'zip:weekly:2026-W39': {} });
  render();
  expect(container.textContent).toContain('2 of 40 earned');
  const earned = badges().filter((b) => b.querySelector('.ach-disc.earned'));
  expect(earned.map(title).sort()).toEqual(['Hello, Hustler', 'Weekender']);
});

it('shows the closest started counters under Almost there', () => {
  seed(Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`zip:medium:s${i}`, {}])));
  render();
  const next = [...container.querySelectorAll('.ach-next .ach-next-card')].map((c) => c.textContent);
  // solved 40/50 (0.8), Zip 40/100 (0.4), daily types 1/9 (0.11); streaks and weeklies untouched.
  expect(next).toHaveLength(3);
  expect(next[0]).toContain('Getting Hooked');
  expect(next[0]).toContain('40/50');
  expect(next[1]).toContain('Zip Fan');
  expect(next[1]).toContain('40/100');
  expect(next[2]).toContain('Sampler');
});

it('filters by chip: General shows twenty, a type shows its two', () => {
  render();
  act(() => chip('General').click());
  expect(badges()).toHaveLength(20);
  act(() => chip('Zip').click());
  expect(badges().map(title)).toEqual(['Zip Fan', 'Lightning']);
  act(() => chip('All').click());
  expect(badges()).toHaveLength(ACHIEVEMENTS.length);
});

it('opens a detail card with description, progress, coins and flair', () => {
  seed(Object.fromEntries(Array.from({ length: 3 }, (_, i) => [`zip:medium:s${i}`, {}])));
  render();
  const thousand = badges().find((b) => title(b) === 'Thousand Club')!;
  act(() => (thousand as HTMLButtonElement).click());
  const card = container.querySelector('[role="dialog"]')!;
  expect(card.textContent).toContain('Solve 1000 puzzles.');
  expect(card.textContent).toContain('3/1000');
  expect(card.textContent).toContain('+25 coins');
  expect(card.textContent).toContain('Veteran');
});

it('closes the detail card on back and hands the back button back', () => {
  render();
  act(() => (badges()[0] as HTMLButtonElement).click());
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  let outcome = '';
  act(() => {
    outcome = handleBackPress(true);
  });
  expect(outcome).toBe('guarded');
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(handleBackPress(true)).toBe('back');
});
