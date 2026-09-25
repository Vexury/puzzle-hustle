import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { dailyRef, encodeRef, levelRef, refId } from '@puzzle-hustle/core';
import { Play } from '../src/pages/Play.tsx';
import { handleBackPress } from '../src/lib/back.ts';
import { readProgress, writeSetting } from '../src/lib/storage.ts';

vi.mock('../src/lib/haptics.ts', () => ({ solved: vi.fn(), tap: vi.fn(), press: vi.fn() }));

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

function mount(query: string) {
  act(() => root.render(createElement(Play, { params: new URLSearchParams(query) })));
}

it('keeps the clock of a daily left before the first move', () => {
  const ref = dailyRef('tracks');
  mount(encodeRef(ref));
  act(() => vi.advanceTimersByTime(42_000));
  act(() => root.unmount());
  expect(readProgress(refId(ref))).toMatchObject({ state: [], seconds: 42, moves: 0 });

  root = createRoot(container);
  mount(encodeRef(ref));
  act(() => vi.advanceTimersByTime(1_000));
  expect(container.querySelector('.timer')?.textContent).toContain('43s');
});

it('saves nothing for a level left before the first move', () => {
  const ref = levelRef('tracks', 'easy', 1)!;
  mount(encodeRef(ref));
  act(() => vi.advanceTimersByTime(5_000));
  act(() => root.unmount());
  expect(readProgress(refId(ref))).toBeNull();
});

it('a back press opens the leave question and a second one dismisses it', () => {
  mount(encodeRef(dailyRef('tracks')));
  act(() => void handleBackPress(true));
  expect(container.textContent).toContain('Leave this puzzle?');
  let outcome = '';
  act(() => void (outcome = handleBackPress(true)));
  expect(outcome).toBe('guarded');
  expect(container.textContent).not.toContain('Leave this puzzle?');
});
