import { useEffect, useRef, useState } from 'react';
import { ApiError, readSession } from '../lib/api.ts';
import {
  NATIVE_APPLE,
  NATIVE_GOOGLE,
  SIGN_IN_AVAILABLE,
  deleteAccount,
  nativeSignIn,
  renderSignInButton,
  setName as setAccountName,
  signOut,
  useSession,
} from '../lib/auth.ts';
import { href, onLinkClick } from '../lib/router.ts';
import { readSetting, writeSetting } from '../lib/storage.ts';
import { useTheme } from '../lib/theme.ts';
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

export function AccountCard() {
  const session = useSession();
  const [name, setName] = useState(readSetting('ph:name') ?? '');
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Follow the signed-in player's name, which sign-in may have replaced. Reading `editing` via
  // a ref (rather than a dependency) means finishing an edit doesn't re-run this against a
  // session that hasn't caught up yet and clobber what the player just typed.
  const editingRef = useRef(editing);
  editingRef.current = editing;
  useEffect(() => {
    if (session && !editingRef.current) setName(session.player.name);
  }, [session?.player.name]);

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
      {!session && SIGN_IN_AVAILABLE && <SignInButton />}
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

function SignInButton() {
  const session = useSession();
  const { theme } = useTheme();
  const buttonHost = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  // Google's button is an iframe from accounts.google.com, and for an account that already
  // consented it serves a white personalised variant regardless of the theme and shape asked
  // for in the iframe's own URL. Nothing on our side can colour it. So it is not shown until
  // the player asks for it: at rest the card carries an ordinary app button, and Google's
  // control appears when it is the thing being looked at rather than a bright slab sitting in
  // a dark card. Ours says only "Sign in" — the Google wording and mark belong on Google's.
  const [asked, setAsked] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  const attemptSignIn = () => {
    if (!buttonHost.current) return;
    setFailed(false);
    renderSignInButton(buttonHost.current, () => setFailed(false), theme).catch(() => setFailed(true));
  };

  useEffect(() => {
    // Keyed on the theme as well: Google draws the button itself, so the only way it follows
    // a theme switch is to draw it again. The apps have no widget to draw, their sheets are native.
    if (asked && !session && !NATIVE_GOOGLE && !NATIVE_APPLE) attemptSignIn();
  }, [session, theme, asked]);

  return (
    <>
      {!asked && (
        // In the same wrapper the signed-in actions use: the card is a flex column, so a
        // bare button stretches the full width and reads as a bar rather than a button.
        <div className="friends-actions">
          {NATIVE_GOOGLE || NATIVE_APPLE ? (
            <button
              type="button"
              className={NATIVE_APPLE ? 'pill apple-signin' : 'pill'}
              disabled={signingIn}
              onClick={() => {
                setSigningIn(true);
                void nativeSignIn().finally(() => setSigningIn(false));
              }}
            >
              {NATIVE_APPLE ? (
                <>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
                  </svg>
                  Sign in with Apple
                </>
              ) : (
                'Sign in with Google'
              )}
            </button>
          ) : (
            <button type="button" className="pill" onClick={() => setAsked(true)}>
              Sign in
            </button>
          )}
        </div>
      )}
      {asked && <div className="gsi-host" ref={buttonHost} />}
      {failed && (
        <button type="button" className="linklike muted small" onClick={attemptSignIn}>
          Sign-in is unavailable right now. Try again.
        </button>
      )}
    </>
  );
}
