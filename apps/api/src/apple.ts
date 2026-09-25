import { cachedJwks, verifyIdToken, type VerifyOptions } from './idtoken.ts';

const KEYS_URL = 'https://appleid.apple.com/auth/keys';
const ISSUERS = ['https://appleid.apple.com'];
const TOKEN_URL = 'https://appleid.apple.com/auth/token';
const REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

// The audience is the bundle ID for tokens from the iOS app, a Services ID for the web flow.
export function verifyAppleIdToken(token: string, options: VerifyOptions): Promise<string | null> {
  return verifyIdToken(token, ISSUERS, (refresh) => cachedJwks(KEYS_URL, refresh), options);
}

export interface AppleClient {
  clientId: string;
  teamId: string;
  keyId: string;
  // The Sign in with Apple key as downloaded, a PKCS#8 PEM.
  privateKey: string;
}

function b64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemBody(pem: string): Uint8Array {
  const base64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

// Apple's client secret is a short-lived ES256 JWT signed with the Sign in with Apple key.
// WebCrypto already emits the raw r||s signature JWS wants.
export async function appleClientSecret(client: AppleClient, now = Date.now()): Promise<string> {
  const key = await crypto.subtle.importKey('pkcs8', pemBody(client.privateKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
  ]);
  const encoder = new TextEncoder();
  const iat = Math.floor(now / 1000);
  const header = b64url(encoder.encode(JSON.stringify({ alg: 'ES256', kid: client.keyId })));
  const claims = { iss: client.teamId, iat, exp: iat + 300, aud: 'https://appleid.apple.com', sub: client.clientId };
  const payload = b64url(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(new Uint8Array(signature))}`;
}

function form(fields: Record<string, string>): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  };
}

// Apple asks apps to revoke a player's tokens when the account is deleted. The server never keeps
// one, so the app hands over a fresh authorization code: it is exchanged and the result revoked
// on the spot. Resolves false on any failure; deleting the account must not depend on Apple.
// Each outcome is logged for `wrangler tail`, with Apple's error code but never a token: Apple
// answers a made-up code the same way whatever the client secret, so only a real deletion shows
// whether the key works.
export async function revokeAppleAuthorization(code: string, client: AppleClient, fetcher = fetch): Promise<boolean> {
  try {
    const secret = await appleClientSecret(client);
    const base = { client_id: client.clientId, client_secret: secret };
    const exchanged = await fetcher(TOKEN_URL, form({ ...base, code, grant_type: 'authorization_code' }));
    if (!exchanged.ok) {
      const { error } = (await exchanged.json().catch(() => ({}))) as { error?: string };
      console.log(`apple revoke: code exchange failed, ${exchanged.status} ${error ?? 'no error code'}`);
      return false;
    }
    const tokens = (await exchanged.json()) as { refresh_token?: string; access_token?: string };
    const [token, hint] = tokens.refresh_token
      ? [tokens.refresh_token, 'refresh_token']
      : [tokens.access_token, 'access_token'];
    if (!token) {
      console.log('apple revoke: code exchange returned no token');
      return false;
    }
    const revoked = await fetcher(REVOKE_URL, form({ ...base, token, token_type_hint: hint }));
    console.log(`apple revoke: ${hint} revoke answered ${revoked.status}`);
    return revoked.ok;
  } catch (err) {
    console.log(`apple revoke: failed before reaching Apple, ${err instanceof Error ? err.message : 'unknown error'}`);
    return false;
  }
}
