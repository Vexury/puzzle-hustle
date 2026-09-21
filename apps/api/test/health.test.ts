import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, expect, it } from 'vitest';
import worker from '../src/index.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

it('answers the health route', async () => {
  const response = await worker.fetch(new Request('https://api.test/health'), env);
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ ok: true });
});

it('answers an unknown route with 404 and a code', async () => {
  const response = await worker.fetch(new Request('https://api.test/nope'), env);
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
