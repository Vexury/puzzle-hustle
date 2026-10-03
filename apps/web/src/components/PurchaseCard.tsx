import { useEffect, useState } from 'react';
import { adsAvailable } from '../lib/ads.ts';
import { buyUnlimitedHints, hasUnlimitedHints, onEntitlement, restoreUnlimitedHints, type PurchaseOutcome } from '../lib/entitlement.ts';
import { toast } from './Toast.tsx';

const PURCHASE_TOASTS: Record<PurchaseOutcome, string | null> = {
  owned: 'Unlocked. No ads, every hint free.',
  pending: 'Payment pending. It unlocks once it goes through.',
  cancelled: null,
  failed: 'No purchase was made',
};

export function useUnlimited(): boolean {
  const [unlimited, setUnlimited] = useState(hasUnlimitedHints);
  useEffect(() => onEntitlement(() => setUnlimited(hasUnlimitedHints())), []);
  return unlimited;
}

// The one-time purchase on Profile, in the apps only and only until it is bought; afterwards
// Account shows that it is unlocked (2026-10-03).
export function PurchaseCard() {
  const unlimited = useUnlimited();
  const [buying, setBuying] = useState(false);
  if (!adsAvailable || unlimited) return null;

  return (
    <div className="card-lg row-between">
      <span>
        <b>No ads · Free hints</b>
        <span className="muted small">No videos, every hint free, double coins on every Daily, Weekly and Monthly. Pay once, keep it for good.</span>
        <span>
          <button
            type="button"
            className="linklike muted small"
            disabled={buying}
            onClick={() => {
              setBuying(true);
              void restoreUnlimitedHints()
                .then((found) => toast(found ? 'Purchase restored. No ads, every hint free.' : 'No purchase found for this store account'))
                .catch(() => toast('The store is not reachable right now'))
                .finally(() => setBuying(false));
            }}
          >
            Restore purchase
          </button>
        </span>
      </span>
      <button
        type="button"
        className="pill"
        disabled={buying}
        onClick={() => {
          setBuying(true);
          void buyUnlimitedHints()
            .then((outcome) => {
              const message = PURCHASE_TOASTS[outcome];
              if (message) toast(message);
            })
            .finally(() => setBuying(false));
        }}
      >
        {buying ? 'One moment' : 'Unlock'}
      </button>
    </div>
  );
}
