import { useEffect, useRef, useState } from 'react';
import { PUZZLE_META, PUZZLE_TYPES } from '@puzzle-hustle/core';
import { Flame } from './Daily.tsx';
import { ACCENTS, ACCENT_NAMES, useAccent } from '../lib/accent.ts';
import { adsAvailable, onAdsConsent, privacyOptionsAvailable, showPrivacyOptions } from '../lib/ads.ts';
import { deleteAccount, renderSignInButton, setName as setAccountName, signOut, useSession } from '../lib/auth.ts';
import { ApiError, readSession } from '../lib/api.ts';
import { buyUnlimitedHints, hasUnlimitedHints, onEntitlement } from '../lib/entitlement.ts';
import { href, onLinkClick } from '../lib/router.ts';
import { readSetting, resetProgress, useSolves, writeSetting } from '../lib/storage.ts';
import { formatSeconds } from '../lib/share.ts';
import { dailyStreaks, totalSolved, typeStats } from '../lib/stats.ts';
import { THEME_PREFS, centerOf, useTheme, type ThemePref } from '../lib/theme.ts';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { toast } from '../components/Toast.tsx';

// Once signed in, the server's name is the source of truth. A rejected rename must not leave
// the local field and the Friends card silently showing two different names.
const NAME_REJECTION_MESSAGES: Record<string, string> = {
  name_length: 'Names are 2 to 24 characters',
  name_characters: 'Letters, digits, spaces, dots, dashes and underscores only',
  name_blocked: 'Pick a different name',
};

export function Profile() {
  const solves = useSolves();
  const streaks = dailyStreaks(solves);
  const stats = typeStats(solves);
  const { pref, setPref } = useTheme();
  const { accent, setAccent } = useAccent();
  const [name, setName] = useState(readSetting('ph:name') ?? '');
  const [editing, setEditing] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [unlimited, setUnlimited] = useState(hasUnlimitedHints);
  const [buying, setBuying] = useState(false);

  const [privacy, setPrivacy] = useState(privacyOptionsAvailable);

  useEffect(() => onEntitlement(() => setUnlimited(hasUnlimitedHints())), []);
  useEffect(() => onAdsConsent(() => setPrivacy(privacyOptionsAvailable())), []);

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
    <>
      <header className="page-head">
        <h1>Profile</h1>
        <ThemeToggle />
      </header>

      <div className="stack">
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
              {name || 'Add a name'} <span className="muted">✎</span>
            </button>
          )}
        </div>

        <FriendsCard />

        <div className="card-lg streak-card">
          <span className="streak-badge">
            <Flame />
          </span>
          <span>
            <b>{streaks.perfect}-day perfect streak</b>
            <span className="muted small">
              All {PUZZLE_TYPES.length} dailies every day · best {streaks.bestPerfect}
            </span>
          </span>
        </div>

        <div className="stat-grid">
          <Stat value={streaks.current} label="day streak" flame />
          <Stat value={streaks.best} label="best streak" />
          <Stat value={streaks.daysPlayed} label="days played" />
          <Stat value={totalSolved(solves)} label="puzzles solved" />
        </div>

        <div className="card-lg">
          <b>Appearance</b>
          <span className="muted small">System follows your device setting.</span>
          <div className="segmented three" role="radiogroup" aria-label="Appearance">
            {THEME_PREFS.map((p: ThemePref) => (
              <button key={p} type="button" role="radio" aria-checked={pref === p} className={pref === p ? 'seg active' : 'seg'} onClick={(e) => setPref(p, centerOf(e.currentTarget))}>
                {p === 'system' ? 'System' : p === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
          <div className="swatches" role="radiogroup" aria-label="Accent color">
            {ACCENTS.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={accent === a}
                aria-label={ACCENT_NAMES[a]}
                title={ACCENT_NAMES[a]}
                data-accent={a}
                className="swatch"
                onClick={() => setAccent(a)}
              />
            ))}
          </div>
          <span className="muted small">{ACCENT_NAMES[accent]}</span>
        </div>

        <div className="card-lg">
          <h2>By puzzle</h2>
          <table className="stat-table">
            <tbody>
              {stats.map((s) => (
                <tr key={s.type}>
                  <td>{PUZZLE_META[s.type].name}</td>
                  <td className="num">{s.solved} solved</td>
                  <td className="num muted">{s.averageSeconds === null ? '–' : `avg ${formatSeconds(s.averageSeconds)}`}</td>
                  <td className="num muted">{s.bestSeconds === null ? '' : `best ${formatSeconds(s.bestSeconds)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {adsAvailable ? (
          <div className="card-lg row-between">
            <span>
              <b>Unlimited hints</b>
              <span className="muted small">
                {unlimited ? 'Bought. Every hint is yours, no ads.' : 'One hint per puzzle is free. Unlock the rest without ads.'}
              </span>
            </span>
            {unlimited ? (
              <span className="muted small">Unlocked</span>
            ) : (
              <button
                type="button"
                className="pill"
                disabled={buying}
                onClick={() => {
                  setBuying(true);
                  void buyUnlimitedHints().finally(() => setBuying(false));
                }}
              >
                {buying ? 'One moment' : 'Unlock'}
              </button>
            )}
          </div>
        ) : null}

        <div className="card-lg row-between">
          <span>
            <b>Reset progress</b>
            <span className="muted small">{confirmReset ? 'Deletes all solves and streaks on this device.' : 'Start over from zero.'}</span>
          </span>
          {confirmReset ? (
            <span className="reset-confirm">
              <button type="button" className="pill outline" onClick={() => setConfirmReset(false)}>
                Keep
              </button>
              <button
                type="button"
                className="pill danger"
                onClick={() => {
                  resetProgress();
                  setConfirmReset(false);
                }}
              >
                Delete
              </button>
            </span>
          ) : (
            <button type="button" className="pill outline" onClick={() => setConfirmReset(true)}>
              Reset
            </button>
          )}
        </div>

        <p className="muted small center">
          Progress is stored on this device. ·{' '}
          <a href="https://vexury.dev" target="_blank" rel="noreferrer">
            vexury.dev
          </a>
          {adsAvailable && privacy ? (
            <>
              {' · '}
              <button type="button" className="linklike" onClick={() => void showPrivacyOptions()}>
                Ad privacy settings
              </button>
            </>
          ) : null}
        </p>
      </div>
    </>
  );
}

const DELETE_CONFIRM_MS = 4000;

function FriendsCard() {
  const session = useSession();
  const buttonHost = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const attemptSignIn = () => {
    if (!buttonHost.current) return;
    setFailed(false);
    renderSignInButton(buttonHost.current, () => setFailed(false)).catch(() => setFailed(true));
  };

  useEffect(() => {
    if (!session) attemptSignIn();
  }, [session]);

  // Mirrors ResetButton.tsx's arm/revert pattern: the timer lives in an effect keyed on the
  // armed state so it is cleared on unmount or re-arm instead of firing into a stale closure.
  useEffect(() => {
    if (!confirmDelete) return;
    const timer = setTimeout(() => setConfirmDelete(false), DELETE_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirmDelete]);

  if (!session) {
    return (
      <div className="card-lg">
        <h2>Friends</h2>
        <span className="muted small">Sign in to compare your daily times with a group of friends. Everything else works without an account.</span>
        <div ref={buttonHost} />
        {failed && (
          <button type="button" className="linklike muted small" onClick={attemptSignIn}>
            Sign-in is unavailable right now. Try again.
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="card-lg">
      <h2>Friends</h2>
      <span className="muted small">Signed in as {session.player.name}.</span>
      <div className="friends-actions">
        <a href={href('/friends')} className="pill" onClick={onLinkClick}>
          Groups ›
        </a>
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
      </div>
    </div>
  );
}

function Stat({ value, label, flame }: { value: number; label: string; flame?: boolean }) {
  return (
    <div className="stat">
      <b>
        {flame && <Flame />}
        {value}
      </b>
      <span className="muted small">{label}</span>
    </div>
  );
}
