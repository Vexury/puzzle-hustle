import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

const migrations = await readD1Migrations('./migrations');

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        d1Databases: ['DB'],
        bindings: {
          TEST_MIGRATIONS: migrations,
          SESSION_SECRET: 'test-secret',
          GOOGLE_CLIENT_IDS: 'test-client-id',
          APPLE_AUDIENCES: 'test.bundle.id',
          APPLE_TEAM_ID: 'TEAMID1234',
          APPLE_KEY_ID: 'KEYID12345',
          APPLE_SIGNIN_KEY: 'test-key',
        },
      },
    }),
  ],
});
