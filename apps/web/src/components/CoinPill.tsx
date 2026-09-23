import { useBalance } from '../lib/coins.ts';

export function CoinPill() {
  const coins = useBalance();
  return (
    <span className="coin-pill" aria-label={`${coins} coins`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="currentColor" />
        <circle cx="12" cy="12" r="5.5" fill="none" stroke="var(--card-bg)" strokeWidth="1.5" />
      </svg>
      <b>{coins}</b>
    </span>
  );
}
