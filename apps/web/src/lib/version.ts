import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

declare const __BUILD__: string;
// The commit the bundle was built from, also the tag on usage events.
export const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';

// What testers quote when they report something: the store version and build in the apps
// (versionName and versionCode on Android), the commit on the web.
export async function appVersion(): Promise<string> {
  if (!Capacitor.isNativePlatform()) return `Web ${BUILD}`;
  const info = await App.getInfo();
  return `Version ${info.version} (${info.build})`;
}
