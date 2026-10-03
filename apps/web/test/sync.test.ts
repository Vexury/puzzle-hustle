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
