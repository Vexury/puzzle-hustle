import { beforeEach, expect, it } from 'vitest';
import { handleBackPress, pushBackGuard, setBackGuard } from '../src/lib/back.ts';

// initBackButton() itself just wires handleBackPress to the native listener and isn't tested
// here (it needs a native platform); these exercise the stack and its LIFO handling directly.

beforeEach(() => {
  // Guards are held in module scope so a leftover from one test would otherwise bleed into
  // the next; each test pushes and pops its own.
});

it('with no guard registered, a back press is not handled', () => {
  expect(handleBackPress(true)).toBe('back');
  expect(handleBackPress(false)).toBe('exit');
});

it('a pushed guard that returns true handles the press instead of navigating', () => {
  const remove = pushBackGuard(() => true);
  expect(handleBackPress(true)).toBe('guarded');
  remove();
});

it('a pushed guard that returns false falls through to the default behaviour', () => {
  const remove = pushBackGuard(() => false);
  expect(handleBackPress(true)).toBe('back');
  remove();
});

it('the most recently pushed guard wins over an older one still on the stack', () => {
  const removeOuter = pushBackGuard(() => true);
  const inner: boolean[] = [];
  const removeInner = pushBackGuard(() => {
    inner.push(true);
    return true;
  });
  expect(handleBackPress(true)).toBe('guarded');
  expect(inner).toEqual([true]); // the inner guard ran, not the outer one
  removeInner();
  // With the inner guard gone, the outer guard (still on the stack) takes back button presses.
  expect(handleBackPress(true)).toBe('guarded');
  removeOuter();
});

it('removing a guard restores whatever was beneath it', () => {
  const removeOuter = pushBackGuard(() => true);
  const removeInner = pushBackGuard(() => true);
  removeInner();
  expect(handleBackPress(true)).toBe('guarded');
  removeOuter();
  expect(handleBackPress(true)).toBe('back');
});

it('removing the same guard twice is a no-op', () => {
  const remove = pushBackGuard(() => true);
  remove();
  remove();
  expect(handleBackPress(true)).toBe('back');
});

it('setBackGuard(fn) still works as a single slot for existing callers', () => {
  setBackGuard(() => true);
  expect(handleBackPress(true)).toBe('guarded');
  setBackGuard(null);
  expect(handleBackPress(true)).toBe('back');
});

it('a fresh setBackGuard call replaces its own previous guard, not just adds to the stack', () => {
  setBackGuard(() => true);
  setBackGuard(() => false);
  expect(handleBackPress(true)).toBe('back');
  setBackGuard(null);
});

it('setBackGuard sits beneath a guard pushed on top of it', () => {
  setBackGuard(() => true);
  const removeModal = pushBackGuard(() => true);
  expect(handleBackPress(true)).toBe('guarded');
  removeModal();
  // The legacy guard is still there underneath once the modal's guard is gone.
  expect(handleBackPress(true)).toBe('guarded');
  setBackGuard(null);
  expect(handleBackPress(true)).toBe('back');
});
