import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ACHIEVEMENTS_EPOCH, hustleSlot } from '@puzzle-hustle/core';
import { expect, it } from 'vitest';
import { rehydrate } from '../src/lib/storage.ts';
import { Hustle, nextMilestones } from '../src/pages/Hustle.tsx';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('lists the next milestones with their rewards', () => {
  expect(nextMilestones(46, 3)).toEqual([
    { n: 50, coins: 45, badge: 'hustle-mountain' },
    { n: 60, coins: 50 },
    { n: 70, coins: 55 },
  ]);
  expect(nextMilestones(35, 1)).toEqual([{ n: 40, coins: 40, flair: 'hustle-starter' }]);
});

it('shows the level, the progress to the next milestone and the next puzzle', () => {
  localStorage.clear();
  const solves: Record<string, unknown> = {};
  const solvedAt = new Date(Math.max(Date.now(), ACHIEVEMENTS_EPOCH + 1000)).toISOString();
  for (let n = 1; n <= 46; n++) solves[`hustle:${n}`] = { solvedAt, seconds: 60, hints: 0, moves: 10 };
  localStorage.setItem('ph:solves', JSON.stringify(solves));
  rehydrate();
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(createElement(Hustle)));
  expect(container.querySelector('.hustle-level')?.textContent).toBe('46');
  expect(container.querySelector('.daily-progress')?.getAttribute('aria-valuenow')).toBe('6');
  expect(container.textContent).toContain('4 more for Mountain badge + 45');
  expect(container.querySelector('.streak-timer')?.textContent).toBe('74 stagesto Hard');
  expect(container.textContent).toContain('1 of 18 earned');
  expect(container.querySelector('.hustle-rewards .own')?.textContent).toContain('Hustle Starter');
  expect(container.querySelectorAll('.hustle-rewards li').length).toBe(18);
  const titles = [...container.querySelectorAll('.hustle-rewards li b')].map((b) => b.textContent);
  expect(titles.slice(2, 3)).toEqual(['Tracks nameplate']);
  expect(titles.slice(9, 10)).toEqual(['Ocean theme']);
  expect(titles.slice(-5)).toEqual(['Inferno theme', 'Summit badge', 'Casino theme', 'Genius Gold nameplate', 'Hustle Legend']);
  expect(container.querySelector('a.row-card')?.getAttribute('href')).toContain('h=47');
  act(() => root.unmount());
});

it('counts the tier from the stage, not from the next board’s balanced difficulty', () => {
  // The first Medium-tier stage that is Sumdoku, which plays a tier down on Easy.
  let stage = 41;
  while (hustleSlot(stage).type !== 'killer') stage++;
  expect(hustleSlot(stage).difficulty).toBe('easy');
  localStorage.clear();
  const solves: Record<string, unknown> = {};
  const solvedAt = new Date(Math.max(Date.now(), ACHIEVEMENTS_EPOCH + 1000)).toISOString();
  for (let n = 1; n < stage; n++) solves[`hustle:${n}`] = { solvedAt, seconds: 60, hints: 0, moves: 10 };
  localStorage.setItem('ph:solves', JSON.stringify(solves));
  rehydrate();
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(createElement(Hustle)));
  expect(container.querySelector('.streak-timer')?.textContent).toBe(`${120 - (stage - 1)} stagesto Hard`);
  expect(container.querySelector('a.row-card')?.textContent).toContain(`Stage ${stage} · Easy`);
  act(() => root.unmount());
});
