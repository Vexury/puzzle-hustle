import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

// A guard returns true when it has handled the press itself. Registering a listener at all
// takes the back button away from the native layer, so the default has to be rebuilt here.
let guard: (() => boolean) | null = null;

export function setBackGuard(fn: (() => boolean) | null): void {
  guard = fn;
}

export function initBackButton(): void {
  if (!Capacitor.isNativePlatform()) return;
  void App.addListener('backButton', ({ canGoBack }) => {
    if (guard?.()) return;
    if (canGoBack) history.back();
    else void App.exitApp();
  });
}
