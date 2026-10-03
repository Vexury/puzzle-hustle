import { useEffect, useState } from 'react';
import { OnOff } from './Gameplay.tsx';
import { pushCosmetics } from '../lib/coins.ts';
import { setTelemetryEnabled, telemetryEnabled } from '../lib/telemetry.ts';
import { useSession } from '../lib/auth.ts';
import { resetAccount } from '../lib/sync.ts';
import { AccountActions } from '../components/AccountCard.tsx';
import { useUnlimited } from '../components/PurchaseCard.tsx';
import { SubpageHead } from '../components/SubpageHead.tsx';

export function Account() {
  const signedIn = useSession() !== null;
  const [statsOn, setStatsOn] = useState(telemetryEnabled);
  const [confirmReset, setConfirmReset] = useState(false);
  const unlimited = useUnlimited();

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

        {unlimited && (
          <div className="card-lg row-between">
            <span>
              <b>No ads · Free hints</b>
              <span className="muted small">Bought. No ads, every hint free, double coins.</span>
            </span>
            <span className="muted small">Unlocked</span>
          </div>
        )}

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
            <span className="muted small">
              {confirmReset
                ? signedIn
                  ? 'Deletes all solves, streaks, coins and items on all your devices. Current dailies, weeklies and monthlies stay solved.'
                  : 'Deletes all solves and streaks on this device. Current dailies, weeklies and monthlies stay solved.'
                : 'Start over from zero.'}
            </span>
          </span>
          {confirmReset ? (
            <button
              type="button"
              className="pill danger"
              onClick={() => {
                resetAccount();
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
