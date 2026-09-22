import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.vexury.puzzlehustle',
  appName: 'Puzzle Hustle',
  webDir: 'dist',
  android: { allowMixedContent: false },
  ios: { contentInset: 'automatic' },
  plugins: {
    // Google on Android, Apple on iOS (decision 2026-09-22); the rest stay out of the binaries.
    SocialLogin: {
      providers: { google: true, apple: true, facebook: false, twitter: false },
      logLevel: 1,
    },
  },
};

export default config;
