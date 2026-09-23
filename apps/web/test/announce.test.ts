import { beforeEach, expect, it, vi } from 'vitest';
import { pendingAnnouncements, syncAnnouncements } from '../src/lib/announce.ts';
import { readSetting, writeSetting } from '../src/lib/storage.ts';

beforeEach(() => {
  localStorage.clear();
});

it('announces what is newly current and nothing else', () => {
  const { toAnnounce, nextAnnounced } = pendingAnnouncements(new Set(['a', 'b']), ['a']);
  expect(toAnnounce).toEqual(['b']);
  expect(nextAnnounced.sort()).toEqual(['a', 'b']);
});

it('forgets an announcement whose id is no longer current', () => {
  const { toAnnounce, nextAnnounced } = pendingAnnouncements(new Set(['a']), ['a', 'gone']);
  expect(toAnnounce).toEqual([]);
  expect(nextAnnounced).toEqual(['a']);
});

it('writes the announced list under its own key and announces newly current ids in catalogue order', () => {
  const seen: string[] = [];
  syncAnnouncements('ph:test:one', () => new Set(['z', 'a']), ['a', 'z'], (id) => seen.push(id));
  expect(seen).toEqual(['a', 'z']);
  expect((JSON.parse(readSetting('ph:test:one') ?? '[]') as string[]).sort()).toEqual(['a', 'z']);
});

it('announces once per id and not again on a second run', () => {
  const seen: string[] = [];
  const sync = () => syncAnnouncements('ph:test:two', () => new Set(['a']), ['a'], (id) => seen.push(id));
  sync();
  sync();
  expect(seen).toEqual(['a']);
});

it('does not write when the sync changes nothing, notably a clean install', () => {
  const setItem = vi.spyOn(Storage.prototype, 'setItem');
  syncAnnouncements('ph:test:three', () => new Set(), [], () => {});
  expect(setItem).not.toHaveBeenCalledWith('ph:test:three', expect.anything());
});

it('never throws even if computing the current set throws', () => {
  expect(() =>
    syncAnnouncements(
      'ph:test:four',
      () => {
        throw new Error('boom');
      },
      [],
      () => {},
    ),
  ).not.toThrow();
});

it('never throws when the stored announced list is malformed', () => {
  writeSetting('ph:test:five', 'not json');
  expect(() => syncAnnouncements('ph:test:five', () => new Set(['a']), ['a'], () => {})).not.toThrow();
});

it('keeps each key isolated', () => {
  syncAnnouncements('ph:test:six', () => new Set(['a']), ['a'], () => {});
  expect(readSetting('ph:test:seven')).toBeNull();
});
