import { useEffect, useSyncExternalStore } from 'react';
import confetti from 'canvas-confetti';
import { ACHIEVEMENTS, ACHIEVEMENT_COINS, findCosmetic } from '@puzzle-hustle/core';
import { pushBackGuard } from '../lib/back.ts';
import { equip, useEquipped } from '../lib/coins.ts';
import { requirementText } from '../lib/flairs.ts';
import * as haptics from '../lib/haptics.ts';
import { INTRO_SEEN_KEY, readSetting } from '../lib/storage.ts';

export type UnlockItem = { kind: 'achievement'; id: string } | { kind: 'flair'; id: string };

function isUnlockItem(value: unknown): value is UnlockItem {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (v.kind === 'achievement' || v.kind === 'flair') && typeof v.id === 'string';
}

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

interface UnlockState {
  items: UnlockItem[];
  open: boolean;
}

let unlockState: UnlockState = { items: [], open: false };
// True from the moment main.tsx calls markUnlocksLive() (right after the app-start catch-up
// sync), for the rest of the session. Decides the delay for the *next* batch that starts
// forming (see batchIsLive below): app-start catch-up unlocks are announced before this flips
// and open as soon as possible; a solve is always announced after, and waits OPEN_DELAY_MS so
// the solved screen itself is seen first.
let live = false;
// Captured once, when a new (previously empty, closed) batch receives its first item, rather
// than re-read whenever the batch actually gets to open: intro-blocking can defer opening far
// past the moment the batch started, and by then `live` may already be true even for a genuine
// catch-up batch that merely had to wait for the intro to close.
let batchIsLive = false;
let openTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

// Read fresh every time rather than cached: main.tsx's restoreBackup() can write ph:intro (from
// a native backup) after this module has already been imported and evaluated, so an import-time
// snapshot would wrongly stay "blocked" forever whenever that happens on a reinstall.
function introShowing(): boolean {
  return readSetting(INTRO_SEEN_KEY) !== '1';
}

function tryOpen() {
  if (unlockState.open || unlockState.items.length === 0 || introShowing() || openTimer !== null) return;
  const delay = batchIsLive ? OPEN_DELAY_MS : 0;
  openTimer = setTimeout(() => {
    openTimer = null;
    if (introShowing() || unlockState.items.length === 0) return;
    unlockState = { ...unlockState, open: true };
    notify();
  }, delay);
}

// Never throws: an unlock is never worth breaking a solve or an app start over. Silently drops
// anything that is not a well-formed UnlockItem, so a malformed id can never reach
// buildUnlockRows and crash the host's render.
export function announceUnlock(item: UnlockItem): void {
  try {
    if (!isUnlockItem(item)) return;
    if (unlockState.items.length === 0 && !unlockState.open) batchIsLive = live;
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
  cannon?.reset();
  unlockState = { items: [], open: false };
  notify();
}

// Called once by main.tsx right after the app-start sync (syncAchievements()/syncFlairs()) has
// had its chance to announce any catch-up unlocks. Everything announced from here on (in
// practice, always from a solve) counts as "live" and gets the OPEN_DELAY_MS delay.
export function markUnlocksLive(): void {
  live = true;
}

// Called by Intro.tsx once the player closes the first-launch overlay, so a catch-up unlock
// that had to wait for it is free to open right away rather than waiting for OPEN_DELAY_MS too.
export function introDismissed(): void {
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

const FALLBACK_ACCENT = '#ffa833';
const HEX_RE = /^#?([0-9a-f]{6})$/i;

// canvas-confetti's own colour parsing only understands hex (its hexToRgb strips any non-hex
// character first), so an rgb(...) string silently turns into the wrong colour instead of
// throwing. Every value returned here is #rrggbb.
function normalizeHex(value: string): string | null {
  const m = HEX_RE.exec(value.trim());
  return m ? `#${m[1]!.toLowerCase()}` : null;
}

function lighten(hex: string, amount: number): string {
  const mix = (start: number) => Math.round(start + (255 - start) * amount);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const toHex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

// Pure and exported for direct testing: the base accent plus two lighter tints, all #rrggbb. An
// unparseable input (a computed CSS value in some other, unexpected format) falls back to the
// default accent rather than handing canvas-confetti something it cannot use.
export function accentTints(rawAccent: string): [string, string, string] {
  const accent = normalizeHex(rawAccent) ?? FALLBACK_ACCENT;
  return [accent, lighten(accent, 0.35), lighten(accent, 0.65)];
}

// Own instance without the library's default worker: in the Android WebView the worker's
// requestAnimationFrame could stall mid-burst while the app stayed in the foreground, leaving the
// last frame frozen on screen until the app was minimised and resumed. On the main thread the
// loop follows the page. Created lazily, on the first burst.
let cannon: confetti.CreateTypes | null = null;

// zIndex one below .unlock-ask (62): the burst sits behind the card, showing through the
// dimmed backdrop, rather than covering the card's own text.
function fireConfetti() {
  const colors = accentTints(getComputedStyle(document.documentElement).getPropertyValue('--accent'));
  cannon ??= confetti.create(undefined, { resize: true, useWorker: false });
  void cannon({ particleCount: 90, spread: 70, startVelocity: 42, ticks: 130, origin: { y: 0.35 }, colors, zIndex: 61, disableForReducedMotion: true });
}

// -- Host ------------------------------------------------------------------------------------

export function UnlockModalHost() {
  const { items, open } = useSyncExternalStore(subscribe, unlockSnapshot);
  const equipped = useEquipped();
  const rows = open ? buildUnlockRows(items, equipped.flair) : [];
  // open can be true with no rows to show when every queued id turns out unrecognised (e.g. a
  // newer client's ids reaching an older build); dismiss rather than sit open with nothing to
  // show and a back guard nobody can see.
  const visible = open && rows.length > 0;

  useEffect(() => {
    if (open && rows.length === 0) dismissUnlocks();
  }, [open, rows.length]);

  useEffect(() => {
    if (!visible) return;
    return pushBackGuard(() => {
      dismissUnlocks();
      return true;
    });
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    haptics.solved();
    if (!reducedMotion()) fireConfetti();
  }, [visible]);

  if (!visible) return null;

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
        <b className={row.kind === 'flair' ? 'unlock-title unlock-flair-title' : 'unlock-title'}>{row.title}</b>
        {row.kind === 'achievement' ? (
          <>
            <span className="muted unlock-desc">{row.description}</span>
            <span className="coin-line">{row.coinsText}</span>
          </>
        ) : (
          <>
            <span className="muted unlock-desc">{row.description}</span>
            <span className="unlock-flair-action">{row.equipped ? '✓ Equipped' : 'Tap to wear'}</span>
          </>
        )}
      </span>
    </>
  );
}
