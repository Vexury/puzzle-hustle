import { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { apiFetch, readSession, subscribeSession, writeSession, type Session } from './api.ts';
import { pushCosmetics } from './coins.ts';
import { flush, resetBackoff } from './queue.ts';
import { readSetting, writeSetting } from './storage.ts';
import { toast } from '../components/Toast.tsx';

// The Web client's ID, public by design, so native builds made without the CI variable still
// carry it. Android's Credential Manager wants this one too: the Android OAuth clients only
// vouch for package name and signing key in the Cloud Console and never appear in code.
export const CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ||
  '455101583494-lfg3kbscmqgubeqrsocg0919269n2a23.apps.googleusercontent.com';
const GSI_SRC = 'https://accounts.google.com/gsi/client';

// Android signs in natively with Google, the web through Google's widget. iOS will offer Apple
// alone (decision 2026-09-22) and has no sign-in until that exists.
export const NATIVE_GOOGLE = Capacitor.getPlatform() === 'android';
export const SIGN_IN_AVAILABLE = NATIVE_GOOGLE || !Capacitor.isNativePlatform();

async function startSession(idToken: string): Promise<Session> {
  const session = await apiFetch<Session>('/session', {
    method: 'POST',
    body: JSON.stringify({ provider: 'google', idToken, name: readSetting('ph:name') ?? undefined }),
  });
  writeSession(session);
  // Solves made while signed out wait in the queue. Nothing else fires when the sign-in sheet
  // closes, it covers the app without hiding it, so send them now instead of on the next resume.
  resetBackoff();
  void flush();
  void pushCosmetics();
  // Sign-in rejects an invalid offered name server-side and replaces it with a generated one
  // without saying so. Keep the local name in step with whatever the server settled on, so
  // the Profile name field never disagrees with the server. Only toast about it when a local name
  // existed to be overridden: a first-ever sign-in has none, and announcing the generated name
  // would read as an error on the one screen meant to make signing in feel harmless.
  const offered = readSetting('ph:name');
  if (session.player.name !== offered) {
    writeSetting('ph:name', session.player.name);
    if (offered) toast(`Signed in as ${session.player.name}.`);
  }
  return session;
}

let nativeReady: Promise<void> | null = null;

function initNative(): Promise<void> {
  nativeReady ??= SocialLogin.initialize({ google: { webClientId: CLIENT_ID } }).catch((err: unknown) => {
    nativeReady = null;
    throw err;
  });
  return nativeReady;
}

// Resolves false when the player dismissed Google's sheet, which is a choice, not a failure.
export async function nativeSignIn(): Promise<boolean> {
  try {
    await initNative();
    // No scopes: the ID token is all the server needs, and asking for any on Android would
    // route through the AuthorizationClient, which the plugin only allows with a patched activity.
    const login = await SocialLogin.login({ provider: 'google', options: {} });
    const idToken = login.result.responseType === 'online' ? login.result.idToken : null;
    if (!idToken) throw new Error('no id token');
    await startSession(idToken);
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === 'USER_CANCELLED') return false;
    toast('Sign-in failed. Try again.');
    return false;
  }
}

let current: Session | null = readSession();
// Registered once at module load, so this always runs before any component's own listener
// added later and `current` is never stale by the time React reads it.
subscribeSession(() => {
  current = readSession();
});

export function useSession(): Session | null {
  return useSyncExternalStore(subscribeSession, () => current);
}

let loading: Promise<void> | null = null;

// Google's widget is a script tag, not a package. It is loaded on demand so that a player
// who never signs in never talks to Google at all.
function loadGsi(): Promise<void> {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Let a later call try again instead of being stuck with this rejected promise forever.
      loading = null;
      reject(new Error('gsi unavailable'));
    };
    document.head.append(script);
  });
  return loading;
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
  await loadGsi();
  const gsi = (window as unknown as { google?: Gsi }).google;
  if (!gsi) throw new Error('gsi unavailable');

  gsi.accounts.id.initialize({
    client_id: CLIENT_ID,
    // Google invokes this callback itself, outside any promise chain we control, so a rejection
    // in here would otherwise vanish as an unhandled rejection. Catch it and surface it via toast.
    callback: (response) => {
      void (async () => {
        try {
          onDone(await startSession(response.credential));
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

export function signOut() {
  try {
    const gsi = (window as unknown as { google?: Gsi }).google;
    gsi?.accounts.id.disableAutoSelect();
  } catch {
    // Google's auto-select hint is a convenience. If the browser refuses it, that is no
    // reason to keep the player signed in locally.
  }
  // The Android counterpart: clears Credential Manager's remembered choice so the next sign-in
  // asks for an account again instead of silently picking the last one.
  if (NATIVE_GOOGLE) {
    void initNative()
      .then(() => SocialLogin.logout({ provider: 'google' }))
      .catch(() => undefined);
  }
  writeSession(null);
}

export async function setName(name: string): Promise<void> {
  const result = await apiFetch<{ name: string }>('/name', { method: 'POST', body: JSON.stringify({ name }), auth: true });
  const session = readSession();
  if (session) writeSession({ ...session, player: { ...session.player, name: result.name } });
}

export async function deleteAccount(): Promise<void> {
  // A failed delete must not sign the player out: the account is still fully present on the
  // server, and keeping the session is what lets them retry rather than silently doing nothing.
  try {
    await apiFetch('/account', { method: 'DELETE', auth: true });
  } catch {
    toast('Could not delete your account. Try again.');
    return;
  }
  signOut();
}
