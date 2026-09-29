import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { CoinAward } from '@puzzle-hustle/core';
import { formatSeconds } from '../lib/share.ts';
import { Flame } from '../pages/Daily.tsx';

export interface SolvedCardProps {
  seconds: number;
  moves: number;
  hints: number;
  // Levels and random only; null on a first clear, which has nothing to compare against.
  bestBefore: number | null;
  // Only on the solve that earned them; a revisit earns nothing and shows no chip.
  awards: CoinAward[] | null;
  // Off when an already solved puzzle is reopened: the card is simply there.
  animate: boolean;
  placement?: ReactNode;
}

const COUNT_MS = 700;
const COUNT_STEP_MS = 35;

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function useCountUp(target: number, animate: boolean): number {
  const [value, setValue] = useState(() => (animate && !reducedMotion() ? 0 : target));
  useEffect(() => {
    if (!animate || reducedMotion()) {
      setValue(target);
      return;
    }
    const steps = Math.ceil(COUNT_MS / COUNT_STEP_MS);
    let step = 0;
    const timer = setInterval(() => {
      step++;
      setValue(Math.round((target * step) / steps));
      if (step >= steps) clearInterval(timer);
    }, COUNT_STEP_MS);
    return () => clearInterval(timer);
  }, [target, animate]);
  return value;
}

export function SolvedCard({ seconds, moves, hints, bestBefore, awards, animate, placement }: SolvedCardProps) {
  const coins = awards ? awards.reduce((n, a) => n + a.coins, 0) : 0;
  const shownCoins = useCountUp(coins, animate);
  const sweep = awards?.some((a) => a.reason === 'clean-sweep') ?? false;
  const newBest = bestBefore !== null && seconds < bestBefore;
  let pop = 0;
  const next = () => ({ '--pop': pop++ }) as CSSProperties;

  return (
    <div className={animate ? 'solved-card animate' : 'solved-card'}>
      <h2 className="solved-title">Solved!</h2>

      <div className="solved-tiles">
        <Tile style={next()} icon={<ClockIcon />} value={formatSeconds(seconds)} label="time" />
        <Tile style={next()} icon={<MoveIcon />} value={String(moves)} label={moves === 1 ? 'move' : 'moves'} />
        {hints === 0 ? (
          <Tile style={next()} className="good" icon={<CheckIcon />} value="0" label="hints" />
        ) : (
          <Tile style={next()} icon={<BulbIcon />} value={String(hints)} label={hints === 1 ? 'hint' : 'hints'} />
        )}
      </div>

      {(coins > 0 || newBest || sweep || placement) && (
        <div className="solved-chips">
          {coins > 0 && (
            <span className="solved-chip coins" style={next()} aria-label={`plus ${coins} coins`}>
              <CoinIcon />+{shownCoins}
            </span>
          )}
          {newBest && (
            <span className="solved-chip best" style={next()} title={`was ${formatSeconds(bestBefore!)}`}>
              <TrophyIcon /> New best!
            </span>
          )}
          {sweep && (
            <span className="solved-chip sweep" style={next()}>
              <Flame /> Clean sweep
            </span>
          )}
          {placement}
        </div>
      )}
    </div>
  );
}

function Tile({ icon, value, label, className, style }: { icon: ReactNode; value: string; label: string; className?: string; style: CSSProperties }) {
  return (
    <span className={className ? `solved-tile ${className}` : 'solved-tile'} style={style}>
      <span className="solved-tile-icon">{icon}</span>
      <b>{value}</b>
      <span className="solved-tile-label">{label}</span>
    </span>
  );
}

export function PlacementChip({ rank, of, group }: { rank: number; of: number; group: string }) {
  const suffix = rank % 100 >= 11 && rank % 100 <= 13 ? 'th' : rank % 10 === 1 ? 'st' : rank % 10 === 2 ? 'nd' : rank % 10 === 3 ? 'rd' : 'th';
  const medal = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : null;
  return (
    <span className={medal ? `solved-chip place ${medal}` : 'solved-chip place'}>
      {medal && <span className="solved-medal" aria-hidden="true" />}
      {rank}
      {suffix} of {of} · {group}
    </span>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l3 2M9 3h6" />
    </svg>
  );
}

function MoveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10m0-1.5a1.5 1.5 0 0 1 3 0V11m0-1a1.5 1.5 0 0 1 3 0v4.5a6.5 6.5 0 0 1-6.5 6.5h-.8a6 6 0 0 1-4.9-2.5L4.6 15a1.5 1.5 0 0 1 2.3-1.9L9 15" />
    </svg>
  );
}

function BulbIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6M10 17h4v3h-4z" />
    </svg>
  );
}

function CoinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="solved-coin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="currentColor" />
      <circle cx="12" cy="12" r="5.5" fill="none" stroke="var(--card-bg)" strokeWidth="1.5" />
    </svg>
  );
}
