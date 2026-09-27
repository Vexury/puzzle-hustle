import { expect, it } from 'vitest';
import { streakNews } from '../src/lib/stats.ts';

const now = new Date('2026-09-27T10:00:00Z');
const today = (type: string) => `${type}:daily:2026-09-27`;
const yesterday = (type: string) => `${type}:daily:2026-09-26`;

it('announces a new streak on the third daily of the first day', () => {
  const ids = [today('zip'), today('shapes'), today('crowns')];
  expect(streakNews(ids, today('crowns'), now)).toEqual({ started: true, days: 1 });
});

it('reports the running streak when yesterday already counted', () => {
  const ids = [yesterday('zip'), yesterday('shapes'), yesterday('crowns'), today('zip'), today('shapes'), today('stars')];
  expect(streakNews(ids, today('stars'), now)).toEqual({ started: false, days: 2 });
});

it('stays quiet before the third daily and after it', () => {
  expect(streakNews([today('zip'), today('shapes')], today('shapes'), now)).toBeNull();
  const four = [today('zip'), today('shapes'), today('crowns'), today('stars')];
  expect(streakNews(four, today('stars'), now)).toBeNull();
});

it('ignores levels and random puzzles', () => {
  const ids = [today('zip'), today('shapes'), 'crowns:level:easy:3'];
  expect(streakNews(ids, 'crowns:level:easy:3', now)).toBeNull();
});
