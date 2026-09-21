import { expect, it, vi } from 'vitest';
import { joinUrl, puzzleUrl } from '../src/lib/share.ts';

it('builds a join link from the public address, not from wherever this copy runs', () => {
  // jsdom serves the page from http://localhost:3000, which is exactly the kind of origin a
  // recipient cannot open. The link must not inherit it.
  expect(location.origin).not.toBe('https://puzzles.vexury.dev');
  expect(joinUrl('ABC123')).toBe('https://puzzles.vexury.dev/join?c=ABC123');
});

it('builds a puzzle link the same way', () => {
  const url = puzzleUrl({ type: 'sudoku', difficulty: 'easy', seed: 1, period: 'daily', key: '2026-09-22' });
  expect(url.startsWith('https://puzzles.vexury.dev/play?')).toBe(true);
});

it('does not change when running natively', async () => {
  vi.resetModules();
  vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
  const { joinUrl: nativeJoinUrl } = await import('../src/lib/share.ts');
  expect(nativeJoinUrl('ABC123')).toBe('https://puzzles.vexury.dev/join?c=ABC123');
  vi.doUnmock('@capacitor/core');
  vi.resetModules();
});
