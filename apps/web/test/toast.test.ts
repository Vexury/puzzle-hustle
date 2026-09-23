import { expect, it } from 'vitest';
import { toastDuration } from '../src/components/Toast.tsx';

it('keeps a short message up for a little under two and a half seconds', () => {
  expect(toastDuration('Reported')).toBe(1800 + 8 * 40);
});

it('gives a longer message more time to be read', () => {
  const text = 'Finish all 50 Zip levels on Hard.';
  expect(toastDuration(text)).toBe(1800 + text.length * 40);
});

it('never stays longer than four seconds', () => {
  expect(toastDuration('x'.repeat(500))).toBe(4000);
});
