import { href, onLinkClick } from '../lib/router.ts';
import { useBalance } from '../lib/coins.ts';

export function CoinPill() {
  const coins = useBalance();
  return (
    <a href={href('/shop')} onClick={onLinkClick} className="coin-pill" aria-label={`${coins} coins, open shop`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="currentColor" />
        <circle cx="12" cy="12" r="5.5" fill="none" stroke="var(--card-bg)" strokeWidth="1.5" />
      </svg>
      <b>{coins}</b>
    </a>
  );
}
