import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

// A guard returns true when it has handled the press itself. Registering a listener at all
// takes the back button away from the native layer, so the default has to be rebuilt here.
type Guard = () => boolean;

// Guards form a stack: only the most recently pushed one is consulted. This lets an overlay
// opened on top of a screen that already holds a guard (Play's leave-ask, Intro's card-back)
// take the back button away from it while it's open, and hand it back automatically once it
// closes, just by removing itself from the stack.
const stack: Guard[] = [];

export function pushBackGuard(fn: Guard): () => void {
  stack.push(fn);
  return () => {
    const i = stack.indexOf(fn);
    if (i !== -1) stack.splice(i, 1);
  };
}

// Legacy single-slot API, kept for callers that only ever hold one guard of their own at a
// time (Play.tsx, Intro.tsx): setBackGuard(fn) replaces whatever this caller previously held
// on the stack, setBackGuard(null) releases it. Both go through pushBackGuard, so a guard
// pushed on top by something else (the unlock modal) still wins over it.
let releaseLegacy: (() => void) | null = null;

export function setBackGuard(fn: Guard | null): void {
  releaseLegacy?.();
  releaseLegacy = fn ? pushBackGuard(fn) : null;
}

// The decision a back press resolves to, exercised directly in back.test.ts without the
// native listener plumbing below.
export function handleBackPress(canGoBack: boolean): 'guarded' | 'back' | 'exit' {
  const top = stack[stack.length - 1];
  if (top?.()) return 'guarded';
  return canGoBack ? 'back' : 'exit';
}

export function initBackButton(): void {
  if (!Capacitor.isNativePlatform()) return;
  void App.addListener('backButton', ({ canGoBack }) => {
    const outcome = handleBackPress(canGoBack);
    if (outcome === 'back') history.back();
    else if (outcome === 'exit') void App.exitApp();
  });
}
