import { useEffect, useState } from 'react';
import {
  DIFFICULTIES,
  PERIODS,
  PUZZLE_META,
  PUZZLE_TYPES,
  encodeRef,
  nextPeriodStart,
  periodRef,
  randomSeed,
  refId,
  type Period,
  type PuzzleRef,
} from '@puzzle-hustle/core';
import { href, navigate, onLinkClick } from '../lib/router.ts';
import { useSolves } from '../lib/storage.ts';
import { capitalize, formatSeconds } from '../lib/share.ts';

function useCountdown(period: Period): string {
  const [text, setText] = useState('');
  useEffect(() => {
    const tick = () => {
      const ms = nextPeriodStart(period).getTime() - Date.now();
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

function PeriodCard({ period }: { period: Period }) {
  const solves = useSolves();
  const countdown = useCountdown(period);
  const refs: PuzzleRef[] =
    period === 'daily'
      ? PUZZLE_TYPES.map((type) => ({ ...periodRef('daily'), type }))
      : [periodRef(period)];
  return (
    <>
      {refs.map((ref) => {
        const solve = solves[refId(ref)];
        return (
          <a key={refId(ref)} href={href(`/play?${encodeRef(ref)}`)} className="card" onClick={onLinkClick}>
            <span className="kicker">{capitalize(period)}</span>
            <span className="title">{PUZZLE_META[ref.type].name}</span>
            <span className="muted small">
              {capitalize(ref.difficulty)} · {ref.key} · resets in {countdown}
            </span>
            {solve && <span className="done">✔ {formatSeconds(solve.seconds)}</span>}
          </a>
        );
      })}
    </>
  );
}

export function Home() {
  return (
    <>
      <section className="section">
        <div className="section-title">
          <h1>Today&apos;s puzzles</h1>
          <span className="muted small">Resets at midnight, Europe/Berlin</span>
        </div>
        <div className="cards">
          {PERIODS.map((p) => (
            <PeriodCard key={p} period={p} />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-title">
          <h2>Free play</h2>
        </div>
        <div className="cards">
          {PUZZLE_TYPES.map((type) => (
            <div key={type} className="card">
              <span className="title">{PUZZLE_META[type].name}</span>
              <span className="muted small">{PUZZLE_META[type].tagline}</span>
              <div className="chips">
                {DIFFICULTIES.map((d) => (
                  <button
                    type="button"
                    key={d}
                    className="chip"
                    onClick={() => navigate(href(`/play?${encodeRef({ type, difficulty: d, seed: randomSeed() })}`))}
                  >
                    {capitalize(d)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
