import { expect, it, vi } from 'vitest';
import { href } from '../src/lib/router.ts';
import { joinUrl } from '../src/lib/share.ts';

it('builds a join link from the page origin on the web', () => {
  expect(joinUrl('ABC123')).toBe(`${location.origin}${href('/join')}?c=ABC123`);
});

it('uses the fixed share origin instead of the WebView-internal one when native', async () => {
  vi.resetModules();
  vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
  const { joinUrl: nativeJoinUrl } = await import('../src/lib/share.ts');
  expect(nativeJoinUrl('ABC123')).toBe('https://puzzles.vexury.dev/join?c=ABC123');
  vi.doUnmock('@capacitor/core');
  vi.resetModules();
});
