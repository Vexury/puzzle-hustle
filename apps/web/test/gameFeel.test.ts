import { expect, it } from 'vitest';
import { justSolved } from '../src/pages/Daily.tsx';

it('treats a solve from the last half minute as just solved, so its check and stars pop once', () => {
  const now = Date.parse('2026-09-30T18:00:00Z');
  expect(justSolved({ solvedAt: '2026-09-30T17:59:45Z' }, now)).toBe(true);
  expect(justSolved({ solvedAt: '2026-09-30T17:59:00Z' }, now)).toBe(false);
});
