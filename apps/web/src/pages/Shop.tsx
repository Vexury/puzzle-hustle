import { useEffect, useRef, useState } from 'react';
import {
  ACTIVITY_FLAIRS,
  COSMETICS,
  FLAIRS_BY_TYPE,
  HUSTLE_NAMEPLATES,
  HUSTLE_THEMES,
  hustleSolved,
  NAMEPLATES,
  packProgress,
  PUZZLE_META,
  PUZZLE_TYPES,
  SHOWCASE_SIZE,
  THEMES,
  THEMES_FREE,
  type BadgeCosmetic,
  type FlairCosmetic,
  type NameplateCosmetic,
  type ThemeCosmetic,
} from '@puzzle-hustle/core';
import { BadgeIcon, badgeMotion } from '../components/BadgeIcon.tsx';
import { StandingsRow } from '../components/Board.tsx';
import { NameplateArt, plateClass } from '../components/Nameplate.tsx';
import { CoinPill } from '../components/CoinPill.tsx';
import { toast } from '../components/Toast.tsx';
import { useSession } from '../lib/auth.ts';
import { ACCENTS, ACCENT_NAMES, storedAccent, useAccent } from '../lib/accent.ts';
import { storedSolves } from '../lib/achievements.ts';
import { pushBackGuard } from '../lib/back.ts';
import { buyItem, equip, owned, toggleShowcase, useBalance, useEquipped, type Equipped } from '../lib/coins.ts';
import { requirementText } from '../lib/flairs.ts';
import { readSetting, writeSetting } from '../lib/storage.ts';
import { THEME_PREFS, centerOf, equipPack, tryOnPack, usePack, useTheme, type ThemePref } from '../lib/theme.ts';
import { BackLink } from '../components/BackLink.tsx';
import { Chevron } from '../components/Chevron.tsx';

const REVERT_MS = 4000;
// Cheapest first, earned-only badges last; sort is stable, so equal prices keep their catalogue order.
const BADGES: readonly BadgeCosmetic[] = COSMETICS.filter((c): c is BadgeCosmetic => c.kind === 'badge').sort((a, b) => (a.requires ? 1 : 0) - (b.requires ? 1 : 0) || a.price - b.price);
const FLAIRS: readonly FlairCosmetic[] = COSMETICS.filter((c): c is FlairCosmetic => c.kind === 'flair');
// Bought packs first, then the ones only Hustle gives, in the order they are earned.
const ALL_THEMES: readonly ThemeCosmetic[] = [...THEMES, ...HUSTLE_THEMES];
const ALL_NAMEPLATES: readonly NameplateCosmetic[] = [...NAMEPLATES, ...HUSTLE_NAMEPLATES];

// Badges and flairs fold away so the page stays short; themes stay open, the try-on is the point
// of the page. Closed by default, and each section remembers how it was left.
function ShopSection({ id, title, count, children }: { id: string; title: string; count: string; children: React.ReactNode }) {
  const key = `ph:shop:${id}`;
  const [open, setOpen] = useState(() => readSetting(key) === '1');
  const toggle = () => {
    writeSetting(key, open ? '0' : '1');
    setOpen(!open);
  };
  return (
    <section className="card-lg">
      <h2>
        <button type="button" className="shop-section-head" aria-expanded={open} aria-controls={`shop-${id}`} onClick={toggle}>
          <span className="shop-section-title">{title}</span>
          <span className="shop-section-count">{count}</span>
          <Chevron size={18} />
        </button>
      </h2>
      {open && <div id={`shop-${id}`}>{children}</div>}
    </section>
  );
}

// A tap plays the badge's motion once. An attribute rather than a class, so the re-render that
// follows the tap (armed, owned, equipped) cannot wipe it mid-motion.
function replayMotion(el: HTMLElement) {
  el.removeAttribute('data-tap');
  void el.offsetWidth;
  el.setAttribute('data-tap', '');
}

export function itemState(id: string, ownedIds: Set<string>, equipped: Equipped, balance: number): 'equipped' | 'owned' | 'buyable' | 'locked' {
  if (equipped.badges.includes(id) || equipped.flair === id || equipped.theme === id || equipped.nameplate === id) return 'equipped';
  if (ownedIds.has(id)) return 'owned';
  const item = COSMETICS.find((c) => c.id === id);
  if (!item || item.kind === 'flair' || item.requires) return 'locked';
  return balance >= item.price ? 'buyable' : 'locked';
}

export function Shop() {
  // Same reason as useBalance()/useEquipped() in coins.ts: owned() and storedAccent() read
  // external stores directly and take no arguments, so the compiler can't see them as inputs.
  'use no memo';
  const balance = useBalance();
  const equipped = useEquipped();
  const session = useSession();
  const ownedIds = owned();
  const solves = storedSolves();
  const [armed, setArmed] = useState<string | null>(null);
  const active = usePack();
  const { theme: vexuryMode, pref, setPref } = useTheme();
  const { accent, setAccent } = useAccent();
  const [trying, setTrying] = useState<ThemeCosmetic | null>(null);
  const tryingRef = useRef(trying);
  tryingRef.current = trying;

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(null), REVERT_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  const endTryOn = () => {
    tryOnPack(null);
    setTrying(null);
  };

  // The try-on never outlives the shop: leaving it, backgrounding the app or the back button
  // all put the equipped look back.
  useEffect(() => {
    const blur = () => endTryOn();
    window.addEventListener('appBlur', blur);
    window.addEventListener('pagehide', blur);
    const pop = pushBackGuard(() => {
      if (!tryingRef.current) return false;
      endTryOn();
      return true;
    });
    return () => {
      window.removeEventListener('appBlur', blur);
      window.removeEventListener('pagehide', blur);
      pop();
      tryOnPack(null);
    };
  }, []);

  const tapTheme = (item: ThemeCosmetic | null, event: React.MouseEvent<HTMLElement>) => {
    const origin = centerOf(event.currentTarget);
    if (item === null || ownedIds.has(item.id) || equipped.theme === item.id) {
      setTrying(null);
      equipPack(item?.id ?? null, origin);
      return;
    }
    setTrying(item);
    tryOnPack(item.id, origin);
  };

  const buyTheme = () => {
    if (!trying || (!THEMES_FREE && !buyItem(trying.id))) return;
    setTrying(null);
    equipPack(trying.id);
  };

  const themeLabel = (item: ThemeCosmetic) => {
    const state = itemState(item.id, ownedIds, equipped, balance);
    if (state === 'equipped') return 'Equipped';
    if (state === 'owned') return 'Owned';
    if (item.requires) return `Lv ${item.requires.hustle}`;
    return `${item.price}`;
  };

  const name = session?.player.name ?? readSetting('ph:name') ?? 'You';

  // Owned badges go in and out of the showcase; the first one is the one the standings show.
  const showcase = (id: string) => {
    if (toggleShowcase(id) === 'full') toast(`The showcase holds ${SHOWCASE_SIZE}. Tap one there to take it out.`);
  };

  const tapBadge = (item: BadgeCosmetic) => {
    const state = itemState(item.id, ownedIds, equipped, balance);
    if (state === 'equipped' || state === 'owned') {
      showcase(item.id);
    } else if (state === 'locked') {
      toast(item.requires ? `Reach Hustle level ${item.requires.hustle}` : `${item.price - balance} more coins needed`);
    } else if (armed !== item.id) {
      setArmed(item.id);
    } else {
      setArmed(null);
      if (buyItem(item.id)) showcase(item.id);
    }
  };

  const badgeLabel = (item: BadgeCosmetic) => {
    const state = itemState(item.id, ownedIds, equipped, balance);
    if (state === 'equipped') return `Shown ${equipped.badges.indexOf(item.id) + 1}`;
    if (state === 'owned') return 'Owned';
    if (item.requires) return `Hustle ${item.requires.hustle}`;
    return armed === item.id ? 'Buy?' : `${item.price}`;
  };

  // Like a badge: a first tap on one for sale arms it and shows it in the preview row above, a
  // second buys and wears it. Before launch (THEMES_FREE) every plate can be worn straight away.
  const tapNameplate = (item: NameplateCosmetic) => {
    const state = itemState(item.id, ownedIds, equipped, balance);
    if (state === 'equipped') equip('nameplate', null);
    else if (state === 'owned' || THEMES_FREE) equip('nameplate', item.id);
    else if (item.requires) toast(`Reach Hustle level ${item.requires.hustle}`);
    else if (armed !== item.id) setArmed(item.id);
    else if (state === 'locked') toast(`${item.price - balance} more coins needed`);
    else {
      setArmed(null);
      if (buyItem(item.id)) equip('nameplate', item.id);
    }
  };

  const nameplateLabel = (item: NameplateCosmetic) => {
    const state = itemState(item.id, ownedIds, equipped, balance);
    if (state === 'equipped') return 'Equipped';
    if (state === 'owned') return 'Owned';
    if (item.requires) return `Lv ${item.requires.hustle}`;
    return armed === item.id && state === 'buyable' ? 'Buy?' : `${item.price}`;
  };

  const previewPlate = ALL_NAMEPLATES.some((n) => n.id === armed) ? armed : equipped.nameplate;

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
  // activity flair has no numeric progress to show. Kept separate from flairLabel so the caller
  // can put only this number, not the text labels, in the number font.
  const flairProgress = (item: FlairCosmetic): string | null => {
    if (itemState(item.id, ownedIds, equipped, balance) !== 'locked') return null;
    const req = item.requires;
    if ('achievement' in req || 'hustle' in req) return null;
    const { solved, total } = packProgress(solves, req.pack, req.difficulty);
    return `${solved}/${total}`;
  };

  return (
    <>
      <section className="page-head">
        <div className="head-back">
          <BackLink fallback="/profile" />
          <h1>Customize</h1>
          <CoinPill />
        </div>
      </section>

      <div className="stack">
        <section className="card-lg shop-preview">
          <ol className="leaderboard">
            <StandingsRow entry={{ name, seconds: 24, hints: 0, ...equipped, nameplate: previewPlate, hustle: hustleSolved(solves) }} rank={1} me={false} />
          </ol>
          <div className="showcase-edit">
            <span className="muted small">Showcase · the first one shows in standings</span>
            <div className="showcase-slots">
              {Array.from({ length: SHOWCASE_SIZE }, (_, i) => {
                const id = equipped.badges[i];
                const title = COSMETICS.find((c) => c.id === id)?.title;
                return id ? (
                  <button
                    key={id}
                    type="button"
                    className={`showcase-slot${i === 0 ? ' first' : ''}`}
                    onClick={() => (i === 0 ? showcase(id) : equip('badge', id))}
                    aria-label={i === 0 ? `${title}, shown first, tap to take out` : `${title}, tap to show first`}
                  >
                    <BadgeIcon id={id} className="shop-badge" />
                  </button>
                ) : (
                  <span key={`empty-${i}`} className="showcase-slot empty" aria-hidden="true" />
                );
              })}
            </div>
          </div>
          {!session && <span className="muted small">Badges, flairs and nameplates show in your groups once you sign in.</span>}
        </section>

        {!active && (
          <section className="card-lg">
            <h2>Appearance</h2>
            <span className="muted small">System follows your device setting.</span>
            <div className="segmented three" role="radiogroup" aria-label="Appearance">
              {THEME_PREFS.map((p: ThemePref) => (
                <button key={p} type="button" role="radio" aria-checked={pref === p} className={pref === p ? 'seg active' : 'seg'} onClick={(e) => setPref(p, centerOf(e.currentTarget))}>
                  {p === 'system' ? 'System' : p === 'light' ? 'Light' : 'Dark'}
                </button>
              ))}
            </div>
            <div className="swatches" role="radiogroup" aria-label="Accent color">
              {ACCENTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={accent === a}
                  aria-label={ACCENT_NAMES[a]}
                  title={ACCENT_NAMES[a]}
                  data-accent={a}
                  className="swatch"
                  onClick={() => setAccent(a)}
                />
              ))}
            </div>
            <span className="muted small">{ACCENT_NAMES[accent]}</span>
          </section>
        )}

        <section className="card-lg">
          <h2>Themes</h2>
          {THEMES_FREE && <span className="muted small">Free while in beta. Prices apply from launch.</span>}
          <span className="muted small">{HUSTLE_THEMES.map((t) => t.title).join(', ')}: earned in Hustle, never sold.</span>
          <div className="theme-grid">
            <button
              type="button"
              className={`theme-card${!active && !trying ? ' equipped' : ''}`}
              onClick={(e) => tapTheme(null, e)}
              aria-label={`Vexury, ${equipped.theme ? 'Free' : 'Equipped'}`}
            >
              <MiniBoard mode={vexuryMode} accent={storedAccent()} />
              <b className="small">Vexury</b>
              <span className="small">{!equipped.theme ? 'Equipped' : 'Free'}</span>
            </button>
            {ALL_THEMES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`theme-card ${itemState(item.id, ownedIds, equipped, balance)}${trying?.id === item.id ? ' trying' : ''}`}
                onClick={(e) => tapTheme(item, e)}
                aria-label={`${item.title}, ${themeLabel(item)}`}
              >
                <MiniBoard pack={item} />
                <b className="small">{item.title}</b>
                <span className="small">{themeLabel(item)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="card-lg">
          <h2>Nameplates</h2>
          <span className="muted small">{HUSTLE_NAMEPLATES.map((n) => n.title).join(', ')}: earned in Hustle, never sold.</span>
          <div className="plate-list">
            {ALL_NAMEPLATES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`plate-tile ${itemState(item.id, ownedIds, equipped, balance)}${armed === item.id ? ' armed' : ''}${plateClass(item.id)}`}
                onClick={() => tapNameplate(item)}
                aria-label={`${item.title}, ${nameplateLabel(item)}`}
              >
                <NameplateArt id={item.id} />
                <b className="np-name">{item.title}</b>
                <span className="plate-tile-state">{nameplateLabel(item)}</span>
              </button>
            ))}
          </div>
        </section>

        <ShopSection id="badges" title="Badges" count={`${BADGES.filter((b) => ownedIds.has(b.id)).length}/${BADGES.length}`}>
          <div className="shop-grid">
            {BADGES.map((item, i) => (
              <button
                key={item.id}
                type="button"
                className={`shop-tile ${itemState(item.id, ownedIds, equipped, balance)}${armed === item.id ? ' armed' : ''}`}
                data-motion={badgeMotion(item.id)}
                onClick={(e) => {
                  replayMotion(e.currentTarget);
                  tapBadge(item);
                }}
                onAnimationEnd={(e) => e.animationName.startsWith('badge-tap') && e.currentTarget.removeAttribute('data-tap')}
                aria-label={`${item.title}, ${badgeLabel(item)}`}
              >
                <BadgeIcon id={item.id} className="shop-badge" wave={(Math.floor(i / 4) + (i % 4)) * 0.12} />
                <span className="small">{badgeLabel(item)}</span>
              </button>
            ))}
          </div>
        </ShopSection>

        <ShopSection id="flairs" title="Flairs" count={`${FLAIRS.filter((f) => ownedIds.has(f.id)).length}/${FLAIRS.length}`}>
          <div className="stack">
            {PUZZLE_TYPES.map((type) => (
              <div key={type} className="shop-flair-group">
                <h3 className="shop-flair-heading">{PUZZLE_META[type].name}</h3>
                <div className="shop-flair-tiers">
                  {FLAIRS_BY_TYPE[type].map((item) => {
                    const progress = flairProgress(item);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`shop-tile shop-flair-tile ${itemState(item.id, ownedIds, equipped, balance)}`}
                        onClick={() => tapFlair(item)}
                        aria-label={`${item.title}, ${flairLabel(item)}`}
                      >
                        <span className="row-title">{item.title}</span>
                        <span className="row-sub">{progress ? <span className="shop-flair-progress">{progress}</span> : flairLabel(item)}</span>
                      </button>
                    );
                  })}
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
        </ShopSection>
      </div>

      {trying && (
        <div className="tryon-bar" role="region" aria-label={`Trying ${trying.title}`}>
          <button type="button" className="pill outline" onClick={endTryOn}>
            Back
          </button>
          {THEMES_FREE ? (
            <button type="button" className="pill" onClick={buyTheme}>
              Use free (beta)
            </button>
          ) : trying.requires ? (
            <button type="button" className="pill" disabled>
              Reach Hustle level {trying.requires.hustle}
            </button>
          ) : (
            <button type="button" className="pill" onClick={buyTheme} disabled={balance < trying.price}>
              {balance < trying.price ? `Need ${trying.price - balance} more` : `Buy for ${trying.price}`}
            </button>
          )}
        </div>
      )}
    </>
  );
}

// Nine cells in a pack's own colours: its attributes on this element make the same token block
// apply here as on the whole app. The Vexury card passes its stored mode and accent instead,
// because under a pack the root carries neither.
export function MiniBoard({ pack, mode, accent }: { pack?: ThemeCosmetic; mode?: string; accent?: string }) {
  return (
    <span className="mini-board" data-theme={pack?.mode ?? mode} data-pack={pack?.id} data-accent={pack ? undefined : accent} aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} className={i === 4 ? 'on' : undefined} />
      ))}
    </span>
  );
}
