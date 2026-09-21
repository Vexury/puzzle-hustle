import { cors, error, json, type Env } from './http.ts';

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true });
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
