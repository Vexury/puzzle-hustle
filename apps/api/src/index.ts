import { verifyGoogleIdToken } from './google.ts';
import { createGroup, joinGroup, leaveGroup, listGroups, removeMember } from './groups.ts';
import { cors, error, json, type Env } from './http.ts';
import { generatedName, validateName } from './names.ts';
import { requirePlayer, upsertPlayer } from './players.ts';
import { signSession } from './token.ts';

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function postSession(request: Request, env: Env): Promise<Response> {
  if (env.SESSION_LIMIT) {
    const key = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await env.SESSION_LIMIT.limit({ key });
    if (!success) return error(429, 'too_many_requests');
  }
  const input = await body(request);
  if (input.provider !== 'google') return error(400, 'unsupported_provider');
  if (typeof input.idToken !== 'string') return error(400, 'missing_token');

  const audiences = env.GOOGLE_CLIENT_IDS.split(',').map((id) => id.trim()).filter(Boolean);
  const subject = await verifyGoogleIdToken(input.idToken, { audiences });
  if (!subject) return error(401, 'bad_token');

  const offered = typeof input.name === 'string' ? validateName(input.name) : null;
  const name = offered?.ok ? offered.name : generatedName();
  const player = await upsertPlayer(env.DB, 'google', subject, name);
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

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === 'GET' && path === '/health') return json({ ok: true });
  if (method === 'POST' && path === '/session') return postSession(request, env);

  const playerId = await requirePlayer(request, env);
  if (!playerId) return error(401, 'unauthorized');

  if (method === 'POST' && path === '/name') return postName(request, env, playerId);

  if (method === 'GET' && path === '/groups') return json({ groups: await listGroups(env.DB, playerId) });

  if (method === 'POST' && path === '/groups') {
    const input = await body(request);
    if (typeof input.name !== 'string') return error(400, 'missing_name');
    const created = await createGroup(env.DB, playerId, input.name);
    if (!created.ok) return error(created.reason === 'name' ? 400 : 403, `group_${created.reason}`);
    return json(created.group);
  }

  if (method === 'POST' && path === '/groups/join') {
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

  return error(404, 'not_found');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return cors(request, new Response(null, { status: 204 }));
    try {
      return cors(request, await route(request, env));
    } catch {
      return cors(request, error(500, 'internal'));
    }
  },
};
