import { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { SESSION_KEY, apiFetch, readSession, subscribeSession, writeSession, type Session } from './api.ts';
import { pushCosmetics } from './coins.ts';
import { flush, resetBackoff } from './queue.ts';
import { readSetting, removeSetting, writeSetting } from './storage.ts';
import { toast } from '../components/Toast.tsx';

// The Web client's ID, public by design, so native builds made without the CI variable still
// carry it. Android's Credential Manager wants this one too: the Android OAuth clients only
// vouch for package name and signing key in the Cloud Console and never appear in code.
export const CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ||
  '455101583494-lfg3kbscmqgubeqrsocg0919269n2a23.apps.googleusercontent.com';
const GSI_SRC = 'https://accounts.google.com/gsi/client';
// The web's Services ID, grouped under the app's App ID, so an Apple ID is the same player in
// both. Apple only returns to registered URLs, which rules out localhost.
export const APPLE_WEB_CLIENT_ID = 'dev.vexury.puzzlehustle.web';
const APPLE_JS_SRC = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

// Android signs in natively with Google, the web through Google's widget, iOS with Apple
// alone (decision 2026-09-22).
export const NATIVE_GOOGLE = Capacitor.getPlatform() === 'android';
export const NATIVE_APPLE = Capacitor.getPlatform() === 'ios';
export const SIGN_IN_AVAILABLE = NATIVE_GOOGLE || NATIVE_APPLE || !Capacitor.isNativePlatform();
const NATIVE_PROVIDER = NATIVE_APPLE ? 'apple' : 'google';
const NAME_KEY = 'ph:name';
// Set on every sign-in and kept on sign-out: the web shows this provider's button first, and
// account deletion needs to know whether the running session is an Apple one.
const PROVIDER_KEY = 'ph:provider';
const PREVIOUS_PLAYER_KEY = 'ph:previousPlayer';

async function startSession(provider: 'google' | 'apple', idToken: string): Promise<Session> {
  const session = await apiFetch<Session>('/session', {
    method: 'POST',
    body: JSON.stringify({ provider, idToken, name: readSetting(NAME_KEY) ?? undefined }),
  });
  writeSession(session);
  writeSetting(PROVIDER_KEY, provider);
  // Solves made while signed out wait in the queue. Nothing else fires when the sign-in sheet
  // closes, it covers the app without hiding it, so send them now instead of on the next resume.
  resetBackoff();
  void flush();
  // The cosmetics equipped here belong to whoever signed out last. Only hand them to the same
  // player, or to anyone when nobody was signed in on this device before.
  const previous = readSetting(PREVIOUS_PLAYER_KEY);
  removeSetting(PREVIOUS_PLAYER_KEY);
  if (previous === null || previous === session.player.id) void pushCosmetics();
  // Sign-in rejects an invalid offered name server-side and replaces it with a generated one
  // without saying so. Keep the local name in step with whatever the server settled on, so
  // the Profile name field never disagrees with the server. Only toast about it when a local name
  // existed to be overridden: a first-ever sign-in has none, and announcing the generated name
  // would read as an error on the one screen meant to make signing in feel harmless.
  const offered = readSetting(NAME_KEY);
  if (session.player.name !== offered) {
    writeSetting(NAME_KEY, session.player.name);
    if (offered) toast(`Signed in as ${session.player.name}.`);
  }
  return session;
}

let nativeReady: Promise<void> | null = null;

function initNative(): Promise<void> {
  // useProperTokenExchange makes the plugin hand out Apple's authorization code under its own
  // name, which account deletion passes to the server for revoking.
  const options = NATIVE_APPLE ? { apple: { useProperTokenExchange: true } } : { google: { webClientId: CLIENT_ID } };
  nativeReady ??= SocialLogin.initialize(options).catch((err: unknown) => {
    nativeReady = null;
    throw err;
  });
  return nativeReady;
}

// Resolves false when the player dismissed the system sheet, which is a choice, not a failure.
export async function nativeSignIn(): Promise<boolean> {
  try {
    await initNative();
    // No scopes: the ID token is all the server needs. On Android asking for any would route
    // through the AuthorizationClient, which the plugin only allows with a patched activity; on
    // iOS an empty list keeps Apple's sheet from asking for name and e-mail we never store.
    let idToken: string | null;
    if (NATIVE_APPLE) {
      const login = await SocialLogin.login({ provider: 'apple', options: { scopes: [] } });
      idToken = login.result.idToken;
    } else {
      const login = await SocialLogin.login({ provider: 'google', options: {} });
      idToken = login.result.responseType === 'online' ? login.result.idToken : null;
    }
    if (!idToken) throw new Error('no id token');
    await startSession(NATIVE_PROVIDER, idToken);
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === 'USER_CANCELLED') return false;
    toast('Sign-in failed. Try again.');
    return false;
  }
}

// Read lazily and keyed on the stored string: main.tsx restores the native backup after this
// module has loaded, and a cache filled at load time would miss the restored session.
let raw: string | null | undefined;
let current: Session | null = null;

export function sessionSnapshot(): Session | null {
  const next = readSetting(SESSION_KEY);
  if (next !== raw) {
    raw = next;
    current = readSession();
  }
  return current;
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribeSession, sessionSnapshot);
}

const loading = new Map<string, Promise<void>>();

// Google's widget and Apple's popup are script tags, not packages. They are loaded on demand
// so that a player who never signs in never talks to either.
function loadScript(src: string): Promise<void> {
  const pending = loading.get(src);
  if (pending) return pending;
  const next = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Let a later call try again instead of being stuck with this rejected promise forever.
      loading.delete(src);
      script.remove();
      reject(new Error(`${src} unavailable`));
    };
    document.head.append(script);
  });
  loading.set(src, next);
  return next;
}

interface GsiCredential {
  credential: string;
}

interface Gsi {
  accounts: {
    id: {
      initialize(options: { client_id: string; callback: (r: GsiCredential) => void }): void;
      renderButton(target: HTMLElement, options: Record<string, string>): void;
      disableAutoSelect(): void;
    };
  };
}

export async function renderSignInButton(
  target: HTMLElement,
  onDone: (session: Session) => void,
  theme: 'light' | 'dark' = 'light',
): Promise<void> {
  if (!CLIENT_ID) throw new Error('no client id');
  await loadScript(GSI_SRC);
  const gsi = (window as unknown as { google?: Gsi }).google;
  if (!gsi) throw new Error('gsi unavailable');

  gsi.accounts.id.initialize({
    client_id: CLIENT_ID,
    // Google invokes this callback itself, outside any promise chain we control, so a rejection
    // in here would otherwise vanish as an unhandled rejection. Catch it and surface it via toast.
    callback: (response) => {
      void (async () => {
        try {
          onDone(await startSession('google', response.credential));
        } catch {
          toast('Sign-in failed. Try again.');
        }
      })();
    },
  });
  // Google renders this button itself and its branding rules leave only these knobs, so the
  // way to make it belong here is to pick the variant that matches the surface it sits on:
  // the dark fill under the dark theme, the outline under the light one, and the pill shape
  // the rest of the app's buttons use. Width is measured rather than guessed so the button
  // spans its card instead of floating at whatever size the account name happens to need.
  // Re-rendering clears the host first: renderButton appends, it does not replace.
  // If this button is on screen at all, the player is signed out of Puzzle Hustle. Telling
  // Google so is simply true, and it stops it replacing the button a moment later with the
  // personalised variant for whichever account it remembers — a variant that ignores the
  // theme and shape asked for below, which is why a dark card briefly showed a white slab.
  // On a shared device the plain button is also the safer one: it opens an account chooser
  // instead of signing in as whoever Google saw last, which is the same mistake the score
  // queue had to be taught not to make.
  gsi.accounts.id.disableAutoSelect();

  const box = getComputedStyle(target);
  const width = Math.round(target.clientWidth - parseFloat(box.paddingLeft) - parseFloat(box.paddingRight));
  target.replaceChildren();
  gsi.accounts.id.renderButton(target, {
    type: 'standard',
    theme: theme === 'dark' ? 'filled_black' : 'outline',
    size: 'large',
    shape: 'pill',
    text: 'signin_with',
    logo_alignment: 'left',
    width: String(Math.max(200, Math.min(400, width || 280))),
  });
}

export function lastProvider(): 'google' | 'apple' | null {
  const value = readSetting(PROVIDER_KEY);
  return value === 'google' || value === 'apple' ? value : null;
}

interface AppleAuth {
  auth: {
    init(options: { clientId: string; redirectURI: string; usePopup: boolean }): void;
    signIn(): Promise<{ authorization: { code: string; id_token: string } }>;
  };
}

let appleReady: Promise<AppleAuth> | null = null;

// Apple opens its popup from signIn(), and browsers only allow that close to a click. Call this
// ahead of time, when the button appears, so the click itself has nothing left to wait for.
export function prepareAppleWeb(): Promise<AppleAuth> {
  appleReady ??= loadScript(APPLE_JS_SRC)
    .then(() => {
      const apple = (window as unknown as { AppleID?: AppleAuth }).AppleID;
      if (!apple) throw new Error('apple js unavailable');
      // No scope, as on iOS: name and e-mail are never stored, so Apple need not ask for them.
      apple.auth.init({ clientId: APPLE_WEB_CLIENT_ID, redirectURI: `${location.origin}/`, usePopup: true });
      return apple;
    })
    .catch((err: unknown) => {
      appleReady = null;
      throw err;
    });
  return appleReady;
}

// Null when the player closed the popup, which is a choice, not a failure.
async function appleWebAuthorization(): Promise<{ code: string; id_token: string } | null> {
  const apple = await prepareAppleWeb();
  try {
    return (await apple.auth.signIn()).authorization;
  } catch (err) {
    const code = (err as { error?: string }).error;
    if (code === 'popup_closed_by_user' || code === 'user_cancelled_authorize') return null;
    throw err;
  }
}

export async function appleWebSignIn(): Promise<boolean> {
  try {
    const authorization = await appleWebAuthorization();
    if (!authorization) return false;
    await startSession('apple', authorization.id_token);
    return true;
  } catch {
    toast('Sign-in failed. Try again.');
    return false;
  }
}

export function isAppleSession(): boolean {
  return NATIVE_APPLE || (!Capacitor.isNativePlatform() && lastProvider() === 'apple');
}

export function signOut() {
  try {
    const gsi = (window as unknown as { google?: Gsi }).google;
    gsi?.accounts.id.disableAutoSelect();
  } catch {
    // Google's auto-select hint is a convenience. If the browser refuses it, that is no
    // reason to keep the player signed in locally.
  }
  // The native counterpart: on Android it clears Credential Manager's remembered choice so the
  // next sign-in asks for an account again, on iOS it drops the plugin's stored Apple tokens.
  if (NATIVE_GOOGLE || NATIVE_APPLE) {
    void initNative()
      .then(() => SocialLogin.logout({ provider: NATIVE_PROVIDER }))
      .catch(() => undefined);
  }
  // On a shared device the next sign-in may be somebody else, whose new account would otherwise
  // be created under this player's name. The same player gets theirs back from the server.
  const player = readSession()?.player.id;
  if (player) writeSetting(PREVIOUS_PLAYER_KEY, player);
  removeSetting(NAME_KEY);
  writeSession(null);
}

export async function setName(name: string): Promise<void> {
  const result = await apiFetch<{ name: string }>('/name', { method: 'POST', body: JSON.stringify({ name }), auth: true });
  const session = readSession();
  if (session) writeSession({ ...session, player: { ...session.player, name: result.name } });
}

// Apple asks apps to revoke the player's Apple tokens on deletion. The server keeps none, so it
// needs a fresh authorization code, and only Apple's sheet can issue one. Null means the player
// closed the sheet, which cancels the deletion.
async function appleCodeForDeletion(): Promise<string | null> {
  try {
    if (!NATIVE_APPLE) return (await appleWebAuthorization())?.code ?? null;
    await initNative();
    const login = await SocialLogin.login({ provider: 'apple', options: { scopes: [] } });
    return login.result.authorizationCode ?? null;
  } catch {
    return null;
  }
}

export async function deleteAccount(): Promise<void> {
  let apple: { appleCode: string; appleClientId?: string } | null = null;
  if (isAppleSession()) {
    const code = await appleCodeForDeletion();
    if (!code) return;
    apple = NATIVE_APPLE ? { appleCode: code } : { appleCode: code, appleClientId: APPLE_WEB_CLIENT_ID };
  }
  // A failed delete must not sign the player out: the account is still fully present on the
  // server, and keeping the session is what lets them retry rather than silently doing nothing.
  try {
    await apiFetch('/account', { method: 'DELETE', auth: true, body: apple ? JSON.stringify(apple) : null });
  } catch {
    toast('Could not delete your account. Try again.');
    return;
  }
  signOut();
}
