import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS, ACHIEVEMENT_COINS, findCosmetic, levelList, type FlairCosmetic } from '@puzzle-hustle/core';
import { requirementText } from '../src/lib/flairs.ts';

// No testing-library in this workspace, same approach as the old achievementBanner.test.ts:
// mount the real host with react-dom/client and drive it with vitest's fake timers.

const confettiFire = vi.hoisted(() => Object.assign(vi.fn(), { reset: vi.fn() }));
vi.mock('canvas-confetti', () => ({ default: { create: () => confettiFire } }));
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

// -- accentTints: the confetti colour helper ---------------------------------------------------
// canvas-confetti's own colour parsing only understands hex (its hexToRgb strips non-hex
// characters first), so an rgb(...) string silently comes out as the wrong colour instead of
// throwing — this has to be asserted on the actual format, not just "does not throw".

import { accentTints } from '../src/components/UnlockModal.tsx';

const HEX = /^#[0-9a-f]{6}$/i;

function channelSum(hex: string): number {
  return parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
}

it('returns three hex colours, the base accent plus two lighter tints', () => {
  const [base, tint1, tint2] = accentTints('#ffa833');
  for (const c of [base, tint1, tint2]) expect(c).toMatch(HEX);
  expect(base).toBe('#ffa833');
  expect(channelSum(tint1!)).toBeGreaterThan(channelSum(base!));
  expect(channelSum(tint2!)).toBeGreaterThan(channelSum(tint1!));
});

it('falls back to a default accent for an unparseable value instead of passing it through broken', () => {
  const [base, tint1, tint2] = accentTints('not-a-colour');
  for (const c of [base, tint1, tint2]) expect(c).toMatch(HEX);
});

it('handles every configured accent colour, with or without surrounding whitespace', () => {
  const accents = ['#FFA833', ' #23cbb6 ', '#4faef7', '#9b7bff', '#ff7ba6', '#8aa0bc'];
  for (const raw of accents) {
    const tints = accentTints(raw);
    expect(tints).toHaveLength(3);
    for (const c of tints) expect(c).toMatch(HEX);
  }
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
  confettiFire.mockClear();
  confettiFire.reset.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

it('opens a catch-up unlock (announced before markUnlocksLive) immediately, once any pending timer elapses', async () => {
  localStorage.setItem('ph:intro', '1'); // already seen, so nothing blocks the open
  const { announceUnlock, unlockSnapshot } = await freshUnlockModal();
  act(() => announceUnlock({ kind: 'achievement', id: 'first-weekly' }));
  expect(unlockSnapshot().open).toBe(false);
  act(() => vi.advanceTimersByTime(0));
  expect(unlockSnapshot().open).toBe(true);
  expect(unlockSnapshot().items).toEqual([{ kind: 'achievement', id: 'first-weekly' }]);
});

it('delays an unlock announced after markUnlocksLive (a solve) by about 800ms, so the solved screen is seen first', async () => {
  localStorage.setItem('ph:intro', '1');
  const { announceUnlock, markUnlocksLive, unlockSnapshot } = await freshUnlockModal();
  act(() => markUnlocksLive()); // main.tsx calls this right after app-start catch-up is synced
  act(() => announceUnlock({ kind: 'achievement', id: 'first-weekly' }));
  act(() => vi.advanceTimersByTime(799));
  expect(unlockSnapshot().open).toBe(false);
  act(() => vi.advanceTimersByTime(1));
  expect(unlockSnapshot().open).toBe(true);
});

it('still delays a solve-triggered unlock even when it is the very first opening this session', async () => {
  // The old rule decided the delay by "has anything opened yet this session"; the correct rule
  // decides by origin (catch-up vs. a solve), so a solve that happens to be the first opening
  // ever this session (no catch-up unlocks existed) must still wait, not open at 0ms.
  localStorage.setItem('ph:intro', '1');
  const { announceUnlock, markUnlocksLive, unlockSnapshot } = await freshUnlockModal();
  act(() => markUnlocksLive());
  act(() => announceUnlock({ kind: 'achievement', id: 'first-genius' }));
  act(() => vi.advanceTimersByTime(0));
  expect(unlockSnapshot().open).toBe(false);
  act(() => vi.advanceTimersByTime(800));
  expect(unlockSnapshot().open).toBe(true);
});

it('still delays a second, later solve after an earlier catch-up batch opened immediately', async () => {
  localStorage.setItem('ph:intro', '1');
  const { announceUnlock, dismissUnlocks, markUnlocksLive, unlockSnapshot } = await freshUnlockModal();
  act(() => announceUnlock({ kind: 'achievement', id: 'first-weekly' })); // catch-up
  act(() => vi.advanceTimersByTime(0));
  expect(unlockSnapshot().open).toBe(true);
  act(() => dismissUnlocks());
  act(() => markUnlocksLive());

  act(() => announceUnlock({ kind: 'achievement', id: 'first-genius' })); // a later solve
  act(() => vi.advanceTimersByTime(799));
  expect(unlockSnapshot().open).toBe(false);
  act(() => vi.advanceTimersByTime(1));
  expect(unlockSnapshot().open).toBe(true);
});

it('does not stay blocked forever when ph:intro is restored just after import but before the first announce', async () => {
  // Mirrors main.tsx: restoreBackup() can write a native backup's ph:intro to localStorage
  // after this module has already been imported (and would, with an eager import-time read,
  // have cached introBlocked=true), but before syncAchievements()/syncFlairs() ever run.
  const { announceUnlock, unlockSnapshot } = await freshUnlockModal(); // ph:intro unset at import time
  localStorage.setItem('ph:intro', '1'); // "restoreBackup()" resolves after import, before announce
  act(() => announceUnlock({ kind: 'achievement', id: 'first-weekly' }));
  act(() => vi.advanceTimersByTime(0));
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

it('drops a malformed announced item instead of queueing it', async () => {
  localStorage.setItem('ph:intro', '1');
  const { announceUnlock, unlockSnapshot } = await freshUnlockModal();
  // @ts-expect-error deliberately malformed for the throw check
  expect(() => announceUnlock(null)).not.toThrow();
  // @ts-expect-error wrong kind
  expect(() => announceUnlock({ kind: 'bogus', id: 'x' })).not.toThrow();
  // @ts-expect-error non-string id
  expect(() => announceUnlock({ kind: 'achievement', id: 42 })).not.toThrow();
  act(() => vi.advanceTimersByTime(0));
  expect(unlockSnapshot()).toEqual({ items: [], open: false }); // nothing made it into the queue
});

it('holds a catch-up unlock announced before the intro has been dismissed, then opens once dismissed', async () => {
  // ph:intro unset: the first-launch intro has not been seen yet.
  const { announceUnlock, introDismissed, unlockSnapshot } = await freshUnlockModal();
  act(() => announceUnlock({ kind: 'achievement', id: 'first-weekly' }));
  act(() => vi.advanceTimersByTime(5000));
  expect(unlockSnapshot().open).toBe(false); // still blocked by the intro
  expect(unlockSnapshot().items).toEqual([{ kind: 'achievement', id: 'first-weekly' }]);

  // Intro.tsx's real dismiss() writes ph:intro='1' before calling introDismissed(); introDismissed()
  // itself only retries opening against whatever ph:intro currently says, it does not override it.
  localStorage.setItem('ph:intro', '1');
  act(() => introDismissed());
  act(() => vi.advanceTimersByTime(0));
  expect(unlockSnapshot().open).toBe(true); // opens immediately, no further delay
});

it('introDismissed() alone does not open the card while ph:intro is still unset', async () => {
  const { announceUnlock, introDismissed, unlockSnapshot } = await freshUnlockModal();
  act(() => announceUnlock({ kind: 'achievement', id: 'first-weekly' }));
  act(() => introDismissed()); // called without ph:intro ever having been set to '1'
  act(() => vi.advanceTimersByTime(5000));
  expect(unlockSnapshot().open).toBe(false);
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

it('ignores a malformed announced item instead of crashing the mounted host', async () => {
  localStorage.setItem('ph:intro', '1');
  const { announceUnlock } = await mountHost();
  // @ts-expect-error deliberately malformed
  expect(() => act(() => announceUnlock(null))).not.toThrow();
  act(() => vi.advanceTimersByTime(0));
  expect(container.textContent).toBe('');
});

it('auto-dismisses (and releases the back guard) if every queued id turns out unrecognised', async () => {
  localStorage.setItem('ph:intro', '1');
  const { announceUnlock, back, unlockSnapshot } = await mountHost();
  // Both ids are well-formed but not in the catalogue, e.g. from a newer client build.
  act(() => announceUnlock({ kind: 'achievement', id: 'not-a-real-achievement' }));
  act(() => vi.advanceTimersByTime(0));
  expect(container.textContent).toBe('');
  expect(unlockSnapshot()).toEqual({ items: [], open: false });
  // The back guard must not have been left pushed on top of whatever was there before.
  expect(back.handleBackPress(true)).toBe('back');
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

it('closing the card clears any confetti still on screen', async () => {
  localStorage.setItem('ph:intro', '1');
  const { announceUnlock } = await mountHost();
  act(() => announceUnlock({ kind: 'achievement', id: 'first-weekly' }));
  act(() => vi.advanceTimersByTime(0));
  expect(confettiFire).toHaveBeenCalledTimes(1);
  const nice = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Nice!')!;
  act(() => nice.click());
  expect(confettiFire.reset).toHaveBeenCalledTimes(1);
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
  const confetti = confettiFire;
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
    const confetti = confettiFire;
    const { announceUnlock } = await mountHost();
    act(() => announceUnlock({ kind: 'achievement', id: 'first-weekly' }));
    act(() => vi.advanceTimersByTime(0));
    expect(confetti).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  } finally {
    globalThis.matchMedia = original;
  }
});
