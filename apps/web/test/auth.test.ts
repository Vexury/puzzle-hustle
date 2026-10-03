import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { writeSession } from '../src/lib/api.ts';
import { deleteAccount, sessionSnapshot, signOut } from '../src/lib/auth.ts';
import { recordSolve, rehydrate } from '../src/lib/storage.ts';

const ok = () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  rehydrate();
  fetchMock = vi.fn(async () => ok());
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const syncCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/sync'));

it('sees a session restored straight into storage after the module loaded', () => {
  expect(sessionSnapshot()).toBeNull();
  localStorage.setItem('ph:session', JSON.stringify({ token: 't', player: { id: 'p', name: 'Moritz' } }));
  expect(sessionSnapshot()?.player.id).toBe('p');
  expect(sessionSnapshot()).toBe(sessionSnapshot());
});

it('forgets the local name on sign-out so the next account does not inherit it', () => {
  writeSession({ token: 't', player: { id: 'p', name: 'Moritz' } });
  localStorage.setItem('ph:name', 'Moritz');
  signOut();
  expect(localStorage.getItem('ph:name')).toBeNull();
  expect(localStorage.getItem('ph:previousPlayer')).toBe('p');
  expect(sessionSnapshot()).toBeNull();
});

it('sends a pending solve with the old token on sign-out', async () => {
  writeSession({ token: 'old', player: { id: 'p', name: 'Moritz' } });
  recordSolve('zip:level:easy:1', { solvedAt: new Date().toISOString(), seconds: 60, hints: 0, moves: 20 });
  signOut();
  expect(sessionSnapshot()).toBeNull();
  await vi.waitFor(() => expect(syncCalls()).toHaveLength(1));
  const [, init] = syncCalls()[0] as [string, RequestInit];
  expect(new Headers(init.headers).get('Authorization')).toBe('Bearer old');
  expect(Object.keys((JSON.parse(String(init.body)) as { solves: object }).solves)).toEqual(['zip:level:easy:1']);
});

it('forgets the synced player when the account is deleted, without syncing into it', async () => {
  writeSession({ token: 't', player: { id: 'p', name: 'Moritz' } });
  localStorage.setItem('ph:sync:player', 'p');
  expect(await deleteAccount()).toBe(true);
  expect(localStorage.getItem('ph:sync:player')).toBeNull();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(syncCalls()).toHaveLength(0);
});
