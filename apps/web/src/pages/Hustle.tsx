import {
  encodeRef,
  hustleSolved,
  hustleMilestoneCoins,
  hustleRef,
  hustleSlot,
  HUSTLE_BADGES,
  HUSTLE_FLAIRS,
  HUSTLE_MILESTONE,
  PUZZLE_META,
} from '@puzzle-hustle/core';
import type { CSSProperties } from 'react';
import { BadgeIcon } from '../components/BadgeIcon.tsx';
import { PuzzleIcon } from '../components/PuzzleIcon.tsx';
import { CoinIcon } from '../components/SolvedCard.tsx';
import { storedSolves } from '../lib/achievements.ts';
import { href, onLinkClick } from '../lib/router.ts';
import { capitalize } from '../lib/share.ts';
import { useSolves } from '../lib/storage.ts';

const TIER_END: Record<string, number | null> = { easy: 40, medium: 120, hard: 300, genius: null };
const NEXT_TIER: Record<string, string> = { easy: 'Medium', medium: 'Hard', hard: 'Genius' };
const TIERS = ['easy', 'medium', 'hard', 'genius'] as const;

type Milestone = { n: number; coins: number; badge?: string; flair?: string };

// The milestones above the highest solved stage.
export function nextMilestones(solved: number, count: number): Milestone[] {
  const out: Milestone[] = [];
  for (let n = (Math.floor(solved / HUSTLE_MILESTONE) + 1) * HUSTLE_MILESTONE; out.length < count; n += HUSTLE_MILESTONE) {
    const badge = HUSTLE_BADGES.find((b) => b.requires!.hustle === n)?.id;
    const flair = HUSTLE_FLAIRS.find((f) => 'hustle' in f.requires && f.requires.hustle === n)?.id;
    out.push({ n, coins: hustleMilestoneCoins(n), ...(badge ? { badge } : {}), ...(flair ? { flair } : {}) });
  }
  return out;
}

const flairTitle = (id: string) => HUSTLE_FLAIRS.find((f) => f.id === id)!.title;
const badgeTitle = (id: string) => HUSTLE_BADGES.find((b) => b.id === id)!.title;

// Sized by the font size of its box.
function MilestoneIcon({ m }: { m: Milestone }) {
  if (m.badge) return <BadgeIcon id={m.badge} />;
  if (m.flair) return <span className="hustle-flair-mark">♦</span>;
  return <CoinIcon />;
}

export function Hustle() {
  useSolves();
  // The level is the highest solved stage; the one to play is above it.
  const level = hustleSolved(storedSolves());
  const stage = level + 1;
  const { type, difficulty } = hustleSlot(stage);
  const upcoming = nextMilestones(level, 5);
  const next = upcoming[0]!;
  const toGo = next.n - level;
  const tierEnd = TIER_END[difficulty];
  const filled = level % HUSTLE_MILESTONE;
  const tierIndex = TIERS.indexOf(difficulty as (typeof TIERS)[number]);
  const owned = [...HUSTLE_BADGES, ...HUSTLE_FLAIRS].filter((c) => level >= hustleNeeded(c)).length;
  const nextName = next.badge ? `${badgeTitle(next.badge)} badge` : next.flair ? `"${flairTitle(next.flair)}"` : null;

  return (
    <>
      <section className="page-head">
        <h1>Hustle</h1>
      </section>
      <div className="stack">
        <section className="card-lg hustle-card">
          <div className="hustle-hero">
            <div className="hustle-ring" style={{ '--p': `${(filled / HUSTLE_MILESTONE) * 100}%` } as CSSProperties}>
              <b className="hustle-level">{level}</b>
              <small>Level</small>
            </div>
            <div className="hustle-hero-text">
              <b className="hustle-tier-name">{capitalize(difficulty)} tier</b>
              <div className="hustle-tiers" aria-hidden="true">
                {TIERS.map((t, i) => (
                  <span key={t} className={i < tierIndex ? 'done' : i === tierIndex ? 'cur' : undefined}>
                    {t}
                  </span>
                ))}
              </div>
              <span className="muted small">
                {tierEnd ? `${tierEnd - level} stages to ${NEXT_TIER[difficulty]}` : 'The top tier, from here on'}
              </span>
            </div>
          </div>
          <div className="hustle-reward">
            <span className="hustle-reward-icon">
              <MilestoneIcon m={next} />
            </span>
            <span className="hustle-reward-text">
              <span className="muted small">
                {toGo} more to Lv {next.n}
              </span>
              <b>
                {nextName ? (
                  <>
                    {nextName} +{' '}
                    <span className="hustle-coins">
                      {next.coins} <CoinIcon />
                    </span>
                  </>
                ) : (
                  `${next.coins} coins`
                )}
              </b>
              <span className="hustle-bar" aria-hidden="true">
                {Array.from({ length: HUSTLE_MILESTONE }, (_, i) => (
                  <i key={i} className={i < filled ? 'on' : undefined} />
                ))}
              </span>
            </span>
          </div>
        </section>

        <section className="card-lg hustle-next">
          <PuzzleIcon type={type} size={48} />
          <span className="hustle-next-text">
            <b>
              Stage {stage} · {PUZZLE_META[type].name}
            </b>
            <span className="muted small">{capitalize(difficulty)}</span>
          </span>
          <a className="pill" href={href(`/play?${encodeRef(hustleRef(stage))}`)} onClick={onLinkClick}>
            Play
          </a>
        </section>

        <section className="card-lg">
          <h2>Coming up</h2>
          <ul className="hustle-upcoming">
            {upcoming.map((m) => (
              <li key={m.n} className={m.badge || m.flair ? 'special' : undefined}>
                <span className="hustle-upcoming-lv">Lv {m.n}</span>
                <span className="hustle-upcoming-icon">
                  <MilestoneIcon m={m} />
                </span>
                <b>{m.badge ? badgeTitle(m.badge) : m.flair ? flairTitle(m.flair) : `+${m.coins}`}</b>
                <span className="small muted hustle-coins-line">
                  {m.badge ? 'Badge + ' : m.flair ? 'Flair + ' : 'Coins'}
                  {m.badge || m.flair ? (
                    <>
                      {m.coins} <CoinIcon />
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card-lg">
          <h2>
            Hustle collection{' '}
            <span className="muted small">
              {owned} of {HUSTLE_BADGES.length + HUSTLE_FLAIRS.length}
            </span>
          </h2>
          <ul className="hustle-badges">
            {HUSTLE_BADGES.map((b) => (
              <li key={b.id} className={level >= hustleNeeded(b) ? 'own' : undefined} title={b.title}>
                <BadgeIcon id={b.id} />
                <span className="hustle-req">{hustleNeeded(b)}</span>
              </li>
            ))}
          </ul>
          <ul className="hustle-flairs">
            {HUSTLE_FLAIRS.map((f) =>
              level >= hustleNeeded(f) ? (
                <li key={f.id} className="own">
                  {f.title} ✓
                </li>
              ) : (
                <li key={f.id}>
                  {f.title} · {hustleNeeded(f)}
                </li>
              ),
            )}
          </ul>
        </section>
      </div>
    </>
  );
}

function hustleNeeded(c: { requires?: unknown }): number {
  const r = c.requires as { hustle?: number } | undefined;
  return r?.hustle ?? 0;
}
