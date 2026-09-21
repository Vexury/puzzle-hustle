import { PUZZLE_META, encodeRef, type PuzzleRef } from '@puzzle-hustle/core';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import type { SolveRecord } from './storage.ts';
import { href } from './router.ts';

// A shared link exists to be opened on somebody else's device, so it is always built from
// the app's public address and never from wherever this copy happens to be running.
// `location.origin` is right only when that is already the public address: in the Capacitor
// WebView it is https://localhost, on a dev server it is localhost:5173, and on a preview
// deploy it is something nobody else can reach. The WebView version of this shipped once,
// and it took a tester sending the broken message back to notice.
const SHARE_ORIGIN = 'https://puzzles.vexury.dev';

export function puzzleUrl(ref: PuzzleRef): string {
  return `${SHARE_ORIGIN}${href('/play')}?${encodeRef(ref)}`;
}

export function joinUrl(code: string): string {
  return `${SHARE_ORIGIN}${href('/join')}?c=${code}`;
}

export function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

export function periodLabel(ref: PuzzleRef): string {
  if (ref.level) return `${capitalize(ref.difficulty)} · Level ${ref.level}`;
  if (!ref.period || !ref.key) return capitalize(ref.difficulty);
  return `${capitalize(ref.period)} ${ref.key}`;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function shareText(ref: PuzzleRef, record?: SolveRecord): string {
  const name = PUZZLE_META[ref.type].name;
  const head = `Puzzle Hustle · ${name} · ${periodLabel(ref)}`;
  if (!record) return `${head}\nCan you solve it?\n${puzzleUrl(ref)}`;
  const hints = record.hints === 0 ? 'no hints' : `${record.hints} hint${record.hints === 1 ? '' : 's'}`;
  return `${head}\n✔ ${formatSeconds(record.seconds)} · ${hints}\n${puzzleUrl(ref)}`;
}

// Dismissing the share sheet is a decision, not an error, and must stay silent.
function wasCancelled(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  return err instanceof Error && /cancel/i.test(err.message);
}

// `text` already ends with the link. Passing it as `url` as well makes Android append it
// a second time.
export async function share(text: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({ text, dialogTitle: 'Share puzzle' });
      return 'shared';
    } catch (err) {
      return wasCancelled(err) ? 'cancelled' : 'failed';
    }
  }
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (err) {
      if (wasCancelled(err)) return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
