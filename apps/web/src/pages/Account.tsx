import { useEffect, useState } from 'react';
import { OnOff } from './Gameplay.tsx';
import { adsAvailable } from '../lib/ads.ts';
import { pushCosmetics } from '../lib/coins.ts';
import { buyUnlimitedHints, hasUnlimitedHints, onEntitlement, restoreUnlimitedHints, type PurchaseOutcome } from '../lib/entitlement.ts';
import { setTelemetryEnabled, telemetryEnabled } from '../lib/telemetry.ts';
import { resetProgressAndAppearance } from '../lib/theme.ts';
import { AccountActions } from '../components/AccountCard.tsx';
import { SubpageHead } from '../components/SubpageHead.tsx';
import { toast } from '../components/Toast.tsx';

const PURCHASE_TOASTS: Record<PurchaseOutcome, string | null> = {
  owned: 'Unlocked. No ads, every hint free.',
  pending: 'Payment pending. It unlocks once it goes through.',
  cancelled: null,
  failed: 'No purchase was made',
};

export function Account() {
  const [statsOn, setStatsOn] = useState(telemetryEnabled);
  const [confirmReset, setConfirmReset] = useState(false);
  const [unlimited, setUnlimited] = useState(hasUnlimitedHints);
  const [buying, setBuying] = useState(false);

  useEffect(() => onEntitlement(() => setUnlimited(hasUnlimitedHints())), []);
  useEffect(() => {
    if (!confirmReset) return;
    const t = setTimeout(() => setConfirmReset(false), 2000);
    return () => clearTimeout(t);
  }, [confirmReset]);

  return (
    <>
      <SubpageHead title="Account" />
      <div className="stack">
        <AccountActions />

        {adsAvailable ? (
          <div className="card-lg row-between">
            <span>
              <b>No ads · Free hints</b>
              <span className="muted small">
                {unlimited ? 'Bought. No ads, every hint free.' : 'No videos, every hint free. Pay once, keep it for good.'}
              </span>
              {!unlimited && (
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
              )}
            </span>
            {unlimited ? (
              <span className="muted small">Unlocked</span>
            ) : (
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
            )}
          </div>
        ) : null}

        <OnOff
          title="Anonymous stats"
          text="Sends puzzle times, hints and where you stop, with no account or device ID. Helps us tune the puzzles."
          value={statsOn}
          onChange={(on) => {
            setStatsOn(on);
            setTelemetryEnabled(on);
          }}
        />

        <div className="card-lg row-between">
          <span>
            <b>Reset progress</b>
            <span className="muted small">{confirmReset ? 'Deletes all solves and streaks on this device. Current dailies, weeklies and monthlies stay solved.' : 'Start over from zero.'}</span>
          </span>
          {confirmReset ? (
            <button
              type="button"
              className="pill danger"
              onClick={() => {
                resetProgressAndAppearance();
                void pushCosmetics();
                setConfirmReset(false);
              }}
            >
              Delete
            </button>
          ) : (
            <button type="button" className="pill outline" onClick={() => setConfirmReset(true)}>
              Reset
            </button>
          )}
        </div>
      </div>
    </>
  );
}
