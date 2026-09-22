import { afterEach, beforeEach, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ACHIEVEMENTS, ACHIEVEMENTS_EPOCH } from '@puzzle-hustle/core';
import { Achievements } from '../src/pages/Achievements.tsx';
import { rehydrate } from '../src/lib/storage.ts';

let container: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  rehydrate();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
});

it('lists all seventeen achievements under their group headings and marks the earned ones apart from the locked ones', () => {
  const after = ACHIEVEMENTS_EPOCH + 86400000;
  localStorage.setItem(
    'ph:solves',
    JSON.stringify({ 'zip:weekly:2026-W39': { solvedAt: new Date(after).toISOString(), seconds: 60, hints: 0, moves: 10 } }),
  );
  rehydrate();

  container.innerHTML = renderToStaticMarkup(createElement(Achievements));

  expect(ACHIEVEMENTS.length).toBe(17);
  for (const a of ACHIEVEMENTS) {
    expect(container.textContent).toContain(a.title);
  }

  for (const heading of ['Getting started', 'Habit', 'Skill', 'Volume', 'Odd hours']) {
    expect(container.textContent).toContain(heading);
  }

  const rows = [...container.querySelectorAll('.achievement')];
  expect(rows).toHaveLength(ACHIEVEMENTS.length);

  const earnedRow = rows.find((r) => r.textContent?.includes('Weekly done'));
  const lockedRow = rows.find((r) => r.textContent?.includes('Fifty'));
  expect(earnedRow?.classList.contains('earned')).toBe(true);
  expect(lockedRow?.classList.contains('earned')).toBe(false);
  expect(container.textContent).toContain('1 of 17 earned');
});
