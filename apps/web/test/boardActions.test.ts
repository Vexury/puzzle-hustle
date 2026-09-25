import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const apiFetch = vi.fn();
vi.mock('../src/lib/api.ts', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock('../src/components/Toast.tsx', () => ({ toast: vi.fn() }));

import { Board } from '../src/components/Board.tsx';

const BOARD = {
  entries: [
    { playerId: 'me', name: 'Moritz', seconds: 60, hints: 0 },
    { playerId: 'troll', name: 'Troll', seconds: 70, hints: 0 },
  ],
  me: 0,
  percentile: null,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (path: string) => (path.startsWith('/board') ? BOARD : {}));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

async function mount(owner: boolean, onRemoved = vi.fn()) {
  await act(async () => {
    root.render(createElement(Board, { groupId: 'g1', puzzle: 'sudoku:daily:2026-09-25', meId: 'me', owner, onRemoved }));
  });
}

const button = (text: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
const names = () => [...container.querySelectorAll('.leaderboard-name-text')].map((n) => n.textContent);

it('offers Remove only to the owner', async () => {
  await mount(false);
  act(() => container.querySelector<HTMLButtonElement>('.leaderboard-report')!.click());
  expect(button('Hide')).toBeDefined();
  expect(button('Remove from group')).toBeUndefined();
});

it('arms Remove, falls back after 2 s, and removes on the second tap', async () => {
  const onRemoved = vi.fn();
  await mount(true, onRemoved);
  vi.useFakeTimers();
  act(() => container.querySelector<HTMLButtonElement>('.leaderboard-report')!.click());
  act(() => button('Remove from group')!.click());
  expect(button('Remove')?.className).toContain('danger');
  act(() => vi.advanceTimersByTime(2000));
  expect(button('Remove')).toBeUndefined();
  expect(apiFetch).not.toHaveBeenCalledWith('/groups/remove', expect.anything());

  act(() => button('Remove from group')!.click());
  await act(async () => button('Remove')!.click());
  expect(apiFetch).toHaveBeenCalledWith(
    '/groups/remove',
    expect.objectContaining({ body: JSON.stringify({ id: 'g1', playerId: 'troll' }) }),
  );
  expect(onRemoved).toHaveBeenCalled();
});

it('hides a player locally and shows them again', async () => {
  await mount(false);
  act(() => container.querySelector<HTMLButtonElement>('.leaderboard-report')!.click());
  act(() => button('Hide')!.click());
  expect(names()).toEqual(['Moritz']);
  expect(JSON.parse(localStorage.getItem('ph:hidden')!)).toEqual(['troll']);

  act(() => button('1 hidden · Show')!.click());
  expect(names()).toEqual(['Moritz', 'Troll']);
  expect(JSON.parse(localStorage.getItem('ph:hidden')!)).toEqual([]);
});
