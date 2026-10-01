import { HUSTLE_MAX_STAGE, SHOWCASE_SIZE, isCosmeticOf } from '@puzzle-hustle/core';
import { readBoard } from './board.ts';
import { revokeAppleAuthorization, verifyAppleIdToken } from './apple.ts';
import { verifyGoogleIdToken } from './google.ts';
import { MAX_EVENTS, pruneEvents, storeEvents } from './events.ts';
import { createGroup, joinGroup, leaveGroup, listGroups, removeMember } from './groups.ts';
import { cors, error, json, type Env } from './http.ts';
import { JwksUnavailable } from './idtoken.ts';
import { generatedName, validateName } from './names.ts';
import { requirePlayer, upsertPlayer } from './players.ts';
import { MAX_BATCH, submitScores } from './scores.ts';
import { renewSession, signSession } from './token.ts';

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function list(value: string): string[] {
  return value.split(',').map((id) => id.trim()).filter(Boolean);
}

// Best effort: the revocation is Apple's request, the deletion is the player's, so a missing
// code, a missing key or an Apple outage never keeps the account alive.
async function revokeIfApple(request: Request, env: Env, playerId: string): Promise<void> {
  const player = await env.DB.prepare('SELECT provider FROM players WHERE id = ?')
    .bind(playerId)
    .first<{ provider: string }>();
  if (player?.provider !== 'apple') return;
  const input = await body(request);
  // A code belongs to whoever asked for it: the web names its Services ID, the app sends none
  // and gets the bundle ID, which comes first in APPLE_AUDIENCES.
  const audiences = list(env.APPLE_AUDIENCES);
  const named = input.appleClientId;
  const clientId = typeof named === 'string' && audiences.includes(named) ? named : audiences[0];
  if (typeof input.appleCode !== 'string') {
    console.log('apple revoke: skipped, the app sent no authorization code');
    return;
  }
  if (!clientId || !env.APPLE_TEAM_ID || !env.APPLE_KEY_ID || !env.APPLE_SIGNIN_KEY) {
    console.log('apple revoke: skipped, the Sign in with Apple key is not configured');
    return;
  }
  await revokeAppleAuthorization(input.appleCode, {
    clientId,
    teamId: env.APPLE_TEAM_ID,
    keyId: env.APPLE_KEY_ID,
    privateKey: env.APPLE_SIGNIN_KEY,
  });
}

async function postSession(request: Request, env: Env): Promise<Response> {
  if (env.SESSION_LIMIT) {
    const key = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await env.SESSION_LIMIT.limit({ key });
    if (!success) return error(429, 'too_many_requests');
  }
  const input = await body(request);
  const provider = input.provider;
  if (provider !== 'google' && provider !== 'apple') return error(400, 'unsupported_provider');
  if (typeof input.idToken !== 'string') return error(400, 'missing_token');

  let subject: string | null;
  try {
    subject =
      provider === 'google'
        ? await verifyGoogleIdToken(input.idToken, { audiences: list(env.GOOGLE_CLIENT_IDS) })
        : await verifyAppleIdToken(input.idToken, { audiences: list(env.APPLE_AUDIENCES) });
  } catch (err) {
    if (err instanceof JwksUnavailable) return error(503, 'provider_unavailable');
    throw err;
  }
  if (!subject) return error(401, 'bad_token');

  const offered = typeof input.name === 'string' ? validateName(input.name) : null;
  const name = offered?.ok ? offered.name : generatedName();
  const player = await upsertPlayer(env.DB, provider, subject, name);
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

// Ownership lives in a local log the server cannot see, and a forged badge buys no rank, so
// only the ids are checked against the catalogue. Clients from before the showcase send only
// `badge` and no `nameplate`: their badge becomes the whole showcase and the nameplate stays.
async function postCosmetics(request: Request, env: Env, playerId: string): Promise<Response> {
  const input = await body(request);
  const flair = input.flair ?? null;
  let badges: string[];
  if (input.badges !== undefined) {
    const list = input.badges;
    if (!Array.isArray(list) || list.length > SHOWCASE_SIZE || new Set(list).size !== list.length) return error(400, 'bad_badges');
    if (!list.every((id) => isCosmeticOf(id, 'badge'))) return error(400, 'unknown_badge');
    badges = list as string[];
  } else {
    const badge = input.badge ?? null;
    if (badge !== null && !isCosmeticOf(badge, 'badge')) return error(400, 'unknown_badge');
    badges = badge === null ? [] : [badge as string];
  }
  const badge = badges[0] ?? null;
  if (flair !== null && !isCosmeticOf(flair, 'flair')) return error(400, 'unknown_flair');
  const setsNameplate = input.nameplate !== undefined;
  const nameplate = input.nameplate ?? null;
  if (nameplate !== null && !isCosmeticOf(nameplate, 'nameplate')) return error(400, 'unknown_nameplate');
  const stored = badges.length ? JSON.stringify(badges) : null;
  const row = setsNameplate
    ? await env.DB.prepare('UPDATE players SET badge = ?, badges = ?, flair = ?, nameplate = ? WHERE id = ? RETURNING nameplate')
        .bind(badge, stored, flair, nameplate, playerId)
        .first<{ nameplate: string | null }>()
    : await env.DB.prepare('UPDATE players SET badge = ?, badges = ?, flair = ? WHERE id = ? RETURNING nameplate')
        .bind(badge, stored, flair, playerId)
        .first<{ nameplate: string | null }>();
  return json({ badge, badges, flair, nameplate: row?.nameplate ?? null });
}

// The level comes from the device, like badge and flair. MAX keeps a stale device from lowering it.
async function postHustle(request: Request, env: Env, playerId: string): Promise<Response> {
  const { level } = await body(request);
  if (typeof level !== 'number' || !Number.isInteger(level) || level < 0 || level > HUSTLE_MAX_STAGE) return error(400, 'bad_level');
  const row = await env.DB.prepare('UPDATE players SET hustle = MAX(hustle, ?) WHERE id = ? RETURNING hustle')
    .bind(level, playerId)
    .first<{ hustle: number }>();
  return json({ hustle: row?.hustle ?? level });
}

// Anonymous by design: no token, and the IP only keys the rate limiter, it is never stored.
async function postEvents(request: Request, env: Env): Promise<Response> {
  if (env.EVENTS_LIMIT) {
    const key = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await env.EVENTS_LIMIT.limit({ key });
    if (!success) return error(429, 'too_many_requests');
  }
  const input = await body(request);
  const events = input.events;
  if (!Array.isArray(events) || events.length === 0) return error(400, 'missing_events');
  if (events.length > MAX_EVENTS) return error(400, 'batch_too_large');
  return json({ stored: await storeEvents(env.DB, events) });
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === 'GET' && path === '/health') return json({ ok: true });
  if (method === 'POST' && path === '/session') return postSession(request, env);
  if (method === 'POST' && path === '/events') return postEvents(request, env);

  const playerId = await requirePlayer(request, env);
  if (!playerId) return error(401, 'unauthorized');

  if (method === 'POST' && path === '/name') return postName(request, env, playerId);
  if (method === 'POST' && path === '/cosmetics') return postCosmetics(request, env, playerId);
  if (method === 'POST' && path === '/hustle') return postHustle(request, env, playerId);

  if (method === 'GET' && path === '/groups') return json({ groups: await listGroups(env.DB, playerId) });

  if (method === 'POST' && path === '/groups') {
    const input = await body(request);
    if (typeof input.name !== 'string') return error(400, 'missing_name');
    const created = await createGroup(env.DB, playerId, input.name);
    if (!created.ok) {
      const status = created.reason === 'name' ? 400 : created.reason === 'collision' ? 500 : 403;
      return error(status, `group_${created.reason}`);
    }
    return json(created.group);
  }

  if (method === 'POST' && path === '/groups/join') {
    if (env.JOIN_LIMIT) {
      const { success } = await env.JOIN_LIMIT.limit({ key: playerId });
      if (!success) return error(429, 'too_many_requests');
    }
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

  if (method === 'POST' && path === '/scores') {
    const input = await body(request);
    const entries = input.entries;
    if (!Array.isArray(entries) || entries.length === 0) return error(400, 'missing_entries');
    if (entries.length > MAX_BATCH) return error(400, 'batch_too_large');
    return json({ results: await submitScores(env.DB, playerId, entries) });
  }

  if (method === 'GET' && path === '/board') {
    const group = url.searchParams.get('group');
    const puzzle = url.searchParams.get('puzzle');
    if (!group || !puzzle) return error(400, 'missing_query');
    const board = await readBoard(env.DB, playerId, group, puzzle);
    return board ? json(board) : error(404, 'not_a_member');
  }

  if (method === 'POST' && path === '/report') {
    const input = await body(request);
    if (typeof input.playerId !== 'string') return error(400, 'missing_id');
    if (input.playerId === playerId) return error(400, 'self_report');
    const target = await env.DB.prepare('SELECT id FROM players WHERE id = ?').bind(input.playerId).first<{ id: string }>();
    if (!target) return error(404, 'unknown_player');
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
    await revokeIfApple(request, env, playerId);
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

  return error(404, 'not_found');
}

// Rides on any successful authenticated response instead of a refresh route, so a client that
// keeps talking to the API never has to remember to renew. Not after deleting the account:
// the token would outlive the player it names.
async function withRenewal(request: Request, env: Env, response: Response): Promise<Response> {
  const header = request.headers.get('Authorization');
  if (!response.ok || !header?.startsWith('Bearer ')) return response;
  if (request.method === 'DELETE' && new URL(request.url).pathname === '/account') return response;
  const renewed = await renewSession(header.slice(7), env.SESSION_SECRET);
  if (!renewed) return response;
  const headers = new Headers(response.headers);
  headers.set('X-Session-Token', renewed);
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await pruneEvents(env.DB);
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return cors(request, new Response(null, { status: 204 }));
    try {
      return cors(request, await withRenewal(request, env, await route(request, env)));
    } catch {
      return cors(request, error(500, 'internal'));
    }
  },
};
