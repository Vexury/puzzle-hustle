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
import { readSetting, useSolves, writeSetting, type SolveRecord } from '../lib/storage.ts';
import { capitalize, formatSeconds } from '../lib/share.ts';
import { typeStats } from '../lib/stats.ts';
import { ThemeToggle } from '../components/ThemeToggle.tsx';

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
  return (
    <>
      <header className="page-head">
        <h1>Puzzles</h1>
        <p className="muted">Hand-picked packs, playable offline.</p>
        <ThemeToggle />
      </header>
      <div className="stack">
        {PUZZLE_TYPES.map((type) => {
          const s = stats.find((x) => x.type === type)!;
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
              <span className="pill">Play</span>
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

  const pick = (d: Difficulty) => {
    if (d === difficulty) return;
    setSlide(DIFFICULTIES.indexOf(d) > DIFFICULTIES.indexOf(difficulty) ? ' slide-right' : ' slide-left');
    setDifficulty(d);
    writeSetting(`ph:difficulty:${type}`, d);
  };

  return (
    <>
      <a href={href('/levels')} onClick={onLinkClick} className="back">
        ‹ Puzzles
      </a>
      <header className="page-head compact">
        <h1>
          <PuzzleIcon type={type} size={32} /> {PUZZLE_META[type].name}
        </h1>
        <p className="muted">
          {stat.levelsSolved}/{stat.levelsTotal} solved
        </p>
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

      <div key={difficulty} className={`level-grid${slide}`}>
        {list.map((_, i) => {
          const n = i + 1;
          const ref = levelRef(type, difficulty, n)!;
          const solve = solves[refId(ref)];
          if (n > open) {
            return (
              <span key={n} className="tile locked" aria-label={`Level ${n}, locked`}>
                <b>#{n}</b>
                <small>locked</small>
              </span>
            );
          }
          return (
            <a key={n} href={href(`/play?${encodeRef(ref)}`)} onClick={onLinkClick} className={solve ? 'tile solved' : 'tile open'}>
              <b>#{n}</b>
              <small>{solve ? `✓ ${formatSeconds(solve.seconds)}` : 'play'}</small>
            </a>
          );
        })}
      </div>

      <div className="actions">
        <button type="button" className="pill outline" onClick={() => navigate(href(`/play?${encodeRef(randomRef(type, difficulty))}`))}>
          Random {capitalize(difficulty)}
        </button>
      </div>
    </>
  );
}
