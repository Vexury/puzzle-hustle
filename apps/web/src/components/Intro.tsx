import { useEffect, useState } from 'react';
import { setBackGuard } from '../lib/back.ts';
import { href, navigate } from '../lib/router.ts';
import { readSetting, writeSetting } from '../lib/storage.ts';

const SEEN_KEY = 'ph:intro';

const CARDS = [
  {
    title: 'Welcome to Puzzle Hustle',
    body: 'Eight logic puzzles, a fresh set every day. Everything works offline, nothing needs an account.',
  },
  {
    title: 'Stuck? Take a hint',
    body: 'The first hint in every puzzle is free. After that a short video, or unlock unlimited hints once.',
  },
  {
    title: 'Start easy',
    body: 'The dailies are medium. If a puzzle type is new to you, play the Easy levels first, they teach the rules on small boards.',
  },
];

export function Intro() {
  const [card, setCard] = useState(0);
  const [done, setDone] = useState(() => readSetting(SEEN_KEY) === '1');

  // No dependency list: the guard has to see the current card, not the first one.
  useEffect(() => {
    if (done) return;
    setBackGuard(() => {
      if (card === 0) return false;
      setCard(card - 1);
      return true;
    });
    return () => setBackGuard(null);
  });

  if (done) return null;

  const dismiss = (toLevels: boolean) => {
    writeSetting(SEEN_KEY, '1');
    setDone(true);
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
