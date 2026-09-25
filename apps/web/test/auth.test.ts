import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { writeSession } from '../src/lib/api.ts';
import { sessionSnapshot, signOut } from '../src/lib/auth.ts';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('sees a session restored straight into storage after the module loaded', () => {
  expect(sessionSnapshot()).toBeNull();
  localStorage.setItem('ph:session', JSON.stringify({ token: 't', player: { id: 'p', name: 'Moritz' } }));
  expect(sessionSnapshot()?.player.id).toBe('p');
  expect(sessionSnapshot()).toBe(sessionSnapshot());
});

it('forgets the local name on sign-out so the next account does not inherit it', () => {
  writeSession({ token: 't', player: { id: 'p', name: 'Moritz' } });
  localStorage.setItem('ph:name', 'Moritz');
  signOut();
  expect(localStorage.getItem('ph:name')).toBeNull();
  expect(localStorage.getItem('ph:previousPlayer')).toBe('p');
  expect(sessionSnapshot()).toBeNull();
});
