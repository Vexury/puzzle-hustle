import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { STAMP_MS, SolvedStamp } from '../src/components/SolvedStamp.tsx';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  container.className = 'play';
  container.innerHTML = '<div class="board-frame"></div><div class="host"></div>';
  document.body.append(container);
  root = createRoot(container.querySelector('.host')!);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

it('says Solved over the board and ends on its own', () => {
  const onDone = vi.fn();
  act(() => root.render(createElement(SolvedStamp, { onDone })));
  expect(container.querySelector('.solved-stamp')?.textContent).toBe('Solved');
  act(() => vi.advanceTimersByTime(STAMP_MS - 1));
  expect(onDone).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(onDone).toHaveBeenCalledOnce();
});
