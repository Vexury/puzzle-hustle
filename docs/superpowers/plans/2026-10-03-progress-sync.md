# Progress Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in player sees the same profile (stats, streaks, Hustle level, coins, owned items, flairs, achievements, equipment) on web, Android and iOS.

**Architecture:** Four local stores (`ph:solves`, `ph:coins:spent`, `ph:coins:doubled`, `ph:cosmetics`) form a `SaveData` snapshot. A pure, commutative, idempotent `mergeSave` in `packages/core` merges two snapshots. `POST /sync` in the Worker merges the client's snapshot into a `saves` row and returns the result; the client merges that answer with whatever changed locally meanwhile and writes it back. Everything else (coins, flairs, achievements, Hustle) is already derived from these stores.

**Tech Stack:** TypeScript, React 19 + React Compiler, Vite 8, Vitest, Cloudflare Workers + D1 (`apps/api`, tests in `@cloudflare/vitest-pool-workers`), pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-10-03-progress-sync-design.md`

## Global Constraints

- Signed out, the app behaves exactly as today. Playing never waits on a sync; offline or a failed request is silent.
- Synced: `ph:solves`, `ph:coins:spent`, `ph:coins:doubled`, `ph:cosmetics` (badges, flair, theme pack, nameplate). Not synced: `ph:progress:*`, `ph:view:*`, settings, light/dark `theme`, name, `ph:queue`.
- New local keys: `ph:sync:resetAt` (number as string), `ph:sync:player` (player id).
- Limits: request body at most 1 000 000 characters (413), at most 20 000 solves, 5 000 spend entries, 20 000 doubled ids, ids at most 64 characters.
- Debounce 5 000 ms after a write to a synced store; `keepalive` only below 60 000 characters.
- `players.hustle` is set exactly (no `MAX`) by `/sync`, clamped to `HUSTLE_MAX_STAGE`. `POST /hustle` stays unchanged for old app versions.
- Reset while signed in is account-wide; reset while signed out stays local and sets no `resetAt`.
- Code comments and UI copy in English; repo docs (`docs/*.md`) in German as they are today.
- Commits: stage files explicitly (never `git add -A`); body ends with the prose line `Implemented with assistance from Claude Opus 5.5.`; no `Co-Authored-By` trailer. Do not push; pushing both remotes and deploying the Worker happen only after Moritz says so.

## Review Focus

1. Device clocks disagree: a solve made after a reset on a device whose clock lags could fall before `resetAt` and vanish. Expected: the resetting side is never filtered; a stale side keeps everything at or after `R`. Pinned in Task 1 (`keeps a stale side's solves at or after the reset`).
2. Stored equipment from before this change (`{ badge }` or `{ badges, ... }` without `at`) must read as equipment with `at: 0`, not as nothing. Pinned in Task 1 (`reads legacy equipment`).
3. One corrupt entry in `ph:solves` (non-object, bad date, negative seconds) must not block the whole sync. Expected: that entry is dropped, the rest syncs. Pinned in Task 1 (`drops bad entries one by one`).
4. A local snapshot over the limits must never be replaced by an empty one. Expected: no request, local data untouched. Pinned in Task 4 (`skips a snapshot over the limits`).
5. A failed or offline sync must not touch local data, and a later trigger must retry. Pinned in Task 4 (`leaves everything alone when the request fails`).

---

### Task 1: `SaveData` and `mergeSave` in core

**Files:**
- Create: `packages/core/src/save.ts`
- Modify: `packages/core/src/index.ts` (add `export * from './save.ts';` after `coins.ts`)
- Test: `packages/core/test/save.test.ts`

**Interfaces:**
- Consumes: `ACHIEVEMENTS_EPOCH`, `SolveEntry` (`achievements.ts`); `SpendEntry` (`coins.ts`); `parseSolveId` (`solveId.ts`).
- Produces:
  - `interface SolveRecord { solvedAt: string; seconds: number; hints: number; moves: number }`
  - `interface SavedEquipment { badges: string[]; flair: string | null; theme: string | null; nameplate: string | null; at: number }`
  - `interface SaveData { solves: Record<string, SolveRecord>; spent: SpendEntry[]; doubled: string[]; equipped: SavedEquipment; resetAt: number }`
  - `const SAVE_LIMITS: { solves: 20000; spent: 5000; doubled: 20000; idLength: 64 }`
  - `function emptySave(): SaveData`
  - `function noEquipment(at?: number): SavedEquipment`
  - `function isSpendEntry(value: unknown): value is SpendEntry`
  - `function parseEquipment(value: unknown): SavedEquipment`
  - `function parseSaveData(value: unknown): SaveData | null` (null = not an object or over a limit)
  - `function mergeSave(a: SaveData, b: SaveData): SaveData`
  - `function saveSolveEntries(solves: Record<string, SolveRecord>): SolveEntry[]`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/test/save.test.ts
import { expect, it } from 'vitest';
import { ACHIEVEMENTS_EPOCH } from '../src/achievements.ts';
import { emptySave, mergeSave, noEquipment, parseEquipment, parseSaveData, saveSolveEntries, type SaveData, type SolveRecord } from '../src/save.ts';

const at = (iso: string) => Date.parse(iso);
const rec = (solvedAt: string, seconds = 60, hints = 0, moves = 20): SolveRecord => ({ solvedAt, seconds, hints, moves });
const save = (patch: Partial<SaveData>): SaveData => ({ ...emptySave(), ...patch });

const A = save({
  solves: {
    'zip:daily:2026-10-01': rec('2026-10-01T08:00:00.000Z', 90),
    'zip:level:easy:1': rec('2026-10-01T09:00:00.000Z', 50, 1),
    'hustle:1': rec('2026-10-01T10:00:00.000Z'),
  },
  spent: [{ kind: 'item', item: 'badge-star', coins: 100, at: at('2026-10-01T11:00:00Z') }],
  doubled: ['zip:daily:2026-10-01'],
  equipped: { badges: ['badge-star'], flair: null, theme: null, nameplate: null, at: 5 },
});
const B = save({
  solves: {
    'zip:daily:2026-10-01': rec('2026-10-01T07:00:00.000Z', 120),
    'zip:level:easy:1': rec('2026-10-01T06:00:00.000Z', 70, 0),
    'hustle:2': rec('2026-10-01T10:05:00.000Z'),
  },
  spent: [
    { kind: 'item', item: 'badge-star', coins: 100, at: at('2026-10-01T10:30:00Z') },
    { kind: 'hint', puzzle: 'zip:level:easy:1', coins: 20, at: at('2026-10-01T06:00:00Z') },
  ],
  equipped: { badges: [], flair: null, theme: null, nameplate: 'plate-paper', at: 9 },
});

it('is commutative and idempotent', () => {
  const ab = mergeSave(A, B);
  expect(mergeSave(B, A)).toEqual(ab);
  expect(mergeSave(ab, ab)).toEqual(ab);
  expect(mergeSave(ab, A)).toEqual(ab);
  expect(mergeSave(emptySave(), ab)).toEqual(ab);
});

it('keeps the first run of a period puzzle whole', () => {
  expect(mergeSave(A, B).solves['zip:daily:2026-10-01']).toEqual(rec('2026-10-01T07:00:00.000Z', 120));
});

it('keeps the better run of a level, fewer hints first, with the earliest date', () => {
  // A is faster but took a hint; B took none.
  expect(mergeSave(A, B).solves['zip:level:easy:1']).toEqual(rec('2026-10-01T06:00:00.000Z', 70, 0));
  const faster = save({ solves: { 'zip:level:easy:1': rec('2026-10-02T06:00:00.000Z', 40, 0) } });
  expect(mergeSave(B, faster).solves['zip:level:easy:1']).toEqual(rec('2026-10-01T06:00:00.000Z', 40, 0));
});

it('prefers a Hustle solve that counts over one from before the epoch', () => {
  const before = new Date(ACHIEVEMENTS_EPOCH - 60_000).toISOString();
  const after = new Date(ACHIEVEMENTS_EPOCH + 60_000).toISOString();
  const old = save({ solves: { 'hustle:5': rec(before, 10) } });
  const fresh = save({ solves: { 'hustle:5': rec(after, 99) } });
  expect(mergeSave(old, fresh).solves['hustle:5']).toEqual(rec(after, 99));
});

it('counts an item purchase once, the earliest, and every hint purchase', () => {
  const spent = mergeSave(A, B).spent;
  expect(spent.filter((e) => e.kind === 'item')).toEqual([{ kind: 'item', item: 'badge-star', coins: 100, at: at('2026-10-01T10:30:00Z') }]);
  expect(spent.filter((e) => e.kind === 'hint')).toHaveLength(1);
  const twice = mergeSave(B, save({ spent: [{ kind: 'hint', puzzle: 'zip:level:easy:1', coins: 20, at: at('2026-10-01T06:05:00Z') }] }));
  expect(twice.spent.filter((e) => e.kind === 'hint')).toHaveLength(2);
});

it('keeps doubled ids only for solves that exist', () => {
  expect(mergeSave(A, B).doubled).toEqual(['zip:daily:2026-10-01']);
  expect(mergeSave(save({ doubled: ['zip:daily:2026-09-01'] }), B).doubled).toEqual([]);
});

it('takes the newer equipment, and a fixed one on a tie', () => {
  expect(mergeSave(A, B).equipped.nameplate).toBe('plate-paper');
  const x = save({ equipped: { ...noEquipment(7), flair: 'puzzler' } });
  const y = save({ equipped: { ...noEquipment(7), flair: 'hustler' } });
  expect(mergeSave(x, y).equipped).toEqual(mergeSave(y, x).equipped);
});

it('drops everything older than a reset from the side that did not reset', () => {
  const R = at('2026-10-01T10:02:00Z');
  const resetter = save({ resetAt: R, solves: { 'zip:daily:2026-10-01': rec('2026-10-01T08:00:00.000Z') }, equipped: noEquipment(R) });
  const merged = mergeSave(resetter, B);
  expect(Object.keys(merged.solves).sort()).toEqual(['hustle:2', 'zip:daily:2026-10-01']);
  expect(merged.solves['zip:daily:2026-10-01']).toEqual(rec('2026-10-01T08:00:00.000Z'));
  expect(merged.spent).toEqual([]);
  expect(merged.equipped).toEqual(noEquipment(R));
  expect(merged.resetAt).toBe(R);
});

it("keeps a stale side's solves at or after the reset", () => {
  const R = at('2026-10-01T10:00:00Z');
  const merged = mergeSave(save({ resetAt: R }), save({ solves: { 'hustle:3': rec('2026-10-01T10:00:00.000Z') } }));
  expect(Object.keys(merged.solves)).toEqual(['hustle:3']);
});

it('reads legacy equipment', () => {
  expect(parseEquipment({ badge: 'badge-star' })).toEqual({ ...noEquipment(0), badges: ['badge-star'] });
  expect(parseEquipment({ badges: ['a', 'b'], flair: 'puzzler', theme: null, nameplate: 7 })).toEqual({ badges: ['a', 'b'], flair: 'puzzler', theme: null, nameplate: null, at: 0 });
  expect(parseEquipment(null)).toEqual(noEquipment(0));
});

it('drops bad entries one by one', () => {
  const parsed = parseSaveData({
    solves: { ok: rec('2026-10-01T08:00:00.000Z'), bad: 'x', date: rec('nope'), neg: rec('2026-10-01T08:00:00.000Z', -1), ['x'.repeat(65)]: rec('2026-10-01T08:00:00.000Z') },
    spent: [{ kind: 'item', item: 'a', coins: 1, at: 1 }, { kind: 'item', coins: 1, at: 1 }, 'junk'],
    doubled: ['ok', 3],
    equipped: 'junk',
    resetAt: 'later',
  });
  expect(parsed).toEqual(save({ solves: { ok: rec('2026-10-01T08:00:00.000Z') }, spent: [{ kind: 'item', item: 'a', coins: 1, at: 1 }], doubled: ['ok'] }));
});

it('refuses non-objects and oversized saves', () => {
  expect(parseSaveData(null)).toBeNull();
  expect(parseSaveData([])).toBeNull();
  const solves: Record<string, SolveRecord> = {};
  for (let i = 0; i <= 20_000; i++) solves[`zip:level:easy:${i}`] = rec('2026-10-01T08:00:00.000Z');
  expect(parseSaveData({ solves })).toBeNull();
});

it('turns solves into entries for the derived values', () => {
  expect(saveSolveEntries({ 'hustle:1': rec('2026-10-01T10:00:00.000Z', 5, 1, 9) })).toEqual([
    { id: 'hustle:1', solvedAt: at('2026-10-01T10:00:00.000Z'), seconds: 5, hints: 1, moves: 9 },
  ]);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm --filter @puzzle-hustle/core exec vitest run test/save.test.ts`
Expected: FAIL, `Failed to load url ../src/save.ts`.

- [ ] **Step 3: Implement `save.ts`**

```ts
// packages/core/src/save.ts
import { ACHIEVEMENTS_EPOCH, type SolveEntry } from './achievements.ts';
import type { SpendEntry } from './coins.ts';
import { parseSolveId } from './solveId.ts';

export interface SolveRecord {
  solvedAt: string;
  seconds: number;
  hints: number;
  moves: number;
}

// The stored form of ph:cosmetics. `at` orders two devices' choices; 0 means "before sync existed".
export interface SavedEquipment {
  badges: string[];
  flair: string | null;
  theme: string | null;
  nameplate: string | null;
  at: number;
}

// Everything the profile is derived from. Boards in progress and settings stay per device.
export interface SaveData {
  solves: Record<string, SolveRecord>;
  spent: SpendEntry[];
  doubled: string[];
  equipped: SavedEquipment;
  resetAt: number;
}

export const SAVE_LIMITS = { solves: 20_000, spent: 5_000, doubled: 20_000, idLength: 64 } as const;

export function noEquipment(at = 0): SavedEquipment {
  return { badges: [], flair: null, theme: null, nameplate: null, at };
}

export function emptySave(): SaveData {
  return { solves: {}, spent: [], doubled: [], equipped: noEquipment(), resetAt: 0 };
}

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= SAVE_LIMITS.idLength;
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function isSpendEntry(value: unknown): value is SpendEntry {
  if (!isObject(value)) return false;
  if (typeof value.coins !== 'number' || !Number.isInteger(value.coins) || value.coins < 0 || typeof value.at !== 'number') return false;
  if (value.kind === 'hint') return typeof value.puzzle === 'string';
  if (value.kind === 'item') return typeof value.item === 'string';
  return false;
}

function parseSolve(value: unknown): SolveRecord | null {
  if (!isObject(value) || typeof value.solvedAt !== 'string' || !Number.isFinite(Date.parse(value.solvedAt))) return null;
  if (!isCount(value.seconds) || !isCount(value.hints) || !isCount(value.moves)) return null;
  return { solvedAt: value.solvedAt, seconds: value.seconds, hints: value.hints, moves: value.moves };
}

// Reads ph:cosmetics as stored today, with or without `at`, and the older lone `badge`.
export function parseEquipment(value: unknown): SavedEquipment {
  if (!isObject(value)) return noEquipment();
  const listed: unknown[] = Array.isArray(value.badges) ? value.badges : [value.badge];
  const one = (v: unknown) => (isId(v) ? v : null);
  return {
    badges: [...new Set(listed.filter(isId))],
    flair: one(value.flair),
    theme: one(value.theme),
    nameplate: one(value.nameplate),
    at: isCount(value.at) ? value.at : 0,
  };
}

export function parseSaveData(value: unknown): SaveData | null {
  if (!isObject(value)) return null;
  const rawSolves = isObject(value.solves) ? value.solves : {};
  const rawSpent = Array.isArray(value.spent) ? value.spent : [];
  const rawDoubled = Array.isArray(value.doubled) ? value.doubled : [];
  if (Object.keys(rawSolves).length > SAVE_LIMITS.solves || rawSpent.length > SAVE_LIMITS.spent || rawDoubled.length > SAVE_LIMITS.doubled) return null;
  const solves: Record<string, SolveRecord> = {};
  for (const [id, raw] of Object.entries(rawSolves)) {
    const record = isId(id) ? parseSolve(raw) : null;
    if (record) solves[id] = record;
  }
  return {
    solves,
    spent: rawSpent.filter(isSpendEntry),
    doubled: [...new Set(rawDoubled.filter(isId))],
    equipped: parseEquipment(value.equipped),
    resetAt: isCount(value.resetAt) ? value.resetAt : 0,
  };
}

// Breaks every tie the same way whichever side came first, so the merge stays commutative.
function pick<T>(a: T, b: T, order: number): T {
  if (order !== 0) return order < 0 ? a : b;
  return JSON.stringify(a) <= JSON.stringify(b) ? a : b;
}

const time = (r: SolveRecord) => Date.parse(r.solvedAt);
const counts = (id: string, r: SolveRecord) => !(id.startsWith('hustle:') && time(r) < ACHIEVEMENTS_EPOCH);

// Periods keep their first run, which is the one on the leaderboard. Everything else keeps the
// better run (fewer hints first, so a hinted replay never takes back a hint-free achievement)
// under the earliest date, unless one side does not count, which then simply loses.
function mergeSolve(id: string, a: SolveRecord, b: SolveRecord): SolveRecord {
  if (parseSolveId(id)?.mode === 'period') return pick(a, b, time(a) - time(b));
  const countA = counts(id, a);
  const countB = counts(id, b);
  if (countA !== countB) return countA ? a : b;
  const best = pick(a, b, a.hints - b.hints || a.seconds - b.seconds || a.moves - b.moves);
  return { ...best, solvedAt: time(a) <= time(b) ? a.solvedAt : b.solvedAt };
}

function since(save: SaveData, from: number): SaveData {
  return {
    solves: Object.fromEntries(Object.entries(save.solves).filter(([, r]) => time(r) >= from)),
    spent: save.spent.filter((e) => e.at >= from),
    doubled: save.doubled,
    equipped: save.equipped.at >= from ? save.equipped : noEquipment(),
    resetAt: save.resetAt,
  };
}

const spendKey = (e: SpendEntry) => (e.kind === 'item' ? `item:${e.item}` : `hint:${e.puzzle}@${e.at}`);

export function mergeSave(a: SaveData, b: SaveData): SaveData {
  const resetAt = Math.max(a.resetAt, b.resetAt);
  const left = a.resetAt < resetAt ? since(a, resetAt) : a;
  const right = b.resetAt < resetAt ? since(b, resetAt) : b;

  const solves: Record<string, SolveRecord> = { ...left.solves };
  for (const [id, record] of Object.entries(right.solves)) solves[id] = solves[id] ? mergeSolve(id, solves[id], record) : record;

  const spentByKey = new Map<string, SpendEntry>();
  for (const entry of [...left.spent, ...right.spent]) {
    const key = spendKey(entry);
    const known = spentByKey.get(key);
    spentByKey.set(key, known ? pick(known, entry, known.at - entry.at) : entry);
  }
  const spent = [...spentByKey.values()].sort((x, y) => x.at - y.at || (JSON.stringify(x) < JSON.stringify(y) ? -1 : 1));

  const doubled = [...new Set([...left.doubled, ...right.doubled])].filter((id) => solves[id]).sort();
  const equipped = pick(left.equipped, right.equipped, right.equipped.at - left.equipped.at);
  return { solves: sortKeys(solves), spent, doubled, equipped, resetAt };
}

function sortKeys(solves: Record<string, SolveRecord>): Record<string, SolveRecord> {
  return Object.fromEntries(Object.keys(solves).sort().map((id) => [id, solves[id]]));
}

export function saveSolveEntries(solves: Record<string, SolveRecord>): SolveEntry[] {
  return Object.entries(solves).map(([id, r]) => ({ id, solvedAt: time(r), seconds: r.seconds, hints: r.hints, moves: r.moves }));
}
```

Note on `pick` for equipment: the order argument is `right.at - left.at`, so a newer `right` gives a positive order and wins (`pick` returns `b` for positive). Keep it that way.

Add to `packages/core/src/index.ts` after `export * from './coins.ts';`:

```ts
export * from './save.ts';
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter @puzzle-hustle/core exec vitest run test/save.test.ts`
Expected: PASS (13 tests). Then `pnpm --filter @puzzle-hustle/core typecheck`, expected no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/save.ts packages/core/src/index.ts packages/core/test/save.test.ts
git commit -m "Sync: SaveData snapshot and commutative mergeSave in core" -m "Implemented with assistance from Claude Opus 5.5."
```

---

### Task 2: `POST /sync` in the Worker

**Files:**
- Create: `apps/api/migrations/0007_saves.sql`
- Create: `apps/api/src/sync.ts`
- Modify: `apps/api/src/index.ts` (route, account deletion)
- Test: `apps/api/test/sync.test.ts`

**Interfaces:**
- Consumes: `emptySave`, `mergeSave`, `parseSaveData`, `saveSolveEntries`, `hustleSolved`, `HUSTLE_MAX_STAGE`, `SaveData` from `@puzzle-hustle/core`.
- Produces: `POST /sync` with a `SaveData` body; answers `200` with the merged `SaveData`, `400 { error: 'bad_save' }`, `401`, `409 { error: 'conflict' }`, `413 { error: 'too_large' }`. `export const MAX_SAVE_CHARS = 1_000_000;` and `export async function syncSave(db: D1Database, playerId: string, incoming: SaveData): Promise<SaveData | null>` in `sync.ts`.

- [ ] **Step 1: Write the migration**

```sql
-- apps/api/migrations/0007_saves.sql
CREATE TABLE saves (
  player_id   TEXT PRIMARY KEY REFERENCES players(id),
  data        TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
```

- [ ] **Step 2: Write the failing tests**

```ts
// apps/api/test/sync.test.ts
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS_EPOCH, emptySave, type SaveData } from '@puzzle-hustle/core';
import worker from '../src/index.ts';
import * as google from '../src/google.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await env.DB.exec('DELETE FROM saves; DELETE FROM reports; DELETE FROM scores; DELETE FROM members; DELETE FROM groups; DELETE FROM players;');
  vi.restoreAllMocks();
});

async function signIn(subject: string, name: string) {
  vi.spyOn(google, 'verifyGoogleIdToken').mockResolvedValue(subject);
  const response = await worker.fetch(new Request('https://api.test/session', { method: 'POST', body: JSON.stringify({ provider: 'google', idToken: 'x', name }) }), env);
  return (await response.json()) as { token: string; player: { id: string } };
}

const sync = (token: string, body: string) =>
  worker.fetch(new Request('https://api.test/sync', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body }), env);

const after = (minutes: number) => new Date(Math.max(Date.now(), ACHIEVEMENTS_EPOCH) + minutes * 60_000).toISOString();
const rec = (solvedAt: string) => ({ solvedAt, seconds: 60, hints: 0, moves: 20 });
const hustle = (from: number, to: number, solvedAt: string) =>
  Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [`hustle:${from + i}`, rec(solvedAt)]));
const save = (patch: Partial<SaveData>): SaveData => ({ ...emptySave(), ...patch });
const hustleOf = async (id: string) => (await env.DB.prepare('SELECT hustle FROM players WHERE id = ?').bind(id).first<{ hustle: number }>())?.hustle;

it('stores the first save and answers with it', async () => {
  const me = await signIn('s1', 'Moritz');
  const mine = save({ solves: hustle(1, 3, after(1)) });
  const response = await sync(me.token, JSON.stringify(mine));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(mine);
  expect(await hustleOf(me.player.id)).toBe(3);
});

it('merges a second device into what is stored', async () => {
  const me = await signIn('s1', 'Moritz');
  await sync(me.token, JSON.stringify(save({ solves: hustle(1, 49, after(1)) })));
  const response = await sync(me.token, JSON.stringify(save({ solves: hustle(1, 4, after(2)) })));
  const merged = (await response.json()) as SaveData;
  expect(Object.keys(merged.solves)).toHaveLength(49);
  expect(await hustleOf(me.player.id)).toBe(49);
});

it('lowers the Hustle level after an account-wide reset', async () => {
  const me = await signIn('s1', 'Moritz');
  await sync(me.token, JSON.stringify(save({ solves: hustle(1, 49, after(1)) })));
  const resetAt = Date.parse(after(5));
  const response = await sync(me.token, JSON.stringify(save({ resetAt })));
  expect(((await response.json()) as SaveData).solves).toEqual({});
  expect(await hustleOf(me.player.id)).toBe(0);
});

it('keeps players apart', async () => {
  const me = await signIn('s1', 'Moritz');
  const other = await signIn('s2', 'Dani');
  await sync(me.token, JSON.stringify(save({ solves: hustle(1, 2, after(1)) })));
  const response = await sync(other.token, JSON.stringify(emptySave()));
  expect(((await response.json()) as SaveData).solves).toEqual({});
});

it('survives two devices syncing at once', async () => {
  const me = await signIn('s1', 'Moritz');
  await Promise.all([
    sync(me.token, JSON.stringify(save({ solves: hustle(1, 2, after(1)) }))),
    sync(me.token, JSON.stringify(save({ solves: hustle(3, 4, after(1)) }))),
  ]);
  const response = await sync(me.token, JSON.stringify(emptySave()));
  const keys = Object.keys(((await response.json()) as SaveData).solves);
  // Both writes land, or one reports a conflict and its device simply sends again; never a mix.
  expect(keys.length === 4 || keys.length === 2).toBe(true);
});

it('refuses junk and oversized bodies', async () => {
  const me = await signIn('s1', 'Moritz');
  expect((await sync(me.token, 'not json')).status).toBe(400);
  expect((await sync(me.token, '[]')).status).toBe(400);
  expect((await sync(me.token, JSON.stringify({ pad: 'x'.repeat(1_000_001) }))).status).toBe(413);
});

it('needs a session', async () => {
  expect((await worker.fetch(new Request('https://api.test/sync', { method: 'POST', body: '{}' }), env)).status).toBe(401);
});

it('is deleted with the account', async () => {
  const me = await signIn('s1', 'Moritz');
  await sync(me.token, JSON.stringify(save({ solves: hustle(1, 2, after(1)) })));
  const response = await worker.fetch(new Request('https://api.test/account', { method: 'DELETE', headers: { Authorization: `Bearer ${me.token}` } }), env);
  expect(response.status).toBe(200);
  expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM saves').first<{ n: number }>()).toEqual({ n: 0 });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `pnpm --filter @puzzle-hustle/api exec vitest run test/sync.test.ts`
Expected: FAIL; `/sync` answers 404.

- [ ] **Step 4: Implement `sync.ts` and the route**

```ts
// apps/api/src/sync.ts
import { emptySave, HUSTLE_MAX_STAGE, hustleSolved, mergeSave, parseSaveData, saveSolveEntries, type SaveData } from '@puzzle-hustle/core';

export const MAX_SAVE_CHARS = 1_000_000;

// Read, merge, write only if nobody wrote in between. A second device that got there first just
// means one more merge, which costs nothing because the merge does not care about order.
export async function syncSave(db: D1Database, playerId: string, incoming: SaveData): Promise<SaveData | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const row = await db.prepare('SELECT data, updated_at AS updatedAt FROM saves WHERE player_id = ?')
      .bind(playerId)
      .first<{ data: string; updatedAt: number }>();
    const stored = row ? (parseSaveData(JSON.parse(row.data)) ?? emptySave()) : emptySave();
    const merged = mergeSave(stored, incoming);
    const data = JSON.stringify(merged);
    const now = Math.max(Date.now(), (row?.updatedAt ?? 0) + 1);
    const write = row
      ? db.prepare('UPDATE saves SET data = ?, updated_at = ? WHERE player_id = ? AND updated_at = ?').bind(data, now, playerId, row.updatedAt)
      : db.prepare('INSERT INTO saves (player_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(player_id) DO NOTHING').bind(playerId, data, now);
    const result = await write.run();
    if (result.meta.changes !== 1) continue;
    // Exact, not MAX like POST /hustle: the save is the whole truth, so a reset lowers the chip.
    const level = Math.min(HUSTLE_MAX_STAGE, hustleSolved(saveSolveEntries(merged.solves)));
    await db.prepare('UPDATE players SET hustle = ? WHERE id = ?').bind(level, playerId).run();
    return merged;
  }
  return null;
}
```

In `apps/api/src/index.ts`, extend the core import and add the import of `sync.ts`:

```ts
import { HUSTLE_MAX_STAGE, SHOWCASE_SIZE, isCosmeticOf, parseSaveData } from '@puzzle-hustle/core';
// ...
import { MAX_SAVE_CHARS, syncSave } from './sync.ts';
```

Add the handler after `postHustle`:

```ts
async function postSync(request: Request, env: Env, playerId: string): Promise<Response> {
  const text = await request.text();
  if (text.length > MAX_SAVE_CHARS) return error(413, 'too_large');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return error(400, 'bad_save');
  }
  const incoming = parseSaveData(raw);
  if (!incoming) return error(400, 'bad_save');
  const merged = await syncSave(env.DB, playerId, incoming);
  return merged ? json(merged) : error(409, 'conflict');
}
```

Route it next to `/hustle`:

```ts
  if (method === 'POST' && path === '/sync') return postSync(request, env, playerId);
```

In the `DELETE /account` batch, before the `players` delete:

```ts
      env.DB.prepare('DELETE FROM saves WHERE player_id = ?').bind(playerId),
```

- [ ] **Step 5: Run the API tests**

Run: `pnpm --filter @puzzle-hustle/api test` and `pnpm --filter @puzzle-hustle/api typecheck`
Expected: all PASS, no type errors. If another test file's `beforeEach` (`DELETE FROM players`) fails on the foreign key, add `DELETE FROM saves;` at the front of that file's cleanup too.

- [ ] **Step 6: Commit**

```bash
git add apps/api/migrations/0007_saves.sql apps/api/src/sync.ts apps/api/src/index.ts apps/api/test/sync.test.ts
git commit -m "Sync: POST /sync merges the save, sets the exact Hustle level" -m "Implemented with assistance from Claude Opus 5.5."
```

---

### Task 3: Local stores ready for sync

**Files:**
- Modify: `apps/web/src/lib/storage.ts` (type import, write notifier, `replaceSolves`, `clearUnsynced`)
- Modify: `apps/web/src/lib/coins.ts` (core `isSpendEntry`, `at` on equipment, `coinsChanged`)
- Modify: `apps/web/src/lib/achievements.ts`, `apps/web/src/lib/flairs.ts`, `apps/web/src/lib/hustle.ts` (optional `silent`)
- Test: `apps/web/test/storage.test.ts`, `apps/web/test/coins.test.ts`, `apps/web/test/achievements.test.ts`

**Interfaces:**
- Consumes: `SolveRecord`, `isSpendEntry` from `@puzzle-hustle/core` (Task 1).
- Produces:
  - `storage.ts`: `SYNCED_KEYS: ReadonlySet<string>`; `onSyncedWrite(listener: () => void): () => void`; `replaceSolves(solves: Record<string, SolveRecord>): void`; `clearUnsynced(kept: Record<string, unknown>): void`; `SolveRecord` re-exported as a type.
  - `coins.ts`: `coinsChanged(): void`; `ph:cosmetics` now stored as `{ badges, flair, theme, nameplate, at }`.
  - `syncAchievements(silent?: boolean)`, `syncFlairs(silent?: boolean)`, `syncHustleRewards(silent?: boolean)`: with `true` they update the announced lists without calling `announceUnlock`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/test/storage.test.ts`:

```ts
import { clearUnsynced, onSyncedWrite, readSetting, replaceSolves, writeSetting } from '../src/lib/storage.ts';

it('tells listeners about writes to synced stores only', () => {
  localStorage.clear();
  rehydrate();
  let calls = 0;
  const off = onSyncedWrite(() => calls++);
  recordSolve('zip:level:easy:1', { solvedAt: new Date().toISOString(), seconds: 60, hints: 0, moves: 10 });
  writeSetting('ph:coins:spent', '[]');
  writeSetting('ph:sound', 'off');
  off();
  writeSetting('ph:cosmetics', '{}');
  expect(calls).toBe(2);
});

it('replaces all solves without telling the sync', () => {
  localStorage.clear();
  rehydrate();
  let calls = 0;
  const off = onSyncedWrite(() => calls++);
  replaceSolves({ 'zip:level:easy:2': { solvedAt: '2026-10-01T08:00:00.000Z', seconds: 5, hints: 0, moves: 3 } });
  off();
  expect(calls).toBe(0);
  expect(Object.keys(allSolves())).toEqual(['zip:level:easy:2']);
  rehydrate();
  expect(Object.keys(allSolves())).toEqual(['zip:level:easy:2']);
});

it('clears boards and markers but keeps boards of kept solves', () => {
  localStorage.clear();
  const daily = `stars:daily:${periodKey('daily')}`;
  writeProgress(daily, { state: [1], seconds: 1, moves: 1, hints: 0 });
  writeProgress('zip:level:easy:1', { state: [1], seconds: 1, moves: 1, hints: 0 });
  writeSetting('ph:howto:zip', '1');
  writeSetting('ph:difficulty:zip', 'hard');
  writeSetting('ph:achievements', '["first-solve"]');
  clearUnsynced({ [daily]: {} });
  expect(readProgress(daily)).not.toBeNull();
  expect(readProgress('zip:level:easy:1')).toBeNull();
  expect(readSetting('ph:howto:zip')).toBeNull();
  expect(readSetting('ph:difficulty:zip')).toBeNull();
  expect(readSetting('ph:achievements')).toBeNull();
});
```

Append to `apps/web/test/coins.test.ts` (use the file's existing imports; add `equip` and `readSetting` if missing):

```ts
it('stamps the equipment with the time it was chosen', () => {
  localStorage.clear();
  const before = Date.now();
  equip('nameplate', 'plate-paper');
  const stored = JSON.parse(readSetting('ph:cosmetics') ?? '{}') as { at?: number };
  expect(stored.at).toBeGreaterThanOrEqual(before);
});
```

Append to `apps/web/test/achievements.test.ts` (it already mocks `announceUnlock`):

```ts
it('marks unlocks as seen without announcing them when silent', () => {
  localStorage.clear();
  localStorage.setItem('ph:solves', JSON.stringify({ [`zip:daily:${periodKey('daily')}`]: { solvedAt: new Date(Math.max(Date.now(), ACHIEVEMENTS_EPOCH + 1000)).toISOString(), seconds: 60, hints: 0, moves: 10 } }));
  rehydrate();
  vi.mocked(announceUnlock).mockClear();
  syncAchievements(true);
  expect(announceUnlock).not.toHaveBeenCalled();
  syncAchievements();
  expect(announceUnlock).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem('ph:achievements') ?? '[]')).not.toEqual([]);
});
```

(Import `periodKey`, `ACHIEVEMENTS_EPOCH` from `@puzzle-hustle/core` and `rehydrate` from `../src/lib/storage.ts` if the file lacks them.)

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm --filter @puzzle-hustle/web exec vitest run test/storage.test.ts test/coins.test.ts test/achievements.test.ts`
Expected: FAIL; `onSyncedWrite`, `replaceSolves`, `clearUnsynced` are not exported, `at` is undefined, silent announces.

- [ ] **Step 3: Implement**

`apps/web/src/lib/storage.ts`:

Replace the local `SolveRecord` interface with:

```ts
import type { SolveRecord } from '@puzzle-hustle/core';
export type { SolveRecord };
```

Add after the `listeners` set:

```ts
// The four stores the profile is derived from; sync.ts sends them to the server.
export const SYNCED_KEYS: ReadonlySet<string> = new Set([KEY, 'ph:coins:spent', 'ph:coins:doubled', 'ph:cosmetics']);
const writeListeners = new Set<() => void>();

export function onSyncedWrite(listener: () => void): () => void {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}

function syncedWrite() {
  for (const l of writeListeners) l();
}

// For sync.ts: takes a merged set as it is, without telling the sync about its own write.
export function replaceSolves(solves: Record<string, SolveRecord>) {
  cache = solves;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
    scheduleBackup();
  } catch {
    /* storage unavailable */
  }
  for (const l of listeners) l();
}
```

In `recordSolve`, call `syncedWrite();` right after `scheduleBackup();` inside the `try`.

In `writeSetting` and `removeSetting`, after the backup line add:

```ts
    if (SYNCED_KEYS.has(key)) syncedWrite();
```

Split `resetProgress` so the device-only part can run on its own. New function above it:

```ts
// What a reset clears besides the synced stores: boards (except those of `kept` solves),
// announcement lists, how-to and difficulty markers. sync.ts calls it when another device reset.
export function clearUnsynced(kept: Record<string, unknown>) {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        k &&
        (k === 'ph:achievements' ||
          k === 'ph:flairs' ||
          (k.startsWith(PROGRESS_PREFIX) && !kept[k.slice(PROGRESS_PREFIX.length)]) ||
          k.startsWith('ph:howto:') ||
          k.startsWith('ph:difficulty:'))
      )
        doomed.push(k);
    }
    for (const k of doomed) localStorage.removeItem(k);
    scheduleBackup();
  } catch {
    /* storage unavailable */
  }
}
```

and `resetProgress` becomes:

```ts
export function resetProgress() {
  const kept = Object.fromEntries(Object.entries(cache).filter(([id]) => isRunningPeriod(id)));
  clearUnsynced(kept);
  try {
    for (const k of [KEY, 'ph:coins:spent', 'ph:coins:doubled', 'ph:cosmetics']) localStorage.removeItem(k);
    if (Object.keys(kept).length > 0) localStorage.setItem(KEY, JSON.stringify(kept));
    scheduleBackup();
  } catch {
    /* storage unavailable */
  }
  cache = kept;
  for (const l of listeners) l();
}
```

Keep the existing comment above `resetProgress` (the one about `ph:queue` and running periods).

`apps/web/src/lib/coins.ts`:
- Delete the local `isSpendEntry` and import it: add `isSpendEntry` to the `@puzzle-hustle/core` import list.
- `writeEquipped` stores the time:

```ts
  writeSetting(EQUIPPED_KEY, JSON.stringify({ badges, flair, theme, nameplate, at: Date.now() }));
```

- Export the store notification for sync.ts, below `changed()`:

```ts
// sync.ts writes the spend log and equipment around writeSetting's back of the coin store.
export function coinsChanged() {
  changed();
}
```

Silent announcements. `achievements.ts`:

```ts
export function syncAchievements(silent = false): void {
  syncAnnouncements(KEY, currentUnlocked, CATALOG_ORDER, silent ? () => undefined : (id) => announceUnlock({ kind: 'achievement', id }));
}
```

`flairs.ts`:

```ts
export function syncFlairs(silent = false): void {
  syncAnnouncements(KEY, () => earnedFlairs(storedSolves()), CATALOG_ORDER, silent ? () => undefined : (id) => announceUnlock({ kind: 'flair', id }));
}
```

`hustle.ts`:

```ts
// Like syncFlairs: after a solve and on app start, never throws. Silent after a sync, so what
// another device earned does not open a stack of cards here.
export function syncHustleRewards(silent = false): void {
  const quiet = () => undefined;
  syncAnnouncements(BADGES_KEY, () => earnedHustleBadges(storedSolves()), HUSTLE_BADGES.map((b) => b.id), silent ? quiet : (id) => announceUnlock({ kind: 'badge', id }));
  syncAnnouncements(NAMEPLATES_KEY, () => earnedHustleNameplates(storedSolves()), HUSTLE_NAMEPLATES.map((n) => n.id), silent ? quiet : (id) => announceUnlock({ kind: 'nameplate', id }));
}
```

Existing callers pass a function reference in places like `onSolved` handlers; search with `grep -rn "syncAchievements\|syncFlairs\|syncHustleRewards" apps/web/src` and make sure none is passed directly as an event callback (an event object would land in `silent`). Wrap any such call site as `() => syncAchievements()`.

- [ ] **Step 4: Run the web tests and typecheck**

Run: `pnpm --filter @puzzle-hustle/web test` and `pnpm -r typecheck`
Expected: all PASS, including the existing `reset.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/storage.ts apps/web/src/lib/coins.ts apps/web/src/lib/achievements.ts apps/web/src/lib/flairs.ts apps/web/src/lib/hustle.ts apps/web/test/storage.test.ts apps/web/test/coins.test.ts apps/web/test/achievements.test.ts
git commit -m "Sync: write notifier, replaceable solves, timestamped equipment, silent unlocks" -m "Implemented with assistance from Claude Opus 5.5."
```

---

### Task 4: `sync.ts` client

**Files:**
- Create: `apps/web/src/lib/sync.ts`
- Test: `apps/web/test/sync.test.ts`

**Interfaces:**
- Consumes: Task 1 (`emptySave`, `mergeSave`, `noEquipment`, `parseEquipment`, `parseSaveData`, `SaveData`), Task 3 (`onSyncedWrite`, `replaceSolves`, `clearUnsynced`, `allSolves`, `coinsChanged`, silent syncs), `apiFetch`, `readSession` (`api.ts`), `readSpent`, `readDoubled`, `pushCosmetics` (`coins.ts`), `resetProgressAndAppearance` (`theme.ts`).
- Produces:
  - `readLocalSave(): SaveData | null` (null = over limits)
  - `syncNow(options?: { keepalive?: boolean }): Promise<void>`
  - `syncAfterSignIn(previous: string | null): Promise<void>`
  - `resetAccount(): void`
  - `forgetSyncedPlayer(): void`
  - `initSync(): void`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/test/sync.test.ts
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../src/components/UnlockModal.tsx', () => ({ announceUnlock: vi.fn() }));
import { ACHIEVEMENTS_EPOCH, emptySave, mergeSave, parseSaveData, periodKey, type SaveData } from '@puzzle-hustle/core';
import { announceUnlock } from '../src/components/UnlockModal.tsx';
import { allSolves, readProgress, recordSolve, rehydrate, writeProgress } from '../src/lib/storage.ts';
import { readLocalSave, resetAccount, syncAfterSignIn, syncNow } from '../src/lib/sync.ts';

const when = (minutes: number) => new Date(Math.max(Date.now(), ACHIEVEMENTS_EPOCH) + minutes * 60_000).toISOString();
const rec = (solvedAt: string) => ({ solvedAt, seconds: 60, hints: 0, moves: 20 });

let server: SaveData;
let onRequest: (() => void) | null;

function signIn(id = 'p1') {
  localStorage.setItem('ph:session', JSON.stringify({ token: 't', player: { id, name: 'Moritz' } }));
}

beforeEach(() => {
  localStorage.clear();
  rehydrate();
  server = emptySave();
  onRequest = null;
  vi.mocked(announceUnlock).mockClear();
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (!String(url).endsWith('/sync')) return new Response('{}', { status: 200 });
    onRequest?.();
    server = mergeSave(server, parseSaveData(JSON.parse(String(init?.body)))!);
    return new Response(JSON.stringify(server), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
});

afterEach(() => vi.unstubAllGlobals());

it('merges this device with the account on first sync', async () => {
  signIn();
  server = { ...emptySave(), solves: { 'hustle:1': rec(when(1)), 'hustle:2': rec(when(1)) } };
  recordSolve('zip:level:easy:1', rec(when(2)));
  await syncNow();
  expect(Object.keys(allSolves()).sort()).toEqual(['hustle:1', 'hustle:2', 'zip:level:easy:1']);
  expect(Object.keys(server.solves)).toHaveLength(3);
  expect(localStorage.getItem('ph:sync:player')).toBe('p1');
});

it('takes the account over the device when another player synced here before', async () => {
  signIn('p2');
  localStorage.setItem('ph:sync:player', 'p1');
  recordSolve('zip:level:easy:1', rec(when(1)));
  server = { ...emptySave(), solves: { 'hustle:1': rec(when(1)) } };
  await syncNow();
  expect(Object.keys(allSolves())).toEqual(['hustle:1']);
  expect(Object.keys(server.solves)).toEqual(['hustle:1']);
});

it('treats the player signed out last as the owner of a never-synced device', async () => {
  signIn('p2');
  recordSolve('zip:level:easy:1', rec(when(1)));
  await syncAfterSignIn('p1');
  expect(Object.keys(allSolves())).toEqual([]);
});

it('keeps a solve made while the request was out', async () => {
  signIn();
  onRequest = () => recordSolve('zip:level:easy:9', rec(when(3)));
  await syncNow();
  expect(allSolves()['zip:level:easy:9']).toBeDefined();
});

it('does not announce what another device unlocked', async () => {
  signIn();
  server = { ...emptySave(), solves: { [`zip:daily:${periodKey('daily')}`]: rec(when(1)) } };
  await syncNow();
  expect(announceUnlock).not.toHaveBeenCalled();
});

it('clears this device after another device reset the account', async () => {
  signIn();
  localStorage.setItem('ph:sync:player', 'p1');
  recordSolve('zip:level:easy:1', rec(when(1)));
  writeProgress('zip:level:easy:2', { state: [1], seconds: 1, moves: 1, hints: 0 });
  server = { ...emptySave(), resetAt: Date.parse(when(5)) };
  await syncNow();
  expect(allSolves()).toEqual({});
  expect(readProgress('zip:level:easy:2')).toBeNull();
});

it('resets the account when signed in', async () => {
  signIn();
  localStorage.setItem('ph:sync:player', 'p1');
  server = { ...emptySave(), solves: { 'hustle:1': rec(when(-10)) } };
  resetAccount();
  await syncNow();
  expect(server.solves).toEqual({});
  expect(server.resetAt).toBeGreaterThan(0);
});

it('resets only this device when signed out', () => {
  recordSolve('zip:level:easy:1', rec(when(1)));
  resetAccount();
  expect(localStorage.getItem('ph:sync:resetAt')).toBeNull();
});

it('leaves everything alone when the request fails', async () => {
  signIn();
  recordSolve('zip:level:easy:1', rec(when(1)));
  vi.stubGlobal('fetch', async () => {
    throw new TypeError('offline');
  });
  await syncNow();
  expect(Object.keys(allSolves())).toEqual(['zip:level:easy:1']);
  expect(localStorage.getItem('ph:sync:player')).toBeNull();
});

it('skips a snapshot over the limits', async () => {
  signIn();
  const solves: Record<string, unknown> = {};
  for (let i = 0; i <= 20_000; i++) solves[`zip:level:easy:${i}`] = rec(when(1));
  localStorage.setItem('ph:solves', JSON.stringify(solves));
  rehydrate();
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  expect(readLocalSave()).toBeNull();
  await syncNow();
  expect(fetch).not.toHaveBeenCalled();
  expect(Object.keys(allSolves())).toHaveLength(20_001);
});

it('does nothing signed out', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await syncNow();
  expect(fetch).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm --filter @puzzle-hustle/web exec vitest run test/sync.test.ts`
Expected: FAIL, `Failed to load url ../src/lib/sync.ts`.

- [ ] **Step 3: Implement `sync.ts`**

```ts
// apps/web/src/lib/sync.ts
import { emptySave, mergeSave, noEquipment, parseEquipment, parseSaveData, type SaveData } from '@puzzle-hustle/core';
import { syncAchievements } from './achievements.ts';
import { apiFetch, readSession } from './api.ts';
import { coinsChanged, pushCosmetics, readDoubled, readSpent } from './coins.ts';
import { syncFlairs } from './flairs.ts';
import { syncHustleRewards } from './hustle.ts';
import { allSolves, clearUnsynced, onSyncedWrite, readSetting, removeSetting, replaceSolves, writeSetting } from './storage.ts';
import { resetProgressAndAppearance } from './theme.ts';

const RESET_KEY = 'ph:sync:resetAt';
const PLAYER_KEY = 'ph:sync:player';
const DEBOUNCE_MS = 5000;
// Browsers refuse keepalive bodies over 64 KB; such a sync goes as a plain request instead.
const KEEPALIVE_LIMIT = 60_000;

let running: Promise<void> | null = null;
let again = false;
let applying = false;
let dirty = false;
let timer: number | undefined;

export function readLocalSave(): SaveData | null {
  let equipped: unknown = null;
  try {
    equipped = JSON.parse(readSetting('ph:cosmetics') ?? 'null');
  } catch {
    /* unreadable equipment counts as none */
  }
  return parseSaveData({
    solves: allSolves(),
    spent: readSpent(),
    doubled: [...readDoubled()],
    equipped: parseEquipment(equipped),
    resetAt: Number(readSetting(RESET_KEY)) || 0,
  });
}

function applySave(save: SaveData, before: SaveData) {
  applying = true;
  try {
    replaceSolves(save.solves);
    writeSetting('ph:coins:spent', JSON.stringify(save.spent));
    writeSetting('ph:coins:doubled', JSON.stringify(save.doubled));
    writeSetting('ph:cosmetics', JSON.stringify(save.equipped));
    writeSetting(RESET_KEY, String(save.resetAt));
    if (save.resetAt > before.resetAt) clearUnsynced(save.solves);
    coinsChanged();
  } finally {
    applying = false;
  }
}

async function run(keepalive: boolean): Promise<void> {
  const session = readSession();
  if (!session) return;
  const local = readLocalSave();
  if (!local) return;
  dirty = false;
  const owner = readSetting(PLAYER_KEY);
  // Progress of another account must not flow into this one; the device takes this account's.
  const replace = owner !== null && owner !== session.player.id;
  const body = JSON.stringify(replace ? emptySave() : local);
  let answer: SaveData | null;
  try {
    answer = parseSaveData(await apiFetch<unknown>('/sync', { method: 'POST', body, auth: true, keepalive: keepalive && body.length < KEEPALIVE_LIMIT }));
  } catch {
    return;
  }
  if (!answer || readSession()?.player.id !== session.player.id) return;
  // Own unlocks first, with their cards; what the other device brought in stays quiet below.
  syncAchievements();
  syncFlairs();
  syncHustleRewards();
  const current = readLocalSave() ?? local;
  const next = replace ? answer : mergeSave(answer, current);
  if (JSON.stringify(next) !== JSON.stringify(answer)) again = true;
  applySave(next, current);
  writeSetting(PLAYER_KEY, session.player.id);
  syncAchievements(true);
  syncFlairs(true);
  syncHustleRewards(true);
  if (replace || owner === null || JSON.stringify(next.equipped) !== JSON.stringify(current.equipped)) void pushCosmetics();
}

export function syncNow(options: { keepalive?: boolean } = {}): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = run(options.keepalive ?? false).finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return running;
}

// The player signed out last on this device owns its progress, also from before sync existed.
export function syncAfterSignIn(previous: string | null): Promise<void> {
  if (previous !== null && readSetting(PLAYER_KEY) === null) writeSetting(PLAYER_KEY, previous);
  return syncNow();
}

// Signed in, the reset reaches every device of the account; signed out it stays on this one.
export function resetAccount(): void {
  resetProgressAndAppearance();
  if (!readSession()) return;
  const now = Date.now();
  writeSetting(RESET_KEY, String(now));
  writeSetting('ph:cosmetics', JSON.stringify(noEquipment(now)));
  void syncNow();
}

// After deleting the account: the progress stays here and merges into whichever account comes next.
export function forgetSyncedPlayer(): void {
  removeSetting(PLAYER_KEY);
}

function scheduleSync() {
  if (applying || !readSession()) return;
  dirty = true;
  if (timer !== undefined) clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = undefined;
    void syncNow();
  }, DEBOUNCE_MS);
}

export function initSync(): void {
  onSyncedWrite(scheduleSync);
  void syncNow();
  window.addEventListener('online', () => void syncNow());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      void syncNow();
      return;
    }
    if (!dirty) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    void syncNow({ keepalive: true });
  });
}
```

Check: `theme.ts` must not import `sync.ts` (it does not today), otherwise there is a cycle.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @puzzle-hustle/web exec vitest run test/sync.test.ts`, then `pnpm --filter @puzzle-hustle/web test` and `pnpm -r typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/sync.ts apps/web/test/sync.test.ts
git commit -m "Sync: client merges with the account on sign-in, start, resume and after writes" -m "Implemented with assistance from Claude Opus 5.5."
```

---

### Task 5: Wire it into the app

**Files:**
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/lib/auth.ts` (`startSession`, `deleteAccount`)
- Modify: `apps/web/src/pages/Account.tsx` (reset button)
- Test: `apps/web/test/auth.test.ts`, new `apps/web/test/accountReset.test.ts`

**Interfaces:**
- Consumes: `initSync`, `syncAfterSignIn`, `resetAccount`, `forgetSyncedPlayer` (Task 4); `useSession` (`auth.ts`).
- Produces: nothing new for other tasks.

- [ ] **Step 1: Write the failing test**

`startSession` is not exported and every sign-in path needs a provider plugin, so the
sign-in trigger is checked by hand in Task 7. Pin the account deletion instead; append to
`apps/web/test/auth.test.ts` (add `deleteAccount` to the `auth.ts` import):

```ts
it('forgets the synced player when the account is deleted', async () => {
  writeSession({ token: 't', player: { id: 'p', name: 'Moritz' } });
  localStorage.setItem('ph:sync:player', 'p');
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
  expect(await deleteAccount()).toBe(true);
  expect(localStorage.getItem('ph:sync:player')).toBeNull();
});
```

For the reset copy, a render test in `apps/web/test/accountReset.test.ts`:

```ts
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { Account } from '../src/pages/Account.tsx';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function openReset(): string {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(createElement(Account)));
  const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Reset')!;
  act(() => button.click());
  const text = container.textContent ?? '';
  act(() => root.unmount());
  return text;
}

it('says the reset reaches all devices when signed in', () => {
  localStorage.clear();
  localStorage.setItem('ph:session', JSON.stringify({ token: 't', player: { id: 'p1', name: 'Moritz' } }));
  expect(openReset()).toContain('on all your devices');
});

it('says the reset stays on this device when signed out', () => {
  localStorage.clear();
  expect(openReset()).toContain('on this device');
});
```


- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm --filter @puzzle-hustle/web exec vitest run test/auth.test.ts test/accountReset.test.ts`
Expected: FAIL; `ph:sync:player` survives the deletion, copy says "on this device" in both cases.

- [ ] **Step 3: Implement**

`main.tsx`: import and start after `initQueue();`:

```ts
import { initSync } from './lib/sync.ts';
// ...
initQueue();
initSync();
```

`auth.ts` `startSession`: after `removeSetting(PREVIOUS_PLAYER_KEY);` add

```ts
  void syncAfterSignIn(previous);
```

with `import { forgetSyncedPlayer, syncAfterSignIn } from './sync.ts';`. Keep the existing guarded `pushCosmetics()`/`pushHustle()` block as it is.

`auth.ts` `deleteAccount`: before `signOut();` add

```ts
  forgetSyncedPlayer();
```

`Account.tsx`: import `useSession` from `../lib/auth.ts` and `resetAccount` from `../lib/sync.ts`; drop the `resetProgressAndAppearance` import if nothing else uses it. In the component body: `const signedIn = useSession() !== null;`. The copy and the click:

```tsx
<span className="muted small">
  {confirmReset
    ? signedIn
      ? 'Deletes all solves, streaks, coins and items on all your devices. Current dailies, weeklies and monthlies stay solved.'
      : 'Deletes all solves and streaks on this device. Current dailies, weeklies and monthlies stay solved.'
    : 'Start over from zero.'}
</span>
```

```tsx
onClick={() => {
  resetAccount();
  void pushCosmetics();
  setConfirmReset(false);
}}
```

- [ ] **Step 4: Run all web tests, typecheck and look at it**

Run: `pnpm --filter @puzzle-hustle/web test`, `pnpm -r typecheck`
Expected: all PASS.
Then `pnpm dev`, open the app, Profile, Account, tap Reset: the copy reads "on this device" signed out. Signing in in the dev build must show a `POST /sync` in the network tab right after `/session`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/main.tsx apps/web/src/lib/auth.ts apps/web/src/pages/Account.tsx apps/web/test/auth.test.ts apps/web/test/accountReset.test.ts
git commit -m "Sync: start with the app, after sign-in, account-wide reset" -m "Implemented with assistance from Claude Opus 5.5."
```

---

### Task 6: Docs, store texts, privacy, review

**Files:**
- Modify: `docs/design.md`, `docs/decisions.md`, `docs/backlog.md`, `docs/pitfalls.md`
- Modify: `store/listing.md`
- Modify: `apps/web/src/pages/DeleteAccount.tsx`
- Modify (other repo, `C:/GameDev/Website/vexury.github.io`): `src/puzzle-hustle-privacy.md`

- [ ] **Step 1: Repo docs (German, dated bullets like the neighbours)**
  - `docs/design.md`: new bullet "Fortschritts-Sync (seit 2026-10-03, Spec `docs/superpowers/specs/2026-10-03-progress-sync-design.md`)": the four stores, `mergeSave` rules in one sentence each, `POST /sync`, `saves` table (Migration 0007), triggers, `ph:sync:resetAt`/`ph:sync:player`, account-wide reset. In the existing Hustle bullet, replace "`POST /hustle` behaelt das Maximum" with a note that `/sync` sets `players.hustle` exactly and `/hustle` stays for old versions.
  - `docs/decisions.md`: entry 2026-10-03 with scope (profile complete, boards and settings local), reset account-wide, server-side merge; rejected: client merge with versions, delta sync, Saved Games.
  - `docs/backlog.md`: delete the item "Sync des Fortschritts zwischen Web und Apps" (line starting `- [ ] Sync des Fortschritts`); keep "Stille Wiederanmeldung auf Android", which now matters more.
  - `docs/pitfalls.md`: in the bullet about `ACHIEVEMENTS_EPOCH` and `players.hustle`, add that `/sync` corrects the chip of every player who syncs; the manual `UPDATE players SET hustle = 0` is still needed for players on old builds.
  - `CLAUDE.md` (repo): in the bullet "Progress, in-progress boards, ... live in localStorage", add that signed-in players' solves, spend log, doubled list and equipment are merged with `saves` via `POST /sync` (`lib/sync.ts`), and that the backend now serves leaderboard and sync.

- [ ] **Step 2: Store texts and the deletion page**
  - `store/listing.md` Data safety table, row "App activity: Other actions": add "solved puzzles with time, hints, moves and date; coin spending; equipped items (progress sync)". In the line "Progress, settings, coins, achievements and unfinished boards stay on the device", say that progress, coins and equipment are copied to the server for signed-in players, unfinished boards and settings stay on the device. App Store label row "Gameplay Content": add "synced progress".
  - `DeleteAccount.tsx` "What is deleted": add `<li>the copy of your progress, coins and items kept for sync</li>`; "What stays on your device": keep the sentence but drop "never leave the device" and say the progress on the device is not touched.

- [ ] **Step 3: Privacy page (vexury-site repo)**
  In `src/puzzle-hustle-privacy.md`: line 17 ("Your progress, streaks, coins and settings stay on your device") becomes "Settings and unfinished boards stay on your device; if you sign in, your progress, coins and equipped items are also kept on our server so they are the same on all your devices." Under "What our server keeps", add a bullet with the synced data and that it is deleted with the account. Line 92 ("Your coins and what you own stay on your device.") goes. Commit in that repo; do **not** push before the release that contains sync is live (the text must match the shipped build).

- [ ] **Step 4: Store review**
  Run the agent `puzzle-hustle-store-review` over the branch diff (sign-in, stored data, account deletion, listing, privacy text). Fix findings; anything that is a decision goes to Moritz.

- [ ] **Step 5: Commit (puzzle-hustle repo)**

```bash
git add docs/design.md docs/decisions.md docs/backlog.md docs/pitfalls.md CLAUDE.md store/listing.md apps/web/src/pages/DeleteAccount.tsx
git commit -m "Sync: docs, data safety and deletion page" -m "Implemented with assistance from Claude Opus 5.5."
```

---

### Task 7: Verification and rollout (each outward step after Moritz says so)

- [ ] **Step 1: Full checks**
  Run: `pnpm test`, `pnpm -r typecheck`. Expected: all green. Paste the summary lines.
- [ ] **Step 2: Local end-to-end**
  `pnpm --filter @puzzle-hustle/api run migrate:local`, `pnpm --filter @puzzle-hustle/api dev`, web with `VITE_API_BASE` on the local Worker, two browser profiles signed in as the same test account: solve in one, reload the other, profiles match (Hustle level, Solved count, coins, nameplate). Reset in one, the other follows after resume.
- [ ] **Step 3: Remote migration and Worker deploy (ask first)**
  `pnpm --filter @puzzle-hustle/api run migrate:remote`, then `pnpm --filter @puzzle-hustle/api run deploy`. The web app deploys on push; push `origin` and `github` only after Moritz says so.
- [ ] **Step 4: Real devices**
  Web and the S23 (Moritz's account): after the next app release containing this change, both show Lv 49 and the same stats and nameplate. App release runs through the skill `puzzle-hustle-release`.
- [ ] **Step 5: Hub wiki**
  Propose the wiki lines for `puzzle-hustle.md` via `sync-wiki` (fact: progress sync since date; decision with reason), then push the privacy page together with the release.
