import { useSyncExternalStore } from 'react';
import { apiFetch, readSession, writeSession, type Session } from './api.ts';
import { readSetting } from './storage.ts';
import { toast } from '../components/Toast.tsx';

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '';
const GSI_SRC = 'https://accounts.google.com/gsi/client';

const listeners = new Set<() => void>();
let current: Session | null = readSession();

function emit() {
  current = readSession();
  for (const l of listeners) l();
}

export function useSession(): Session | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
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
    script.onerror = () => reject(new Error('gsi unavailable'));
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
          emit();
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
  const gsi = (window as unknown as { google?: Gsi }).google;
  gsi?.accounts.id.disableAutoSelect();
  writeSession(null);
  emit();
}

export async function setName(name: string): Promise<void> {
  const result = await apiFetch<{ name: string }>('/name', { method: 'POST', body: JSON.stringify({ name }), auth: true });
  const session = readSession();
  if (session) writeSession({ ...session, player: { ...session.player, name: result.name } });
  emit();
}

export async function deleteAccount(): Promise<void> {
  await apiFetch('/account', { method: 'DELETE', auth: true });
  signOut();
}
