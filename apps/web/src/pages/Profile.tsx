import { useEffect, useState } from 'react';
import { ACHIEVEMENTS, DAILY_TYPES, PUZZLE_META } from '@puzzle-hustle/core';
import { Flame } from './Daily.tsx';
import { ACCENTS, ACCENT_NAMES, useAccent } from '../lib/accent.ts';
import { adsAvailable, onAdsConsent, privacyOptionsAvailable, showPrivacyOptions } from '../lib/ads.ts';
import { currentUnlocked } from '../lib/achievements.ts';
import { pushCosmetics } from '../lib/coins.ts';
import { buyUnlimitedHints, hasUnlimitedHints, onEntitlement, restoreUnlimitedHints, type PurchaseOutcome } from '../lib/entitlement.ts';
import { HAPTICS_KEY, hapticsAvailable, tap } from '../lib/haptics.ts';
import { href, onLinkClick } from '../lib/router.ts';
import { readSetting, useSolves, writeSetting } from '../lib/storage.ts';
import { formatSeconds } from '../lib/share.ts';
import { dailyStreaks, totalSolved, typeStats } from '../lib/stats.ts';
import { THEME_PREFS, centerOf, resetProgressAndAppearance, usePack, useTheme, type ThemePref } from '../lib/theme.ts';
import { AccountCard, PRIVACY_POLICY_URL } from '../components/AccountCard.tsx';
import { CoinPill } from '../components/CoinPill.tsx';
import { toast } from '../components/Toast.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';

const PURCHASE_TOASTS: Record<PurchaseOutcome, string | null> = {
  owned: 'Unlocked. Every hint is yours.',
  pending: 'Payment pending. Hints unlock once it goes through.',
  cancelled: null,
  failed: 'No purchase was made',
};

export function Profile({ joinCode = null }: { joinCode?: string | null } = {}) {
  const solves = useSolves();
  const streaks = dailyStreaks(solves);
  const stats = typeStats(solves);
  const { pref, setPref } = useTheme();
  const { accent, setAccent } = useAccent();
  const pack = usePack();
  const [numberHighlight, setNumberHighlight] = useState(readSetting('ph:sudokuHighlight') !== '0');
  const [hapticsOn, setHapticsOn] = useState(readSetting(HAPTICS_KEY) !== '0');
  const [confirmReset, setConfirmReset] = useState(false);
  const [unlimited, setUnlimited] = useState(hasUnlimitedHints);
  const [buying, setBuying] = useState(false);

  const [privacy, setPrivacy] = useState(privacyOptionsAvailable);
  const earned = currentUnlocked().size;

  useEffect(() => onEntitlement(() => setUnlimited(hasUnlimitedHints())), []);
  useEffect(() => onAdsConsent(() => setPrivacy(privacyOptionsAvailable())), []);
  useEffect(() => {
    if (!confirmReset) return;
    const t = setTimeout(() => setConfirmReset(false), 2000);
    return () => clearTimeout(t);
  }, [confirmReset]);

  return (
    <>
      <header className="page-head">
        <h1>Profile</h1>
        <div className="head-actions">
          <CoinPill />
          <ThemeToggle />
        </div>
      </header>

      <div className="stack">
        {joinCode && (
          <div className="card-lg">
            <b>
              Join group <span className="num">{joinCode}</span>
            </b>
            <span className="muted small">Sign in below and you go straight to the group.</span>
          </div>
        )}
        <AccountCard joinCode={joinCode} />

        <div className="card-lg row-between">
          <span>
            <b>Achievements</b>
            <span className="muted small">
              {earned} of {ACHIEVEMENTS.length} earned
            </span>
          </span>
          <a href={href('/achievements')} className="pill outline" onClick={onLinkClick}>
            Show ›
          </a>
        </div>

        <div className="stat-grid">
          <Stat value={streaks.current} label="day streak" flame />
          <Stat value={streaks.best} label="best streak" />
          <Stat value={streaks.daysPlayed} label="days played" />
          <Stat value={totalSolved(solves)} label="puzzles solved" />
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
          {pack ? (
            <>
              <span className="muted small">Theme: {pack.title}</span>
              <a href={href('/shop')} className="pill outline" onClick={onLinkClick}>
                Change
              </a>
            </>
          ) : (
            <>
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
            </>
          )}
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
              {!unlimited && (
                <span>
                  <button
                    type="button"
                    className="linklike muted small"
                    disabled={buying}
                    onClick={() => {
                      setBuying(true);
                      void restoreUnlimitedHints()
                        .then((found) => toast(found ? 'Purchase restored. Every hint is yours.' : 'No purchase found for this store account'))
                        .catch(() => toast('The store is not reachable right now'))
                        .finally(() => setBuying(false));
                    }}
                  >
                    Restore purchase
                  </button>
                </span>
              )}
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
                  void buyUnlimitedHints()
                    .then((outcome) => {
                      const message = PURCHASE_TOASTS[outcome];
                      if (message) toast(message);
                    })
                    .finally(() => setBuying(false));
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
            <span className="muted small">{confirmReset ? 'Deletes all solves and streaks on this device. Current dailies, weeklies and monthlies stay solved.' : 'Start over from zero.'}</span>
          </span>
          {confirmReset ? (
            <button
              type="button"
              className="pill danger"
              onClick={() => {
                resetProgressAndAppearance();
                void pushCosmetics();
                setConfirmReset(false);
              }}
            >
              Delete
            </button>
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
          {' · '}
          <a href={PRIVACY_POLICY_URL} target="_blank" rel="noreferrer">
            Privacy policy
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
