import { useEffect, useState } from 'react';
import {
  ACHIEVEMENTS,
  ACTIVITY_FLAIRS,
  COSMETICS,
  FLAIRS_BY_TYPE,
  levelList,
  packProgress,
  PUZZLE_META,
  PUZZLE_TYPES,
  type BadgeCosmetic,
  type FlairCosmetic,
} from '@puzzle-hustle/core';
import { BadgeIcon } from '../components/BadgeIcon.tsx';
import { NameCell } from '../components/Board.tsx';
import { CoinPill } from '../components/CoinPill.tsx';
import { toast } from '../components/Toast.tsx';
import { useSession } from '../lib/auth.ts';
import { storedSolves } from '../lib/achievements.ts';
import { buyItem, equip, owned, useBalance, useEquipped, type Equipped } from '../lib/coins.ts';
import { readSetting } from '../lib/storage.ts';

const REVERT_MS = 4000;
const BADGES: readonly BadgeCosmetic[] = COSMETICS.filter((c): c is BadgeCosmetic => c.kind === 'badge');

export function itemState(id: string, ownedIds: Set<string>, equipped: Equipped, balance: number): 'equipped' | 'owned' | 'buyable' | 'locked' {
  if (equipped.badge === id || equipped.flair === id) return 'equipped';
  if (ownedIds.has(id)) return 'owned';
  const item = COSMETICS.find((c) => c.id === id);
  if (!item || item.kind === 'flair') return 'locked';
  return balance >= item.price ? 'buyable' : 'locked';
}

function requirementText(item: FlairCosmetic): string {
  const req = item.requires;
  if ('achievement' in req) return ACHIEVEMENTS.find((a) => a.id === req.achievement)?.description ?? '';
  const difficulty = req.difficulty.charAt(0).toUpperCase() + req.difficulty.slice(1);
  return `Finish all ${levelList(req.pack, req.difficulty).length} ${PUZZLE_META[req.pack].name} levels on ${difficulty}.`;
}

export function Shop() {
  const balance = useBalance();
  const equipped = useEquipped();
  const session = useSession();
  const ownedIds = owned();
  const solves = storedSolves();
  const [armed, setArmed] = useState<string | null>(null);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(null), REVERT_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  const name = session?.player.name ?? readSetting('ph:name') ?? 'You';

  const tapBadge = (item: BadgeCosmetic) => {
    const state = itemState(item.id, ownedIds, equipped, balance);
    if (state === 'equipped') {
      equip('badge', null);
    } else if (state === 'owned') {
      equip('badge', item.id);
    } else if (state === 'locked') {
      toast(`${item.price - balance} more coins needed`);
    } else if (armed !== item.id) {
      setArmed(item.id);
    } else {
      setArmed(null);
      if (buyItem(item.id)) equip('badge', item.id);
    }
  };

  const badgeLabel = (item: BadgeCosmetic) => {
    const state = itemState(item.id, ownedIds, equipped, balance);
    if (state === 'equipped') return 'Equipped';
    if (state === 'owned') return 'Owned';
    return armed === item.id ? 'Buy?' : `${item.price}`;
  };

  // Flairs are never bought: earned equips or unequips on a single tap, locked only offers a
  // toast explaining how to earn it.
  const tapFlair = (item: FlairCosmetic) => {
    const state = itemState(item.id, ownedIds, equipped, balance);
    if (state === 'equipped') equip('flair', null);
    else if (state === 'owned') equip('flair', item.id);
    else toast(requirementText(item));
  };

  const flairLabel = (item: FlairCosmetic) => {
    const state = itemState(item.id, ownedIds, equipped, balance);
    if (state === 'equipped') return 'Equipped';
    if (state === 'owned') return 'Earned';
    return 'Locked';
  };

  // A locked pack flair shows its "solved/total" progress instead of just "Locked"; a locked
  // activity flair has no numeric progress to show.
  const flairSub = (item: FlairCosmetic) => {
    if (itemState(item.id, ownedIds, equipped, balance) !== 'locked') return flairLabel(item);
    const req = item.requires;
    if ('achievement' in req) return flairLabel(item);
    const { solved, total } = packProgress(solves, req.pack, req.difficulty);
    return `${solved}/${total}`;
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
            {BADGES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`shop-tile ${itemState(item.id, ownedIds, equipped, balance)}${armed === item.id ? ' armed' : ''}`}
                onClick={() => tapBadge(item)}
                aria-label={`${item.title}, ${badgeLabel(item)}`}
              >
                <BadgeIcon id={item.id} className="shop-badge" />
                <span className="small">{badgeLabel(item)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="card-lg">
          <h2>Flairs</h2>
          <div className="stack">
            {PUZZLE_TYPES.map((type) => (
              <div key={type} className="shop-flair-group">
                <h3 className="shop-flair-heading">{PUZZLE_META[type].name}</h3>
                <div className="shop-flair-tiers">
                  {FLAIRS_BY_TYPE[type].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`shop-tile shop-flair-tile ${itemState(item.id, ownedIds, equipped, balance)}`}
                      onClick={() => tapFlair(item)}
                      aria-label={`${item.title}, ${flairLabel(item)}`}
                    >
                      <span className="row-title">{item.title}</span>
                      <span className="row-sub">{flairSub(item)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="shop-flair-group">
              <h3 className="shop-flair-heading">Activity</h3>
              <div className="shop-list">
                {ACTIVITY_FLAIRS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`row-card shop-row ${itemState(item.id, ownedIds, equipped, balance)}`}
                    onClick={() => tapFlair(item)}
                  >
                    <span className="row-title">{item.title}</span>
                    <span className="small">{flairLabel(item)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
