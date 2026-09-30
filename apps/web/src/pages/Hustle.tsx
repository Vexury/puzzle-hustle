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
import { BadgeIcon } from '../components/BadgeIcon.tsx';
import { CoinPill } from '../components/CoinPill.tsx';
import { PuzzleIcon } from '../components/PuzzleIcon.tsx';
import { CoinIcon } from '../components/SolvedCard.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { storedSolves } from '../lib/achievements.ts';
import { href, onLinkClick } from '../lib/router.ts';
import { capitalize } from '../lib/share.ts';
import { useSolves } from '../lib/storage.ts';

const TIER_END: Record<string, number | null> = { easy: 40, medium: 120, hard: 300, genius: null };
const NEXT_TIER: Record<string, string> = { easy: 'Medium', medium: 'Hard', hard: 'Genius' };

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

// Every badge and flair Hustle pays out, in the order they are earned.
const REWARDS = [
  ...HUSTLE_BADGES.map((b) => ({ id: b.id, title: `${b.title} badge`, kind: 'Badge', badge: b.id, n: hustleNeeded(b) })),
  ...HUSTLE_FLAIRS.map((f) => ({ id: f.id, title: f.title, kind: 'Flair', badge: undefined, n: hustleNeeded(f) })),
].sort((a, b) => a.n - b.n);

// Sized by the font size of its box.
function MilestoneIcon({ m }: { m: { badge?: string | undefined; flair?: string | undefined } }) {
  if (m.badge) return <BadgeIcon id={m.badge} />;
  if (m.flair) return <span className="hustle-flair-mark">♦</span>;
  return <CoinIcon />;
}

function HustleMark() {
  return (
    <svg className="hustle-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 20h4v-5h4v-5h4V5h6" />
      <path d="M17 5h4v4" />
    </svg>
  );
}

export function Hustle() {
  useSolves();
  // The level is the highest solved stage; the one to play is above it.
  const level = hustleSolved(storedSolves());
  const stage = level + 1;
  const { type, difficulty } = hustleSlot(stage);
  const next = nextMilestones(level, 1)[0]!;
  const toGo = next.n - level;
  const tierEnd = TIER_END[difficulty];
  const filled = level % HUSTLE_MILESTONE;
  const owned = REWARDS.filter((r) => level >= r.n).length;
  const nextName = next.badge ? `${badgeTitle(next.badge)} badge` : next.flair ? flairTitle(next.flair) : null;

  return (
    <>
      <header className="page-head">
        <h1>Hustle</h1>
        <p className="muted">Endless puzzles, harder as you climb.</p>
        <div className="head-actions">
          <CoinPill />
          <ThemeToggle />
        </div>
      </header>

      <section className={`streak-hero hustle-hero${level > 0 ? ' has-streak' : ''}`}>
        <div className="streak-hero-top">
          <div className="streak-count">
            <HustleMark />
            <div>
              <b className="hustle-level">{level}</b>
              <span>hustle level</span>
            </div>
          </div>
          <div className="streak-timer">
            <b>{capitalize(difficulty)}</b>
            {tierEnd ? `${tierEnd - level} to ${NEXT_TIER[difficulty]}` : 'top tier'}
          </div>
        </div>
        <div className="daily-progress" role="progressbar" aria-valuemin={0} aria-valuemax={HUSTLE_MILESTONE} aria-valuenow={filled}>
          <div className="track">
            <span className="fill" style={{ width: `${(filled / HUSTLE_MILESTONE) * 100}%` }} />
            <span className="goal-badge">
              <MilestoneIcon m={next} />
            </span>
          </div>
          <span className="small hustle-caption">
            {filled}/{HUSTLE_MILESTONE} · {toGo} more for {nextName ? `${nextName} + ` : '+'}
            {next.coins} <CoinIcon />
          </span>
        </div>
      </section>

      <div className="stack">
        <a className="row-card" href={href(`/play?${encodeRef(hustleRef(stage))}`)} onClick={onLinkClick}>
          <span className="row-icon">
            <PuzzleIcon type={type} />
          </span>
          <span className="row-text">
            <span className="row-title">{PUZZLE_META[type].name}</span>
            <span className="row-sub">
              Stage {stage} · {capitalize(difficulty)}
            </span>
          </span>
          <span className="pill">Play</span>
        </a>
      </div>

      <h2 className="section-h">Rewards</h2>
      <p className="muted small section-sub">
        {owned} of {REWARDS.length} earned
      </p>
      <section className="card-lg">
        <ul className="hustle-rewards">
          {REWARDS.map((r) => (
            <li key={r.id} className={level >= r.n ? 'own' : undefined}>
              <span className="hustle-reward-icon">
                <MilestoneIcon m={r.badge ? { badge: r.badge } : { flair: r.id }} />
              </span>
              <span className="row-text">
                <b>{r.title}</b>
                <span className="row-sub">
                  {r.kind} · Lv {r.n}
                </span>
              </span>
              {level >= r.n ? (
                <span className="hustle-owned" role="img" aria-label="Earned">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5.5 12.25L10 16.75L18.5 7.25" />
                  </svg>
                </span>
              ) : (
                <span className="small muted">{r.n - level} to go</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function hustleNeeded(c: { requires?: unknown }): number {
  const r = c.requires as { hustle?: number } | undefined;
  return r?.hustle ?? 0;
}
