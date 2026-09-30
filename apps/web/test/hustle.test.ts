import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ACHIEVEMENTS_EPOCH } from '@puzzle-hustle/core';
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
  expect(container.querySelector('.streak-timer')?.textContent).toBe('Medium74 to Hard');
  expect(container.textContent).toContain('1 of 10 earned');
  expect(container.querySelector('.hustle-rewards .own')?.textContent).toContain('Hustle Starter');
  expect(container.querySelectorAll('.hustle-rewards li').length).toBe(10);
  expect(container.querySelector('a.row-card')?.getAttribute('href')).toContain('h=47');
  act(() => root.unmount());
});
