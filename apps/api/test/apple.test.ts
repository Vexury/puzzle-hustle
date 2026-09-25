import { expect, it } from 'vitest';
import { appleClientSecret, revokeAppleAuthorization, verifyAppleIdToken } from '../src/apple.ts';
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

async function appleClient() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array((await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer);
  const privateKey = `-----BEGIN PRIVATE KEY-----\n${b64url(pkcs8).replace(/-/g, '+').replace(/_/g, '/')}\n-----END PRIVATE KEY-----`;
  return { client: { clientId: 'test.bundle.id', teamId: 'TEAMID1234', keyId: 'KEYID12345', privateKey }, publicKey: pair.publicKey };
}

function decodePart(part: string): Record<string, unknown> {
  const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  return JSON.parse(atob(padded)) as Record<string, unknown>;
}

it('signs a client secret Apple can verify with the key', async () => {
  const { client, publicKey } = await appleClient();
  const secret = await appleClientSecret(client, 1_000_000_000_000);
  const [head, body, signature] = secret.split('.') as [string, string, string];
  expect(decodePart(head)).toEqual({ alg: 'ES256', kid: 'KEYID12345' });
  expect(decodePart(body)).toMatchObject({ iss: 'TEAMID1234', sub: 'test.bundle.id', aud: 'https://appleid.apple.com' });
  const raw = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(signature.length / 4) * 4, '=')), (c) =>
    c.charCodeAt(0),
  );
  await expect(
    crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, raw, encoder.encode(`${head}.${body}`)),
  ).resolves.toBe(true);
});

it('exchanges the code and revokes the refresh token', async () => {
  const { client } = await appleClient();
  const calls: { url: string; body: URLSearchParams }[] = [];
  const fetcher = async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body as URLSearchParams });
    return String(url).endsWith('/auth/token')
      ? Response.json({ access_token: 'a', refresh_token: 'r' })
      : new Response(null, { status: 200 });
  };
  await expect(revokeAppleAuthorization('code-1', client, fetcher as typeof fetch)).resolves.toBe(true);
  expect(calls.map((c) => c.url)).toEqual(['https://appleid.apple.com/auth/token', 'https://appleid.apple.com/auth/revoke']);
  expect(calls[0]!.body.get('code')).toBe('code-1');
  expect(calls[1]!.body.get('token')).toBe('r');
  expect(calls[1]!.body.get('token_type_hint')).toBe('refresh_token');
});

it('reports failure when Apple refuses the code', async () => {
  const { client } = await appleClient();
  const fetcher = async () => new Response('{"error":"invalid_grant"}', { status: 400 });
  await expect(revokeAppleAuthorization('stale', client, fetcher as typeof fetch)).resolves.toBe(false);
});
