import { expect, it } from 'vitest';
import { RENEW_AFTER_DAYS, SESSION_DAYS, renewSession, signSession, verifySession } from '../src/token.ts';

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

it('leaves a fresh token alone', async () => {
  const token = await signSession('player-1', SECRET);
  await expect(renewSession(token, SECRET)).resolves.toBeNull();
});

it('swaps an older token for a fresh one of the same player', async () => {
  const issued = Date.now() - (RENEW_AFTER_DAYS + 1) * 86400000;
  const renewed = await renewSession(await signSession('player-1', SECRET, issued), SECRET);
  expect(renewed).not.toBeNull();
  await expect(verifySession(renewed!, SECRET, issued + (SESSION_DAYS + 1) * 86400000)).resolves.toBe('player-1');
});

it('does not revive an expired or forged token', async () => {
  const expired = await signSession('player-1', SECRET, Date.now() - 31 * 86400000);
  await expect(renewSession(expired, SECRET)).resolves.toBeNull();
  await expect(renewSession(await signSession('player-1', 'other-secret', Date.now() - 8 * 86400000), SECRET)).resolves.toBeNull();
});
