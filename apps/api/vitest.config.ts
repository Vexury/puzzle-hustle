import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

const migrations = await readD1Migrations('./migrations');

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        singleWorker: true,
        miniflare: {
          d1Databases: ['DB'],
          bindings: {
            TEST_MIGRATIONS: migrations,
            SESSION_SECRET: 'test-secret',
            GOOGLE_CLIENT_IDS: 'test-client-id',
          },
        },
      },
    },
  },
});
