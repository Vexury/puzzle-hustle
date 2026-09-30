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
import { PuzzleIcon } from '../components/PuzzleIcon.tsx';
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

export function Hustle() {
  useSolves();
  // The level is the highest solved stage; the one to play is above it.
  const level = hustleSolved(storedSolves());
  const stage = level + 1;
  const { type, difficulty } = hustleSlot(stage);
  const [next, ...later] = nextMilestones(level, 5);
  const toGo = next!.n - level;
  const tierEnd = TIER_END[difficulty];
  const reward = (m: Milestone) =>
    m.badge ? 'new badge' : m.flair ? HUSTLE_FLAIRS.find((f) => f.id === m.flair)!.title : `${m.coins} coins`;
  const filled = level % HUSTLE_MILESTONE;

  return (
    <>
      <section className="page-head">
        <h1>Hustle</h1>
      </section>
      <div className="stack">
        <section className="card-lg hustle-card">
          <span className="muted small">Your Hustle level</span>
          <b className="hustle-level">{level}</b>
          <span className="chip">
            {capitalize(difficulty)}
            {tierEnd ? ` · ${tierEnd - level} to ${NEXT_TIER[difficulty]}` : ''}
          </span>
          <div className="hustle-bar" aria-hidden="true">
            {Array.from({ length: HUSTLE_MILESTONE }, (_, i) => (
              <i key={i} className={i < filled ? 'on' : undefined} />
            ))}
            <span className="hustle-node">{next!.badge ? <BadgeIcon id={next!.badge} /> : '🎁'}</span>
          </div>
          <span className="muted small">
            {toGo} more to Lv {next!.n} · {reward(next!)}
          </span>
        </section>

        <section className="card-lg hustle-next">
          <PuzzleIcon type={type} size={48} />
          <span className="hustle-next-text">
            <b>Next: {PUZZLE_META[type].name}</b>
            <span className="muted small">
              Stage {stage} · {capitalize(difficulty)}
            </span>
          </span>
          <a className="pill" href={href(`/play?${encodeRef(hustleRef(stage))}`)} onClick={onLinkClick}>
            Play
          </a>
        </section>

        <section className="card-lg">
          <h2>Next milestones</h2>
          <ul className="hustle-milestones">
            {[next!, ...later].map((m) => (
              <li key={m.n} className={m.badge || m.flair ? 'special' : undefined}>
                <span className="hustle-node">{m.badge ? <BadgeIcon id={m.badge} /> : m.flair ? '♦' : '🎁'}</span>
                <span className="small">{m.n}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
