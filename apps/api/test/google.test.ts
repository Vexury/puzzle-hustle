import { expect, it } from 'vitest';
import { verifyGoogleIdToken, type Jwks } from '../src/google.ts';
import { JwksUnavailable } from '../src/idtoken.ts';

const encoder = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function issue(claims: Record<string, unknown>) {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey;
  const header = b64url(encoder.encode(JSON.stringify({ alg: 'RS256', kid: 'test-kid' })));
  const payload = b64url(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, encoder.encode(`${header}.${payload}`));
  return {
    token: `${header}.${payload}.${b64url(new Uint8Array(signature))}`,
    fetchJwks: async (): Promise<Jwks> => ({ keys: [{ ...jwk, kid: 'test-kid', alg: 'RS256' } as JsonWebKey] }),
  };
}

const base = {
  iss: 'https://accounts.google.com',
  aud: 'test-client-id',
  sub: 'google-subject-1',
  email: 'someone@example.com',
  exp: Math.floor(Date.now() / 1000) + 3600,
};

it('returns the subject of a valid token', async () => {
  const { token, fetchJwks } = await issue(base);
  await expect(verifyGoogleIdToken(token, { audiences: ['test-client-id'], fetchJwks })).resolves.toBe('google-subject-1');
});

it('rejects a foreign audience', async () => {
  const { token, fetchJwks } = await issue({ ...base, aud: 'someone-elses-app' });
  await expect(verifyGoogleIdToken(token, { audiences: ['test-client-id'], fetchJwks })).resolves.toBeNull();
});

it('rejects a foreign issuer', async () => {
  const { token, fetchJwks } = await issue({ ...base, iss: 'https://evil.example' });
  await expect(verifyGoogleIdToken(token, { audiences: ['test-client-id'], fetchJwks })).resolves.toBeNull();
});

it('rejects an expired token', async () => {
  const { token, fetchJwks } = await issue({ ...base, exp: Math.floor(Date.now() / 1000) - 10 });
  await expect(verifyGoogleIdToken(token, { audiences: ['test-client-id'], fetchJwks })).resolves.toBeNull();
});

it('rejects a token whose signature does not match the published key', async () => {
  const { token } = await issue(base);
  const other = await issue(base);
  await expect(
    verifyGoogleIdToken(token, { audiences: ['test-client-id'], fetchJwks: other.fetchJwks }),
  ).resolves.toBeNull();
});

it('rejects a token whose kid is not in the key set', async () => {
  const { token, fetchJwks: originalFetchJwks } = await issue(base);
  const { keys } = await originalFetchJwks();
  const fetchJwks = async (): Promise<Jwks> => ({
    keys: [{ ...keys[0]!, kid: 'different-kid' } as JsonWebKey],
  });
  await expect(
    verifyGoogleIdToken(token, { audiences: ['test-client-id'], fetchJwks }),
  ).resolves.toBeNull();
});

it('refetches the key set once for an unknown kid', async () => {
  const { token, fetchJwks: current } = await issue(base);
  const calls: Array<boolean | undefined> = [];
  const fetchJwks = async (refresh?: boolean): Promise<Jwks> => {
    calls.push(refresh);
    return refresh ? current() : { keys: [] };
  };
  await expect(verifyGoogleIdToken(token, { audiences: ['test-client-id'], fetchJwks })).resolves.toBe('google-subject-1');
  expect(calls).toEqual([false, true]);
});

it('throws JwksUnavailable instead of calling the token bad when the keys cannot be fetched', async () => {
  const { token } = await issue(base);
  const fetchJwks = async (): Promise<Jwks> => {
    throw new Error('network');
  };
  await expect(verifyGoogleIdToken(token, { audiences: ['test-client-id'], fetchJwks })).rejects.toBeInstanceOf(
    JwksUnavailable,
  );
});
