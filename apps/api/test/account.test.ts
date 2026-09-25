import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import worker from '../src/index.ts';
import * as apple from '../src/apple.ts';
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

it('refuses a self-report and writes nothing', async () => {
  const me = await signIn('s1', 'Moritz');
  const response = await call('/report', me.token, {
    method: 'POST',
    body: JSON.stringify({ playerId: me.player.id, reason: 'name' }),
  });
  expect(response.status).toBe(400);
  const rows = await env.DB.prepare('SELECT COUNT(*) AS n FROM reports').first<{ n: number }>();
  expect(rows?.n).toBe(0);
});

it('refuses a report against an unknown player and writes nothing', async () => {
  const me = await signIn('s1', 'Moritz');
  const response = await call('/report', me.token, {
    method: 'POST',
    body: JSON.stringify({ playerId: 'nope', reason: 'name' }),
  });
  expect(response.status).toBe(404);
  const rows = await env.DB.prepare('SELECT COUNT(*) AS n FROM reports').first<{ n: number }>();
  expect(rows?.n).toBe(0);
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

it('deletes the badge and flair along with the player on account deletion', async () => {
  const me = await signIn('s1', 'Moritz');
  await call('/cosmetics', me.token, { method: 'POST', body: JSON.stringify({ badge: 'bolt', flair: 'hustler' }) });
  const before = await env.DB.prepare('SELECT badge, flair FROM players WHERE id = ?').bind(me.player.id).first<{
    badge: string | null;
    flair: string | null;
  }>();
  expect(before).toEqual({ badge: 'bolt', flair: 'hustler' });

  expect((await call('/account', me.token, { method: 'DELETE' })).status).toBe(200);

  const after = await env.DB.prepare('SELECT badge, flair FROM players WHERE id = ?').bind(me.player.id).first();
  expect(after).toBeNull();
});

it('hands a deleted owner\'s group on to the longest-standing remaining member and leaves the others intact', async () => {
  const owner = await signIn('s1', 'Moritz');
  const group = (await (await call('/groups', owner.token, { method: 'POST', body: JSON.stringify({ name: 'Family' }) })).json()) as {
    id: string;
    code: string;
  };
  // Joined in this order, so on the owner's deletion the longest-standing of the two
  // remaining members is Daniela, not Rude.
  const second = await signIn('s2', 'Daniela');
  await call('/groups/join', second.token, { method: 'POST', body: JSON.stringify({ code: group.code }) });
  const third = await signIn('s3', 'Rude');
  await call('/groups/join', third.token, { method: 'POST', body: JSON.stringify({ code: group.code }) });

  expect((await call('/account', owner.token, { method: 'DELETE' })).status).toBe(200);

  const list = (await (await call('/groups', second.token)).json()) as {
    groups: Array<{ id: string; owner: boolean; members: number }>;
  };
  expect(list.groups).toHaveLength(1);
  expect(list.groups[0]?.id).toBe(group.id);
  expect(list.groups[0]?.owner).toBe(true);
  expect(list.groups[0]?.members).toBe(2);

  const thirdList = (await (await call('/groups', third.token)).json()) as { groups: Array<{ owner: boolean }> };
  expect(thirdList.groups[0]?.owner).toBe(false);

  const ownerRow = await env.DB.prepare('SELECT id FROM players WHERE id = ?').bind(owner.player.id).first();
  expect(ownerRow).toBeNull();
  const ownerScores = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE player_id = ?')
    .bind(owner.player.id)
    .first<{ n: number }>();
  expect(ownerScores?.n).toBe(0);
  const ownerMemberships = await env.DB.prepare('SELECT COUNT(*) AS n FROM members WHERE player_id = ?')
    .bind(owner.player.id)
    .first<{ n: number }>();
  expect(ownerMemberships?.n).toBe(0);
});

async function signInWithApple(subject: string) {
  vi.spyOn(apple, 'verifyAppleIdToken').mockResolvedValue(subject);
  const response = await worker.fetch(
    new Request('https://api.test/session', { method: 'POST', body: JSON.stringify({ provider: 'apple', idToken: 'x' }) }),
    env,
  );
  return (await response.json()) as { token: string; player: { id: string } };
}

it('revokes the Apple authorization before deleting an Apple account', async () => {
  const me = await signInWithApple('apple-1');
  const revoke = vi.spyOn(apple, 'revokeAppleAuthorization').mockResolvedValue(true);
  const response = await call('/account', me.token, { method: 'DELETE', body: JSON.stringify({ appleCode: 'code-1' }) });
  expect(response.status).toBe(200);
  expect(revoke).toHaveBeenCalledWith('code-1', expect.objectContaining({ clientId: 'test.bundle.id', teamId: 'TEAMID1234' }));
  const rows = await env.DB.prepare('SELECT COUNT(*) AS n FROM players').first<{ n: number }>();
  expect(rows?.n).toBe(0);
});

it('revokes with the Services ID a web code was issued to', async () => {
  const me = await signInWithApple('apple-1');
  const revoke = vi.spyOn(apple, 'revokeAppleAuthorization').mockResolvedValue(true);
  const body = JSON.stringify({ appleCode: 'code-1', appleClientId: 'test.web.id' });
  await call('/account', me.token, { method: 'DELETE', body });
  expect(revoke).toHaveBeenCalledWith('code-1', expect.objectContaining({ clientId: 'test.web.id' }));
});

it('ignores a client ID outside APPLE_AUDIENCES', async () => {
  const me = await signInWithApple('apple-1');
  const revoke = vi.spyOn(apple, 'revokeAppleAuthorization').mockResolvedValue(true);
  const body = JSON.stringify({ appleCode: 'code-1', appleClientId: 'someone.else' });
  await call('/account', me.token, { method: 'DELETE', body });
  expect(revoke).toHaveBeenCalledWith('code-1', expect.objectContaining({ clientId: 'test.bundle.id' }));
});

it('deletes an Apple account even when the revocation fails', async () => {
  const me = await signInWithApple('apple-1');
  vi.spyOn(apple, 'revokeAppleAuthorization').mockResolvedValue(false);
  const response = await call('/account', me.token, { method: 'DELETE', body: JSON.stringify({ appleCode: 'code-1' }) });
  expect(response.status).toBe(200);
  const rows = await env.DB.prepare('SELECT COUNT(*) AS n FROM players').first<{ n: number }>();
  expect(rows?.n).toBe(0);
});

it('never revokes for a Google account', async () => {
  const me = await signIn('s1', 'Moritz');
  const revoke = vi.spyOn(apple, 'revokeAppleAuthorization');
  await call('/account', me.token, { method: 'DELETE', body: JSON.stringify({ appleCode: 'code-1' }) });
  expect(revoke).not.toHaveBeenCalled();
});
