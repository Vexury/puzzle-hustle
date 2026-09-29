import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { dailyRef, encodeRef, generateStars, levelRef, refId } from '@puzzle-hustle/core';
import { Play } from '../src/pages/Play.tsx';
import { handleBackPress } from '../src/lib/back.ts';
import { readProgress, writeSetting } from '../src/lib/storage.ts';

vi.mock('../src/lib/haptics.ts', () => ({ solved: vi.fn(), tap: vi.fn(), press: vi.fn() }));
vi.mock('@puzzle-hustle/core', async (original) => {
  const core = await original<typeof import('@puzzle-hustle/core')>();
  return { ...core, generateStars: vi.fn(core.generateStars) };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  writeSetting('ph:howto:tracks', '1');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

// The board arrives asynchronously now (board pack or generator), behind a loading view.
async function mount(query: string) {
  await act(async () => root.render(createElement(Play, { params: new URLSearchParams(query) })));
  await vi.waitFor(() => expect(container.querySelector('.board-loading')).toBeNull());
  await act(async () => {});
}

it('keeps the clock of a daily left before the first move', async () => {
  const ref = dailyRef('tracks');
  await mount(encodeRef(ref));
  act(() => vi.advanceTimersByTime(42_000));
  act(() => root.unmount());
  expect(readProgress(refId(ref))).toMatchObject({ state: [], seconds: 42, moves: 0 });

  root = createRoot(container);
  await mount(encodeRef(ref));
  act(() => vi.advanceTimersByTime(1_000));
  expect(container.querySelector('.timer')?.textContent).toContain('43s');
});

it('saves nothing for a level left before the first move', async () => {
  const ref = levelRef('tracks', 'easy', 1)!;
  await mount(encodeRef(ref));
  act(() => vi.advanceTimersByTime(5_000));
  act(() => root.unmount());
  expect(readProgress(refId(ref))).toBeNull();
});

it('a back press opens the leave question and a second one dismisses it', async () => {
  await mount(encodeRef(dailyRef('tracks')));
  act(() => void handleBackPress(true));
  expect(container.textContent).toContain('Leave this puzzle?');
  let outcome = '';
  act(() => void (outcome = handleBackPress(true)));
  expect(outcome).toBe('guarded');
  expect(container.textContent).not.toContain('Leave this puzzle?');
});

it('takes a scheduled stars puzzle from the adapter instead of generating it again', async () => {
  writeSetting('ph:howto:stars', '1');
  vi.mocked(generateStars).mockClear();
  await mount(encodeRef(dailyRef('stars')));
  expect(generateStars).not.toHaveBeenCalled();
  expect(container.querySelector('.play')).not.toBeNull();
});

it('holds the clock while the first how-to is up and starts it on Got it', async () => {
  localStorage.removeItem('ph:howto:tracks');
  await mount(encodeRef(dailyRef('tracks')));
  expect(container.querySelector('.help')).not.toBeNull();
  act(() => vi.advanceTimersByTime(10_000));
  expect(container.querySelector('.timer')?.textContent).toContain('0s');
  const next = () => container.querySelector<HTMLButtonElement>('.demo > .pill')!;
  const dots = container.querySelectorAll('.demo-dots button').length;
  for (let k = 1; k < dots; k++) {
    expect(next().textContent).toBe('Continue');
    act(() => next().click());
    expect(container.querySelector('.demo-dots .on')).toBe(container.querySelectorAll('.demo-dots button')[k]);
  }
  expect(container.querySelector('.timer')?.textContent).toContain('0s');
  expect(next().textContent).toBe('Got it');
  act(() => next().click());
  expect(container.querySelector('.help')).toBeNull();
  act(() => vi.advanceTimersByTime(3_000));
  expect(container.querySelector('.timer')?.textContent).toContain('3s');
});

it('stays on a how-to step until the reader swipes to the next or back', async () => {
  localStorage.removeItem('ph:howto:tracks');
  await mount(encodeRef(dailyRef('tracks')));
  const on = () => [...container.querySelectorAll('.demo-dots button')].indexOf(container.querySelector('.demo-dots .on')!);
  act(() => vi.advanceTimersByTime(30_000));
  expect(on()).toBe(0);
  const demo = container.querySelector('.demo')!;
  const swipe = (dx: number) =>
    act(() => {
      demo.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 200, clientY: 100 }));
      demo.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 200 + dx, clientY: 110 }));
    });
  swipe(-80);
  expect(on()).toBe(1);
  swipe(80);
  expect(on()).toBe(0);
  swipe(80);
  expect(on()).toBe(0);
  swipe(-20);
  expect(on()).toBe(0);
});

it('a back press closes the how-to instead of asking to leave', async () => {
  await mount(encodeRef(dailyRef('tracks')));
  act(() => (container.querySelector('[aria-label="How to play"]') as HTMLButtonElement).click());
  expect(container.querySelector('.help')).not.toBeNull();
  act(() => void handleBackPress(true));
  expect(container.querySelector('.help')).toBeNull();
  expect(container.textContent).not.toContain('Leave this puzzle?');
});

it('shows the cats how-to as a demo', async () => {
  await mount(encodeRef(dailyRef('crowns')));
  expect(container.querySelector('.help .demo')).not.toBeNull();
  act(() => vi.advanceTimersByTime(5_000));
});
