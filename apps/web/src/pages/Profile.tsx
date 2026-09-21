import { useEffect, useState } from 'react';
import { PUZZLE_META, PUZZLE_TYPES } from '@puzzle-hustle/core';
import { Flame } from './Daily.tsx';
import { ACCENTS, ACCENT_NAMES, useAccent } from '../lib/accent.ts';
import { adsAvailable, onAdsConsent, privacyOptionsAvailable, showPrivacyOptions } from '../lib/ads.ts';
import { buyUnlimitedHints, hasUnlimitedHints, onEntitlement } from '../lib/entitlement.ts';
import { readSetting, resetProgress, useSolves, writeSetting } from '../lib/storage.ts';
import { formatSeconds } from '../lib/share.ts';
import { STREAK_MIN, dailyStreaks, totalSolved, typeStats } from '../lib/stats.ts';
import { THEME_PREFS, useTheme, type ThemePref } from '../lib/theme.ts';
import { ThemeToggle } from '../components/ThemeToggle.tsx';

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
          <Stat value={streaks.current} label={`day streak (${STREAK_MIN}+ dailies)`} flame />
          <Stat value={streaks.best} label="best streak" />
          <Stat value={streaks.daysPlayed} label="days played" />
          <Stat value={totalSolved(solves)} label="puzzles solved" />
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

        <div className="card-lg">
          <b>Appearance</b>
          <span className="muted small">System follows your device setting.</span>
          <div className="segmented three" role="radiogroup" aria-label="Appearance">
            {THEME_PREFS.map((p: ThemePref) => (
              <button key={p} type="button" role="radio" aria-checked={pref === p} className={pref === p ? 'seg active' : 'seg'} onClick={() => setPref(p)}>
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
          Progress is stored on this device. Sign-in and sync will come later. ·{' '}
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
