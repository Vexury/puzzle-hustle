import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PlacementChip, SolvedCard, type SolvedCardProps } from '../src/components/SolvedCard.tsx';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const base: SolvedCardProps = { seconds: 84, moves: 31, hints: 0, bestBefore: null, awards: null, animate: false };

function render(props: Partial<SolvedCardProps>) {
  act(() => root.render(createElement(SolvedCard, { ...base, ...props })));
}

const tiles = () => [...container.querySelectorAll('.solved-tile')].map((t) => t.textContent);
const tile = (cls: string) => container.querySelector(`.solved-tile.${cls}`);
const chips = () => [...container.querySelectorAll('.solved-chip')].map((c) => c.textContent);

it('puts time, moves and hints in three tiles and leaves the word to the stamp', () => {
  render({});
  expect(container.querySelector('.solved-title')).toBeNull();
  expect(tiles()).toEqual(['1:24time', '31moves', '0hints']);
  expect(tile('good')!.textContent).toBe('0hints');
});

it('counts hints plainly when there were some', () => {
  render({ hints: 1, moves: 1 });
  expect(tiles()).toEqual(['1:24time', '1move', '1hint']);
  expect(tile('good')).toBeNull();
});

it('adds a New best chip only when the time beats the old best', () => {
  render({ bestBefore: 100 });
  expect(chips()).toEqual([' New best!']);
  render({ bestBefore: 60 });
  expect(container.querySelector('.solved-chips')).toBeNull();
  render({ bestBefore: null });
  expect(container.querySelector('.solved-chips')).toBeNull();
});

it('counts the coins up to the total of every award on a fresh solve', () => {
  render({ awards: [{ reason: 'daily', coins: 10 }, { reason: 'no-hints', coins: 5 }], animate: true });
  expect(chips()).toEqual(['+0']);
  act(() => vi.advanceTimersByTime(1000));
  expect(chips()).toEqual(['+15']);
});

it('shows the total at once when not animating, and a clean sweep chip for the sweep', () => {
  render({ awards: [{ reason: 'daily', coins: 10 }, { reason: 'clean-sweep', coins: 20 }] });
  expect(chips()).toEqual(['+30', ' Clean sweep']);
});

it('has no chip row without coins or a placement, as on a revisit', () => {
  render({ awards: null });
  expect(container.querySelector('.solved-chips')).toBeNull();
});

it('labels the placement with an ordinal and a medal on the podium only', () => {
  const place = (rank: number) => {
    act(() => root.render(createElement(PlacementChip, { rank, of: 23, group: 'Family' })));
    const chip = container.querySelector('.solved-chip.place')!;
    return [chip.textContent, [...chip.classList].filter((c) => c !== 'solved-chip' && c !== 'place').join(' ')];
  };
  expect(place(1)).toEqual(['1st of 23 · Family', 'gold']);
  expect(place(2)).toEqual(['2nd of 23 · Family', 'silver']);
  expect(place(3)).toEqual(['3rd of 23 · Family', 'bronze']);
  expect(place(4)).toEqual(['4th of 23 · Family', '']);
  expect(place(11)).toEqual(['11th of 23 · Family', '']);
  expect(place(22)).toEqual(['22nd of 23 · Family', '']);
});
