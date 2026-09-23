import { useEffect, useSyncExternalStore } from 'react';
import confetti from 'canvas-confetti';
import { ACHIEVEMENTS, ACHIEVEMENT_COINS, findCosmetic } from '@puzzle-hustle/core';
import { pushBackGuard } from '../lib/back.ts';
import { equip, useEquipped } from '../lib/coins.ts';
import { requirementText } from '../lib/flairs.ts';
import * as haptics from '../lib/haptics.ts';
import { readSetting } from '../lib/storage.ts';

export type UnlockItem = { kind: 'achievement'; id: string } | { kind: 'flair'; id: string };

export interface UnlockRow {
  key: string;
  kind: 'achievement' | 'flair';
  id: string;
  title: string;
  description: string;
  coinsText: string | null;
  equipped: boolean;
}

// Pure: turns the queued unlocks into what the card shows, looking titles/descriptions up in
// the catalogue itself rather than trusting whatever syncAchievements/syncFlairs pass along. An
// id from a newer client build that this one does not recognise is dropped rather than shown
// blank.
export function buildUnlockRows(items: readonly UnlockItem[], equippedFlairId: string | null): UnlockRow[] {
  const rows: UnlockRow[] = [];
  for (const item of items) {
    if (item.kind === 'achievement') {
      const achievement = ACHIEVEMENTS.find((a) => a.id === item.id);
      if (!achievement) continue;
      rows.push({
        key: `achievement:${item.id}`,
        kind: 'achievement',
        id: item.id,
        title: achievement.title,
        description: achievement.description,
        coinsText: `+${ACHIEVEMENT_COINS} coins`,
        equipped: false,
      });
    } else {
      const flair = findCosmetic(item.id);
      if (!flair || flair.kind !== 'flair') continue;
      rows.push({
        key: `flair:${item.id}`,
        kind: 'flair',
        id: item.id,
        title: flair.title,
        description: requirementText(flair),
        coinsText: null,
        equipped: equippedFlairId === item.id,
      });
    }
  }
  return rows;
}

// -- Queue -----------------------------------------------------------------------------------
// Module-scope store, same shape as the old AchievementBanner's single `enqueue` slot but able
// to hold several unlocks in one card. syncAchievements()/syncFlairs() call announceUnlock()
// both right after a solve (Play.tsx) and at app start (main.tsx, before React has rendered
// anything), so items are always buffered here regardless of whether the host has mounted yet,
// instead of being dropped when nothing is listening.

const OPEN_DELAY_MS = 800;
const INTRO_SEEN_KEY = 'ph:intro';

interface UnlockState {
  items: UnlockItem[];
  open: boolean;
}

let unlockState: UnlockState = { items: [], open: false };
// True once the card has opened at least once this session: the very first opening (typically
// app-start catch-up) happens as soon as possible, everything after that (typically a solve)
// waits OPEN_DELAY_MS so the solved screen itself is seen first.
let everOpened = false;
// Read once, synchronously, at import time (before React has painted anything), rather than
// waited on via a mount effect: Intro.tsx and this module both attach at the same moment, and a
// mount-order race would risk the card flashing open underneath the first-launch intro for a
// frame. Intro.tsx calls introDismissed() once the player actually closes it.
let introBlocked = readSetting(INTRO_SEEN_KEY) !== '1';
let openTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function tryOpen() {
  if (unlockState.open || unlockState.items.length === 0 || introBlocked || openTimer !== null) return;
  openTimer = setTimeout(
    () => {
      openTimer = null;
      if (introBlocked || unlockState.items.length === 0) return;
      everOpened = true;
      unlockState = { ...unlockState, open: true };
      notify();
    },
    everOpened ? OPEN_DELAY_MS : 0,
  );
}

// Never throws: an unlock is never worth breaking a solve or an app start over.
export function announceUnlock(item: UnlockItem): void {
  try {
    unlockState = { ...unlockState, items: [...unlockState.items, item] };
    notify();
    tryOpen();
  } catch {
    /* an unlock is never worth breaking a solve or app start over */
  }
}

export function dismissUnlocks(): void {
  if (openTimer !== null) {
    clearTimeout(openTimer);
    openTimer = null;
  }
  unlockState = { items: [], open: false };
  notify();
}

// Called by Intro.tsx once the player closes the first-launch overlay, so a catch-up unlock
// (or one earned mid-intro, though nothing can be earned before a puzzle is even shown) is free
// to open right away rather than waiting for OPEN_DELAY_MS on top.
export function introDismissed(): void {
  introBlocked = false;
  tryOpen();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function unlockSnapshot(): UnlockState {
  return unlockState;
}

// -- Confetti ---------------------------------------------------------------------------------

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function lighten(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  const [, r, g, b] = m as unknown as [string, string, string, string];
  const mix = (c: string) => Math.round(parseInt(c, 16) + (255 - parseInt(c, 16)) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

// zIndex one below .unlock-ask (62): the burst sits behind the card, showing through the
// dimmed backdrop, rather than covering the card's own text.
function fireConfetti() {
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#FFA833';
  const colors = [accent.trim(), lighten(accent, 0.35), lighten(accent, 0.65)];
  void confetti({ particleCount: 90, spread: 70, startVelocity: 42, ticks: 130, origin: { y: 0.35 }, colors, zIndex: 61, disableForReducedMotion: true });
}

// -- Host ------------------------------------------------------------------------------------

export function UnlockModalHost() {
  const { items, open } = useSyncExternalStore(subscribe, unlockSnapshot);
  const equipped = useEquipped();

  useEffect(() => {
    if (!open) return;
    return pushBackGuard(() => {
      dismissUnlocks();
      return true;
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    haptics.solved();
    if (!reducedMotion()) fireConfetti();
  }, [open]);

  if (!open) return null;
  const rows = buildUnlockRows(items, equipped.flair);
  if (rows.length === 0) return null;

  return (
    <div className="ad-ask unlock-ask" role="dialog" aria-modal="true" aria-label="Unlocked">
      <div className={rows.length === 1 ? 'card-lg unlock-card unlock-single' : 'card-lg unlock-card'}>
        <ul className="unlock-list">
          {rows.map((row) =>
            row.kind === 'achievement' ? (
              <li key={row.key} className="unlock-row">
                <UnlockRowBody row={row} />
              </li>
            ) : (
              <li key={row.key}>
                <button
                  type="button"
                  className="unlock-row"
                  onClick={() => equip('flair', row.id)}
                  aria-label={`${row.title}, ${row.equipped ? 'equipped' : 'tap to wear'}`}
                >
                  <UnlockRowBody row={row} />
                </button>
              </li>
            ),
          )}
        </ul>
        <div className="ad-ask-row">
          <button type="button" className="pill" onClick={() => dismissUnlocks()}>
            Nice!
          </button>
        </div>
      </div>
    </div>
  );
}

function UnlockRowBody({ row }: { row: UnlockRow }) {
  return (
    <>
      <span className="unlock-mark" aria-hidden="true">
        {row.kind === 'achievement' ? '★' : '♦'}
      </span>
      <span className="unlock-text">
        <span className="unlock-eyebrow">{row.kind === 'achievement' ? 'Achievement unlocked' : 'Flair unlocked'}</span>
        <b className={row.kind === 'flair' ? 'unlock-title leaderboard-flair' : 'unlock-title'}>{row.title}</b>
        {row.kind === 'achievement' ? (
          <>
            <span className="muted unlock-desc">{row.description}</span>
            <span className="coin-line">{row.coinsText}</span>
          </>
        ) : (
          <span className={row.equipped ? 'unlock-desc unlock-equipped' : 'muted unlock-desc'}>{row.equipped ? 'Equipped' : row.description}</span>
        )}
      </span>
    </>
  );
}
