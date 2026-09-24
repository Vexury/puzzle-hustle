import { expect, it } from 'vitest';
import { verifyAppleIdToken } from '../src/apple.ts';
import type { Jwks } from '../src/idtoken.ts';

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
  const header = b64url(encoder.encode(JSON.stringify({ alg: 'RS256', kid: 'apple-kid' })));
  const payload = b64url(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, encoder.encode(`${header}.${payload}`));
  return {
    token: `${header}.${payload}.${b64url(new Uint8Array(signature))}`,
    fetchJwks: async (): Promise<Jwks> => ({ keys: [{ ...jwk, kid: 'apple-kid', alg: 'RS256' } as JsonWebKey] }),
  };
}

const base = {
  iss: 'https://appleid.apple.com',
  aud: 'test.bundle.id',
  sub: '001234.abcdef.0987',
  exp: Math.floor(Date.now() / 1000) + 600,
};

it('returns the subject of a valid token', async () => {
  const { token, fetchJwks } = await issue(base);
  await expect(verifyAppleIdToken(token, { audiences: ['test.bundle.id'], fetchJwks })).resolves.toBe('001234.abcdef.0987');
});

it('rejects a token issued by Google', async () => {
  const { token, fetchJwks } = await issue({ ...base, iss: 'https://accounts.google.com' });
  await expect(verifyAppleIdToken(token, { audiences: ['test.bundle.id'], fetchJwks })).resolves.toBeNull();
});

it('rejects a token for another app', async () => {
  const { token, fetchJwks } = await issue({ ...base, aud: 'com.someone.else' });
  await expect(verifyAppleIdToken(token, { audiences: ['test.bundle.id'], fetchJwks })).resolves.toBeNull();
});

it('rejects an expired token', async () => {
  const { token, fetchJwks } = await issue({ ...base, exp: Math.floor(Date.now() / 1000) - 10 });
  await expect(verifyAppleIdToken(token, { audiences: ['test.bundle.id'], fetchJwks })).resolves.toBeNull();
});
