import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.vexury.puzzlehustle',
  appName: 'Puzzle Hustle',
  webDir: 'dist',
  android: { allowMixedContent: false },
  // The CSS pads for the safe areas itself; 'automatic' inset them a second time and made the
  // web view scrollable by that amount, shifting the page down and leaving the bottom dead to taps.
  ios: { contentInset: 'never' },
  plugins: {
    // Google on Android, Apple on iOS (decision 2026-09-22); the rest stay out of the binaries.
    SocialLogin: {
      providers: { google: true, apple: true, facebook: false, twitter: false },
      logLevel: 1,
    },
  },
};

export default config;
