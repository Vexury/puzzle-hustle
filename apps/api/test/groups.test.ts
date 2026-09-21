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

async function signInWithId(subject: string, name: string): Promise<{ token: string; id: string }> {
  vi.spyOn(google, 'verifyGoogleIdToken').mockResolvedValue(subject);
  const response = await worker.fetch(
    new Request('https://api.test/session', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken: 'x', name }),
    }),
    env,
  );
  const parsed = (await response.json()) as { token: string; player: { id: string } };
  return { token: parsed.token, id: parsed.player.id };
}

async function signIn(subject: string, name: string): Promise<string> {
  return (await signInWithId(subject, name)).token;
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

it('tells a player at their group cap who re-joins one of their own groups that they are already in it, not that they are at the cap', async () => {
  const token = await signIn('s1', 'Moritz');
  let firstCode = '';
  for (let i = 0; i < 5; i++) {
    const created = (await (await post('/groups', token, { name: `G${i}` })).json()) as { code: string };
    if (i === 0) firstCode = created.code;
  }
  const rejoin = await post('/groups/join', token, { code: firstCode });
  expect(rejoin.status).toBe(409);
});

it('refuses an invalid group name', async () => {
  const token = await signIn('s1', 'Moritz');
  expect((await post('/groups', token, { name: 'x' })).status).toBe(400);
  expect((await post('/groups', token, { name: 'http://x.example' })).status).toBe(400);
});

it('refuses a non-owner removing anybody', async () => {
  const owner = await signIn('s1', 'Moritz');
  const group = (await (await post('/groups', owner, { name: 'Family' })).json()) as { id: string; code: string };
  const guest = await signIn('s2', 'Daniela');
  await post('/groups/join', guest, { code: group.code });

  expect((await post('/groups/remove', guest, { id: group.id, playerId: 'anyone' })).status).toBe(403);
});

it('lets an owner remove a member', async () => {
  const owner = await signIn('s1', 'Moritz');
  const group = (await (await post('/groups', owner, { name: 'Family' })).json()) as { id: string; code: string };
  const guest = await signInWithId('s2', 'Daniela');
  await post('/groups/join', guest.token, { code: group.code });

  const removed = await post('/groups/remove', owner, { id: group.id, playerId: guest.id });
  expect(removed.status).toBe(200);

  const afterList = (await (await call('/groups', guest.token)).json()) as { groups: unknown[] };
  expect(afterList.groups).toEqual([]);
});

it('lets a member leave voluntarily', async () => {
  const owner = await signIn('s1', 'Moritz');
  const group = (await (await post('/groups', owner, { name: 'Family' })).json()) as { id: string; code: string };
  const guest = await signIn('s2', 'Daniela');
  await post('/groups/join', guest, { code: group.code });

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
