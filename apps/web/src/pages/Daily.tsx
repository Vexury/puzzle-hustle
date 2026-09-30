import { useEffect, useState } from 'react';
import { CLEAN_SWEEP_COINS, DAILY_TYPES, PUZZLE_META, dailyRef, encodeRef, nextPeriodStart, periodRef, refId, type Period, type PuzzleRef } from '@puzzle-hustle/core';
import { PuzzleIcon } from '../components/PuzzleIcon.tsx';
import { href, onLinkClick } from '../lib/router.ts';
import { readCurrentProgress, useSolves } from '../lib/storage.ts';
import { formatSeconds } from '../lib/share.ts';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { CoinPill } from '../components/CoinPill.tsx';
import { STREAK_MIN, dailyAverageSeconds, dailyNumber, dailyStreaks, formatDateShort, monthlyNumber, weeklyNumber } from '../lib/stats.ts';

export function useCountdown(period: Period): string {
  const [text, setText] = useState('');
  useEffect(() => {
    const tick = () => {
      const ms = Math.max(0, nextPeriodStart(period).getTime() - Date.now());
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const d = Math.floor(h / 24);
      setText(d >= 1 ? `${d}d ${h % 24}h` : `${h}h ${String(m).padStart(2, '0')}m`);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [period]);
  return text;
}

function ChallengeCard({ puzzleRef }: { puzzleRef: PuzzleRef }) {
  const solves = useSolves();
  const solve = solves[refId(puzzleRef)];
  const started = !solve && readCurrentProgress(refId(puzzleRef)) !== null;
  const url = href(`/play?${encodeRef(puzzleRef)}`);
  const average = puzzleRef.period === 'daily' ? dailyAverageSeconds(solves, puzzleRef.type) : null;
  return (
    <a href={url} onClick={onLinkClick} className={solve ? 'row-card solved' : 'row-card'}>
      <span className={solve ? 'row-icon done' : 'row-icon open'}>
        <PuzzleIcon type={puzzleRef.type} />
        {solve && (
          <span className={justSolved(solve) ? 'row-check pop' : 'row-check'} role="img" aria-label="Solved">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5.5 12.25L10 16.75L18.5 7.25" />
            </svg>
          </span>
        )}
      </span>
      <span className="row-text">
        <span className="row-title">{PUZZLE_META[puzzleRef.type].name}</span>
        {average !== null && <span className="row-sub">Your avg {formatSeconds(average)}</span>}
      </span>
      <span className={solve ? 'pill outline' : 'pill'}>{solve ? formatSeconds(solve.seconds) : started ? 'Continue' : 'Play'}</span>
    </a>
  );
}

export function Daily() {
  const solves = useSolves();
  const streaks = dailyStreaks(solves);
  const dailies = DAILY_TYPES.map((type) => dailyRef(type));
  const weekly = periodRef('weekly');
  const monthly = periodRef('monthly');
  const dayLeft = useCountdown('daily');
  const weekLeft = useCountdown('weekly');
  const monthLeft = useCountdown('monthly');
  const number = dailyNumber(dailies[0]!.key!);

  return (
    <>
      <header className="page-head">
        <h1>Daily</h1>
        <p className="muted">
          <span className="nowrap">{formatDateShort()}</span> · <span className="nowrap">#{number}</span>
        </p>
        <div className="head-actions">
          <CoinPill />
          <ThemeToggle />
        </div>
      </header>

      <section
        className={`streak-hero${streaks.current > 0 ? ' has-streak' : ''}${streaks.today >= STREAK_MIN ? ' safe' : ''}${streaks.today >= dailies.length ? ' full' : ''}`}
      >
        <div className="streak-hero-top">
          <div className="streak-count" title="Days in a row">
            <Flame />
            <div>
              <b>{streaks.current}</b>
              <span>day streak</span>
            </div>
          </div>
          <div className="streak-timer">
            <b>{dayLeft}</b>
            left today
          </div>
        </div>
        <DailyProgress solved={streaks.today} total={dailies.length} streak={streaks.current} day={dailies[0]!.key!} />
      </section>

      <div className="stack">
        {dailies.map((ref) => (
          <ChallengeCard key={refId(ref)} puzzleRef={ref} />
        ))}
      </div>

      <h2 className="section-h">Weekly</h2>
      <p className="muted small section-sub">
        {weekly.key} · #{weeklyNumber(weekly.key!)} · {weekLeft} left
      </p>
      <div className="stack">
        <ChallengeCard puzzleRef={weekly} />
      </div>

      <h2 className="section-h">Monthly</h2>
      <p className="muted small section-sub">
        {monthly.key} · #{monthlyNumber(monthly.key!)} · {monthLeft} left
      </p>
      <div className="stack">
        <ChallengeCard puzzleRef={monthly} />
      </div>
    </>
  );
}

const IGNITE_KEY = 'ph:view:streak-ignite';
const SEEN_KEY = 'ph:view:daily-seen';

// A solve from the last moments, so coming back from it to Daily lets its check pop in.
export function justSolved(solve: { solvedAt: string }, now = Date.now()): boolean {
  return now - Date.parse(solve.solvedAt) < 30_000;
}

function DailyProgress({ solved, total, streak, day }: { solved: number; total: number; streak: number; day: string }) {
  const safe = solved >= STREAK_MIN;
  const full = solved >= total;
  const missing = STREAK_MIN - solved;
  const stage = full ? `${day}:full` : safe ? `${day}:safe` : null;
  const [ignite] = useState(() => {
    try {
      return stage !== null && localStorage.getItem(IGNITE_KEY) !== stage;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!stage) return;
    try {
      localStorage.setItem(IGNITE_KEY, stage);
    } catch {
      /* storage unavailable */
    }
  }, [stage]);
  // The bar grows from where this page last showed it today, so a solve visibly adds its part.
  const [grownFrom] = useState(() => {
    try {
      const [seenDay, seen] = (localStorage.getItem(SEEN_KEY) ?? '').split('|');
      const before = Number(seen);
      return seenDay === day && Number.isInteger(before) && before < solved ? before : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SEEN_KEY, `${day}|${solved}`);
    } catch {
      /* storage unavailable */
    }
  }, [day, solved]);
  return (
    <div
      className={`daily-progress${safe ? ' safe' : ''}${full ? ' full' : ''}${ignite ? ' ignite' : ''}${grownFrom !== null ? ' grow' : ''}`}
      style={grownFrom !== null ? ({ '--from': `${Math.min(1, grownFrom / total) * 100}%` } as React.CSSProperties) : undefined}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={solved}
    >
      <div className="track">
        <span className="fill" style={{ width: `${Math.min(1, solved / total) * 100}%` }} />
        <span className="goal-badge" style={{ left: `${(STREAK_MIN / total) * 100}%` }}>
          <Flame />
        </span>
      </div>
      <span className="small">
        {solved}/{total} solved ·{' '}
        {full
          ? `clean sweep · +${CLEAN_SWEEP_COINS} coins`
          : safe
            ? 'streak safe'
            : streak === 0
              ? `${missing} more ${missing === 1 ? 'daily' : 'dailies'} to start a streak`
              : missing === 1
                ? 'one more for your streak'
                : `${missing} more for your streak`}
      </span>
    </div>
  );
}

export function Flame() {
  return (
    <svg className="flame" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-2 .8-3.4 2-4.6.2 1.4.9 2.3 2 2.6 0-3 .3-6 1-9z" />
    </svg>
  );
}
