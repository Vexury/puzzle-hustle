import { useState } from 'react';
import { AccountActions, PRIVACY_POLICY_URL, SignInButton } from '../components/AccountCard.tsx';
import { useSession } from '../lib/auth.ts';
import { href, onLinkClick } from '../lib/router.ts';

// The account deletion URL in the Play listing: it must name the app, give the steps and say
// what is deleted and what is kept, and it has to work without installing the app.
export function DeleteAccount() {
  const session = useSession();
  const [deleted, setDeleted] = useState(false);

  return (
    <>
      <header className="page-head">
        <h1>Delete your account</h1>
        <span className="muted">Puzzle Hustle by Vexury</span>
      </header>

      <div className="stack">
        {deleted ? (
          <div className="card-lg">
            <b>Your account is deleted</b>
            <span className="muted small">Everything listed below is gone from our server.</span>
          </div>
        ) : session ? (
          <>
            <div className="card-lg">
              <b>Signed in as {session.player.name}</b>
              <span className="muted small">Tap Delete account below, then tap again to confirm. This cannot be undone.</span>
            </div>
            <AccountActions onDeleted={() => setDeleted(true)} />
          </>
        ) : (
          <div className="card-lg">
            <b>Sign in with the account you want to delete</b>
            <span className="muted small">
              Use the same provider you use in the app: Google on Android, Apple on iPhone. You come back to this page and can delete the account
              here, without installing anything.
            </span>
            <SignInButton joinCode={null} />
          </div>
        )}

        <div className="card-lg">
          <h2>What is deleted</h2>
          <ul className="plain-list small">
            <li>your account and display name, badge and flair</li>
            <li>all your submitted times</li>
            <li>every report you made or that was made about you</li>
            <li>your group memberships; a group you created passes to its longest-standing member, or is deleted if you were the last one</li>
          </ul>
          <span className="muted small">Deletion happens right away. We keep no copy.</span>
        </div>

        <div className="card-lg">
          <h2>What stays on your device</h2>
          <span className="muted small">
            Your progress, coins, achievements and settings never leave the device, so deleting the account does not touch them. Uninstalling the
            app removes them; Reset progress in the Profile screen erases your solves and streaks.
          </span>
        </div>

        <div className="card-lg">
          <h2>Can't sign in?</h2>
          <span className="muted small">
            Write to <a href="mailto:vexury.dev@gmail.com">vexury.dev@gmail.com</a> with your display name and the name of a group you are in,
            and we will delete the account for you.
          </span>
        </div>

        <span className="muted small">
          <a href={PRIVACY_POLICY_URL}>Privacy policy</a> ·{' '}
          <a href={href('/')} onClick={onLinkClick}>
            Open Puzzle Hustle
          </a>
        </span>
      </div>
    </>
  );
}
