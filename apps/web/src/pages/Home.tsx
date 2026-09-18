import { useEffect, useState } from 'react';
import {
  DIFFICULTIES,
  PERIODS,
  PUZZLE_META,
  PUZZLE_TYPES,
  encodeRef,
  levelList,
  levelRef,
  nextPeriodStart,
  periodRef,
  randomRef,
  refId,
  type Difficulty,
  type Period,
  type PuzzleRef,
  type PuzzleTypeId,
} from '@puzzle-hustle/core';
import { href, navigate, onLinkClick } from '../lib/router.ts';
import { useSolves, type SolveRecord } from '../lib/storage.ts';
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

export function unlockedLevel(type: PuzzleTypeId, difficulty: Difficulty, solves: Record<string, SolveRecord>): number {
  const list = levelList(type, difficulty);
  for (let i = 1; i <= list.length; i++) {
    const ref = levelRef(type, difficulty, i);
    if (ref && !solves[refId(ref)]) return i;
  }
  return list.length + 1;
}

function LevelRow({ type, difficulty }: { type: PuzzleTypeId; difficulty: Difficulty }) {
  const solves = useSolves();
  const list = levelList(type, difficulty);
  const open = unlockedLevel(type, difficulty, solves);
  const solvedCount = Math.min(open - 1, list.length);
  return (
    <div className="level-row">
      <div className="level-head">
        <span className="level-name">{capitalize(difficulty)}</span>
        <span className="muted small">
          {solvedCount}/{list.length}
        </span>
        <button
          type="button"
          className="chip"
          onClick={() => navigate(href(`/play?${encodeRef(randomRef(type, difficulty))}`))}
        >
          Random
        </button>
      </div>
      <div className="level-grid">
        {list.map((_, i) => {
          const n = i + 1;
          const ref = levelRef(type, difficulty, n)!;
          const state = n < open ? 'solved' : n === open ? 'open' : 'locked';
          if (state === 'locked') {
            return (
              <span key={n} className="level-tile locked" aria-label={`Level ${n}, locked`}>
                {n}
              </span>
            );
          }
          return (
            <a key={n} href={href(`/play?${encodeRef(ref)}`)} className={`level-tile ${state}`} onClick={onLinkClick} aria-label={`Level ${n}`}>
              {n}
            </a>
          );
        })}
      </div>
    </div>
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

      {PUZZLE_TYPES.map((type) => (
        <section key={type} className="section">
          <div className="section-title">
            <h2>{PUZZLE_META[type].name}</h2>
            <span className="muted small">{PUZZLE_META[type].tagline}</span>
          </div>
          <div className="levels">
            {DIFFICULTIES.map((d) => (
              <LevelRow key={d} type={type} difficulty={d} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
