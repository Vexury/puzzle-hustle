import { useEffect, useRef, useState } from 'react';
import { pushBackGuard } from '../lib/back.ts';
import { href, navigate } from '../lib/router.ts';
import { INTRO_SEEN_KEY as SEEN_KEY, readSetting, writeSetting } from '../lib/storage.ts';
import { introDismissed } from './UnlockModal.tsx';

const CARDS = [
  {
    title: 'Welcome to Puzzle Hustle',
    body: 'Eight logic puzzles, a fresh set every day. Everything works offline, nothing needs an account.',
  },
  {
    title: 'Stuck? Take a hint',
    body: 'The first hint in every puzzle is free. Every hint after that costs a short video, or you unlock unlimited hints once and keep them.',
  },
  {
    title: 'Start easy',
    body: 'Most dailies land on medium. If a puzzle type is new to you, play the Easy levels first, they teach the rules on small boards.',
  },
];

export function Intro() {
  const [card, setCard] = useState(0);
  const [done, setDone] = useState(() => readSetting(SEEN_KEY) === '1');

  // Pushed once while the intro is up (not re-pushed per card): the closure reads the latest
  // handler from this ref, reassigned every render, so the guard's stack position never moves
  // just because the card changed. See the matching comment on Play.tsx's own back guard.
  const backGuard = useRef<() => boolean>(() => false);
  backGuard.current = () => {
    if (card === 0) return false;
    setCard(card - 1);
    return true;
  };
  useEffect(() => {
    if (done) return;
    return pushBackGuard(() => backGuard.current());
  }, [done]);

  if (done) return null;

  const dismiss = (toLevels: boolean) => {
    writeSetting(SEEN_KEY, '1');
    setDone(true);
    introDismissed();
    if (toLevels) navigate(href('/levels'));
  };

  const last = card === CARDS.length - 1;
  return (
    <div className="intro">
      <div className="card-lg">
        <button type="button" className="linklike muted small intro-skip" onClick={() => dismiss(false)}>
          Skip
        </button>
        <h2>{CARDS[card]!.title}</h2>
        <p className="muted">{CARDS[card]!.body}</p>
        <div className="intro-dots" aria-hidden="true">
          {CARDS.map((c, i) => (
            <span key={c.title} className={i === card ? 'dot on' : 'dot'} />
          ))}
        </div>
        <div className="ad-ask-row">
          {card > 0 && (
            <button type="button" className="pill outline" onClick={() => setCard(card - 1)}>
              Back
            </button>
          )}
          <button type="button" className="pill" onClick={() => (last ? dismiss(true) : setCard(card + 1))}>
            {last ? 'Show the puzzles' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
