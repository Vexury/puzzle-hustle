import { cachedJwks, verifyIdToken, type VerifyOptions } from './idtoken.ts';

export type { Jwks, VerifyOptions } from './idtoken.ts';

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

export function verifyGoogleIdToken(token: string, options: VerifyOptions): Promise<string | null> {
  return verifyIdToken(token, ISSUERS, (refresh) => cachedJwks(CERTS_URL, refresh), options);
}
