import { useEffect, useState } from 'react';
import { CLEAN_SWEEP_COINS, DAILY_TYPES, PUZZLE_META, dailyRef, encodeRef, nextPeriodStart, periodRef, refId, type Period, type PuzzleRef } from '@puzzle-hustle/core';
import { PuzzleIcon } from '../components/PuzzleIcon.tsx';
import { href, onLinkClick } from '../lib/router.ts';
import { readProgress, useSolves } from '../lib/storage.ts';
import { capitalize, formatSeconds } from '../lib/share.ts';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { STREAK_MIN, dailyNumber, dailyStreaks, formatDateLong, monthlyNumber, weeklyNumber } from '../lib/stats.ts';

export function useCountdown(period: Period): string {
  const [text, setText] = useState('');
  useEffect(() => {
    const tick = () => {
      const ms = Math.max(0, nextPeriodStart(period).getTime() - Date.now());
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const d = Math.floor(h / 24);
      setText(d >= 1 ? `${d}d ${h % 24}h left` : `${h}h ${String(m).padStart(2, '0')}m left`);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [period]);
  return text;
}

function ChallengeCard({ puzzleRef, label }: { puzzleRef: PuzzleRef; label: string }) {
  const solves = useSolves();
  const solve = solves[refId(puzzleRef)];
  const started = !solve && readProgress(refId(puzzleRef)) !== null;
  const url = href(`/play?${encodeRef(puzzleRef)}`);
  return (
    <a href={url} onClick={onLinkClick} className={solve ? 'row-card solved' : 'row-card'}>
      <span className="row-icon">
        <PuzzleIcon type={puzzleRef.type} />
        {solve && (
          <span className="row-check" role="img" aria-label="Solved">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5.5 12.25L10 16.75L18.5 7.25" />
            </svg>
          </span>
        )}
      </span>
      <span className="row-text">
        <span className="row-title">{PUZZLE_META[puzzleRef.type].name}</span>
        <span className="row-sub">
          {label} <span className={`diff ${puzzleRef.difficulty}`}>{capitalize(puzzleRef.difficulty)}</span>
        </span>
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
        <h1>
          Daily
          {streaks.current > 0 && (
            <span className="streak" title="Days in a row">
              <Flame /> {streaks.current}
            </span>
          )}
        </h1>
        <p className="muted">
          {formatDateLong()} · {dayLeft}
        </p>
        <ThemeToggle />
      </header>

      <DailyProgress solved={streaks.today} total={dailies.length} />

      <div className="stack">
        {dailies.map((ref) => (
          <ChallengeCard key={refId(ref)} puzzleRef={ref} label={`Daily #${number} ·`} />
        ))}
      </div>

      <h2 className="section-h">Weekly</h2>
      <p className="muted small section-sub">
        {weekly.key} · {weekLeft}
      </p>
      <div className="stack">
        <ChallengeCard puzzleRef={weekly} label={`Weekly #${weeklyNumber(weekly.key!)} ·`} />
      </div>

      <h2 className="section-h">Monthly</h2>
      <p className="muted small section-sub">
        {monthly.key} · {monthLeft}
      </p>
      <div className="stack">
        <ChallengeCard puzzleRef={monthly} label={`Monthly #${monthlyNumber(monthly.key!)} ·`} />
      </div>
    </>
  );
}

function DailyProgress({ solved, total }: { solved: number; total: number }) {
  const safe = solved >= STREAK_MIN;
  const full = solved >= total;
  const missing = STREAK_MIN - solved;
  return (
    <div
      className={full ? 'daily-progress safe full' : safe ? 'daily-progress safe' : 'daily-progress'}
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
        {full ? `clean sweep · +${CLEAN_SWEEP_COINS} coins` : safe ? 'streak safe' : missing === 1 ? 'one more for your streak' : `${missing} more for your streak`}
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
