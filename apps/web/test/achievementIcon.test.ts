import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ACHIEVEMENTS } from '@puzzle-hustle/core';
import { AchievementIcon, GENERAL_ICONS } from '../src/components/AchievementIcon.tsx';

it('has a drawn icon for every general achievement', () => {
  for (const a of ACHIEVEMENTS.filter((x) => !x.type)) expect(GENERAL_ICONS[a.id], a.id).toBeTruthy();
});

it('marks earned badges, and draws a ring only on locked ones with progress', () => {
  const a = ACHIEVEMENTS.find((x) => x.id === 'streak-30')!;
  const earned = renderToStaticMarkup(createElement(AchievementIcon, { achievement: a, earned: true, share: 1 }));
  const locked = renderToStaticMarkup(createElement(AchievementIcon, { achievement: a, earned: false, share: 0.4 }));
  const bare = renderToStaticMarkup(createElement(AchievementIcon, { achievement: a, earned: false }));
  expect(earned).toContain('ach-disc earned');
  expect(earned).not.toContain('ach-ring');
  expect(locked).toContain('ach-ring');
  expect(locked).toContain('--share:40%');
  expect(bare).not.toContain('ach-ring');
});

it('uses the puzzle icon plus a corner mark for type achievements', () => {
  const speed = renderToStaticMarkup(createElement(AchievementIcon, { achievement: ACHIEVEMENTS.find((x) => x.id === 'zip-speed')!, earned: false }));
  const genius = renderToStaticMarkup(createElement(AchievementIcon, { achievement: ACHIEVEMENTS.find((x) => x.id === 'sudoku-genius')!, earned: false }));
  const volume = renderToStaticMarkup(createElement(AchievementIcon, { achievement: ACHIEVEMENTS.find((x) => x.id === 'zip-100')!, earned: false }));
  expect(speed).toContain('puzzle-icon');
  expect(speed).toContain('ach-corner speed');
  expect(genius).toContain('ach-corner genius');
  expect(volume).not.toContain('ach-corner');
});

it('gives a general achievement no corner mark, even one whose id ends in -genius', () => {
  const firstGenius = renderToStaticMarkup(createElement(AchievementIcon, { achievement: ACHIEVEMENTS.find((x) => x.id === 'first-genius')!, earned: false }));
  expect(firstGenius).not.toContain('ach-corner');
});
