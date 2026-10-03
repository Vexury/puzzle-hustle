import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Placement } from '../src/pages/Play.tsx';
import { writeSession } from '../src/lib/api.ts';
import { enqueue, flush, resetBackoff } from '../src/lib/queue.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PUZZLE = 'crowns:daily:2026-10-03';
const group = { id: 'g1', code: 'ABC', name: 'Crew', members: 3, owner: false };
const entry = (playerId: string, seconds: number) => ({ playerId, name: playerId, seconds, hints: 0 });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  resetBackoff();
  writeSession({ token: 't', player: { id: 'me', name: 'Pia' } });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function settle() {
  for (let i = 0; i < 5; i++) await act(async () => {});
}

const chip = () => container.querySelector('.place');

it('shows the place once a score that was still queued reaches the server', async () => {
  let stored = false;
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.includes('/groups')) return json({ groups: [group] });
    if (url.includes('/scores')) {
      stored = true;
      return json({ results: [{ puzzle: PUZZLE, status: 'stored' }] });
    }
    return json({ entries: stored ? [entry('a', 40), entry('me', 50)] : [entry('a', 40)], me: stored ? 2 : null, percentile: null });
  });
  await act(async () => root.render(createElement(Placement, { puzzle: PUZZLE })));
  await settle();
  expect(chip()).toBeNull();

  enqueue(PUZZLE, { seconds: 50, hints: 0, moves: 27, solvedAt: new Date().toISOString() });
  await act(async () => flush());
  await settle();
  expect(chip()?.textContent).toContain('2nd of 2');
});

it('tries the board again when the first request fails', async () => {
  vi.useFakeTimers();
  let boardCalls = 0;
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.includes('/groups')) return json({ groups: [group] });
    boardCalls++;
    if (boardCalls === 1) throw new TypeError('network');
    return json({ entries: [entry('me', 50)], me: 1, percentile: null });
  });
  await act(async () => root.render(createElement(Placement, { puzzle: PUZZLE })));
  await settle();
  expect(chip()).toBeNull();

  await act(async () => vi.advanceTimersByTime(5_000));
  await settle();
  expect(chip()?.textContent).toContain('1st of 1');
});

it('tries the groups again when they did not load', async () => {
  let groupCalls = 0;
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.includes('/groups')) {
      groupCalls++;
      if (groupCalls === 1) throw new TypeError('network');
      return json({ groups: [group] });
    }
    return json({ entries: [entry('me', 50)], me: 1, percentile: null });
  });
  await act(async () => root.render(createElement(Placement, { puzzle: PUZZLE })));
  await settle();
  expect(chip()).toBeNull();

  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  await settle();
  expect(chip()?.textContent).toContain('1st of 1');
});

it('asks nothing more of a player without a group', async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn(async (url: string) => (url.includes('/groups') ? json({ groups: [] }) : json({})));
  vi.stubGlobal('fetch', fetchMock);
  await act(async () => root.render(createElement(Placement, { puzzle: PUZZLE })));
  await settle();
  await act(async () => vi.advanceTimersByTime(120_000));
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  await settle();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
