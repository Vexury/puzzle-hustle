const CACHE_MS = 3600_000;
// An unknown kid may be a key published after the cache was filled; a forged header must not
// turn that into a fetch per request, so a forced refresh still reuses a set this fresh.
const REFRESH_MS = 60_000;

export interface Jwks {
  keys: JsonWebKey[];
}

export interface VerifyOptions {
  audiences: string[];
  now?: number;
  fetchJwks?: (refresh?: boolean) => Promise<Jwks>;
}

// The provider's key set could not be fetched: the token may be fine, so the caller answers
// with a retryable error instead of calling it invalid.
export class JwksUnavailable extends Error {}

const cache = new Map<string, { at: number; jwks: Jwks }>();

export async function cachedJwks(url: string, refresh = false): Promise<Jwks> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < (refresh ? REFRESH_MS : CACHE_MS)) return hit.jwks;
  const response = await fetch(url);
  if (!response.ok) throw new Error('jwks unavailable');
  const jwks = (await response.json()) as Jwks;
  if (!Array.isArray(jwks?.keys)) throw new Error('jwks malformed');
  cache.set(url, { at: Date.now(), jwks });
  return jwks;
}

async function loadJwks(fetchJwks: (refresh?: boolean) => Promise<Jwks>, refresh: boolean): Promise<Jwks> {
  try {
    return await fetchJwks(refresh);
  } catch {
    throw new JwksUnavailable();
  }
}

function findKey(jwks: Jwks, kid: string): JsonWebKey | undefined {
  return jwks.keys.find((k) => (k as { kid?: string }).kid === kid);
}

function unb64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function decode(part: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(unb64url(part))) as Record<string, unknown>;
}

// An RS256 OpenID Connect ID token, as Google and Apple both issue them. Returns the subject,
// null for a bad token, and throws JwksUnavailable when the keys cannot be fetched.
export async function verifyIdToken(
  token: string,
  issuers: string[],
  fetchJwks: (refresh?: boolean) => Promise<Jwks>,
  options: VerifyOptions,
): Promise<string | null> {
  const now = options.now ?? Date.now();
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head, body, signature] = parts as [string, string, string];
  let kid: string;
  let sub: string;
  try {
    const header = decode(head);
    const claims = decode(body);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
    if (typeof claims.iss !== 'string' || !issuers.includes(claims.iss)) return null;
    if (typeof claims.aud !== 'string' || !options.audiences.includes(claims.aud)) return null;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return null;
    if (typeof claims.sub !== 'string' || !claims.sub) return null;
    kid = header.kid;
    sub = claims.sub;
  } catch {
    return null;
  }

  const load = options.fetchJwks ?? fetchJwks;
  const jwk = findKey(await loadJwks(load, false), kid) ?? findKey(await loadJwks(load, true), kid);
  if (!jwk) return null;
  try {
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [
      'verify',
    ]);
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      unb64url(signature),
      new TextEncoder().encode(`${head}.${body}`),
    );
    return ok ? sub : null;
  } catch {
    return null;
  }
}
