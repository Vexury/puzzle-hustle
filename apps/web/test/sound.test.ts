import { beforeEach, expect, it } from 'vitest';
import { setVolume, volume } from '../src/lib/sound.ts';

beforeEach(() => localStorage.clear());

it('starts both volumes at full so existing players hear no change', () => {
  expect(volume('moves')).toBe(100);
  expect(volume('feedback')).toBe(100);
});

it('keeps each volume separately', () => {
  setVolume('moves', 35);
  expect(volume('moves')).toBe(35);
  expect(volume('feedback')).toBe(100);
});

it('falls back or clamps when the stored value is broken', () => {
  localStorage.setItem('ph:volMoves', 'loud');
  localStorage.setItem('ph:volFeedback', '250');
  expect(volume('moves')).toBe(100);
  expect(volume('feedback')).toBe(100);
});
