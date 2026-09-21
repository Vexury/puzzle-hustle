import { useSyncExternalStore } from 'react';
import { apiFetch, readSession, subscribeSession, writeSession, type Session } from './api.ts';
import { readSetting, writeSetting } from './storage.ts';
import { toast } from '../components/Toast.tsx';

// Exported so a caller (the Profile tab's Friends card) can tell "sign-in is not configured
// on this build" apart from "sign-in is configured but failed to load", instead of attempting
// a sign-in that is guaranteed to throw.
export const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '';
const GSI_SRC = 'https://accounts.google.com/gsi/client';

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

export async function renderSignInButton(target: HTMLElement, onDone: (session: Session) => void): Promise<void> {
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
          const session = await apiFetch<Session>('/session', {
            method: 'POST',
            body: JSON.stringify({
              provider: 'google',
              idToken: response.credential,
              name: readSetting('ph:name') ?? undefined,
            }),
          });
          writeSession(session);
          // Sign-in rejects an invalid offered name server-side and replaces it with a
          // generated one without saying so. Keep the local name in step with whatever the
          // server actually settled on, so Profile's field and the Friends card never
          // disagree. Only toast about it when a local name existed to be overridden — a
          // first-ever sign-in has none, so the server's generated name is not a change from
          // anything the player had, and announcing one would read as an error on the one
          // screen meant to make signing in feel harmless.
          const offered = readSetting('ph:name');
          if (session.player.name !== offered) {
            writeSetting('ph:name', session.player.name);
            if (offered) toast(`Signed in as ${session.player.name}.`);
          }
          onDone(session);
        } catch {
          toast('Sign-in failed. Try again.');
        }
      })();
    },
  });
  gsi.accounts.id.renderButton(target, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with' });
}

export function signOut() {
  try {
    const gsi = (window as unknown as { google?: Gsi }).google;
    gsi?.accounts.id.disableAutoSelect();
  } catch {
    // Google's auto-select hint is a convenience. If the browser refuses it, that is no
    // reason to keep the player signed in locally.
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
