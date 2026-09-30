import { beforeEach, expect, it } from 'vitest';
import { LAUNCH_KEY, initLaunch, launchDone, launchMode } from '../src/lib/launch.ts';
import { readSetting, writeSetting } from '../src/lib/storage.ts';

beforeEach(() => {
  writeSetting(LAUNCH_KEY, '');
  launchDone();
});

it('plays the welcome on the first open of a Berlin day and only the page after that', () => {
  initLaunch('/', new Date('2026-09-30T08:00:00Z'));
  expect(launchMode()).toBe('welcome');
  initLaunch('/', new Date('2026-09-30T20:00:00Z'));
  expect(launchMode()).toBe('page');
  // 22:30 UTC is already 1 October in Berlin.
  initLaunch('/', new Date('2026-09-30T22:30:00Z'));
  expect(launchMode()).toBe('welcome');
  expect(readSetting(LAUNCH_KEY)).toBe('2026-10-01');
});

it('stays out of the delete-account page and is gone once done', () => {
  initLaunch('/delete-account/', new Date('2026-09-30T08:00:00Z'));
  expect(launchMode()).toBe('none');
  initLaunch('/', new Date('2026-09-30T08:00:00Z'));
  launchDone();
  expect(launchMode()).toBe('none');
});
