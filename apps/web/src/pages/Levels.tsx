import { useState } from 'react';
import {
  DIFFICULTIES,
  PUZZLE_META,
  PUZZLE_TYPES,
  encodeRef,
  isDifficulty,
  isPuzzleTypeId,
  levelList,
  levelRef,
  randomRef,
  refId,
  type Difficulty,
  type PuzzleTypeId,
} from '@puzzle-hustle/core';
import { PuzzleIcon } from '../components/PuzzleIcon.tsx';
import { href, navigate, onLinkClick } from '../lib/router.ts';
import { readSetting, startedIds, useSolves, writeSetting, type SolveRecord } from '../lib/storage.ts';
import { toast } from '../components/Toast.tsx';
import { capitalize, formatSeconds } from '../lib/share.ts';
import { typeStats } from '../lib/stats.ts';
import { Chevron } from '../components/Chevron.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { CoinPill } from '../components/CoinPill.tsx';

export function unlockedLevel(type: PuzzleTypeId, difficulty: Difficulty, solves: Record<string, SolveRecord>): number {
  const list = levelList(type, difficulty);
  for (let i = 1; i <= list.length; i++) {
    const ref = levelRef(type, difficulty, i);
    if (ref && !solves[refId(ref)]) return i;
  }
  return list.length + 1;
}

export function LevelsIndex() {
  const solves = useSolves();
  const stats = typeStats(solves);
  const started = [...startedIds()].filter((id) => !/:(daily|weekly|monthly):/.test(id));
  return (
    <>
      <header className="page-head">
        <h1>Puzzles</h1>
        <p className="muted">Four difficulties, playable offline.</p>
        <div className="head-actions">
          <CoinPill />
          <ThemeToggle />
        </div>
      </header>
      <div className="stack">
        {PUZZLE_TYPES.map((type) => {
          const s = stats.find((x) => x.type === type)!;
          const inProgress = started.some((id) => id.startsWith(`${type}:`));
          return (
            <a key={type} href={href(`/levels/${type}`)} onClick={onLinkClick} className="row-card">
              <span className="row-icon">
                <PuzzleIcon type={type} />
              </span>
              <span className="row-text">
                <span className="row-title">{PUZZLE_META[type].name}</span>
                <span className="row-sub">
                  {s.levelsSolved}/{s.levelsTotal} solved
                </span>
              </span>
              <span className="pill">{inProgress ? 'Continue' : 'Play'}</span>
            </a>
          );
        })}
      </div>
    </>
  );
}

export function LevelsType({ type }: { type: string }) {
  if (!isPuzzleTypeId(type)) {
    navigate(href('/levels'), true);
    return null;
  }
  return <LevelGrid type={type} />;
}

function LevelGrid({ type }: { type: PuzzleTypeId }) {
  const solves = useSolves();
  const saved = readSetting(`ph:difficulty:${type}`);
  const [difficulty, setDifficulty] = useState<Difficulty>(isDifficulty(saved) ? saved : 'easy');
  const [slide, setSlide] = useState<'' | ' slide-left' | ' slide-right'>('');
  const list = levelList(type, difficulty);
  const open = unlockedLevel(type, difficulty, solves);
  const stat = typeStats(solves).find((s) => s.type === type)!;
  const started = startedIds();
  // Only worth a button once the open level has scrolled out of the first row.
  const openRef = open > 4 && open <= list.length ? levelRef(type, difficulty, open) : null;
  const openStarted = openRef !== null && started.has(refId(openRef));

  const pick = (d: Difficulty) => {
    if (d === difficulty) return;
    setSlide(DIFFICULTIES.indexOf(d) > DIFFICULTIES.indexOf(difficulty) ? ' slide-right' : ' slide-left');
    setDifficulty(d);
    writeSetting(`ph:difficulty:${type}`, d);
  };

  return (
    <>
      <a href={href('/levels')} onClick={onLinkClick} className="back">
        <Chevron size={20} /> Puzzles
      </a>
      <header className="page-head compact">
        <h1>
          <PuzzleIcon type={type} size={32} /> {PUZZLE_META[type].name}
        </h1>
        <p className="muted">
          {stat.levelsSolved}/{stat.levelsTotal} solved
        </p>
        <div className="head-actions">
          <CoinPill />
          <ThemeToggle />
        </div>
      </header>

      <div className="segmented" role="tablist" aria-label="Difficulty">
        {DIFFICULTIES.map((d) => {
          const solvedHere = Math.min(unlockedLevel(type, d, solves) - 1, levelList(type, d).length);
          return (
            <button type="button" key={d} role="tab" aria-selected={d === difficulty} className={d === difficulty ? 'seg active' : 'seg'} onClick={() => pick(d)}>
              {capitalize(d)}
              <small>
                {solvedHere}/{levelList(type, d).length}
              </small>
            </button>
          );
        })}
      </div>

      {openRef && (
        <div className="actions level-jump">
          <a href={href(`/play?${encodeRef(openRef)}`)} onClick={onLinkClick} className="pill">
            {openStarted ? 'Continue' : 'Play'} #{open}
          </a>
        </div>
      )}

      <div key={difficulty} className={`level-grid${slide}`}>
        {list.map((_, i) => {
          const n = i + 1;
          const ref = levelRef(type, difficulty, n)!;
          const solve = solves[refId(ref)];
          if (n > open) {
            return (
              <button key={n} type="button" className="tile locked" aria-label={`Level ${n}, locked`} onClick={() => toast(`Solve #${open} first`)}>
                <b>#{n}</b>
                <small>locked</small>
              </button>
            );
          }
          return (
            <a key={n} href={href(`/play?${encodeRef(ref)}`)} onClick={onLinkClick} className={solve ? 'tile solved' : 'tile open'}>
              <b>#{n}</b>
              <small>{solve ? `✓ ${formatSeconds(solve.seconds)}` : started.has(refId(ref)) ? 'continue' : 'play'}</small>
            </a>
          );
        })}
      </div>

      {open > list.length ? (
        <div className="actions">
          <button type="button" className="pill outline" onClick={() => navigate(href(`/play?${encodeRef(randomRef(type, difficulty))}`))}>
            Random {capitalize(difficulty)}
          </button>
        </div>
      ) : (
        <p className="muted small center">
          Solve all {list.length} to unlock endless {difficulty} puzzles.
        </p>
      )}
    </>
  );
}
