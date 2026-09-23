import { expect, it } from 'vitest';
import { handleBackPress, pushBackGuard } from '../src/lib/back.ts';

// initBackButton() itself just wires handleBackPress to the native listener and isn't tested
// here (it needs a native platform); these exercise the stack and its LIFO handling directly.
// Guards are held in module scope, so every test pushes and pops its own, leaving the stack
// empty for the next one, rather than relying on a reset hook.

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

// Play.tsx and Intro.tsx each push exactly once (a mount-only, or rarely-changing-dependency
// effect) and keep the actual handler in a ref they reassign every render, rather than calling
// pushBackGuard() again on every render. This reproduces that real pattern end to end: a guard
// pushed once, "re-rendered" several times by only swapping what its delegate ref points at
// (never popped and re-pushed), with a second guard pushed on top of it partway through.
it('a guard pushed once and updated only through a ref across re-renders (the Play/Intro pattern) never moves in the stack', () => {
  const calls: string[] = [];
  let delegate = () => {
    calls.push('legacy-v1');
    return true;
  };
  const removeLegacy = pushBackGuard(() => delegate());

  const removeModal = pushBackGuard(() => {
    calls.push('modal');
    return true;
  });

  // Re-renders: only the ref's target changes, pushBackGuard is never called again for this
  // guard. Mirrors Play.tsx re-rendering every 500ms while its clock ticks, and Intro.tsx
  // re-rendering on every card change, while the modal is open on top of either.
  delegate = () => {
    calls.push('legacy-v2');
    return true;
  };
  delegate = () => {
    calls.push('legacy-v3');
    return true;
  };

  expect(handleBackPress(true)).toBe('guarded');
  expect(calls).toEqual(['modal']); // the modal's guard wins, not the legacy one underneath it

  removeModal();
  expect(handleBackPress(true)).toBe('guarded');
  expect(calls).toEqual(['modal', 'legacy-v3']); // now sees the latest delegate, still in place

  removeLegacy();
  expect(handleBackPress(true)).toBe('back');
});
