import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AchievementBannerHost, announceAchievement } from '../src/components/AchievementBanner.tsx';

// No testing-library in this workspace. AchievementBannerHost is stateful (queue, timers), so
// the renderToStaticMarkup trick achievementsPage.test.ts uses for a pure page does not apply
// here: it never runs effects or re-renders on a state change. This mounts the real component
// into jsdom with react-dom/client instead, the same way main.tsx mounts the app, and drives it
// forward with vitest's fake timers standing in for the CSS-transition-driven wall clock.

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(createElement(AchievementBannerHost));
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
});

// One tick (the enter -> open timer) after an announcement, the banner has mounted and is
// showing its title.
function openTick() {
  act(() => {
    vi.advanceTimersByTime(0);
  });
}

// Carries the currently showing banner through its hold and exit, and the tick that opens
// whatever the queue hands it next.
function advanceToNext() {
  act(() => {
    vi.advanceTimersByTime(2200); // hold elapses, phase -> exit
  });
  act(() => {
    vi.advanceTimersByTime(420); // exit animation elapses, current is cleared and the queue advances
  });
  openTick();
}

it('renders nothing until an achievement is announced', () => {
  expect(container.textContent).toBe('');
});

it('shows an announced achievement as a status region with its title', () => {
  act(() => {
    announceAchievement('Weekly done');
  });
  openTick();
  expect(container.textContent).toContain('Weekly done');
  const status = container.querySelector('[role="status"]');
  expect(status).not.toBeNull();
  expect(status?.textContent).toContain('Weekly done');
});

it('shows the bare title, without an "Achievement unlocked" prefix', () => {
  act(() => {
    announceAchievement('Two hundred and fifty');
  });
  openTick();
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Two hundred and fifty');
});

it('queues a second announcement instead of overwriting the first', () => {
  act(() => {
    announceAchievement('First one');
  });
  openTick();
  expect(container.textContent).toContain('First one');

  // Second unlock arrives while the first is still on screen.
  act(() => {
    announceAchievement('Second one');
  });
  expect(container.textContent).toContain('First one');
  expect(container.textContent).not.toContain('Second one');
});

it('announces two unlocks one after another, in arrival order', () => {
  act(() => {
    announceAchievement('First one');
    announceAchievement('Second one');
  });
  openTick();
  expect(container.textContent).toContain('First one');
  expect(container.textContent).not.toContain('Second one');

  advanceToNext();
  expect(container.textContent).toContain('Second one');
  expect(container.textContent).not.toContain('First one');
});

it('is empty again once the queue has drained', () => {
  act(() => {
    announceAchievement('Only one');
  });
  openTick();
  advanceToNext();
  expect(container.textContent).toBe('');
});
