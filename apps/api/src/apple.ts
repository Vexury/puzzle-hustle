import { cachedJwks, verifyIdToken, type VerifyOptions } from './idtoken.ts';

const KEYS_URL = 'https://appleid.apple.com/auth/keys';
const ISSUERS = ['https://appleid.apple.com'];

// The audience is the bundle ID for tokens from the iOS app, a Services ID for the web flow.
export function verifyAppleIdToken(token: string, options: VerifyOptions): Promise<string | null> {
  return verifyIdToken(token, ISSUERS, () => cachedJwks(KEYS_URL), options);
}
