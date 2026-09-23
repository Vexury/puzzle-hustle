import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS, ACHIEVEMENT_COINS, findCosmetic, levelList, type FlairCosmetic } from '@puzzle-hustle/core';
import { requirementText } from '../src/lib/flairs.ts';

// No testing-library in this workspace, same approach as the old achievementBanner.test.ts:
// mount the real host with react-dom/client and drive it with vitest's fake timers.

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('../src/lib/haptics.ts', () => ({ solved: vi.fn(), tap: vi.fn(), press: vi.fn() }));

// -- buildUnlockRows: pure, no module reset needed -------------------------------------------

import { buildUnlockRows } from '../src/components/UnlockModal.tsx';

const weekly = ACHIEVEMENTS.find((a) => a.id === 'first-weekly')!;
const genius = ACHIEVEMENTS.find((a) => a.id === 'first-genius')!;

it('builds an achievement row from the catalogue, with the coin award text', () => {
  const rows = buildUnlockRows([{ kind: 'achievement', id: 'first-weekly' }], null);
  expect(rows).toEqual([
    {
      key: 'achievement:first-weekly',
      kind: 'achievement',
      id: 'first-weekly',
      title: weekly.title,
      description: weekly.description,
      coinsText: `+${ACHIEVEMENT_COINS} coins`,
      equipped: false,
    },
  ]);
});

it('builds a pack flair row with the same requirement wording the shop toast uses', () => {
  const rows = buildUnlockRows([{ kind: 'flair', id: 'basic-zipper' }], null);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ kind: 'flair', id: 'basic-zipper', title: 'Basic Zipper', coinsText: null, equipped: false });
  expect(rows[0]!.description).toBe(requirementText(findCosmetic('basic-zipper') as FlairCosmetic));
  expect(rows[0]!.description).toBe(`Finish all ${levelList('zip', 'easy').length} Zip levels on Easy.`);
});

it('builds an activity flair row using the linked achievement description as its requirement text', () => {
  const rows = buildUnlockRows([{ kind: 'flair', id: 'puzzler' }], null);
  expect(rows[0]!.description).toBe(ACHIEVEMENTS.find((a) => a.id === 'every-type')!.description);
});

it('marks a flair row as equipped when its id matches the equipped flair', () => {
  const rows = buildUnlockRows([{ kind: 'flair', id: 'basic-zipper' }], 'basic-zipper');
  expect(rows[0]!.equipped).toBe(true);
  const notEquipped = buildUnlockRows([{ kind: 'flair', id: 'basic-zipper' }], 'zip-addict');
  expect(notEquipped[0]!.equipped).toBe(false);
});

it('keeps arrival order and skips an id it does not recognise', () => {
  const rows = buildUnlockRows(
    [
      { kind: 'achievement', id: 'first-genius' },
      { kind: 'achievement', id: 'not-a-real-id' },
      { kind: 'flair', id: 'basic-zipper' },
    ],
    null,
  );
  expect(rows.map((r) => r.key)).toEqual(['achievement:first-genius', 'flair:basic-zipper']);
  expect(rows[0]!.title).toBe(genius.title);
});

// -- announceUnlock / dismissUnlocks / introDismissed: queue and timing -----------------------
// Fresh module instance per test (vi.resetModules + dynamic import) since the queue's timing
// and intro-blocking state live at module scope.

// Returns the modal alongside back.ts and storage.ts from the very same reset: vi.resetModules()
// clears the whole registry, so any module read statically at file scope (before a reset) would
// otherwise be a different instance than the one this fresh UnlockModal.tsx actually talks to.
async function freshUnlockModal() {
  vi.resetModules();
  const [mod, back, storage] = await Promise.all([
    import('../src/components/UnlockModal.tsx'),
    import('../src/lib/back.ts'),
    import('../src/lib/storage.ts'),
  ]);
  return { ...mod, back, storage };
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('opens right away the first time this session, once any pending timer elapses', async () => {
  localStorage.setItem('ph:intro', '1'); // already seen, so nothing blocks the open
  const { announceUnlock, unlockSnapshot } = await freshUnlockModal();
  act(() => announceUnlock({ kind: 'achievement', id: 'first-weekly' }));
  expect(unlockSnapshot().open).toBe(false);
  act(() => vi.advanceTimersByTime(0));
  expect(unlockSnapshot().open).toBe(true);
  expect(unlockSnapshot().items).toEqual([{ kind: 'achievement', id: 'first-weekly' }]);
});

it('delays the second opening this session by about 800ms, so the solved screen is seen first', async () => {
  localStorage.setItem('ph:intro', '1');
  const { announceUnlock, dismissUnlocks, unlockSnapshot } = await freshUnlockModal();
  act(() => announceUnlock({ kind: 'achievement', id: 'first-weekly' }));
  act(() => vi.advanceTimersByTime(0));
  expect(unlockSnapshot().open).toBe(true);
  act(() => dismissUnlocks());
  expect(unlockSnapshot()).toEqual({ items: [], open: false });

  act(() => announceUnlock({ kind: 'achievement', id: 'first-genius' }));
  act(() => vi.advanceTimersByTime(799));
  expect(unlockSnapshot().open).toBe(false);
  act(() => vi.advanceTimersByTime(1));
  expect(unlockSnapshot().open).toBe(true);
});

it('appends unlocks that arrive while the card is already open, without waiting again', async () => {
  localStorage.setItem('ph:intro', '1');
  const { announceUnlock, unlockSnapshot } = await freshUnlockModal();
  act(() => announceUnlock({ kind: 'achievement', id: 'first-weekly' }));
  act(() => vi.advanceTimersByTime(0));
  expect(unlockSnapshot().open).toBe(true);

  act(() => announceUnlock({ kind: 'flair', id: 'basic-zipper' }));
  expect(unlockSnapshot().open).toBe(true);
  expect(unlockSnapshot().items).toEqual([
    { kind: 'achievement', id: 'first-weekly' },
    { kind: 'flair', id: 'basic-zipper' },
  ]);
});

it('coalesces several unlocks announced synchronously into one opening', async () => {
  localStorage.setItem('ph:intro', '1');
  const { announceUnlock, unlockSnapshot } = await freshUnlockModal();
  act(() => {
    announceUnlock({ kind: 'achievement', id: 'first-weekly' });
    announceUnlock({ kind: 'achievement', id: 'first-genius' });
    announceUnlock({ kind: 'flair', id: 'basic-zipper' });
  });
  act(() => vi.advanceTimersByTime(0));
  expect(unlockSnapshot().open).toBe(true);
  expect(unlockSnapshot().items).toHaveLength(3);
});

it('never throws even if an unlock is announced with a malformed item', async () => {
  const { announceUnlock } = await freshUnlockModal();
  // @ts-expect-error deliberately malformed for the throw check
  expect(() => announceUnlock(null)).not.toThrow();
});

it('holds a catch-up unlock announced before the intro has been dismissed, then opens once dismissed', async () => {
  // ph:intro unset: the first-launch intro has not been seen yet.
  const { announceUnlock, introDismissed, unlockSnapshot } = await freshUnlockModal();
  act(() => announceUnlock({ kind: 'achievement', id: 'first-weekly' }));
  act(() => vi.advanceTimersByTime(5000));
  expect(unlockSnapshot().open).toBe(false); // still blocked by the intro
  expect(unlockSnapshot().items).toEqual([{ kind: 'achievement', id: 'first-weekly' }]);

  act(() => introDismissed());
  act(() => vi.advanceTimersByTime(0));
  expect(unlockSnapshot().open).toBe(true); // opens immediately, no further delay
});

// -- UnlockModalHost: rendering and interaction -------------------------------------------------

let container: HTMLDivElement;
let root: Root;

async function mountHost() {
  const mod = await freshUnlockModal();
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(createElement(mod.UnlockModalHost));
  });
  return mod;
}

afterEach(() => {
  if (root) {
    act(() => root.unmount());
    container?.remove();
  }
});

it('renders nothing until something unlocks', async () => {
  localStorage.setItem('ph:intro', '1');
  await mountHost();
  expect(container.textContent).toBe('');
});

it('shows the achievement title, description and coin award once open', async () => {
  localStorage.setItem('ph:intro', '1');
  const { announceUnlock } = await mountHost();
  act(() => announceUnlock({ kind: 'achievement', id: 'first-genius' }));
  act(() => vi.advanceTimersByTime(0));
  expect(container.textContent).toContain(genius.title);
  expect(container.textContent).toContain(genius.description);
  expect(container.textContent).toContain(`+${ACHIEVEMENT_COINS} coins`);
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
});

it('renders one row per unlock when several land at once', async () => {
  localStorage.setItem('ph:intro', '1');
  const { announceUnlock } = await mountHost();
  act(() => {
    announceUnlock({ kind: 'achievement', id: 'first-weekly' });
    announceUnlock({ kind: 'flair', id: 'basic-zipper' });
  });
  act(() => vi.advanceTimersByTime(0));
  expect(container.querySelectorAll('.unlock-row').length).toBe(2);
});

it('tapping a flair row equips it and its status switches to Equipped', async () => {
  localStorage.setItem('ph:intro', '1');
  // equip() only accepts an id the player actually owns, so basic-zipper has to be genuinely
  // earned: every Zip Easy level solved, written straight to localStorage so the fresh
  // storage.ts module (re-imported by mountHost's own vi.resetModules()) picks it up on load.
  const n = levelList('zip', 'easy').length;
  const solves: Record<string, unknown> = {};
  for (let i = 1; i <= n; i++) solves[`zip:level:easy:${i}`] = { solvedAt: '2026-09-23T10:00:00.000Z', seconds: 60, hints: 0, moves: 10 };
  localStorage.setItem('ph:solves', JSON.stringify(solves));

  const { announceUnlock } = await mountHost();
  act(() => announceUnlock({ kind: 'flair', id: 'basic-zipper' }));
  act(() => vi.advanceTimersByTime(0));
  const row = container.querySelector('.unlock-row') as HTMLButtonElement;
  expect(row.textContent).not.toContain('Equipped');
  act(() => row.click());
  expect(container.querySelector('.unlock-row')!.textContent).toContain('Equipped');
});

it('tapping Nice! closes the card and clears the queue', async () => {
  localStorage.setItem('ph:intro', '1');
  const { announceUnlock, unlockSnapshot } = await mountHost();
  act(() => announceUnlock({ kind: 'achievement', id: 'first-weekly' }));
  act(() => vi.advanceTimersByTime(0));
  const nice = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Nice!')!;
  act(() => nice.click());
  expect(container.textContent).toBe('');
  expect(unlockSnapshot()).toEqual({ items: [], open: false });
});

it('the Android back button closes the card instead of navigating', async () => {
  localStorage.setItem('ph:intro', '1');
  const { announceUnlock, back } = await mountHost();
  act(() => announceUnlock({ kind: 'achievement', id: 'first-weekly' }));
  act(() => vi.advanceTimersByTime(0));
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  let outcome: ReturnType<typeof back.handleBackPress> | undefined;
  act(() => {
    outcome = back.handleBackPress(true);
  });
  expect(outcome).toBe('guarded');
  expect(container.textContent).toBe('');
});

it('fires confetti and a success haptic once the card opens, not on every appended item', async () => {
  localStorage.setItem('ph:intro', '1');
  const confetti = (await import('canvas-confetti')).default as unknown as ReturnType<typeof vi.fn>;
  const haptics = await import('../src/lib/haptics.ts');
  const { announceUnlock } = await mountHost();
  act(() => announceUnlock({ kind: 'achievement', id: 'first-weekly' }));
  act(() => vi.advanceTimersByTime(0));
  expect(confetti).toHaveBeenCalledTimes(1);
  expect(haptics.solved).toHaveBeenCalledTimes(1);

  act(() => announceUnlock({ kind: 'flair', id: 'basic-zipper' }));
  expect(confetti).toHaveBeenCalledTimes(1);
  expect(haptics.solved).toHaveBeenCalledTimes(1);
});

it('skips confetti under prefers-reduced-motion but still shows the card', async () => {
  const original = globalThis.matchMedia;
  globalThis.matchMedia = ((query: string) => ({ ...original(query), matches: true })) as typeof globalThis.matchMedia;
  try {
    localStorage.setItem('ph:intro', '1');
    const confetti = (await import('canvas-confetti')).default as unknown as ReturnType<typeof vi.fn>;
    const { announceUnlock } = await mountHost();
    act(() => announceUnlock({ kind: 'achievement', id: 'first-weekly' }));
    act(() => vi.advanceTimersByTime(0));
    expect(confetti).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  } finally {
    globalThis.matchMedia = original;
  }
});
