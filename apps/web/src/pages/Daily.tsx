import { useEffect, useState } from 'react';
import { PUZZLE_META, PUZZLE_TYPES, encodeRef, nextPeriodStart, periodRef, refId, type Period, type PuzzleRef } from '@puzzle-hustle/core';
import { PuzzleIcon } from '../components/PuzzleIcon.tsx';
import { href, onLinkClick } from '../lib/router.ts';
import { useSolves } from '../lib/storage.ts';
import { capitalize, formatSeconds } from '../lib/share.ts';
import { dailyNumber, dailyStreaks, formatDateLong } from '../lib/stats.ts';

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
  const url = href(`/play?${encodeRef(puzzleRef)}`);
  return (
    <a href={url} onClick={onLinkClick} className={solve ? 'row-card solved' : 'row-card'}>
      <span className="row-icon">
        <PuzzleIcon type={puzzleRef.type} />
        {solve && <span className="row-check" aria-label="Solved">✓</span>}
      </span>
      <span className="row-text">
        <span className="row-title">{PUZZLE_META[puzzleRef.type].name}</span>
        <span className="row-sub">
          {label} <span className={`diff ${puzzleRef.difficulty}`}>{capitalize(puzzleRef.difficulty)}</span>
        </span>
      </span>
      <span className={solve ? 'pill outline' : 'pill'}>{solve ? formatSeconds(solve.seconds) : 'Play'}</span>
    </a>
  );
}

export function Daily() {
  const solves = useSolves();
  const streaks = dailyStreaks(solves);
  const dailies = PUZZLE_TYPES.map((type) => ({ ...periodRef('daily'), type }));
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
      </header>

      <div className="stack">
        {dailies.map((ref) => (
          <ChallengeCard key={refId(ref)} puzzleRef={ref} label={`Daily #${number} ·`} />
        ))}
      </div>

      <h2 className="section-h">Bigger challenges</h2>
      <div className="stack">
        <ChallengeCard puzzleRef={weekly} label={`Weekly ${weekly.key} · ${weekLeft} ·`} />
        <ChallengeCard puzzleRef={monthly} label={`Monthly ${monthly.key} · ${monthLeft} ·`} />
      </div>
    </>
  );
}

export function Flame() {
  return (
    <svg className="flame" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-2 .8-3.4 2-4.6.2 1.4.9 2.3 2 2.6 0-3 .3-6 1-9z" />
    </svg>
  );
}
