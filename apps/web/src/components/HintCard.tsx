import { HINT_PRICE } from '@puzzle-hustle/core';
import { balance } from '../lib/coins.ts';
import type { HintChoice, HintOffer } from '../lib/hints.ts';

// Opens on every tap on Hint, so a stray tap never spends anything. It offers what applies:
// with the purchase a plain yes, otherwise the day's free hint, and once that is gone coins
// and, in the apps, a video.
export function HintCard({ offer, onAnswer }: { offer: HintOffer; onAnswer(choice: HintChoice): void }) {
  const actions: [Exclude<HintChoice, null>, string][] = [];
  let title: string;
  let text: string;
  if (offer.unlimited) {
    title = 'Use a hint?';
    text = 'Hints are free with No Ads · Free Hints.';
    actions.push(['free', 'Use hint']);
  } else if (offer.free) {
    title = 'Use your free hint?';
    text = 'You get one free hint a day, across all puzzles. The next one comes tomorrow.';
    actions.push(['free', 'Use free hint']);
  } else {
    title = 'One more hint?';
    text = offer.video
      ? `Today's free hint is used. Watch a short video or pay ${HINT_PRICE} coins.`
      : `Today's free hint is used. A hint costs ${HINT_PRICE} coins, the next free one comes tomorrow.`;
    if (offer.video) actions.push(['video', 'Watch video']);
    if (offer.canPay) actions.push(['coins', `Use ${HINT_PRICE} coins`]);
  }
  const short = !offer.unlimited && !offer.free && !offer.canPay;

  return (
    <div className="ad-ask" role="dialog" aria-modal="true" aria-label={title}>
      <div className="card-lg">
        <b>{title}</b>
        <span className="muted small">{text}</span>
        {short && (
          <span className="muted small">
            {HINT_PRICE} coins needed, you have {balance()}.
          </span>
        )}
        {actions.length > 1 ? (
          <div className="ad-ask-row stack">
            {actions.map(([choice, label], i) => (
              <button key={choice} type="button" className={i === 0 ? 'pill' : 'pill outline'} onClick={() => onAnswer(choice)}>
                {label}
              </button>
            ))}
            <button type="button" className="pill outline" onClick={() => onAnswer(null)}>
              Not now
            </button>
          </div>
        ) : (
          <div className="ad-ask-row">
            <button type="button" className="pill outline" onClick={() => onAnswer(null)}>
              {actions.length === 0 ? 'OK' : 'Not now'}
            </button>
            {actions.map(([choice, label]) => (
              <button key={choice} type="button" className="pill" onClick={() => onAnswer(choice)}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
