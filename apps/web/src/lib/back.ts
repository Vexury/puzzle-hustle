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

// Callers push exactly once, typically from a mount-only effect ([] or a rarely-changing
// dependency array), and keep whatever the guard should currently do in a ref they reassign
// every render (Play.tsx, Intro.tsx both do this): the closure passed here just reads that ref.
// pushBackGuard() itself must never be called again on every render for the same logical
// guard — doing so (as an earlier version of this file did, via a since-removed setBackGuard
// single-slot shim) would move it to the top of the stack each time, letting it jump back above
// a guard something else (the unlock modal) had since pushed on top of it.
export function pushBackGuard(fn: Guard): () => void {
  stack.push(fn);
  return () => {
    const i = stack.indexOf(fn);
    if (i !== -1) stack.splice(i, 1);
  };
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
