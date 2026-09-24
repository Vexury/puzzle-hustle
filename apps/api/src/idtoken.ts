const CACHE_MS = 3600_000;

export interface Jwks {
  keys: JsonWebKey[];
}

export interface VerifyOptions {
  audiences: string[];
  now?: number;
  fetchJwks?: () => Promise<Jwks>;
}

const cache = new Map<string, { at: number; jwks: Jwks }>();

export async function cachedJwks(url: string): Promise<Jwks> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.jwks;
  const response = await fetch(url);
  if (!response.ok) throw new Error('jwks unavailable');
  const jwks = (await response.json()) as Jwks;
  cache.set(url, { at: Date.now(), jwks });
  return jwks;
}

function unb64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function decode(part: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(unb64url(part))) as Record<string, unknown>;
}

// An RS256 OpenID Connect ID token, as Google and Apple both issue them. Returns the subject.
export async function verifyIdToken(
  token: string,
  issuers: string[],
  fetchJwks: () => Promise<Jwks>,
  options: VerifyOptions,
): Promise<string | null> {
  const now = options.now ?? Date.now();
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head, body, signature] = parts as [string, string, string];
  try {
    const header = decode(head);
    const claims = decode(body);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
    if (typeof claims.iss !== 'string' || !issuers.includes(claims.iss)) return null;
    if (typeof claims.aud !== 'string' || !options.audiences.includes(claims.aud)) return null;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return null;
    if (typeof claims.sub !== 'string' || !claims.sub) return null;

    const jwks = await (options.fetchJwks ?? fetchJwks)();
    const jwk = jwks.keys.find((k) => (k as { kid?: string }).kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [
      'verify',
    ]);
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      unb64url(signature),
      new TextEncoder().encode(`${head}.${body}`),
    );
    return ok ? claims.sub : null;
  } catch {
    return null;
  }
}
