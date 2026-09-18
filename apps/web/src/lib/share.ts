import { PUZZLE_META, encodeRef, type PuzzleRef } from '@puzzle-hustle/core';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import type { SolveRecord } from './storage.ts';
import { href } from './router.ts';

export function puzzleUrl(ref: PuzzleRef): string {
  return `${location.origin}${href('/play')}?${encodeRef(ref)}`;
}

export function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

export function periodLabel(ref: PuzzleRef): string {
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

export async function share(text: string, url: string): Promise<'shared' | 'copied' | 'failed'> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({ text, url, dialogTitle: 'Share puzzle' });
      return 'shared';
    } catch {
      return 'failed';
    }
  }
  if (navigator.share) {
    try {
      await navigator.share({ text, url });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'failed';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
