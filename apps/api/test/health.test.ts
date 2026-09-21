import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, expect, it } from 'vitest';
import worker from '../src/index.ts';
import { signSession } from '../src/token.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

it('answers the health route', async () => {
  const response = await worker.fetch(new Request('https://api.test/health'), env);
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ ok: true });
});

it('answers an unknown route with 401 when the caller is not signed in', async () => {
  // The requirePlayer gate sits above the router's 404 fallback, so an unauthenticated
  // request never learns whether the path exists.
  const response = await worker.fetch(new Request('https://api.test/nope'), env);
  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({ error: 'unauthorized' });
});

it('answers an unknown route with 404 and a code for a signed-in caller', async () => {
  await env.DB.prepare('INSERT INTO players (id, provider, subject, name, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind('health-test-player', 'google', 'health-test-subject', 'Health Tester', Date.now())
    .run();
  const token = await signSession('health-test-player', env.SESSION_SECRET);
  const response = await worker.fetch(
    new Request('https://api.test/nope', { headers: { Authorization: `Bearer ${token}` } }),
    env,
  );
  expect(response.status).toBe(404);
  await expect(response.json()).resolves.toEqual({ error: 'not_found' });
});

it('reflects an allowed origin and refuses an unknown one', async () => {
  const allowed = await worker.fetch(
    new Request('https://api.test/health', { headers: { Origin: 'https://puzzles.vexury.dev' } }),
    env,
  );
  expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://puzzles.vexury.dev');

  const foreign = await worker.fetch(
    new Request('https://api.test/health', { headers: { Origin: 'https://evil.example' } }),
    env,
  );
  expect(foreign.headers.get('Access-Control-Allow-Origin')).toBeNull();
});
