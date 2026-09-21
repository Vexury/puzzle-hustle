# Daily Leaderboard (web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the group leaderboard end to end on the web: a Cloudflare Worker with D1, optional Google sign-in, groups joined by code, and daily/weekly/monthly boards fed by an offline-tolerant submission queue.

**Architecture:** A new workspace package `apps/api` holds a dependency-free Worker that owns every rule (first submission wins, period validity, plausibility floor, rate limit, name validation). `packages/core` gains two small pure modules the Worker and the app share. `apps/web` gets a thin API client, a sign-in module, a score queue that survives being offline, and three pieces of UI.

**Tech Stack:** TypeScript 7.0.2, Cloudflare Workers + D1 + Wrangler, Vitest 5 (`@cloudflare/vitest-pool-workers` for the Worker), React 19.3 with the React Compiler, Google Identity Services on the web (script tag, no npm package).

**Spec:** `docs/superpowers/specs/2026-09-21-daily-leaderboard-design.md`

## Scope

This plan covers milestones 1 to 4 of the spec. It ends with a working leaderboard on https://puzzles.vexury.dev and needs **no Play release at all**. Native Google sign-in (milestone 5), the compliance package (milestone 6) and Apple/iOS (milestone 7) get their own plans afterwards.

## Global Constraints

- pnpm 12.4.2, Node >= 24, TypeScript 7.0.2, Vitest 5.0.1. Newest versions of anything newly added (`pnpm add -D wrangler@latest`), never a pinned guess.
- `packages/core` stays DOM-free and dependency-free. Everything added there must run unchanged in a Worker.
- All user-visible strings are English. Puzzle names, difficulties and Daily/Weekly/Monthly come from `PUZZLE_META` and stay as they are.
- Every UI change must work in light and dark (`[data-theme]`) and use the tokens in `apps/web/src/theme.css`. Another session may be editing `theme.css`, `Profile.tsx`, `main.tsx` and `accent.ts` in parallel: **re-read any of those four files immediately before editing them**.
- Offline is a product promise. No puzzle, no screen and no navigation may ever block on the network. Every network failure is silent.
- The Worker stores provider, subject and name for a player. The e-mail address from the ID token is read for verification and never written.
- Stage files explicitly (`git add <paths>`), never `git add -A`. Commit subjects follow the repo style: imperative, plain English, no `feat:`/`fix:` prefixes. End each commit body, after a blank line, with the prose sentence `Implemented with assistance from Claude Opus 5.` Never a `Co-Authored-By` trailer.
- Verify before claiming done: `pnpm test`, `pnpm -r typecheck`, and for UI work a browser check with `pnpm dev`.

---

### Task 1: Core puzzle-id parsing and plausibility floors

Two pure modules the Worker needs before it can judge a submission. `refId()` already produces `type:period:key` for period puzzles; this task is the inverse plus the guard rails.

**Files:**
- Create: `packages/core/src/puzzleId.ts`
- Create: `packages/core/src/plausibility.ts`
- Modify: `packages/core/src/index.ts` (two new export lines)
- Test: `packages/core/test/puzzleId.test.ts`, `packages/core/test/plausibility.test.ts`

**Interfaces:**
- Consumes: `PuzzleTypeId`, `Period`, `Difficulty`, `isPuzzleTypeId`, `isPeriod` from `./types.ts`; `periodDifficulty`, `nextPeriodStart` from `./schedule.ts`.
- Produces:
  - `parsePuzzleId(id: string): ParsedPuzzleId | null` with `interface ParsedPuzzleId { type: PuzzleTypeId; period: Period; key: string; difficulty: Difficulty }`
  - `periodEndsAt(period: Period, key: string): Date | null`
  - `minimumSeconds(type: PuzzleTypeId, period: Period): number`

- [ ] **Step 1: Write the failing tests**

`packages/core/test/puzzleId.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parsePuzzleId, periodEndsAt } from '../src/puzzleId.ts';

describe('parsePuzzleId', () => {
  it('reads a daily id and resolves its difficulty', () => {
    expect(parsePuzzleId('sudoku:daily:2026-09-21')).toEqual({
      type: 'sudoku',
      period: 'daily',
      key: '2026-09-21',
      difficulty: 'easy',
    });
  });

  it('resolves the period difficulty for types without a daily override', () => {
    expect(parsePuzzleId('nonogram:daily:2026-09-21')?.difficulty).toBe('medium');
    expect(parsePuzzleId('nonogram:weekly:2026-W39')?.difficulty).toBe('hard');
    expect(parsePuzzleId('nonogram:monthly:2026-09')?.difficulty).toBe('genius');
  });

  it('rejects anything that is not a period puzzle', () => {
    expect(parsePuzzleId('sudoku:level:easy:3')).toBeNull();
    expect(parsePuzzleId('sudoku:medium:1a2b')).toBeNull();
    expect(parsePuzzleId('kakuro:daily:2026-09-21')).toBeNull();
    expect(parsePuzzleId('sudoku:yearly:2026')).toBeNull();
    expect(parsePuzzleId('')).toBeNull();
  });

  it('rejects malformed period keys', () => {
    expect(parsePuzzleId('sudoku:daily:2026-9-21')).toBeNull();
    expect(parsePuzzleId('sudoku:daily:2026-02-30')).toBeNull();
    expect(parsePuzzleId('sudoku:weekly:2026-W54')).toBeNull();
    expect(parsePuzzleId('sudoku:weekly:2025-W53')).toBeNull(); // 2025 has 52 ISO weeks
    expect(parsePuzzleId('sudoku:monthly:2026-13')).toBeNull();
  });
});

describe('periodEndsAt', () => {
  it('ends a daily at the next local midnight', () => {
    const end = periodEndsAt('daily', '2026-09-21')!;
    expect(end.toISOString()).toBe('2026-09-21T22:00:00.000Z');
  });

  it('ends a weekly after its Sunday and a monthly after its last day', () => {
    expect(periodEndsAt('weekly', '2026-W39')!.toISOString()).toBe('2026-09-27T22:00:00.000Z');
    expect(periodEndsAt('monthly', '2026-09')!.toISOString()).toBe('2026-09-30T22:00:00.000Z');
  });

  it('returns null for a malformed key', () => {
    expect(periodEndsAt('daily', 'nonsense')).toBeNull();
  });
});
```

`packages/core/test/plausibility.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PERIODS, PUZZLE_TYPES } from '../src/types.ts';
import { minimumSeconds } from '../src/plausibility.ts';

describe('minimumSeconds', () => {
  it('covers every type and period with a positive floor', () => {
    for (const type of PUZZLE_TYPES) {
      for (const period of PERIODS) {
        const floor = minimumSeconds(type, period);
        expect(floor).toBeGreaterThan(0);
        expect(floor).toBeLessThan(120);
      }
    }
  });

  it('asks for more on longer periods', () => {
    expect(minimumSeconds('sudoku', 'weekly')).toBeGreaterThan(minimumSeconds('sudoku', 'daily'));
    expect(minimumSeconds('sudoku', 'monthly')).toBeGreaterThan(minimumSeconds('sudoku', 'weekly'));
  });

  it('asks for more on a full sudoku than on a small shapes board', () => {
    expect(minimumSeconds('sudoku', 'daily')).toBeGreaterThan(minimumSeconds('shapes', 'daily'));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @puzzle-hustle/core test`
Expected: FAIL, both files, cannot resolve `../src/puzzleId.ts` and `../src/plausibility.ts`.

- [ ] **Step 3: Write `packages/core/src/puzzleId.ts`**

```ts
import { isoWeek, nextPeriodStart, periodDifficulty } from './schedule.ts';
import { isPeriod, isPuzzleTypeId, type Difficulty, type Period, type PuzzleTypeId } from './types.ts';

export interface ParsedPuzzleId {
  type: PuzzleTypeId;
  period: Period;
  key: string;
  difficulty: Difficulty;
}

// A date inside the period the key names, at noon UTC so no time zone can push it into a
// neighbouring day. Returns null for a key that does not describe a real period.
function dateInPeriod(period: Period, key: string): Date | null {
  if (period === 'daily') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const probe = new Date(Date.UTC(y, mo - 1, d, 12));
    if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
    return probe;
  }
  if (period === 'weekly') {
    const m = /^(\d{4})-W(\d{2})$/.exec(key);
    if (!m) return null;
    const [y, w] = [Number(m[1]), Number(m[2])];
    if (w < 1 || w > 53) return null;
    // ISO 8601: week 1 is the week holding 4 January. Walk back to that week's Monday.
    const jan4 = new Date(Date.UTC(y, 0, 4, 12));
    const monday = jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86400000;
    const probe = new Date(monday + (w - 1) * 7 * 86400000);
    // Bounding w to 1..53 is not enough: 2025 has only 52 ISO weeks, so 2025-W53 would
    // otherwise resolve to a date that really belongs to 2026-W01. Round-trip to be sure.
    const computed = isoWeek({ year: probe.getUTCFullYear(), month: probe.getUTCMonth() + 1, day: probe.getUTCDate() });
    if (computed.year !== y || computed.week !== w) return null;
    return probe;
  }
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return new Date(Date.UTC(Number(m[1]), mo - 1, 15, 12));
}

export function parsePuzzleId(id: string): ParsedPuzzleId | null {
  const parts = id.split(':');
  if (parts.length !== 3) return null;
  const [type, period, key] = parts;
  if (!isPuzzleTypeId(type) || !isPeriod(period) || !key) return null;
  if (!dateInPeriod(period, key)) return null;
  return { type, period, key, difficulty: periodDifficulty(type, period) };
}

export function periodEndsAt(period: Period, key: string): Date | null {
  const inside = dateInPeriod(period, key);
  return inside ? nextPeriodStart(period, inside) : null;
}
```

- [ ] **Step 4: Write `packages/core/src/plausibility.ts`**

```ts
import type { Period, PuzzleTypeId } from './types.ts';

// Lower bounds on how long a puzzle can physically take, in seconds. These exist to reject
// the impossible, not to judge a fast player: a rejected submission is lost data, a missed
// cheat costs a line in a list only friends see. Tune upwards from real submissions once
// the board has run for a few weeks.
const DAILY_FLOOR: Record<PuzzleTypeId, number> = {
  shapes: 4,
  zip: 5,
  nonogram: 10,
  mosaic: 8,
  crowns: 6,
  stars: 8,
  sudoku: 20,
  killer: 20,
};

const PERIOD_FACTOR: Record<Period, number> = {
  daily: 1,
  weekly: 1.4,
  monthly: 2,
};

export function minimumSeconds(type: PuzzleTypeId, period: Period): number {
  return Math.round(DAILY_FLOOR[type] * PERIOD_FACTOR[period]);
}
```

- [ ] **Step 5: Export both from the core index**

Add to `packages/core/src/index.ts`, keeping the file's existing order (types, rng, schedule, ref, then the rest):

```ts
export * from './puzzleId.ts';
export * from './plausibility.ts';
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @puzzle-hustle/core test` then `pnpm -r typecheck`
Expected: PASS, and no type errors.

If `periodEndsAt` fails by exactly one or two hours, that is the Berlin offset in `nextPeriodStart`, not a bug in this code: check whether the expected ISO strings in the test were written for summer time (UTC+2, so `22:00:00Z`) and fix the expectation, not the implementation.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/puzzleId.ts packages/core/src/plausibility.ts packages/core/src/index.ts packages/core/test/puzzleId.test.ts packages/core/test/plausibility.test.ts
git commit -m "Parse period puzzle ids and give them a time floor" -m "Implemented with assistance from Claude Opus 5."
```

Two `-m` flags give the subject, a blank line and the attribution sentence, which is the required shape for every commit in this plan. Later tasks show only the subject; add the same second `-m` each time.

---

### Task 2: API package skeleton and test harness

Nothing behavioural, but it proves the toolchain end to end before any logic depends on it.

**Files:**
- Create: `apps/api/package.json`, `apps/api/wrangler.toml`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`, `apps/api/src/index.ts`, `apps/api/src/http.ts`, `apps/api/migrations/0001_init.sql`
- Test: `apps/api/test/health.test.ts`

**Interfaces:**
- Produces: `interface Env { DB: D1Database; SESSION_SECRET: string; GOOGLE_CLIENT_IDS: string }`; `json(data: unknown, status?: number): Response`; `error(status: number, code: string): Response`; `cors(request: Request, response: Response): Response`.

- [ ] **Step 1: Create the package**

`apps/api/package.json`:

```json
{
  "name": "@puzzle-hustle/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "build": "tsc --noEmit",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "migrate:local": "wrangler d1 migrations apply puzzle-hustle --local",
    "migrate:remote": "wrangler d1 migrations apply puzzle-hustle --remote"
  },
  "dependencies": {
    "@puzzle-hustle/core": "workspace:*"
  }
}
```

Then install the tooling at its current version:

```bash
pnpm --filter @puzzle-hustle/api add -D wrangler@latest @cloudflare/workers-types@latest
pnpm --filter @puzzle-hustle/api add -D @cloudflare/vitest-pool-workers@^0.22 vitest@^4.1
```

`apps/api/wrangler.toml` (the `database_id` is filled in during Task 16; `"local"` is a placeholder only for `wrangler dev --local` and must be replaced before any remote command):

```toml
name = "puzzle-hustle-api"
main = "src/index.ts"
compatibility_date = "2026-09-21"

[[d1_databases]]
binding = "DB"
database_name = "puzzle-hustle"
database_id = "local"
migrations_dir = "migrations"

# /session is the one route without a token in front of it, so it gets the platform's own
# rate limiter. The binding does not exist under Miniflare, and the code treats it as optional.
[[ratelimits]]
name = "SESSION_LIMIT"
namespace_id = "1001"
simple = { limit = 20, period = 60 }

[vars]
GOOGLE_CLIENT_IDS = ""
```

The pool has no release that works with the workspace's Vitest 5: `0.22` wants Vitest 4, the older `0.12` line wants Vitest 2 or 3. A local Vitest pin inside `apps/api` is therefore unavoidable, and it belongs on the newest pairing the vendor supports.

`apps/api/tsconfig.json`, extending the repository base like `packages/core` and `apps/web` do, and keeping only what is api-specific:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "lib": ["es2022"],
    "types": ["@cloudflare/workers-types", "@cloudflare/vitest-pool-workers/types"],
    "allowImportingTsExtensions": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 2: Write the first migration**

`apps/api/migrations/0001_init.sql` (exactly the schema from the spec):

```sql
CREATE TABLE players (
  id          TEXT PRIMARY KEY,
  provider    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (provider, subject)
);

CREATE TABLE groups (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  owner_id    TEXT NOT NULL REFERENCES players(id),
  created_at  INTEGER NOT NULL
);

CREATE TABLE members (
  group_id    TEXT NOT NULL REFERENCES groups(id),
  player_id   TEXT NOT NULL REFERENCES players(id),
  joined_at   INTEGER NOT NULL,
  PRIMARY KEY (group_id, player_id)
);

CREATE TABLE scores (
  player_id   TEXT NOT NULL REFERENCES players(id),
  puzzle      TEXT NOT NULL,
  seconds     INTEGER NOT NULL,
  hints       INTEGER NOT NULL,
  moves       INTEGER NOT NULL,
  solved_at   INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (player_id, puzzle)
);

CREATE INDEX scores_by_puzzle ON scores (puzzle, hints, seconds);
CREATE INDEX scores_by_player_time ON scores (player_id, created_at);

CREATE TABLE reports (
  id          TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES players(id),
  target_id   TEXT NOT NULL REFERENCES players(id),
  reason      TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
```

- [ ] **Step 3: Write the failing test**

`apps/api/vitest.config.ts`:

```ts
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
        },
      },
    }),
  ],
});
```

In `0.22` the pool is a Vite plugin rather than a config wrapper, and the old `singleWorker` option is gone with no replacement. Each test file therefore gets its own storage, which is why every API test file applies the migrations in its own `beforeAll` and clears the tables in its own `beforeEach`. No test file may rely on data another one wrote.

`apps/api/test/health.test.ts`:

```ts
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, expect, it } from 'vitest';
import worker from '../src/index.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

it('answers the health route', async () => {
  const response = await worker.fetch(new Request('https://api.test/health'), env);
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ ok: true });
});

it('answers an unknown route with 404 and a code', async () => {
  const response = await worker.fetch(new Request('https://api.test/nope'), env);
  expect(response.status).toBe(404);
  await expect(response.json()).resolves.toEqual({ error: 'not_found' });
});

it('reflects an allowed origin and refuses an unknown one', async () => {
  const allowed = await worker.fetch(
    new Request('https://api.test/health', { headers: { Origin: 'https://puzzles.vexury.dev' } }),
    env,
  );
  expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://puzzles.vexury.dev');

  const foreign = await worker.fetch(
    new Request('https://api.test/health', { headers: { Origin: 'https://evil.example' } }),
    env,
  );
  expect(foreign.headers.get('Access-Control-Allow-Origin')).toBeNull();
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm --filter @puzzle-hustle/api test`
Expected: FAIL, `src/index.ts` has no default export yet.

If the pool refuses to start because it does not support Vitest 5 yet, do not work around it with a hand-rolled D1 stub. Pin the Vitest version the pool asks for inside `apps/api` only (`pnpm --filter @puzzle-hustle/api add -D vitest@<required>`); pnpm keeps that separate from the root version, and the root `pnpm test` still runs every package.

- [ ] **Step 5: Write the HTTP helpers**

`apps/api/src/http.ts`:

```ts
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Database;
  SESSION_SECRET: string;
  GOOGLE_CLIENT_IDS: string;
  SESSION_LIMIT?: RateLimiter;
}

// The app runs on its own domain in the browser, on https://localhost inside the Capacitor
// WebView, and on the Vite dev server while developing.
const ALLOWED_ORIGINS = ['https://puzzles.vexury.dev', 'https://localhost', 'http://localhost:5173'];

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function error(status: number, code: string): Response {
  return json({ error: code }, status);
}

export function cors(request: Request, response: Response): Response {
  const origin = request.headers.get('Origin');
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(response.body, { status: response.status, headers });
}
```

- [ ] **Step 6: Write the router**

`apps/api/src/index.ts`:

```ts
import { cors, error, json, type Env } from './http.ts';

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true });
  return error(404, 'not_found');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return cors(request, new Response(null, { status: 204 }));
    try {
      return cors(request, await route(request, env));
    } catch {
      return cors(request, error(500, 'internal'));
    }
  },
};
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @puzzle-hustle/api test` and `pnpm --filter @puzzle-hustle/api typecheck`
Expected: PASS, three tests, no type errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "Add the leaderboard API package"
```

Body: a sentence naming the stack (Worker, D1, migrations, Miniflare tests), blank line, attribution sentence.

---

### Task 3: Session tokens

**Files:**
- Create: `apps/api/src/token.ts`
- Test: `apps/api/test/token.test.ts`

**Interfaces:**
- Produces: `signSession(playerId: string, secret: string, now?: number): Promise<string>`; `verifySession(token: string, secret: string, now?: number): Promise<string | null>` returning the player id or null. `SESSION_DAYS = 30`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest';
import { signSession, verifySession } from '../src/token.ts';

const SECRET = 'test-secret';

it('round-trips a player id', async () => {
  const token = await signSession('player-1', SECRET);
  await expect(verifySession(token, SECRET)).resolves.toBe('player-1');
});

it('rejects a token signed with another secret', async () => {
  const token = await signSession('player-1', 'other-secret');
  await expect(verifySession(token, SECRET)).resolves.toBeNull();
});

it('rejects a tampered payload', async () => {
  const token = await signSession('player-1', SECRET);
  const [head, , sig] = token.split('.');
  const forged = btoa(JSON.stringify({ pid: 'player-2', iat: 0, exp: 9e12 })).replace(/=/g, '');
  await expect(verifySession(`${head}.${forged}.${sig}`, SECRET)).resolves.toBeNull();
});

it('rejects an expired token', async () => {
  const issued = Date.now() - 31 * 86400000;
  const token = await signSession('player-1', SECRET, issued);
  await expect(verifySession(token, SECRET)).resolves.toBeNull();
});

it('rejects garbage', async () => {
  await expect(verifySession('not-a-token', SECRET)).resolves.toBeNull();
  await expect(verifySession('', SECRET)).resolves.toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @puzzle-hustle/api test token`
Expected: FAIL, cannot resolve `../src/token.ts`.

- [ ] **Step 3: Implement**

```ts
export const SESSION_DAYS = 30;

const encoder = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function signSession(playerId: string, secret: string, now = Date.now()): Promise<string> {
  const header = b64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = b64url(
    encoder.encode(
      JSON.stringify({
        pid: playerId,
        iat: Math.floor(now / 1000),
        exp: Math.floor(now / 1000) + SESSION_DAYS * 86400,
      }),
    ),
  );
  const body = `${header}.${payload}`;
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body));
  return `${body}.${b64url(new Uint8Array(signature))}`;
}

export async function verifySession(token: string, secret: string, now = Date.now()): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts as [string, string, string];
  try {
    const ok = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      unb64url(signature),
      encoder.encode(`${header}.${payload}`),
    );
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(unb64url(payload))) as { pid?: unknown; exp?: unknown };
    if (typeof claims.pid !== 'string' || typeof claims.exp !== 'number') return null;
    if (claims.exp * 1000 <= now) return null;
    return claims.pid;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @puzzle-hustle/api test token`
Expected: PASS, five tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/token.ts apps/api/test/token.test.ts
git commit -m "Sign and verify leaderboard session tokens"
```

---

### Task 4: Google ID token verification

**Files:**
- Create: `apps/api/src/google.ts`
- Test: `apps/api/test/google.test.ts`

**Interfaces:**
- Produces: `verifyGoogleIdToken(token: string, options: VerifyOptions): Promise<string | null>` returning the `sub` claim or null, with `interface VerifyOptions { audiences: string[]; now?: number; fetchJwks?: () => Promise<Jwks> }` and `interface Jwks { keys: JsonWebKey[] }`.

The injectable `fetchJwks` exists so the test can serve its own key set; production leaves it out and the module fetches Google's, caching it in module scope for an hour.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest';
import { verifyGoogleIdToken } from '../src/google.ts';

const encoder = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function issue(claims: Record<string, unknown>) {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const header = b64url(encoder.encode(JSON.stringify({ alg: 'RS256', kid: 'test-kid' })));
  const payload = b64url(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, encoder.encode(`${header}.${payload}`));
  return {
    token: `${header}.${payload}.${b64url(new Uint8Array(signature))}`,
    fetchJwks: async () => ({ keys: [{ ...jwk, kid: 'test-kid', alg: 'RS256' }] }),
  };
}

const base = {
  iss: 'https://accounts.google.com',
  aud: 'test-client-id',
  sub: 'google-subject-1',
  email: 'someone@example.com',
  exp: Math.floor(Date.now() / 1000) + 3600,
};

it('returns the subject of a valid token', async () => {
  const { token, fetchJwks } = await issue(base);
  await expect(verifyGoogleIdToken(token, { audiences: ['test-client-id'], fetchJwks })).resolves.toBe('google-subject-1');
});

it('rejects a foreign audience', async () => {
  const { token, fetchJwks } = await issue({ ...base, aud: 'someone-elses-app' });
  await expect(verifyGoogleIdToken(token, { audiences: ['test-client-id'], fetchJwks })).resolves.toBeNull();
});

it('rejects a foreign issuer', async () => {
  const { token, fetchJwks } = await issue({ ...base, iss: 'https://evil.example' });
  await expect(verifyGoogleIdToken(token, { audiences: ['test-client-id'], fetchJwks })).resolves.toBeNull();
});

it('rejects an expired token', async () => {
  const { token, fetchJwks } = await issue({ ...base, exp: Math.floor(Date.now() / 1000) - 10 });
  await expect(verifyGoogleIdToken(token, { audiences: ['test-client-id'], fetchJwks })).resolves.toBeNull();
});

it('rejects a token whose signature does not match the published key', async () => {
  const { token } = await issue(base);
  const other = await issue(base);
  await expect(
    verifyGoogleIdToken(token, { audiences: ['test-client-id'], fetchJwks: other.fetchJwks }),
  ).resolves.toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @puzzle-hustle/api test google`
Expected: FAIL, cannot resolve `../src/google.ts`.

- [ ] **Step 3: Implement**

```ts
const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const CACHE_MS = 3600_000;

export interface Jwks {
  keys: JsonWebKey[];
}

export interface VerifyOptions {
  audiences: string[];
  now?: number;
  fetchJwks?: () => Promise<Jwks>;
}

let cached: { at: number; jwks: Jwks } | null = null;

async function googleJwks(): Promise<Jwks> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.jwks;
  const response = await fetch(CERTS_URL);
  if (!response.ok) throw new Error('jwks unavailable');
  const jwks = (await response.json()) as Jwks;
  cached = { at: Date.now(), jwks };
  return jwks;
}

function unb64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function decode(part: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(unb64url(part))) as Record<string, unknown>;
}

export async function verifyGoogleIdToken(token: string, options: VerifyOptions): Promise<string | null> {
  const now = options.now ?? Date.now();
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head, body, signature] = parts as [string, string, string];
  try {
    const header = decode(head);
    const claims = decode(body);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
    if (typeof claims.iss !== 'string' || !ISSUERS.includes(claims.iss)) return null;
    if (typeof claims.aud !== 'string' || !options.audiences.includes(claims.aud)) return null;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return null;
    if (typeof claims.sub !== 'string' || !claims.sub) return null;

    const jwks = await (options.fetchJwks ?? googleJwks)();
    const jwk = jwks.keys.find((k) => (k as { kid?: string }).kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [
      'verify',
    ]);
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      unb64url(signature),
      new TextEncoder().encode(`${head}.${body}`),
    );
    return ok ? claims.sub : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @puzzle-hustle/api test google`
Expected: PASS, five tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/google.ts apps/api/test/google.test.ts
git commit -m "Verify Google id tokens against the published keys"
```

---

### Task 5: Players, sign-in and names

**Files:**
- Create: `apps/api/src/players.ts`, `apps/api/src/names.ts`
- Modify: `apps/api/src/index.ts` (routes `POST /session`, `POST /name`, plus the auth helper)
- Test: `apps/api/test/names.test.ts`, `apps/api/test/session.test.ts`

**Interfaces:**
- Consumes: `signSession`, `verifySession` (Task 3); `verifyGoogleIdToken` (Task 4); `json`, `error`, `Env` (Task 2).
- Produces:
  - `validateName(raw: string): { ok: true; name: string } | { ok: false; reason: 'length' | 'characters' | 'blocked' }`
  - `upsertPlayer(db: D1Database, provider: string, subject: string, name: string): Promise<{ id: string; name: string }>`
  - `requirePlayer(request: Request, env: Env): Promise<string | null>` returning the player id from the `Authorization` header.

- [ ] **Step 1: Write the failing tests**

`apps/api/test/names.test.ts`:

```ts
import { expect, it } from 'vitest';
import { validateName } from '../src/names.ts';

it('accepts an ordinary name and trims it', () => {
  expect(validateName('  Moritz  ')).toEqual({ ok: true, name: 'Moritz' });
  expect(validateName('Anna   Lena')).toEqual({ ok: true, name: 'Anna Lena' });
  expect(validateName('zip_master-99')).toEqual({ ok: true, name: 'zip_master-99' });
  expect(validateName('Jörg')).toEqual({ ok: true, name: 'Jörg' });
});

it('refuses names that are too short or too long', () => {
  expect(validateName('a')).toEqual({ ok: false, reason: 'length' });
  expect(validateName('x'.repeat(25))).toEqual({ ok: false, reason: 'length' });
});

it('refuses links and control characters', () => {
  expect(validateName('http://x.example')).toEqual({ ok: false, reason: 'characters' });
  expect(validateName('www.example.com')).toEqual({ ok: false, reason: 'characters' });
  expect(validateName('bad\nname')).toEqual({ ok: false, reason: 'characters' });
  expect(validateName('emoji 🎉')).toEqual({ ok: false, reason: 'characters' });
});

it('refuses a blocked word regardless of case and spacing', () => {
  expect(validateName('ADMIN')).toEqual({ ok: false, reason: 'blocked' });
  expect(validateName('a d m i n')).toEqual({ ok: false, reason: 'blocked' });
});
```

`apps/api/test/session.test.ts`:

```ts
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import worker from '../src/index.ts';
import * as google from '../src/google.ts';
import { signSession } from '../src/token.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await env.DB.exec('DELETE FROM scores; DELETE FROM members; DELETE FROM groups; DELETE FROM players;');
  vi.restoreAllMocks();
});

function post(path: string, body: unknown, token?: string) {
  return worker.fetch(
    new Request(`https://api.test${path}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(body),
    }),
    env,
  );
}

it('creates a player on the first sign-in and reuses it on the second', async () => {
  vi.spyOn(google, 'verifyGoogleIdToken').mockResolvedValue('subject-1');

  const first = await post('/session', { provider: 'google', idToken: 'x', name: 'Moritz' });
  expect(first.status).toBe(200);
  const a = (await first.json()) as { token: string; player: { id: string; name: string } };
  expect(a.player.name).toBe('Moritz');

  const second = await post('/session', { provider: 'google', idToken: 'x' });
  const b = (await second.json()) as { player: { id: string } };
  expect(b.player.id).toBe(a.player.id);

  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM players').first<{ n: number }>();
  expect(count?.n).toBe(1);
});

it('never stores the e-mail address', async () => {
  vi.spyOn(google, 'verifyGoogleIdToken').mockResolvedValue('subject-1');
  await post('/session', { provider: 'google', idToken: 'x', name: 'Moritz' });
  const row = await env.DB.prepare('SELECT * FROM players').first<Record<string, unknown>>();
  expect(JSON.stringify(row)).not.toContain('@');
});

it('refuses an invalid id token', async () => {
  vi.spyOn(google, 'verifyGoogleIdToken').mockResolvedValue(null);
  const response = await post('/session', { provider: 'google', idToken: 'x' });
  expect(response.status).toBe(401);
});

it('refuses an unsupported provider', async () => {
  const response = await post('/session', { provider: 'facebook', idToken: 'x' });
  expect(response.status).toBe(400);
});

it('falls back to a generated name when none is offered', async () => {
  vi.spyOn(google, 'verifyGoogleIdToken').mockResolvedValue('subject-2');
  const response = await post('/session', { provider: 'google', idToken: 'x' });
  const body = (await response.json()) as { player: { name: string } };
  expect(body.player.name).toMatch(/^Player \d{4}$/);
});

it('changes a name and refuses a bad one', async () => {
  vi.spyOn(google, 'verifyGoogleIdToken').mockResolvedValue('subject-3');
  const created = (await (await post('/session', { provider: 'google', idToken: 'x' })).json()) as {
    token: string;
  };

  const ok = await post('/name', { name: 'Danny' }, created.token);
  expect(ok.status).toBe(200);
  await expect(ok.json()).resolves.toEqual({ name: 'Danny' });

  const bad = await post('/name', { name: 'http://x.example' }, created.token);
  expect(bad.status).toBe(400);
});

it('refuses a request without or with a broken token', async () => {
  expect((await post('/name', { name: 'Danny' })).status).toBe(401);
  expect((await post('/name', { name: 'Danny' }, 'garbage')).status).toBe(401);
  const stale = await signSession('nobody', env.SESSION_SECRET);
  expect((await post('/name', { name: 'Danny' }, stale)).status).toBe(401);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @puzzle-hustle/api test`
Expected: FAIL, `../src/names.ts` missing and `/session` answering 404.

- [ ] **Step 3: Write `apps/api/src/names.ts`**

```ts
// Deliberately small and boring. It exists to keep a display name from carrying a link, a
// line break or an obvious slur into somebody else's group list, not to police taste.
const BLOCKED = ['admin', 'moderator', 'support', 'fuck', 'shit', 'bitch', 'nazi', 'hitler', 'fotze', 'hure', 'wichser'];

const ALLOWED = /^[\p{L}\p{N} ._-]+$/u;
const LINKISH = /:\/\/|www\.|\.(com|net|org|de|io|dev|xyz)\b/i;

export type NameResult = { ok: true; name: string } | { ok: false; reason: 'length' | 'characters' | 'blocked' };

export function validateName(raw: string): NameResult {
  // Only literal spaces are collapsed here; any other whitespace (newline, tab, ...) is left
  // in place so it falls through to the ALLOWED check below and is rejected as a control
  // character rather than silently turned into a space.
  const name = raw.trim().replace(/ +/g, ' ');
  if (name.length < 2 || name.length > 24) return { ok: false, reason: 'length' };
  if (!ALLOWED.test(name) || LINKISH.test(name)) return { ok: false, reason: 'characters' };
  const flat = name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  if (BLOCKED.some((word) => flat.includes(word))) return { ok: false, reason: 'blocked' };
  return { ok: true, name };
}

export function generatedName(): string {
  return `Player ${String(Math.floor(1000 + Math.random() * 9000))}`;
}
```

Note for the implementer: `\p{L}` covers Japanese and Cyrillic as well as umlauts, and excludes emoji, which is exactly the intended line.

- [ ] **Step 4: Write `apps/api/src/players.ts`**

```ts
import { verifySession } from './token.ts';
import type { Env } from './http.ts';

export interface Player {
  id: string;
  name: string;
}

export async function upsertPlayer(db: D1Database, provider: string, subject: string, name: string): Promise<Player> {
  const inserted = await db
    .prepare(
      `INSERT INTO players (id, provider, subject, name, created_at)
            VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (provider, subject) DO NOTHING
         RETURNING id, name`,
    )
    .bind(crypto.randomUUID(), provider, subject, name, Date.now())
    .first<Player>();
  if (inserted) return inserted;

  // The row was already there, either from an earlier sign-in or from a request that
  // raced this one. Either way the first name wins, which is what the caller expects.
  const existing = await db
    .prepare('SELECT id, name FROM players WHERE provider = ? AND subject = ?')
    .bind(provider, subject)
    .first<Player>();
  if (!existing) throw new Error('player upsert failed');
  return existing;
}

export async function requirePlayer(request: Request, env: Env): Promise<string | null> {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const playerId = await verifySession(header.slice(7), env.SESSION_SECRET);
  if (!playerId) return null;
  const row = await env.DB.prepare('SELECT id FROM players WHERE id = ?').bind(playerId).first<{ id: string }>();
  return row ? playerId : null;
}
```

- [ ] **Step 5: Wire the routes in `apps/api/src/index.ts`**

Replace the body of `route` with a dispatcher, keeping `/health`:

```ts
import { verifyGoogleIdToken } from './google.ts';
import { cors, error, json, type Env } from './http.ts';
import { generatedName, validateName } from './names.ts';
import { requirePlayer, upsertPlayer } from './players.ts';
import { signSession } from './token.ts';

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function postSession(request: Request, env: Env): Promise<Response> {
  if (env.SESSION_LIMIT) {
    const key = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await env.SESSION_LIMIT.limit({ key });
    if (!success) return error(429, 'too_many_requests');
  }
  const input = await body(request);
  if (input.provider !== 'google') return error(400, 'unsupported_provider');
  if (typeof input.idToken !== 'string') return error(400, 'missing_token');

  const audiences = env.GOOGLE_CLIENT_IDS.split(',').map((id) => id.trim()).filter(Boolean);
  const subject = await verifyGoogleIdToken(input.idToken, { audiences });
  if (!subject) return error(401, 'bad_token');

  const offered = typeof input.name === 'string' ? validateName(input.name) : null;
  const name = offered?.ok ? offered.name : generatedName();
  const player = await upsertPlayer(env.DB, 'google', subject, name);
  return json({ token: await signSession(player.id, env.SESSION_SECRET), player });
}

async function postName(request: Request, env: Env, playerId: string): Promise<Response> {
  const input = await body(request);
  if (typeof input.name !== 'string') return error(400, 'missing_name');
  const result = validateName(input.name);
  if (!result.ok) return error(400, `name_${result.reason}`);
  await env.DB.prepare('UPDATE players SET name = ? WHERE id = ?').bind(result.name, playerId).run();
  return json({ name: result.name });
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === 'GET' && path === '/health') return json({ ok: true });
  if (method === 'POST' && path === '/session') return postSession(request, env);

  const playerId = await requirePlayer(request, env);
  if (!playerId) return error(401, 'unauthorized');

  if (method === 'POST' && path === '/name') return postName(request, env, playerId);
  return error(404, 'not_found');
}
```

The order matters: everything below the `requirePlayer` gate is authenticated by construction, so no later route can forget to check.

Because the session test spies on `verifyGoogleIdToken`, `index.ts` must call it through the module import as written above; do not destructure it into a local constant at module load, or the spy will not take effect.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @puzzle-hustle/api test`
Expected: PASS, all files.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src apps/api/test
git commit -m "Create players from a Google sign-in and let them rename"
```

---

### Task 6: Groups

**Files:**
- Create: `apps/api/src/groups.ts`
- Modify: `apps/api/src/index.ts` (five routes)
- Test: `apps/api/test/groups.test.ts`

**Interfaces:**
- Consumes: `requirePlayer` (Task 5).
- Produces: `newGroupCode(): string`; `createGroup(db, ownerId, name)`; `joinGroup(db, playerId, code)`; `leaveGroup(db, playerId, groupId)`; `removeMember(db, ownerId, groupId, playerId)`; `listGroups(db, playerId)`; constants `MAX_MEMBERS = 50`, `MAX_GROUPS = 5`.
- A group row as returned everywhere: `{ id: string; code: string; name: string; members: number; owner: boolean }`.

- [ ] **Step 1: Write the failing test**

```ts
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import worker from '../src/index.ts';
import * as google from '../src/google.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await env.DB.exec('DELETE FROM scores; DELETE FROM members; DELETE FROM groups; DELETE FROM players;');
  vi.restoreAllMocks();
});

async function signIn(subject: string, name: string): Promise<string> {
  vi.spyOn(google, 'verifyGoogleIdToken').mockResolvedValue(subject);
  const response = await worker.fetch(
    new Request('https://api.test/session', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken: 'x', name }),
    }),
    env,
  );
  return ((await response.json()) as { token: string }).token;
}

function call(path: string, token: string, init: RequestInit = {}) {
  return worker.fetch(
    new Request(`https://api.test${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    }),
    env,
  );
}

const post = (path: string, token: string, payload: unknown) =>
  call(path, token, { method: 'POST', body: JSON.stringify(payload) });

it('creates a group with a six character code and lists it', async () => {
  const token = await signIn('s1', 'Moritz');
  const created = (await (await post('/groups', token, { name: 'Family' })).json()) as {
    id: string;
    code: string;
    name: string;
  };
  expect(created.code).toMatch(/^[0-9A-HJ-NP-TV-Z]{6}$/);

  const list = (await (await call('/groups', token)).json()) as { groups: Array<Record<string, unknown>> };
  expect(list.groups).toEqual([{ id: created.id, code: created.code, name: 'Family', members: 1, owner: true }]);
});

it('lets a second player join by code, case-insensitively', async () => {
  const owner = await signIn('s1', 'Moritz');
  const code = ((await (await post('/groups', owner, { name: 'Family' })).json()) as { code: string }).code;

  const guest = await signIn('s2', 'Daniela');
  const joined = await post('/groups/join', guest, { code: code.toLowerCase() });
  expect(joined.status).toBe(200);

  const list = (await (await call('/groups', guest)).json()) as { groups: Array<{ members: number; owner: boolean }> };
  expect(list.groups[0]).toMatchObject({ members: 2, owner: false });
});

it('refuses an unknown code and a second join', async () => {
  const owner = await signIn('s1', 'Moritz');
  const code = ((await (await post('/groups', owner, { name: 'Family' })).json()) as { code: string }).code;
  expect((await post('/groups/join', owner, { code: 'ZZZZZZ' })).status).toBe(404);
  expect((await post('/groups/join', owner, { code })).status).toBe(409);
});

it('holds the group and membership limits', async () => {
  const token = await signIn('s1', 'Moritz');
  for (let i = 0; i < 5; i++) expect((await post('/groups', token, { name: `G${i}` })).status).toBe(200);
  expect((await post('/groups', token, { name: 'One too many' })).status).toBe(403);
});

it('refuses an invalid group name', async () => {
  const token = await signIn('s1', 'Moritz');
  expect((await post('/groups', token, { name: 'x' })).status).toBe(400);
  expect((await post('/groups', token, { name: 'http://x.example' })).status).toBe(400);
});

it('lets a member leave and an owner remove somebody', async () => {
  const owner = await signIn('s1', 'Moritz');
  const group = (await (await post('/groups', owner, { name: 'Family' })).json()) as { id: string; code: string };
  const guest = await signIn('s2', 'Daniela');
  await post('/groups/join', guest, { code: group.code });

  expect((await post('/groups/remove', guest, { id: group.id, playerId: 'anyone' })).status).toBe(403);
  await post('/groups/leave', guest, { id: group.id });
  const list = (await (await call('/groups', guest)).json()) as { groups: unknown[] };
  expect(list.groups).toEqual([]);
});

it('deletes a group when its last member leaves', async () => {
  const owner = await signIn('s1', 'Moritz');
  const group = (await (await post('/groups', owner, { name: 'Family' })).json()) as { id: string };
  await post('/groups/leave', owner, { id: group.id });
  const rows = await env.DB.prepare('SELECT COUNT(*) AS n FROM groups').first<{ n: number }>();
  expect(rows?.n).toBe(0);
});

it('hands ownership to the longest standing member when the owner leaves', async () => {
  const owner = await signIn('s1', 'Moritz');
  const group = (await (await post('/groups', owner, { name: 'Family' })).json()) as { id: string; code: string };
  const guest = await signIn('s2', 'Daniela');
  await post('/groups/join', guest, { code: group.code });
  await post('/groups/leave', owner, { id: group.id });

  const list = (await (await call('/groups', guest)).json()) as { groups: Array<{ owner: boolean }> };
  expect(list.groups[0]?.owner).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @puzzle-hustle/api test groups`
Expected: FAIL, every group route answers 404.

- [ ] **Step 3: Implement `apps/api/src/groups.ts`**

```ts
import { validateName } from './names.ts';

export const MAX_MEMBERS = 50;
export const MAX_GROUPS = 5;

// Crockford base32 without I, L, O and U: no character pair a person can confuse when
// reading a code off a phone screen, and no accidental words.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export interface GroupRow {
  id: string;
  code: string;
  name: string;
  members: number;
  owner: boolean;
}

export function newGroupCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export async function listGroups(db: D1Database, playerId: string): Promise<GroupRow[]> {
  const { results } = await db
    .prepare(
      `SELECT g.id, g.code, g.name, g.owner_id AS ownerId,
              (SELECT COUNT(*) FROM members m2 WHERE m2.group_id = g.id) AS members
         FROM members m
         JOIN groups g ON g.id = m.group_id
        WHERE m.player_id = ?
        ORDER BY m.joined_at`,
    )
    .bind(playerId)
    .all<{ id: string; code: string; name: string; ownerId: string; members: number }>();
  return results.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    members: row.members,
    owner: row.ownerId === playerId,
  }));
}

export async function createGroup(
  db: D1Database,
  ownerId: string,
  rawName: string,
): Promise<{ ok: true; group: GroupRow } | { ok: false; reason: 'name' | 'limit' }> {
  const name = validateName(rawName);
  if (!name.ok) return { ok: false, reason: 'name' };

  const owned = await db
    .prepare('SELECT COUNT(*) AS n FROM members WHERE player_id = ?')
    .bind(ownerId)
    .first<{ n: number }>();
  if ((owned?.n ?? 0) >= MAX_GROUPS) return { ok: false, reason: 'limit' };

  const id = crypto.randomUUID();
  const now = Date.now();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newGroupCode();
    try {
      await db
        .prepare('INSERT INTO groups (id, code, name, owner_id, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(id, code, name.name, ownerId, now)
        .run();
      await db
        .prepare('INSERT INTO members (group_id, player_id, joined_at) VALUES (?, ?, ?)')
        .bind(id, ownerId, now)
        .run();
      return { ok: true, group: { id, code, name: name.name, members: 1, owner: true } };
    } catch {
      /* code collision, draw another */
    }
  }
  return { ok: false, reason: 'limit' };
}

export async function joinGroup(
  db: D1Database,
  playerId: string,
  rawCode: string,
): Promise<{ ok: true; group: GroupRow } | { ok: false; reason: 'unknown' | 'already' | 'full' | 'limit' }> {
  const code = rawCode.trim().toUpperCase();
  const group = await db
    .prepare('SELECT id, code, name, owner_id AS ownerId FROM groups WHERE code = ?')
    .bind(code)
    .first<{ id: string; code: string; name: string; ownerId: string }>();
  if (!group) return { ok: false, reason: 'unknown' };

  const mine = await db
    .prepare('SELECT COUNT(*) AS n FROM members WHERE player_id = ?')
    .bind(playerId)
    .first<{ n: number }>();
  if ((mine?.n ?? 0) >= MAX_GROUPS) return { ok: false, reason: 'limit' };

  const members = await db
    .prepare('SELECT COUNT(*) AS n FROM members WHERE group_id = ?')
    .bind(group.id)
    .first<{ n: number }>();
  if ((members?.n ?? 0) >= MAX_MEMBERS) return { ok: false, reason: 'full' };

  try {
    await db
      .prepare('INSERT INTO members (group_id, player_id, joined_at) VALUES (?, ?, ?)')
      .bind(group.id, playerId, Date.now())
      .run();
  } catch {
    return { ok: false, reason: 'already' };
  }
  return {
    ok: true,
    group: { id: group.id, code: group.code, name: group.name, members: (members?.n ?? 0) + 1, owner: false },
  };
}

// Leaving is also how a group dies: the last member out deletes it, and an owner who leaves
// hands the group to whoever has been in it longest.
export async function leaveGroup(db: D1Database, playerId: string, groupId: string): Promise<void> {
  await db.prepare('DELETE FROM members WHERE group_id = ? AND player_id = ?').bind(groupId, playerId).run();
  const next = await db
    .prepare('SELECT player_id AS id FROM members WHERE group_id = ? ORDER BY joined_at LIMIT 1')
    .bind(groupId)
    .first<{ id: string }>();
  if (!next) {
    await db.prepare('DELETE FROM groups WHERE id = ?').bind(groupId).run();
    return;
  }
  await db.prepare('UPDATE groups SET owner_id = ? WHERE id = ? AND owner_id = ?').bind(next.id, groupId, playerId).run();
}

export async function removeMember(
  db: D1Database,
  ownerId: string,
  groupId: string,
  playerId: string,
): Promise<boolean> {
  const group = await db
    .prepare('SELECT owner_id AS ownerId FROM groups WHERE id = ?')
    .bind(groupId)
    .first<{ ownerId: string }>();
  if (!group || group.ownerId !== ownerId || playerId === ownerId) return false;
  await db.prepare('DELETE FROM members WHERE group_id = ? AND player_id = ?').bind(groupId, playerId).run();
  return true;
}
```

- [ ] **Step 4: Add the routes**

In `apps/api/src/index.ts`, below the `requirePlayer` gate:

```ts
if (method === 'GET' && path === '/groups') return json({ groups: await listGroups(env.DB, playerId) });

if (method === 'POST' && path === '/groups') {
  const input = await body(request);
  if (typeof input.name !== 'string') return error(400, 'missing_name');
  const created = await createGroup(env.DB, playerId, input.name);
  if (!created.ok) return error(created.reason === 'name' ? 400 : 403, `group_${created.reason}`);
  return json(created.group);
}

if (method === 'POST' && path === '/groups/join') {
  const input = await body(request);
  if (typeof input.code !== 'string') return error(400, 'missing_code');
  const joined = await joinGroup(env.DB, playerId, input.code);
  if (!joined.ok) {
    const status = joined.reason === 'unknown' ? 404 : joined.reason === 'already' ? 409 : 403;
    return error(status, `group_${joined.reason}`);
  }
  return json(joined.group);
}

if (method === 'POST' && path === '/groups/leave') {
  const input = await body(request);
  if (typeof input.id !== 'string') return error(400, 'missing_id');
  await leaveGroup(env.DB, playerId, input.id);
  return json({});
}

if (method === 'POST' && path === '/groups/remove') {
  const input = await body(request);
  if (typeof input.id !== 'string' || typeof input.playerId !== 'string') return error(400, 'missing_id');
  const done = await removeMember(env.DB, playerId, input.id, input.playerId);
  return done ? json({}) : error(403, 'not_owner');
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @puzzle-hustle/api test groups`
Expected: PASS, eight tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/groups.ts apps/api/src/index.ts apps/api/test/groups.test.ts
git commit -m "Let players create and join groups by code"
```

---

### Task 7: Score submission

**Files:**
- Create: `apps/api/src/scores.ts`
- Modify: `apps/api/src/index.ts` (`POST /scores`)
- Test: `apps/api/test/scores.test.ts`

**Interfaces:**
- Consumes: `parsePuzzleId`, `periodEndsAt`, `minimumSeconds` from `@puzzle-hustle/core` (Task 1).
- Produces: `submitScores(db, playerId, entries, now?): Promise<SubmitResult[]>` with `interface ScoreEntry { puzzle: string; seconds: number; hints: number; moves: number; solvedAt: number }` and `type SubmitResult = { puzzle: string; status: 'stored' | 'duplicate' | 'rejected' | 'expired' | 'throttled' }`. Constants `GRACE_MS = 48 * 3600_000`, `DAILY_LIMIT = 40`, `MAX_BATCH = 20`.

- [ ] **Step 1: Write the failing test**

```ts
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import worker from '../src/index.ts';
import * as google from '../src/google.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await env.DB.exec('DELETE FROM scores; DELETE FROM members; DELETE FROM groups; DELETE FROM players;');
  vi.restoreAllMocks();
});

async function signIn(subject: string): Promise<string> {
  vi.spyOn(google, 'verifyGoogleIdToken').mockResolvedValue(subject);
  const response = await worker.fetch(
    new Request('https://api.test/session', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken: 'x', name: 'Moritz' }),
    }),
    env,
  );
  return ((await response.json()) as { token: string }).token;
}

function todayKey(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
}

async function submit(token: string, entries: unknown[]) {
  const response = await worker.fetch(
    new Request('https://api.test/scores', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ entries }),
    }),
    env,
  );
  return { status: response.status, body: (await response.json()) as { results: Array<{ puzzle: string; status: string }> } };
}

const entry = (overrides: Record<string, unknown> = {}) => ({
  puzzle: `sudoku:daily:${todayKey()}`,
  seconds: 180,
  hints: 0,
  moves: 45,
  solvedAt: Date.now(),
  ...overrides,
});

it('stores a plausible solve once and calls the second a duplicate', async () => {
  const token = await signIn('s1');
  expect((await submit(token, [entry()])).body.results[0]?.status).toBe('stored');
  expect((await submit(token, [entry({ seconds: 5 })])).body.results[0]?.status).toBe('duplicate');

  const row = await env.DB.prepare('SELECT seconds FROM scores').first<{ seconds: number }>();
  expect(row?.seconds).toBe(180);
});

it('rejects a time below the floor and a zero move solve', async () => {
  const token = await signIn('s1');
  expect((await submit(token, [entry({ seconds: 2 })])).body.results[0]?.status).toBe('rejected');
  expect((await submit(token, [entry({ moves: 0 })])).body.results[0]?.status).toBe('rejected');
  const rows = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores').first<{ n: number }>();
  expect(rows?.n).toBe(0);
});

it('rejects an id that is not a period puzzle', async () => {
  const token = await signIn('s1');
  const results = (await submit(token, [entry({ puzzle: 'sudoku:level:easy:3' }), entry({ puzzle: 'nope' })])).body.results;
  expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
});

it('calls an old period expired and any future one rejected', async () => {
  const token = await signIn('s1');
  expect((await submit(token, [entry({ puzzle: 'sudoku:daily:2026-01-01' })])).body.results[0]?.status).toBe('expired');
  expect((await submit(token, [entry({ puzzle: 'sudoku:daily:2099-01-01' })])).body.results[0]?.status).toBe('rejected');

  // Two days out, not one: adding 24 hours during the night the clocks go back lands on the
  // same Berlin day and would make this test fail once a year.
  const soon = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date(Date.now() + 2 * 86400000));
  expect((await submit(token, [entry({ puzzle: `sudoku:daily:${soon}` })])).body.results[0]?.status).toBe('rejected');
});

it('answers every entry of a batch independently', async () => {
  const token = await signIn('s1');
  const results = (
    await submit(token, [
      entry({ puzzle: `sudoku:daily:${todayKey()}` }),
      entry({ puzzle: `nonogram:daily:${todayKey()}`, seconds: 1 }),
      entry({ puzzle: `crowns:daily:${todayKey()}`, seconds: 90, moves: 20 }),
    ])
  ).body.results;
  expect(results.map((r) => r.status)).toEqual(['stored', 'rejected', 'stored']);
});

it('refuses an oversized batch and malformed entries', async () => {
  const token = await signIn('s1');
  expect((await submit(token, new Array(21).fill(entry()))).status).toBe(400);
  expect((await submit(token, [{ puzzle: 42 }])).body.results[0]?.status).toBe('rejected');
});

it('throttles a player past the daily limit', async () => {
  const token = await signIn('s1');
  const player = await env.DB.prepare('SELECT id FROM players').first<{ id: string }>();
  const filler = Array.from({ length: 40 }, (_, i) =>
    env.DB.prepare(
      'INSERT INTO scores (player_id, puzzle, seconds, hints, moves, solved_at, created_at) VALUES (?, ?, 100, 0, 30, ?, ?)',
    ).bind(player!.id, `filler-${i}`, Date.now(), Date.now()),
  );
  await env.DB.batch(filler);
  expect((await submit(token, [entry()])).body.results[0]?.status).toBe('throttled');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @puzzle-hustle/api test scores`
Expected: FAIL, `/scores` answers 404.

- [ ] **Step 3: Implement `apps/api/src/scores.ts`**

```ts
import { minimumSeconds, parsePuzzleId, periodEndsAt, periodKey } from '@puzzle-hustle/core';

export const GRACE_MS = 48 * 3600_000;
export const DAILY_LIMIT = 40;
export const MAX_BATCH = 20;

export interface ScoreEntry {
  puzzle: string;
  seconds: number;
  hints: number;
  moves: number;
  solvedAt: number;
}

export type SubmitStatus = 'stored' | 'duplicate' | 'rejected' | 'expired' | 'throttled';
export interface SubmitResult {
  puzzle: string;
  status: SubmitStatus;
}

function readEntry(raw: unknown): ScoreEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const numbers = ['seconds', 'hints', 'moves', 'solvedAt'] as const;
  if (typeof value.puzzle !== 'string') return null;
  for (const field of numbers) {
    if (typeof value[field] !== 'number' || !Number.isFinite(value[field]) || (value[field] as number) < 0) return null;
  }
  return {
    puzzle: value.puzzle,
    seconds: Math.round(value.seconds as number),
    hints: Math.round(value.hints as number),
    moves: Math.round(value.moves as number),
    solvedAt: Math.round(value.solvedAt as number),
  };
}

function judge(entry: ScoreEntry, now: number): SubmitStatus | null {
  const parsed = parsePuzzleId(entry.puzzle);
  if (!parsed) return 'rejected';
  const ends = periodEndsAt(parsed.period, parsed.key);
  if (!ends) return 'rejected';
  // A period that has not started yet cannot have been solved, whatever the client claims.
  // Every period key sorts lexicographically inside its own period, so a plain string
  // comparison against today's key is exact and needs no date arithmetic.
  if (parsed.key > periodKey(parsed.period, new Date(now))) return 'rejected';
  if (now > ends.getTime() + GRACE_MS) return 'expired';
  if (entry.moves < 1) return 'rejected';
  if (entry.seconds < minimumSeconds(parsed.type, parsed.period)) return 'rejected';
  if (entry.seconds > 24 * 3600) return 'rejected';
  return null;
}

export async function submitScores(
  db: D1Database,
  playerId: string,
  raw: unknown[],
  now = Date.now(),
): Promise<SubmitResult[]> {
  const recent = await db
    .prepare('SELECT COUNT(*) AS n FROM scores WHERE player_id = ? AND created_at > ?')
    .bind(playerId, now - 86400000)
    .first<{ n: number }>();
  let budget = DAILY_LIMIT - (recent?.n ?? 0);

  const results: SubmitResult[] = [];
  for (const item of raw) {
    const entry = readEntry(item);
    if (!entry) {
      results.push({ puzzle: typeof (item as { puzzle?: unknown })?.puzzle === 'string' ? String((item as { puzzle: string }).puzzle) : '', status: 'rejected' });
      continue;
    }
    const verdict = judge(entry, now);
    if (verdict) {
      results.push({ puzzle: entry.puzzle, status: verdict });
      continue;
    }
    if (budget <= 0) {
      results.push({ puzzle: entry.puzzle, status: 'throttled' });
      continue;
    }
    try {
      await db
        .prepare(
          'INSERT INTO scores (player_id, puzzle, seconds, hints, moves, solved_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(playerId, entry.puzzle, entry.seconds, entry.hints, entry.moves, entry.solvedAt, now)
        .run();
      budget--;
      results.push({ puzzle: entry.puzzle, status: 'stored' });
    } catch {
      // The primary key is (player_id, puzzle): a failure here means the first solve is
      // already stored, and the first solve is the one that counts.
      results.push({ puzzle: entry.puzzle, status: 'duplicate' });
    }
  }
  return results;
}
```

- [ ] **Step 4: Add the route**

```ts
if (method === 'POST' && path === '/scores') {
  const input = await body(request);
  const entries = input.entries;
  if (!Array.isArray(entries) || entries.length === 0) return error(400, 'missing_entries');
  if (entries.length > MAX_BATCH) return error(400, 'batch_too_large');
  return json({ results: await submitScores(env.DB, playerId, entries) });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @puzzle-hustle/api test scores`
Expected: PASS, seven tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/scores.ts apps/api/src/index.ts apps/api/test/scores.test.ts
git commit -m "Accept the first plausible solve of a period puzzle"
```

---

### Task 8: The board and the percentile

**Files:**
- Create: `apps/api/src/board.ts`
- Modify: `apps/api/src/index.ts` (`GET /board`)
- Test: `apps/api/test/board.test.ts`

**Interfaces:**
- Produces: `readBoard(db, playerId, groupId, puzzle): Promise<Board | null>` with
  `interface BoardEntry { playerId: string; name: string; seconds: number; hints: number }` and
  `interface Board { entries: BoardEntry[]; me: number | null; percentile: { total: number; faster: number } | null }`.
  `me` is the 1-based rank of the requesting player, or null if they have not solved it. `percentile` counts every player, not just the group, and is null unless the requester has a score.

- [ ] **Step 1: Write the failing test**

```ts
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, beforeEach, expect, it } from 'vitest';
import { readBoard } from '../src/board.ts';

const PUZZLE = 'sudoku:daily:2026-09-21';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await env.DB.exec('DELETE FROM scores; DELETE FROM members; DELETE FROM groups; DELETE FROM players;');
});

async function player(id: string, name: string) {
  await env.DB.prepare('INSERT INTO players (id, provider, subject, name, created_at) VALUES (?, ?, ?, ?, 0)')
    .bind(id, 'google', id, name)
    .run();
}

async function score(id: string, seconds: number, hints = 0) {
  await env.DB.prepare(
    'INSERT INTO scores (player_id, puzzle, seconds, hints, moves, solved_at, created_at) VALUES (?, ?, ?, ?, 30, 0, 0)',
  )
    .bind(id, PUZZLE, seconds, hints)
    .run();
}

async function group(id: string, members: string[]) {
  await env.DB.prepare('INSERT INTO groups (id, code, name, owner_id, created_at) VALUES (?, ?, ?, ?, 0)')
    .bind(id, id.toUpperCase().slice(0, 6), 'Family', members[0])
    .run();
  for (const m of members) {
    await env.DB.prepare('INSERT INTO members (group_id, player_id, joined_at) VALUES (?, ?, 0)').bind(id, m).run();
  }
}

it('ranks hint-free runs above hinted ones and then by time', async () => {
  await player('a', 'Anna');
  await player('b', 'Ben');
  await player('c', 'Cem');
  await group('g1', ['a', 'b', 'c']);
  await score('a', 200, 1);
  await score('b', 300, 0);
  await score('c', 240, 0);

  const board = (await readBoard(env.DB, 'a', 'g1', PUZZLE))!;
  expect(board.entries.map((e) => e.name)).toEqual(['Cem', 'Ben', 'Anna']);
  expect(board.me).toBe(3);
});

it('leaves out members who have not solved it and players outside the group', async () => {
  await player('a', 'Anna');
  await player('b', 'Ben');
  await player('x', 'Outsider');
  await group('g1', ['a', 'b']);
  await score('a', 200);
  await score('x', 10);

  const board = (await readBoard(env.DB, 'a', 'g1', PUZZLE))!;
  expect(board.entries.map((e) => e.name)).toEqual(['Anna']);
});

it('returns null for a group the caller is not in', async () => {
  await player('a', 'Anna');
  await player('b', 'Ben');
  await group('g1', ['b']);
  expect(await readBoard(env.DB, 'a', 'g1', PUZZLE)).toBeNull();
});

it('counts the percentile over everybody and hides it without an own score', async () => {
  await player('a', 'Anna');
  await group('g1', ['a']);
  for (let i = 0; i < 30; i++) {
    await player(`p${i}`, `P${i}`);
    await score(`p${i}`, 100 + i);
  }

  const without = (await readBoard(env.DB, 'a', 'g1', PUZZLE))!;
  expect(without.percentile).toBeNull();

  await score('a', 105);
  const withScore = (await readBoard(env.DB, 'a', 'g1', PUZZLE))!;
  expect(withScore.percentile).toEqual({ total: 31, faster: 5 });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @puzzle-hustle/api test board`
Expected: FAIL, cannot resolve `../src/board.ts`.

- [ ] **Step 3: Implement `apps/api/src/board.ts`**

```ts
export interface BoardEntry {
  playerId: string;
  name: string;
  seconds: number;
  hints: number;
}

export interface Board {
  entries: BoardEntry[];
  me: number | null;
  percentile: { total: number; faster: number } | null;
}

export async function readBoard(
  db: D1Database,
  playerId: string,
  groupId: string,
  puzzle: string,
): Promise<Board | null> {
  const member = await db
    .prepare('SELECT 1 AS ok FROM members WHERE group_id = ? AND player_id = ?')
    .bind(groupId, playerId)
    .first<{ ok: number }>();
  if (!member) return null;

  const { results } = await db
    .prepare(
      `SELECT s.player_id AS playerId, p.name, s.seconds, s.hints
         FROM scores s
         JOIN members m ON m.player_id = s.player_id AND m.group_id = ?
         JOIN players p ON p.id = s.player_id
        WHERE s.puzzle = ?
        ORDER BY s.hints, s.seconds, s.created_at`,
    )
    .bind(groupId, puzzle)
    .all<BoardEntry>();

  const index = results.findIndex((row) => row.playerId === playerId);
  const mine = results[index];
  let percentile: Board['percentile'] = null;
  if (mine) {
    const counts = await db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN hints < ?1 OR (hints = ?1 AND seconds < ?2) THEN 1 ELSE 0 END) AS faster
           FROM scores WHERE puzzle = ?3`,
      )
      .bind(mine.hints, mine.seconds, puzzle)
      .first<{ total: number; faster: number }>();
    if (counts) percentile = { total: counts.total, faster: counts.faster ?? 0 };
  }

  return { entries: results, me: index >= 0 ? index + 1 : null, percentile };
}
```

- [ ] **Step 4: Add the route**

```ts
if (method === 'GET' && path === '/board') {
  const group = url.searchParams.get('group');
  const puzzle = url.searchParams.get('puzzle');
  if (!group || !puzzle) return error(400, 'missing_query');
  const board = await readBoard(env.DB, playerId, group, puzzle);
  return board ? json(board) : error(404, 'not_a_member');
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @puzzle-hustle/api test board`
Expected: PASS, four tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/board.ts apps/api/src/index.ts apps/api/test/board.test.ts
git commit -m "Read a group board and count the field behind it"
```

---

### Task 9: Reporting a name and deleting an account

**Files:**
- Modify: `apps/api/src/index.ts` (`POST /report`, `DELETE /account`)
- Test: `apps/api/test/account.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 5 to 8.
- Produces: no new module. `DELETE /account` removes the player's scores, memberships (running the same ownership handover as leaving) and finally the player row.

- [ ] **Step 1: Write the failing test**

```ts
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import worker from '../src/index.ts';
import * as google from '../src/google.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await env.DB.exec('DELETE FROM reports; DELETE FROM scores; DELETE FROM members; DELETE FROM groups; DELETE FROM players;');
  vi.restoreAllMocks();
});

async function signIn(subject: string, name: string) {
  vi.spyOn(google, 'verifyGoogleIdToken').mockResolvedValue(subject);
  const response = await worker.fetch(
    new Request('https://api.test/session', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken: 'x', name }),
    }),
    env,
  );
  return (await response.json()) as { token: string; player: { id: string } };
}

const call = (path: string, token: string, init: RequestInit = {}) =>
  worker.fetch(
    new Request(`https://api.test${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } }),
    env,
  );

it('records a report once per pair', async () => {
  const me = await signIn('s1', 'Moritz');
  const other = await signIn('s2', 'Rude');
  const send = () =>
    call('/report', me.token, { method: 'POST', body: JSON.stringify({ playerId: other.player.id, reason: 'name' }) });
  expect((await send()).status).toBe(200);
  expect((await send()).status).toBe(200);
  const rows = await env.DB.prepare('SELECT COUNT(*) AS n FROM reports').first<{ n: number }>();
  expect(rows?.n).toBe(1);
});

it('deletes the player, their scores and their memberships', async () => {
  const me = await signIn('s1', 'Moritz');
  await call('/groups', me.token, { method: 'POST', body: JSON.stringify({ name: 'Family' }) });
  await call('/scores', me.token, {
    method: 'POST',
    body: JSON.stringify({
      entries: [
        {
          puzzle: `sudoku:daily:${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())}`,
          seconds: 200,
          hints: 0,
          moves: 40,
          solvedAt: Date.now(),
        },
      ],
    }),
  });

  expect((await call('/account', me.token, { method: 'DELETE' })).status).toBe(200);

  for (const table of ['players', 'scores', 'members', 'groups']) {
    const rows = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
    expect(rows?.n, table).toBe(0);
  }
  expect((await call('/groups', me.token)).status).toBe(401);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @puzzle-hustle/api test account`
Expected: FAIL, both routes answer 404.

- [ ] **Step 3: Add the routes**

```ts
if (method === 'POST' && path === '/report') {
  const input = await body(request);
  if (typeof input.playerId !== 'string') return error(400, 'missing_id');
  const reason = typeof input.reason === 'string' ? input.reason.slice(0, 200) : 'name';
  const existing = await env.DB.prepare('SELECT id FROM reports WHERE reporter_id = ? AND target_id = ?')
    .bind(playerId, input.playerId)
    .first<{ id: string }>();
  if (!existing) {
    await env.DB.prepare('INSERT INTO reports (id, reporter_id, target_id, reason, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), playerId, input.playerId, reason, Date.now())
      .run();
  }
  return json({});
}

if (method === 'DELETE' && path === '/account') {
  const { results } = await env.DB.prepare('SELECT group_id AS id FROM members WHERE player_id = ?')
    .bind(playerId)
    .all<{ id: string }>();
  for (const row of results) await leaveGroup(env.DB, playerId, row.id);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM scores WHERE player_id = ?').bind(playerId),
    env.DB.prepare('DELETE FROM reports WHERE reporter_id = ? OR target_id = ?').bind(playerId, playerId),
    env.DB.prepare('DELETE FROM players WHERE id = ?').bind(playerId),
  ]);
  return json({});
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @puzzle-hustle/api test` (the whole suite; this is the last API task)
Expected: PASS, every file.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/index.ts apps/api/test/account.test.ts
git commit -m "Report a name and delete an account for good"
```

---

### Task 10: Web API client and stored session

**Files:**
- Create: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/lib/storage.ts` (nothing structural: the new keys use the existing `readSetting`/`writeSetting`)
- Test: `apps/web/test/api.test.ts` plus test wiring in `apps/web/package.json` and a new `apps/web/vitest.config.ts`

`apps/web` currently has no tests (`"test": "echo no web tests yet"`). This task sets that up, because the queue in Task 14 is exactly the kind of logic that must not be tested by hand.

**Interfaces:**
- Produces:
  - `API_BASE: string` (from `import.meta.env.VITE_API_BASE`, default `https://api.puzzles.vexury.dev`)
  - `interface Session { token: string; player: { id: string; name: string } }`
  - `readSession(): Session | null`, `writeSession(s: Session | null): void`
  - `apiFetch<T>(path: string, init?: RequestInit & { auth?: boolean }): Promise<T>` which throws `ApiError` with a `code` field on any non-2xx answer and on a network failure (`code: 'offline'`).

- [ ] **Step 1: Set up web tests**

```bash
pnpm --filter @puzzle-hustle/web add -D jsdom
```

`apps/web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
  },
});
```

In `apps/web/package.json`, replace the test script with `"test": "vitest run"`.

- [ ] **Step 2: Write the failing test**

`apps/web/test/api.test.ts`:

```ts
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, readSession, writeSession } from '../src/lib/api.ts';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('stores and reads a session', () => {
  expect(readSession()).toBeNull();
  writeSession({ token: 't', player: { id: 'p', name: 'Moritz' } });
  expect(readSession()?.player.name).toBe('Moritz');
  writeSession(null);
  expect(readSession()).toBeNull();
});

it('sends the bearer token when asked to', async () => {
  writeSession({ token: 't', player: { id: 'p', name: 'Moritz' } });
  const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);

  await apiFetch('/groups', { auth: true });
  const headers = new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers);
  expect(headers.get('Authorization')).toBe('Bearer t');
});

it('turns an error answer into an ApiError with its code', async () => {
  vi.stubGlobal('fetch', async () => new Response('{"error":"group_unknown"}', { status: 404 }));
  await expect(apiFetch('/groups/join')).rejects.toMatchObject({ code: 'group_unknown', status: 404 });
});

it('turns a network failure into an offline error', async () => {
  vi.stubGlobal('fetch', async () => {
    throw new TypeError('Failed to fetch');
  });
  await expect(apiFetch('/health')).rejects.toBeInstanceOf(ApiError);
  await expect(apiFetch('/health')).rejects.toMatchObject({ code: 'offline' });
});

it('drops the session on a 401 so the app stops pretending to be signed in', async () => {
  writeSession({ token: 't', player: { id: 'p', name: 'Moritz' } });
  vi.stubGlobal('fetch', async () => new Response('{"error":"unauthorized"}', { status: 401 }));
  await expect(apiFetch('/groups', { auth: true })).rejects.toMatchObject({ code: 'unauthorized' });
  expect(readSession()).toBeNull();
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @puzzle-hustle/web test`
Expected: FAIL, cannot resolve `../src/lib/api.ts`.

- [ ] **Step 4: Implement `apps/web/src/lib/api.ts`**

```ts
import { readSetting, writeSetting } from './storage.ts';

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'https://api.puzzles.vexury.dev';

const SESSION_KEY = 'ph:session';

export interface Session {
  token: string;
  player: { id: string; name: string };
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

export function readSession(): Session | null {
  const raw = readSetting(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Session;
    return parsed?.token && parsed.player?.id ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSession(session: Session | null) {
  if (!session) {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* storage unavailable */
    }
    return;
  }
  writeSetting(SESSION_KEY, JSON.stringify(session));
}

export async function apiFetch<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const { auth, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (rest.body) headers.set('Content-Type', 'application/json');
  if (auth) {
    const session = readSession();
    if (!session) throw new ApiError('unauthorized', 401);
    headers.set('Authorization', `Bearer ${session.token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...rest, headers });
  } catch {
    throw new ApiError('offline', 0);
  }

  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    if (response.status === 401) writeSession(null);
    throw new ApiError(data.error ?? 'failed', response.status);
  }
  return data as T;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @puzzle-hustle/web test` and `pnpm --filter @puzzle-hustle/web typecheck`
Expected: PASS, five tests, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/test/api.test.ts apps/web/vitest.config.ts apps/web/package.json pnpm-lock.yaml
git commit -m "Talk to the leaderboard API from the web app"
```

---

### Task 11: Google sign-in on the web and the Friends card

**Files:**
- Create: `apps/web/src/lib/auth.ts`
- Modify: `apps/web/src/pages/Profile.tsx` (**re-read the file first**, another session may have changed it), `apps/web/src/theme.css`, `apps/web/.env.example`
- Test: manual in the browser; the sign-in itself cannot be unit-tested without mocking Google's widget, and a mocked widget tests nothing.

**Interfaces:**
- Consumes: `apiFetch`, `readSession`, `writeSession`, `Session` (Task 10).
- Produces:
  - `useSession(): Session | null` (a `useSyncExternalStore` hook over the stored session)
  - `renderSignInButton(target: HTMLElement, onDone: (s: Session) => void): Promise<void>`
  - `signOut(): void`
  - `setName(name: string): Promise<void>`

- [ ] **Step 1: Write `apps/web/src/lib/auth.ts`**

```ts
import { useSyncExternalStore } from 'react';
import { apiFetch, readSession, writeSession, type Session } from './api.ts';
import { readSetting } from './storage.ts';

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '';
const GSI_SRC = 'https://accounts.google.com/gsi/client';

const listeners = new Set<() => void>();
let current: Session | null = readSession();

function emit() {
  current = readSession();
  for (const l of listeners) l();
}

export function useSession(): Session | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

let loading: Promise<void> | null = null;

// Google's widget is a script tag, not a package. It is loaded on demand so that a player
// who never signs in never talks to Google at all.
function loadGsi(): Promise<void> {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('gsi unavailable'));
    document.head.append(script);
  });
  return loading;
}

interface GsiCredential {
  credential: string;
}

interface Gsi {
  accounts: {
    id: {
      initialize(options: { client_id: string; callback: (r: GsiCredential) => void }): void;
      renderButton(target: HTMLElement, options: Record<string, string>): void;
      disableAutoSelect(): void;
    };
  };
}

export async function renderSignInButton(target: HTMLElement, onDone: (session: Session) => void): Promise<void> {
  if (!CLIENT_ID) throw new Error('no client id');
  await loadGsi();
  const gsi = (window as unknown as { google?: Gsi }).google;
  if (!gsi) throw new Error('gsi unavailable');

  gsi.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: async (response) => {
      const session = await apiFetch<Session>('/session', {
        method: 'POST',
        body: JSON.stringify({
          provider: 'google',
          idToken: response.credential,
          name: readSetting('ph:name') ?? undefined,
        }),
      });
      writeSession(session);
      emit();
      onDone(session);
    },
  });
  gsi.accounts.id.renderButton(target, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with' });
}

export function signOut() {
  const gsi = (window as unknown as { google?: Gsi }).google;
  gsi?.accounts.id.disableAutoSelect();
  writeSession(null);
  emit();
}

export async function setName(name: string): Promise<void> {
  const result = await apiFetch<{ name: string }>('/name', { method: 'POST', body: JSON.stringify({ name }), auth: true });
  const session = readSession();
  if (session) writeSession({ ...session, player: { ...session.player, name: result.name } });
  emit();
}

export async function deleteAccount(): Promise<void> {
  await apiFetch('/account', { method: 'DELETE', auth: true });
  signOut();
}
```

- [ ] **Step 2: Document the two environment variables**

Create `apps/web/.env.example`:

```
VITE_API_BASE=https://api.puzzles.vexury.dev
VITE_GOOGLE_CLIENT_ID=
```

Without `VITE_GOOGLE_CLIENT_ID` the Friends card must still render; it just shows that sign-in is unavailable. Never commit a real `.env`.

- [ ] **Step 3: Add the Friends card to the Profile page**

Re-read `apps/web/src/pages/Profile.tsx` before editing. Add, below the existing display-name row and above the stats table, a card component defined in the same file:

```tsx
function FriendsCard() {
  const session = useSession();
  const buttonHost = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (session || !buttonHost.current) return;
    renderSignInButton(buttonHost.current, () => setFailed(false)).catch(() => setFailed(true));
  }, [session]);

  if (!session) {
    return (
      <section className="card">
        <h2>Friends</h2>
        <p className="muted small">Sign in to compare your daily times with a group of friends. Everything else works without an account.</p>
        <div ref={buttonHost} />
        {failed && <p className="muted small">Sign-in is unavailable right now.</p>}
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Friends</h2>
      <p className="muted small">Signed in as {session.player.name}.</p>
      <div className="friends-actions">
        <a href={href('/friends')} className="pill" onClick={onLinkClick}>
          Groups ›
        </a>
        <button type="button" className="pill outline" onClick={signOut}>
          Sign out
        </button>
        <button
          type="button"
          className={confirmDelete ? 'pill danger' : 'pill outline'}
          onClick={() => {
            if (!confirmDelete) {
              setConfirmDelete(true);
              setTimeout(() => setConfirmDelete(false), 4000);
              return;
            }
            void deleteAccount();
          }}
        >
          {confirmDelete ? 'Sure?' : 'Delete account'}
        </button>
      </div>
    </section>
  );
}
```

The two-step delete button copies the reset button's pattern from 2026-09-21 deliberately: same idea, same timing, no dialog.

- [ ] **Step 4: Keep the local name and the server name in step**

In the existing `commitName` handler, after `writeSetting('ph:name', v)`, add:

```ts
if (readSession()) void setName(v).catch(() => undefined);
```

A rejected name on the server must not block the local one; the Friends card shows whatever the server accepted.

- [ ] **Step 5: Style the new pieces**

In `apps/web/src/theme.css`, next to the existing `.pill` rules, add `.friends-actions` (flex, wrap, gap `0.5rem`) and `.pill.danger` (background `var(--flame)`, white text) if `.pill.danger` does not already exist. Re-read the file first; another session is editing it.

- [ ] **Step 6: Check it in the browser**

Run: `pnpm dev`, open the Profile tab in both themes.
Expected: without `VITE_GOOGLE_CLIENT_ID` the card renders with the explanatory text and no crash; with one, Google's button appears and a sign-in fills the card with the player's name.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/auth.ts apps/web/src/pages/Profile.tsx apps/web/src/theme.css apps/web/.env.example
git commit -m "Offer an optional Google sign-in in the profile"
```

---

### Task 12: The Friends page

**Files:**
- Create: `apps/web/src/pages/Friends.tsx`
- Modify: `apps/web/src/App.tsx` (route `/friends`), `apps/web/src/theme.css`
- Test: manual in the browser against a locally running Worker (`pnpm --filter @puzzle-hustle/api dev`)

**Interfaces:**
- Consumes: `apiFetch` (Task 10), `useSession` (Task 11).
- Produces: `interface Group { id: string; code: string; name: string; members: number; owner: boolean }`; `useGroups(): { groups: Group[]; reload: () => void; loading: boolean }`, exported from `Friends.tsx` because Task 15 needs it for the Daily card.

- [ ] **Step 1: Write the page**

`apps/web/src/pages/Friends.tsx` renders, in this order:

1. A page head with the title `Friends`. Task 15 inserts the board below it; this task ships the page without one, and an empty page head is a finished screen, not a gap.
2. The group list: one `row-card` per group showing name, member count and the code, plus a Leave button.
3. A create form (text input plus a `Create` pill) and a join form (six character input, uppercased on change, plus a `Join` pill).
4. Signed out, the same invitation sentence as the Profile card plus a link to the Profile tab.

```tsx
import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch } from '../lib/api.ts';
import { useSession } from '../lib/auth.ts';
import { href, onLinkClick } from '../lib/router.ts';
import { toast } from '../components/Toast.tsx';

export interface Group {
  id: string;
  code: string;
  name: string;
  members: number;
  owner: boolean;
}

export function useGroups(): { groups: Group[]; reload: () => void; loading: boolean } {
  const session = useSession();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(() => {
    if (!session) {
      setGroups([]);
      return;
    }
    setLoading(true);
    apiFetch<{ groups: Group[] }>('/groups', { auth: true })
      .then((data) => setGroups(data.groups))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(reload, [reload]);
  return { groups, reload, loading };
}

const MESSAGES: Record<string, string> = {
  group_unknown: 'No group with that code',
  group_already: 'You are already in that group',
  group_full: 'That group is full',
  group_limit: 'You are in five groups already',
  group_name: 'Pick a different name',
  offline: 'No connection',
};

function explain(err: unknown): string {
  return err instanceof ApiError ? (MESSAGES[err.code] ?? 'Something went wrong') : 'Something went wrong';
}

export function Friends() {
  const session = useSession();
  const { groups, reload } = useGroups();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  if (!session) {
    return (
      <section className="page-head">
        <h1>Friends</h1>
        <p className="muted">Sign in on the Profile tab to compare your daily times with a group of friends.</p>
        <a href={href('/profile')} className="pill" onClick={onLinkClick}>
          To Profile ›
        </a>
      </section>
    );
  }

  const create = async () => {
    try {
      await apiFetch<Group>('/groups', { method: 'POST', body: JSON.stringify({ name }), auth: true });
      setName('');
      reload();
    } catch (err) {
      toast(explain(err));
    }
  };

  const join = async () => {
    try {
      const group = await apiFetch<Group>('/groups/join', { method: 'POST', body: JSON.stringify({ code }), auth: true });
      setCode('');
      reload();
      toast(`Joined ${group.name}`);
    } catch (err) {
      toast(explain(err));
    }
  };

  const leave = async (group: Group) => {
    try {
      await apiFetch('/groups/leave', { method: 'POST', body: JSON.stringify({ id: group.id }), auth: true });
      reload();
    } catch (err) {
      toast(explain(err));
    }
  };

  return (
    <>
      <section className="page-head">
        <h1>Friends</h1>
      </section>

      {groups.map((group) => (
        <div key={group.id} className="row-card">
          <span className="row-text">
            <span className="row-title">{group.name}</span>
            <span className="row-sub">
              {group.members} member{group.members === 1 ? '' : 's'} · code <b className="num">{group.code}</b>
            </span>
          </span>
          <button type="button" className="pill outline" onClick={() => void leave(group)}>
            Leave
          </button>
        </div>
      ))}

      <section className="card">
        <h2>New group</h2>
        <div className="friends-actions">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Group name" />
          <button type="button" className="pill" onClick={() => void create()} disabled={name.trim().length < 2}>
            Create
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Join a group</h2>
        <div className="friends-actions">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="CODE"
            className="num"
          />
          <button type="button" className="pill" onClick={() => void join()} disabled={code.length !== 6}>
            Join
          </button>
        </div>
      </section>
    </>
  );
}
```

- [ ] **Step 2: Add the route**

In `apps/web/src/App.tsx`, next to the `/profile` branch:

```tsx
else if (route.path === '/friends') page = <Friends />;
```

with the matching import. The tab bar keeps its three entries; `/friends` is reached from the Profile card and, after Task 15, from the Daily tab.

- [ ] **Step 3: Check it in the browser**

Run the Worker locally and point the app at it:

```bash
pnpm --filter @puzzle-hustle/api migrate:local
pnpm --filter @puzzle-hustle/api dev
```

In a second shell, with `VITE_API_BASE=http://127.0.0.1:8787` in `apps/web/.env.local`, run `pnpm dev`.
Expected: create a group, see the code, join it from a private window with a second Google account, both member counts read 2, Leave empties the list.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/Friends.tsx apps/web/src/App.tsx apps/web/src/theme.css
git commit -m "Add a Friends page for creating and joining groups"
```

---

### Task 13: Joining through a shared link

**Files:**
- Modify: `apps/web/src/App.tsx` (route `/join`), `apps/web/src/pages/Friends.tsx` (read the code from the query)
- Test: manual

**Interfaces:**
- Consumes: the `Friends` page from Task 12.
- Produces: `/join?c=ABC123` renders the Friends page with the code prefilled; signed out it says what the link is and points at the Profile tab. The link text is built where the group list is rendered, using the same `share()` helper the app already uses for puzzles.

- [ ] **Step 1: Accept a prefilled code**

Give `Friends` an optional prop and use it as the initial state:

```tsx
export function Friends({ code: initialCode = '' }: { code?: string } = {}) {
  ...
  const [code, setCode] = useState(initialCode.toUpperCase().slice(0, 6));
```

- [ ] **Step 2: Route `/join`**

In `App.tsx`:

```tsx
else if (route.path === '/join') page = <Friends code={route.params.get('c') ?? ''} />;
```

- [ ] **Step 3: Add a share button to each group row**

In the group row in `Friends.tsx`, beside Leave:

```tsx
<button
  type="button"
  className="pill outline"
  onClick={() =>
    void share(`Join my Puzzle Hustle group "${group.name}"\nCode ${group.code}\n${joinUrl(group.code)}`).then(
      (outcome) => {
        if (outcome === 'copied') toast('Link copied');
        else if (outcome === 'failed') toast('Could not share');
      },
    )
  }
>
  Invite
</button>
```

and, in `apps/web/src/lib/share.ts`, next to `puzzleUrl`:

```ts
export function joinUrl(code: string): string {
  const origin = Capacitor.isNativePlatform() ? SHARE_ORIGIN : location.origin;
  return `${origin}${href('/join')}?c=${code}`;
}
```

This reuses the fixed native origin, which is exactly the trap recorded on 2026-09-21: `location.origin` inside the WebView is `https://localhost` and would ship a dead invitation.

- [ ] **Step 4: Check it in the browser**

Expected: opening `/join?c=<code>` prefills the field, Join works in one tap, and an unknown code shows "No group with that code" instead of an empty screen.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/pages/Friends.tsx apps/web/src/lib/share.ts
git commit -m "Invite to a group with a link"
```

---

### Task 14: The score queue

**Files:**
- Create: `apps/web/src/lib/queue.ts`
- Modify: `apps/web/src/pages/Play.tsx` (`onSolved`), `apps/web/src/main.tsx` (**re-read first**)
- Test: `apps/web/test/queue.test.ts`

**Interfaces:**
- Consumes: `apiFetch`, `readSession` (Task 10).
- Produces:
  - `enqueue(puzzle: string, record: { seconds: number; hints: number; moves: number; solvedAt: string }): void`
  - `readQueue(): QueuedScore[]` with `interface QueuedScore { puzzle: string; seconds: number; hints: number; moves: number; solvedAt: number }`
  - `flush(): Promise<void>` (idempotent, never throws)
  - `initQueue(): void` (flush on start, on `online`, and when the page becomes visible)
  - `resetBackoff(): void` (tests only, so one failing case cannot silence the next)
  - `MAX_QUEUE = 100`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { writeSession } from '../src/lib/api.ts';
import { enqueue, flush, readQueue, resetBackoff } from '../src/lib/queue.ts';

const record = { seconds: 200, hints: 0, moves: 40, solvedAt: new Date().toISOString() };

beforeEach(() => {
  localStorage.clear();
  resetBackoff();
  writeSession({ token: 't', player: { id: 'p', name: 'Moritz' } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('keeps only period puzzles and only the first entry per puzzle', () => {
  enqueue('sudoku:daily:2026-09-21', record);
  enqueue('sudoku:daily:2026-09-21', { ...record, seconds: 5 });
  enqueue('sudoku:level:easy:3', record);
  expect(readQueue().map((e) => e.puzzle)).toEqual(['sudoku:daily:2026-09-21']);
  expect(readQueue()[0]?.seconds).toBe(200);
});

it('drops entries the server has answered and keeps the rest', async () => {
  enqueue('sudoku:daily:2026-09-21', record);
  enqueue('crowns:daily:2026-09-21', record);
  vi.stubGlobal('fetch', async () =>
    new Response(
      JSON.stringify({
        results: [
          { puzzle: 'sudoku:daily:2026-09-21', status: 'stored' },
          { puzzle: 'crowns:daily:2026-09-21', status: 'rejected' },
        ],
      }),
      { status: 200 },
    ),
  );
  await flush();
  expect(readQueue()).toEqual([]);
});

it('keeps everything when the network fails', async () => {
  enqueue('sudoku:daily:2026-09-21', record);
  vi.stubGlobal('fetch', async () => {
    throw new TypeError('Failed to fetch');
  });
  await flush();
  expect(readQueue()).toHaveLength(1);
});

it('does nothing without a session', async () => {
  writeSession(null);
  enqueue('sudoku:daily:2026-09-21', record);
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  await flush();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(readQueue()).toHaveLength(1);
});

it('caps the queue and drops the oldest', () => {
  for (let i = 0; i < 105; i++) enqueue(`sudoku:daily:2026-01-${String((i % 28) + 1).padStart(2, '0')}`, record);
  expect(readQueue().length).toBeLessThanOrEqual(100);
});

it('waits after a failure instead of hammering the server', async () => {
  enqueue('sudoku:daily:2026-09-21', record);
  const fetchMock = vi.fn(async () => {
    throw new TypeError('Failed to fetch');
  });
  vi.stubGlobal('fetch', fetchMock);
  await flush();
  await flush();
  await flush();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @puzzle-hustle/web test queue`
Expected: FAIL, cannot resolve `../src/lib/queue.ts`.

- [ ] **Step 3: Implement `apps/web/src/lib/queue.ts`**

```ts
import { parsePuzzleId } from '@puzzle-hustle/core';
import { apiFetch, readSession } from './api.ts';
import { readSetting, writeSetting } from './storage.ts';

const KEY = 'ph:queue';
export const MAX_QUEUE = 100;
const BATCH = 20;

export interface QueuedScore {
  puzzle: string;
  seconds: number;
  hints: number;
  moves: number;
  solvedAt: number;
}

export function readQueue(): QueuedScore[] {
  try {
    const raw = readSetting(KEY);
    const parsed = raw ? (JSON.parse(raw) as QueuedScore[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(entries: QueuedScore[]) {
  writeSetting(KEY, JSON.stringify(entries.slice(-MAX_QUEUE)));
}

export function enqueue(
  puzzle: string,
  record: { seconds: number; hints: number; moves: number; solvedAt: string },
): void {
  if (!parsePuzzleId(puzzle)) return;
  const queue = readQueue();
  if (queue.some((entry) => entry.puzzle === puzzle)) return;
  queue.push({
    puzzle,
    seconds: record.seconds,
    hints: record.hints,
    moves: record.moves,
    solvedAt: Date.parse(record.solvedAt) || Date.now(),
  });
  writeQueue(queue);
}

let running: Promise<void> | null = null;

// Backoff lives in memory only. A fresh start is always allowed one attempt, which is what
// somebody who just turned the plane mode off expects.
const MIN_BACKOFF = 5_000;
const MAX_BACKOFF = 300_000;
let backoff = MIN_BACKOFF;
let nextAttempt = 0;

function failed() {
  nextAttempt = Date.now() + backoff;
  backoff = Math.min(backoff * 2, MAX_BACKOFF);
}

function succeeded() {
  backoff = MIN_BACKOFF;
  nextAttempt = 0;
}

export function resetBackoff() {
  succeeded();
}

async function run(): Promise<void> {
  if (!readSession()) return;
  if (Date.now() < nextAttempt) return;
  let queue = readQueue();
  while (queue.length > 0) {
    const batch = queue.slice(0, BATCH);
    let results: Array<{ puzzle: string; status: string }>;
    try {
      const answer = await apiFetch<{ results: Array<{ puzzle: string; status: string }> }>('/scores', {
        method: 'POST',
        body: JSON.stringify({ entries: batch }),
        auth: true,
      });
      results = answer.results;
      succeeded();
    } catch {
      // Offline, throttled by the browser, or signed out: every entry stays where it is and
      // the next trigger tries again, later each time. Never surfaced to the player.
      failed();
      return;
    }
    const answered = new Set(results.filter((r) => r.status !== 'throttled').map((r) => r.puzzle));
    queue = readQueue().filter((entry) => !answered.has(entry.puzzle));
    writeQueue(queue);
    // The daily limit is spent. Trying again in this session would only burn requests.
    if (results.some((r) => r.status === 'throttled')) {
      failed();
      return;
    }
  }
}

export function flush(): Promise<void> {
  if (!running) running = run().finally(() => (running = null));
  return running;
}

export function initQueue(): void {
  void flush();
  window.addEventListener('online', () => void flush());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void flush();
  });
}
```

- [ ] **Step 4: Enqueue on solving**

In `apps/web/src/pages/Play.tsx`, inside `onSolved`, directly after `recordSolve(id, record);`:

```ts
if (puzzleRef.period) {
  enqueue(id, record);
  void flush();
}
```

with `import { enqueue, flush } from '../lib/queue.ts';` added to the imports. Nothing here is awaited, and nothing here can throw into the solve path.

- [ ] **Step 5: Start the queue with the app**

Re-read `apps/web/src/main.tsx`, then add `initQueue();` after `initBackButton();`, with the matching import.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @puzzle-hustle/web test` and `pnpm -r typecheck`
Expected: PASS, all files, no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/queue.ts apps/web/src/pages/Play.tsx apps/web/src/main.tsx apps/web/test/queue.test.ts
git commit -m "Queue solved period puzzles until the network is back"
```

---

### Task 15: Board, Daily card and the placement line

The last piece: the numbers finally become visible.

**Files:**
- Create: `apps/web/src/components/Board.tsx`
- Modify: `apps/web/src/pages/Friends.tsx`, `apps/web/src/pages/Daily.tsx`, `apps/web/src/pages/Play.tsx`, `apps/web/src/theme.css`
- Test: manual in the browser with two accounts

**Interfaces:**
- Consumes: `useGroups` (Task 12), `apiFetch` (Task 10), `formatSeconds` (`lib/share.ts`), `dailyRef`/`periodRef`/`refId` (core).
- Produces:
  - `interface BoardData { entries: Array<{ playerId: string; name: string; seconds: number; hints: number }>; me: number | null; percentile: { total: number; faster: number } | null }`
  - `useBoard(groupId: string | null, puzzle: string): { board: BoardData | null; loading: boolean }`
  - `percentileText(percentile: BoardData['percentile']): string | null`
  - `<Board groupId={string} puzzle={string} meId={string} />` rendering the ranked rows, the percentile line and a report button on every row that is not the player's own.

- [ ] **Step 1: Write the Board component**

```tsx
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.ts';
import { formatSeconds } from '../lib/share.ts';
import { toast } from './Toast.tsx';

export interface BoardData {
  entries: Array<{ playerId: string; name: string; seconds: number; hints: number }>;
  me: number | null;
  percentile: { total: number; faster: number } | null;
}

export function useBoard(groupId: string | null, puzzle: string): { board: BoardData | null; loading: boolean } {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!groupId) {
      setBoard(null);
      return;
    }
    setLoading(true);
    apiFetch<BoardData>(`/board?group=${encodeURIComponent(groupId)}&puzzle=${encodeURIComponent(puzzle)}`, { auth: true })
      .then(setBoard)
      .catch(() => setBoard(null))
      .finally(() => setLoading(false));
  }, [groupId, puzzle]);
  return { board, loading };
}

// "Faster than N%" compares against everybody else who solved this puzzle, so the player
// themselves is out of both sides of the fraction. Below 20 submissions the number says
// more about the size of the field than about the player, so it stays hidden.
export function percentileText(percentile: BoardData['percentile']): string | null {
  if (!percentile || percentile.total < 20) return null;
  const others = percentile.total - 1;
  const beaten = others - percentile.faster;
  return `Faster than ${Math.round((beaten / others) * 100)}% of all players today`;
}

export function Board({ groupId, puzzle, meId }: { groupId: string; puzzle: string; meId: string }) {
  const { board, loading } = useBoard(groupId, puzzle);
  if (loading && !board) return <p className="muted small">Loading…</p>;
  if (!board) return <p className="muted small">Standings are unavailable right now.</p>;
  if (board.entries.length === 0) return <p className="muted small">Nobody in this group has solved it yet.</p>;

  const percentile = percentileText(board.percentile);
  return (
    <>
      <ol className="board">
        {board.entries.map((entry, index) => (
          <li key={entry.playerId} className={entry.playerId === meId ? 'board-row me' : 'board-row'}>
            <span className="board-rank num">{index + 1}</span>
            <span className="board-name">{entry.name}</span>
            {entry.hints > 0 && <span className="muted small">{entry.hints} hint{entry.hints === 1 ? '' : 's'}</span>}
            <span className="board-time num">{formatSeconds(entry.seconds)}</span>
            {entry.playerId !== meId && (
              <button
                type="button"
                className="board-report"
                aria-label={`Report ${entry.name}`}
                title="Report this name"
                onClick={() =>
                  void apiFetch('/report', {
                    method: 'POST',
                    body: JSON.stringify({ playerId: entry.playerId, reason: 'name' }),
                    auth: true,
                  })
                    .then(() => toast('Reported'))
                    .catch(() => toast('Could not report'))
                }
              >
                ⚑
              </button>
            )}
          </li>
        ))}
      </ol>
      {percentile && <p className="muted small">{percentile}</p>}
    </>
  );
}
```

- [ ] **Step 2: Show today's boards on the Friends page**

In `Friends.tsx`, add two pieces of state and a section above the group list. It renders only when the player is in at least one group, so a first-time visitor still sees only the create and join forms.

```tsx
const puzzles = [...PUZZLE_TYPES.map((type) => dailyRef(type)), periodRef('weekly'), periodRef('monthly')];
const [groupId, setGroupId] = useState<string | null>(null);
const [puzzleIndex, setPuzzleIndex] = useState(0);
const active = groupId ?? groups[0]?.id ?? null;
const puzzle = puzzles[puzzleIndex]!;
```

```tsx
{active && (
  <section className="card">
    <h2>Standings</h2>
    {groups.length > 1 && (
      <div className="pill-row">
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            className={group.id === active ? 'pill' : 'pill outline'}
            onClick={() => setGroupId(group.id)}
          >
            {group.name}
          </button>
        ))}
      </div>
    )}
    <div className="pill-row">
      {puzzles.map((ref, index) => (
        <button
          key={refId(ref)}
          type="button"
          className={index === puzzleIndex ? 'pill' : 'pill outline'}
          onClick={() => setPuzzleIndex(index)}
        >
          {ref.period === 'daily' ? PUZZLE_META[ref.type].name : capitalize(ref.period!)}
        </button>
      ))}
    </div>
    <Board groupId={active} puzzle={refId(puzzle)} meId={session.player.id} />
  </section>
)}
```

Add `.pill-row` to `theme.css` if it does not exist: flex, wrap, `gap: 0.4rem`, horizontal scroll allowed. The imports this needs are `PUZZLE_META`, `PUZZLE_TYPES`, `dailyRef`, `periodRef`, `refId` from `@puzzle-hustle/core`, `capitalize` from `../lib/share.ts` and `Board` from `../components/Board.tsx`.

- [ ] **Step 3: Add the Daily tab card**

In `apps/web/src/pages/Daily.tsx`, below the Monthly section, using the existing `row-card` markup so it keeps the rhythm of the puzzle rows:

```tsx
function FriendsRow() {
  const { groups } = useGroups();
  const group = groups[0];
  return (
    <a href={href('/friends')} onClick={onLinkClick} className="row-card">
      <span className="row-text">
        <span className="row-title">{group ? group.name : 'Friends'}</span>
        <span className="row-sub">
          {group ? `${group.members} member${group.members === 1 ? '' : 's'}` : 'Compare your times with a group'}
        </span>
      </span>
      <span className="pill outline">{group ? 'Standings' : 'Open'}</span>
    </a>
  );
}
```

Render it as `<FriendsRow />` after the Monthly section, and import `useGroups` from `./Friends.tsx`. Signed out, `useGroups` returns an empty list without touching the network, so the row reads as an invitation and costs nothing.

- [ ] **Step 4: Add the placement line after solving**

In `Play.tsx`, inside the `result &&` block under the time, add a small component that shows the player's rank in their first group, and renders nothing at all when there is no session, no group, no network or no rank:

```tsx
function Placement({ puzzle }: { puzzle: string }) {
  const session = useSession();
  const { groups } = useGroups();
  const group = groups[0] ?? null;
  const { board } = useBoard(group?.id ?? null, puzzle);
  if (!session || !group || !board?.me) return null;
  const suffix = board.me === 1 ? 'st' : board.me === 2 ? 'nd' : board.me === 3 ? 'rd' : 'th';
  return (
    <span className="muted small">
      {board.me}
      {suffix} of {board.entries.length} in {group.name}
    </span>
  );
}
```

rendered inside the existing `solved-head` block as `{puzzleRef.period && <Placement puzzle={id} />}`. `Play.tsx` needs three more imports for it: `useSession` from `../lib/auth.ts`, `useGroups` from `./Friends.tsx` and `useBoard` from `../components/Board.tsx`.

The board is fetched after the solve has been submitted, so the player's own row is already in it. If the submission is still queued because the device is offline, `useBoard` fails, `board` stays null and the component renders nothing, which is the intended behaviour and not an error path.

- [ ] **Step 5: Style the board**

In `theme.css`: `.board` as a list without markers, `.board-row` a grid of rank, name, hints, time and report button, `.board-row.me` with the accent background at low opacity, `.board-rank` and `.board-time` in the number font (Inconsolata, as everywhere else), `.board-report` a borderless muted button. Check light and dark.

- [ ] **Step 6: Check it in the browser**

Expected, with two accounts in one group and a solved daily each: both names appear ranked, the own row is highlighted, a hinted run sits below a clean one with a longer time, the placement line shows up under the time after solving, and pulling the network mid-solve leaves the result screen completely unchanged.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/Board.tsx apps/web/src/pages/Friends.tsx apps/web/src/pages/Daily.tsx apps/web/src/pages/Play.tsx apps/web/src/theme.css
git commit -m "Show group standings and where today's time ranks"
```

---

### Task 16: Deploy the Worker

**Files:**
- Create: `.github/workflows/api.yml`
- Modify: `apps/api/wrangler.toml` (real `database_id`, route)
- Test: `curl https://api.puzzles.vexury.dev/health`

**Interfaces:**
- Consumes: the finished Worker.
- Produces: a deployed API at `api.puzzles.vexury.dev` and a documented set of secrets.

- [ ] **Step 1: Create the database and note its id**

```bash
pnpm --filter @puzzle-hustle/api exec wrangler d1 create puzzle-hustle --location weur
```

Put the printed `database_id` into `wrangler.toml`. The location hint keeps the rows in the EU, which is what the privacy policy will claim.

- [ ] **Step 2: Add the route and the OAuth client id**

In `wrangler.toml`:

```toml
routes = [{ pattern = "api.puzzles.vexury.dev", custom_domain = true }]

[vars]
GOOGLE_CLIENT_IDS = "<the web OAuth client id>"
```

The web client id is not a secret; it ships in the app bundle anyway.

- [ ] **Step 3: Set the session secret and run the migration**

```bash
pnpm --filter @puzzle-hustle/api exec wrangler secret put SESSION_SECRET
pnpm --filter @puzzle-hustle/api migrate:remote
```

Generate the secret with `openssl rand -base64 32` and store it in the password manager, never in the repo. Rotating it signs everybody out, which is the intended emergency exit.

- [ ] **Step 4: Add the deploy workflow**

`.github/workflows/api.yml`, triggered on pushes to `main` that touch `apps/api/**` or `packages/core/**`: checkout, pnpm, `pnpm install --frozen-lockfile`, `pnpm --filter @puzzle-hustle/api test`, then `wrangler deploy` via `cloudflare/wrangler-action` with `CLOUDFLARE_API_TOKEN` from repository secrets. Tests gate the deploy, exactly as the web workflow does.

Keep it a separate workflow: a failing API test must never block the web deploy, and a web-only change must not redeploy the Worker.

- [ ] **Step 5: Set the web build variables**

Add `VITE_API_BASE` and `VITE_GOOGLE_CLIENT_ID` as repository variables and pass them into the existing web build step in `deploy.yml`. Remember the Git Bash trap from 2026-09-19: set values that look like paths from PowerShell, or prefix with `MSYS_NO_PATHCONV=1`.

- [ ] **Step 6: Verify the deployment**

```bash
curl -s https://api.puzzles.vexury.dev/health
```

Expected: `{"ok":true}`. Then sign in on https://puzzles.vexury.dev, create a group, solve a daily and confirm the row appears in the list.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/api.yml apps/api/wrangler.toml
git commit -m "Deploy the leaderboard API to its own subdomain"
```

---

## After this plan

- Update `~/hub/wiki/puzzle-hustle.md` through the `sync-wiki` skill: the leaderboard decisions, the new `apps/api` package, the API subdomain, the D1 location, and the fact that open item "Daily-Bestenliste" is now half done (web yes, native no).
- Write the plan for milestones 5 and 6 (native Google sign-in, in-app and web account deletion, reporting, privacy policy, the three Play declarations). None of the Play work is needed until the app itself carries sign-in.
- Milestone 7 (Apple sign-in) waits for the iOS build and the Apple Developer Program.
