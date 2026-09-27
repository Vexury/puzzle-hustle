import { href, onBackLinkClick } from '../lib/router.ts';
import { Chevron } from './Chevron.tsx';

// Back to the page this one was opened from, or to `fallback` when it was opened directly.
export function BackLink({ fallback }: { fallback: string }) {
  const from = (history.state as { from?: string } | null)?.from;
  const to = from && from !== location.pathname + location.search ? from : href(fallback);
  return (
    <a href={to} onClick={onBackLinkClick} className="icon-round" aria-label="Back">
      <Chevron />
    </a>
  );
}
