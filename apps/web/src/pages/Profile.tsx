import { useEffect, useRef, useState } from 'react';
import { ACHIEVEMENTS, DAILY_TYPES, PUZZLE_META } from '@puzzle-hustle/core';
import { Flame } from './Daily.tsx';
import { ACCENTS, ACCENT_NAMES, useAccent } from '../lib/accent.ts';
import { adsAvailable, onAdsConsent, privacyOptionsAvailable, showPrivacyOptions } from '../lib/ads.ts';
import { setName as setAccountName, useSession } from '../lib/auth.ts';
import { ApiError, readSession } from '../lib/api.ts';
import { currentUnlocked } from '../lib/achievements.ts';
import { useBalance } from '../lib/coins.ts';
import { buyUnlimitedHints, hasUnlimitedHints, onEntitlement } from '../lib/entitlement.ts';
import { HAPTICS_KEY, hapticsAvailable, tap } from '../lib/haptics.ts';
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
  const coins = useBalance();
  const streaks = dailyStreaks(solves);
  const stats = typeStats(solves);
  const { pref, setPref } = useTheme();
  const { accent, setAccent } = useAccent();
  const session = useSession();
  const [name, setName] = useState(readSetting('ph:name') ?? '');
  const [editing, setEditing] = useState(false);
  const [numberHighlight, setNumberHighlight] = useState(readSetting('ph:sudokuHighlight') !== '0');
  const [hapticsOn, setHapticsOn] = useState(readSetting(HAPTICS_KEY) !== '0');
  const [confirmReset, setConfirmReset] = useState(false);
  const [unlimited, setUnlimited] = useState(hasUnlimitedHints);
  const [buying, setBuying] = useState(false);

  const [privacy, setPrivacy] = useState(privacyOptionsAvailable);
  const earned = currentUnlocked().size;

  useEffect(() => onEntitlement(() => setUnlimited(hasUnlimitedHints())), []);
  useEffect(() => onAdsConsent(() => setPrivacy(privacyOptionsAvailable())), []);

  // FriendsCard, a child, is where sign-in actually happens; this component never re-renders
  // on its own just because the session changed. Follow the signed-in player's name so the
  // field and the Friends card below it never show two different names. Reading `editing` via
  // a ref (rather than a dependency) means finishing an edit doesn't re-run this against a
  // session that hasn't caught up yet and clobber what the player just typed.
  const editingRef = useRef(editing);
  editingRef.current = editing;
  useEffect(() => {
    if (session && !editingRef.current) setName(session.player.name);
  }, [session?.player.name]);

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
        <div className="card-row">
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
                {' '}
                <span className="muted">✎</span>
              </button>
            )}
          </div>
          <div className="card-lg">
            <h2>Achievements</h2>
            <span className="muted small">
              {earned} of {ACHIEVEMENTS.length} earned
            </span>
            <div className="friends-actions">
              <a href={href('/achievements')} className="pill outline" onClick={onLinkClick}>
                Show ›
              </a>
            </div>
          </div>
        </div>

        <div className="stat-grid">
          <Stat value={streaks.current} label="day streak" flame />
          <Stat value={streaks.best} label="best streak" />
          <Stat value={streaks.daysPlayed} label="days played" />
          <Stat value={totalSolved(solves)} label="puzzles solved" />
        </div>

        <div className="stat-grid">
          <Stat value={coins} label="coins" />
        </div>

        <div className="card-lg streak-card">
          <span className="streak-badge">
            <Flame />
          </span>
          <span>
            <b>
              {streaks.perfectDays} perfect {streaks.perfectDays === 1 ? 'day' : 'days'}
            </b>
            <span className="muted small">All {DAILY_TYPES.length} dailies in one day</span>
          </span>
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
          <b>Highlight matching numbers</b>
          <span className="muted small">Sudoku lights up every cell and note with the number you tap.</span>
          <div className="segmented two" role="radiogroup" aria-label="Highlight matching numbers">
            {[true, false].map((on) => (
              <button
                key={String(on)}
                type="button"
                role="radio"
                aria-checked={numberHighlight === on}
                className={numberHighlight === on ? 'seg active' : 'seg'}
                onClick={() => {
                  setNumberHighlight(on);
                  writeSetting('ph:sudokuHighlight', on ? '1' : '0');
                }}
              >
                {on ? 'On' : 'Off'}
              </button>
            ))}
          </div>
        </div>

        {hapticsAvailable && (
          <div className="card-lg">
            <b>Haptic feedback</b>
            <span className="muted small">A light tap with every move and a buzz when a puzzle is solved.</span>
            <div className="segmented two" role="radiogroup" aria-label="Haptic feedback">
              {[true, false].map((on) => (
                <button
                  key={String(on)}
                  type="button"
                  role="radio"
                  aria-checked={hapticsOn === on}
                  className={hapticsOn === on ? 'seg active' : 'seg'}
                  onClick={() => {
                    setHapticsOn(on);
                    writeSetting(HAPTICS_KEY, on ? '1' : '0');
                    tap();
                  }}
                >
                  {on ? 'On' : 'Off'}
                </button>
              ))}
            </div>
          </div>
        )}

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
