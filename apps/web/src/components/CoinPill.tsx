import { useEffect, useRef, useState } from 'react';
import { href, onLinkClick } from '../lib/router.ts';
import { useBalance } from '../lib/coins.ts';

// The balance this run last showed, across pages: coins earned in a puzzle count up on the page
// you return to, and nothing moves on the first page of a run.
let shown: number | null = null;

export function CoinPill() {
  const coins = useBalance();
  const [value, setValue] = useState(() => (shown !== null && shown < coins ? shown : coins));
  const [bump, setBump] = useState(0);
  const frame = useRef(0);
  useEffect(() => {
    const from = shown ?? coins;
    shown = coins;
    if (from >= coins || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(coins);
      return;
    }
    setBump((n) => n + 1);
    const start = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 650);
      setValue(Math.round(from + (coins - from) * k));
      if (k < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [coins]);
  return (
    <a key={bump} href={href('/shop')} onClick={onLinkClick} className={bump ? 'coin-pill bump' : 'coin-pill'} aria-label={`${coins} coins, open shop`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="currentColor" />
        <circle cx="12" cy="12" r="5.5" fill="none" stroke="var(--card-bg)" strokeWidth="1.5" />
      </svg>
      <b>{value}</b>
    </a>
  );
}
