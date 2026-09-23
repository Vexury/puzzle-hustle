import { useEffect, useState } from 'react';
import { COSMETICS, type Cosmetic } from '@puzzle-hustle/core';
import { BadgeIcon } from '../components/BadgeIcon.tsx';
import { NameCell } from '../components/Board.tsx';
import { CoinPill } from '../components/CoinPill.tsx';
import { toast } from '../components/Toast.tsx';
import { useSession } from '../lib/auth.ts';
import { buyItem, equip, owned, useBalance, useEquipped, type Equipped } from '../lib/coins.ts';
import { readSetting } from '../lib/storage.ts';

const REVERT_MS = 4000;

export function itemState(id: string, ownedIds: Set<string>, equipped: Equipped, balance: number): 'equipped' | 'owned' | 'buyable' | 'locked' {
  if (equipped.badge === id || equipped.flair === id) return 'equipped';
  if (ownedIds.has(id)) return 'owned';
  const item = COSMETICS.find((c) => c.id === id);
  return item && balance >= item.price ? 'buyable' : 'locked';
}

export function Shop() {
  const balance = useBalance();
  const equipped = useEquipped();
  const session = useSession();
  const ownedIds = owned();
  const [armed, setArmed] = useState<string | null>(null);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(null), REVERT_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  const name = session?.player.name ?? readSetting('ph:name') ?? 'You';

  const tap = (item: Cosmetic) => {
    const state = itemState(item.id, ownedIds, equipped, balance);
    if (state === 'equipped') equip(item.kind, null);
    else if (state === 'owned') equip(item.kind, item.id);
    else if (state === 'locked') toast(`${item.price - balance} more coins needed`);
    else if (armed !== item.id) setArmed(item.id);
    else {
      setArmed(null);
      if (buyItem(item.id)) equip(item.kind, item.id);
    }
  };

  const label = (item: Cosmetic) => {
    const state = itemState(item.id, ownedIds, equipped, balance);
    if (state === 'equipped') return 'Equipped';
    if (state === 'owned') return 'Owned';
    return armed === item.id ? 'Buy?' : `${item.price}`;
  };

  return (
    <>
      <section className="page-head">
        <h1>Customize</h1>
        <CoinPill />
      </section>

      <div className="stack">
        <section className="card-lg shop-preview">
          <NameCell entry={{ name, ...equipped }} />
          {!session && <span className="muted small">Badges and flairs show in your groups once you sign in.</span>}
        </section>

        <section className="card-lg">
          <h2>Badges</h2>
          <div className="shop-grid">
            {COSMETICS.filter((c) => c.kind === 'badge').map((item) => (
              <button
                key={item.id}
                type="button"
                className={`shop-tile ${itemState(item.id, ownedIds, equipped, balance)}${armed === item.id ? ' armed' : ''}`}
                onClick={() => tap(item)}
                aria-label={`${item.title}, ${label(item)}`}
              >
                <BadgeIcon id={item.id} className="shop-badge" />
                <span className="small">{label(item)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="card-lg">
          <h2>Flairs</h2>
          <div className="shop-list">
            {COSMETICS.filter((c) => c.kind === 'flair').map((item) => (
              <button
                key={item.id}
                type="button"
                className={`row-card shop-row ${itemState(item.id, ownedIds, equipped, balance)}${armed === item.id ? ' armed' : ''}`}
                onClick={() => tap(item)}
              >
                <span className="row-title">{item.title}</span>
                <span className="small">{label(item)}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
