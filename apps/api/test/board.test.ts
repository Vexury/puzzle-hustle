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

it('carries each player badge and flair, null when unset', async () => {
  await player('a', 'Anna');
  await player('b', 'Ben');
  await env.DB.prepare("UPDATE players SET badge = 'cat', flair = 'puzzler' WHERE id = 'a'").run();
  await group('g1', ['a', 'b']);
  await score('a', 200);
  await score('b', 300);

  const board = (await readBoard(env.DB, 'a', 'g1', PUZZLE))!;
  expect(board.entries.map((e) => [e.name, e.badge, e.flair])).toEqual([
    ['Anna', 'cat', 'puzzler'],
    ['Ben', null, null],
  ]);
});
