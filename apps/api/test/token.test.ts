import { expect, it } from 'vitest';
import { SESSION_DAYS, signSession, verifySession } from '../src/token.ts';

const SECRET = 'test-secret';

it('round-trips a player id', async () => {
  const token = await signSession('player-1', SECRET);
  await expect(verifySession(token, SECRET)).resolves.toBe('player-1');
});

it('rejects a token signed with another secret', async () => {
  const token = await signSession('player-1', 'other-secret');
  await expect(verifySession(token, SECRET)).resolves.toBeNull();
});

it('rejects a tampered payload', async () => {
  const token = await signSession('player-1', SECRET);
  const [head, , sig] = token.split('.');
  const forged = btoa(JSON.stringify({ pid: 'player-2', iat: 0, exp: 9e12 })).replace(/=/g, '');
  await expect(verifySession(`${head}.${forged}.${sig}`, SECRET)).resolves.toBeNull();
});

it('rejects an expired token', async () => {
  const issued = Date.now() - 31 * 86400000;
  const token = await signSession('player-1', SECRET, issued);
  await expect(verifySession(token, SECRET)).resolves.toBeNull();
});

it('rejects garbage', async () => {
  await expect(verifySession('not-a-token', SECRET)).resolves.toBeNull();
  await expect(verifySession('', SECRET)).resolves.toBeNull();
});

it('treats a token that expires exactly now as expired', async () => {
  const issued = Date.now();
  const token = await signSession('player-1', SECRET, issued);
  const expiresAt = (Math.floor(issued / 1000) + SESSION_DAYS * 86400) * 1000;
  await expect(verifySession(token, SECRET, expiresAt)).resolves.toBeNull();
});
