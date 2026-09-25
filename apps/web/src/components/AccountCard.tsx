import { useEffect, useRef, useState } from 'react';
import { ApiError, readSession } from '../lib/api.ts';
import {
  NATIVE_APPLE,
  NATIVE_GOOGLE,
  SIGN_IN_AVAILABLE,
  appleWebSignIn,
  deleteAccount,
  googleWebSignIn,
  isAppleSession,
  lastProvider,
  nativeSignIn,
  prepareAppleWeb,
  setName as setAccountName,
  signOut,
  useSession,
} from '../lib/auth.ts';
import { href, onLinkClick } from '../lib/router.ts';
import { readSetting, writeSetting } from '../lib/storage.ts';
import { toast } from './Toast.tsx';

export const PRIVACY_POLICY_URL = 'https://vexury.dev/puzzle-hustle-privacy/';

// How long the delete button stays armed before it falls back to asking again.
const DELETE_CONFIRM_MS = 4000;

// Once signed in, the server's name is the source of truth. A rejected rename must not leave
// the field showing a name the server never accepted.
const NAME_REJECTION_MESSAGES: Record<string, string> = {
  name_length: 'Names are 2 to 24 characters',
  name_characters: 'Letters, digits, spaces, dots, dashes and underscores only',
  name_blocked: 'Pick a different name',
};

export function AccountCard({ joinCode = null }: { joinCode?: string | null } = {}) {
  const session = useSession();
  const [name, setName] = useState(readSetting('ph:name') ?? '');
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Follow the signed-in player's name, which sign-in may have replaced, and fall back to the
  // local name on sign-out, which signOut() has already cleared. Reading `editing` via
  // a ref (rather than a dependency) means finishing an edit doesn't re-run this against a
  // session that hasn't caught up yet and clobber what the player just typed.
  const editingRef = useRef(editing);
  editingRef.current = editing;
  useEffect(() => {
    if (editingRef.current) return;
    setName(session ? session.player.name : readSetting('ph:name') ?? '');
  }, [session?.player.name, session === null]);

  // Mirrors ResetButton.tsx's arm/revert pattern: the timer lives in an effect keyed on the
  // armed state so it is cleared on unmount or re-arm instead of firing into a stale closure.
  useEffect(() => {
    if (!confirmDelete) return;
    const timer = setTimeout(() => setConfirmDelete(false), DELETE_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirmDelete]);

  const commitName = () => {
    const v = name.trim().slice(0, 24);
    setName(v);
    writeSetting('ph:name', v);
    if (readSession()) {
      void setAccountName(v).catch((err: unknown) => {
        const code = err instanceof ApiError ? err.code : undefined;
        toast(code && code in NAME_REJECTION_MESSAGES ? NAME_REJECTION_MESSAGES[code]! : 'Could not save your name');
        if (code && code in NAME_REJECTION_MESSAGES) {
          const serverName = readSession()?.player.name ?? '';
          setName(serverName);
          writeSetting('ph:name', serverName);
        }
      });
    }
    setEditing(false);
  };

  return (
    <div className="card-lg">
      <span className="label">Display name</span>
      {editing ? (
        <form
          className="name-form"
          onSubmit={(e) => {
            e.preventDefault();
            commitName();
          }}
        >
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} maxLength={24} placeholder="Your name" />
        </form>
      ) : (
        <button type="button" className="name-btn" onClick={() => setEditing(true)}>
          {name || 'Add a name'}
          {' '}
          <span className="muted">✎</span>
        </button>
      )}
      <span className="muted small">
        {session
          ? 'Signed in. Your name shows in your groups.'
          : SIGN_IN_AVAILABLE
            ? 'Sign in to compare your daily times with friends. Everything else works without an account.'
            : "Sign-in isn't set up on this build yet. Everything else works without an account."}{' '}
        <a href={PRIVACY_POLICY_URL} target="_blank" rel="noreferrer">
          Privacy policy
        </a>
      </span>
      {!session && SIGN_IN_AVAILABLE && <SignInButton joinCode={joinCode} />}
      <div className="friends-actions">
        <a href={href('/shop')} className="pill outline" onClick={onLinkClick}>
          Customize
        </a>
        {session && (
          <>
            <button type="button" className="pill outline" onClick={signOut}>
              Sign out
            </button>
            <button
              type="button"
              className={confirmDelete ? 'pill danger' : 'pill outline'}
              onClick={() => {
                if (!confirmDelete) {
                  // Apple's popup must open right on the confirming click, with its script ready.
                  if (isAppleSession() && !NATIVE_APPLE) void prepareAppleWeb().catch(() => undefined);
                  setConfirmDelete(true);
                  return;
                }
                setConfirmDelete(false);
                void deleteAccount();
              }}
            >
              {confirmDelete ? 'Sure?' : 'Delete account'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const APPLE_LOGO = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
  </svg>
);

// Google's four-colour G, which its branding rules require unchanged on a custom button.
const GOOGLE_LOGO = (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

function SignInButton({ joinCode }: { joinCode: string | null }) {
  // At rest the card carries a plain "Sign in", and only asking loads Apple's script, so a player
  // who never signs in never talks to Apple or Google. The apps skip the step: their sheets
  // are native and load nothing.
  const [asked, setAsked] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [appleReady, setAppleReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const prepareApple = () => {
    setFailed(false);
    prepareAppleWeb().then(
      () => setAppleReady(true),
      () => setFailed(true),
    );
  };

  useEffect(() => {
    if (asked) prepareApple();
  }, [asked]);

  const signIn = (run: () => Promise<boolean>) => () => {
    setSigningIn(true);
    void run().finally(() => setSigningIn(false));
  };

  if (NATIVE_APPLE || NATIVE_GOOGLE) {
    return (
      // In the same wrapper the signed-in actions use: the card is a flex column, so a
      // bare button stretches the full width and reads as a bar rather than a button.
      <div className="friends-actions">
        {NATIVE_APPLE ? (
          <button type="button" className="pill apple-signin" disabled={signingIn} onClick={signIn(nativeSignIn)}>
            {APPLE_LOGO}
            Sign in with Apple
          </button>
        ) : (
          <button type="button" className="pill" disabled={signingIn} onClick={signIn(nativeSignIn)}>
            Sign in with Google
          </button>
        )}
      </div>
    );
  }

  if (!asked) {
    return (
      <div className="friends-actions">
        <button type="button" className="pill" onClick={() => setAsked(true)}>
          Sign in
        </button>
      </div>
    );
  }

  // Google leaves the page and comes back to wherever this returns to. A pending invitation
  // only lives in App's state, so its link is the way back into the group.
  const returnTo = joinCode ? href(`/join?c=${joinCode}`) : location.pathname + location.search;
  const google = (
    <button key="google" type="button" className="pill google-signin" disabled={signingIn} onClick={() => googleWebSignIn(returnTo)}>
      {GOOGLE_LOGO}
      Sign in with Google
    </button>
  );
  const apple = (
    <button key="apple" type="button" className="pill apple-signin" disabled={!appleReady || signingIn} onClick={signIn(appleWebSignIn)}>
      {APPLE_LOGO}
      Sign in with Apple
    </button>
  );
  // The provider is the identity, so picking the other one makes a second, empty player. The
  // one used last on this device comes first (decision 2026-09-22).
  return (
    <>
      <div className="signin-options">{lastProvider() === 'apple' ? [apple, google] : [google, apple]}</div>
      {failed && (
        <button type="button" className="linklike muted small" onClick={prepareApple}>
          Sign in with Apple is unavailable right now. Try again.
        </button>
      )}
    </>
  );
}
