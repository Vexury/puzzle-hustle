import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { dailyRef, periodRef } from '@puzzle-hustle/core';
import { expect, it, vi } from 'vitest';
import { StandingsCarousel, type CarouselPage } from '../src/components/StandingsCarousel.tsx';
import { pageLabel } from '../src/pages/Friends.tsx';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const pages: CarouselPage[] = Array.from({ length: 11 }, (_, i) => ({ key: `p${i}`, label: `Puzzle ${i}`, color: 'red' }));

function mount(index: number, onIndex = vi.fn()) {
  const rendered: string[] = [];
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() =>
    root.render(
      createElement(StandingsCarousel, {
        pages,
        index,
        onIndex,
        render: (page: CarouselPage) => {
          rendered.push(page.key);
          return createElement('p', { className: 'content' }, page.key);
        },
      }),
    ),
  );
  return { container, rendered, onIndex };
}

it('renders only the open card and its neighbours', () => {
  const { container, rendered } = mount(5);
  expect(rendered.sort()).toEqual(['p4', 'p5', 'p6']);
  expect(container.querySelectorAll('.standings-card').length).toBe(11);
  expect(container.querySelectorAll('.content').length).toBe(3);
});

it('marks the open dot and jumps from a tapped one', () => {
  const { container, onIndex } = mount(2);
  const dots = [...container.querySelectorAll<HTMLButtonElement>('.standings-dot')];
  expect(dots.map((d) => d.classList.contains('on'))).toEqual(pages.map((_, i) => i === 2));
  act(() => dots[9]!.click());
  expect(onIndex).toHaveBeenCalledWith(9);
});

it('names dailies, weeklies and monthlies with their number and type', () => {
  expect(pageLabel(dailyRef('stars'))).toMatch(/^Hearts · Daily #\d+$/);
  expect(pageLabel(periodRef('weekly'))).toMatch(/^Weekly #\d+ · \w+/);
  expect(pageLabel(periodRef('monthly'))).toMatch(/^Monthly #\d+ · \w+/);
});
