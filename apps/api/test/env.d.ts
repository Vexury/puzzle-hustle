import type { D1Migration } from '@cloudflare/vitest-pool-workers';
import type { Env as ApiEnv } from '../src/http.ts';

declare global {
  namespace Cloudflare {
    interface Env extends ApiEnv {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
