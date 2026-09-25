import { useEffect, useRef, useState } from 'react';
import {
  ACHIEVEMENT_COINS,
  ACHIEVEMENTS,
  ACTIVITY_FLAIRS,
  PUZZLE_META,
  PUZZLE_TYPES,
  type Achievement,
  type AchievementProgress,
  type PuzzleTypeId,
} from '@puzzle-hustle/core';
import { almostThere, currentProgress, currentUnlocked } from '../lib/achievements.ts';
import { pushBackGuard } from '../lib/back.ts';
import { AchievementIcon } from '../components/AchievementIcon.tsx';
import { CoinPill } from '../components/CoinPill.tsx';

type Filter = 'all' | 'general' | PuzzleTypeId;

const FLAIR_OF = new Map(
  ACTIVITY_FLAIRS.flatMap((f) => ('achievement' in f.requires ? [[f.requires.achievement, f.title] as const] : [])),
);

function matches(a: Achievement, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'general') return !a.type;
  return a.type === filter;
}

export function Achievements() {
  const unlocked = currentUnlocked();
  const progress = currentProgress();
  const byId = new Map(progress.map((p) => [p.id, p]));
  const next = almostThere(progress, unlocked);
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Achievement | null>(null);

  const share = (p: AchievementProgress | undefined) => (p ? p.current / p.target : undefined);
  const chips: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'general', label: 'General' },
    ...PUZZLE_TYPES.map((t) => ({ id: t, label: PUZZLE_META[t].name })),
  ];

  return (
    <>
      <section className="page-head">
        <h1>Achievements</h1>
        <p className="muted small">
          {unlocked.size} of {ACHIEVEMENTS.length} earned
        </p>
        <CoinPill />
      </section>
      <div className="ach-total" aria-hidden="true">
        <i style={{ width: `${(unlocked.size / ACHIEVEMENTS.length) * 100}%` }} />
      </div>

      {next.length > 0 && (
        <section className="ach-next">
          <h2>Almost there</h2>
          <div className="ach-next-row">
            {next.map((p) => {
              const a = ACHIEVEMENTS.find((x) => x.id === p.id)!;
              return (
                <button key={p.id} type="button" className="card-lg ach-next-card" onClick={() => setOpen(a)}>
                  <AchievementIcon achievement={a} earned={false} share={share(p)} size={40} />
                  <b>{a.title}</b>
                  <span className="muted small">
                    {p.current}/{p.target}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="ach-chips" role="tablist" aria-label="Filter achievements">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={filter === c.id}
            className={filter === c.id ? 'ach-chip active' : 'ach-chip'}
            onClick={() => setFilter(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <section className="card-lg ach-cabinet">
        {ACHIEVEMENTS.filter((a) => matches(a, filter)).map((a) => (
          <button key={a.id} type="button" className="ach-badge" onClick={() => setOpen(a)}>
            <AchievementIcon achievement={a} earned={unlocked.has(a.id)} share={share(byId.get(a.id))} />
            <span className="ach-badge-title">{a.title}</span>
          </button>
        ))}
      </section>

      {open && (
        <AchievementCard
          achievement={open}
          earned={unlocked.has(open.id)}
          progress={byId.get(open.id)}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function AchievementCard({
  achievement,
  earned,
  progress,
  onClose,
}: {
  achievement: Achievement;
  earned: boolean;
  progress: AchievementProgress | undefined;
  onClose: () => void;
}) {
  // Pushed once and read through a ref, as lib/back.ts asks: re-pushing on every render would
  // lift this guard above one pushed later by something else.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(
    () =>
      pushBackGuard(() => {
        close.current();
        return true;
      }),
    [],
  );
  const flair = FLAIR_OF.get(achievement.id);

  return (
    <div className="ad-ask" role="dialog" aria-modal="true" aria-label={achievement.title} onClick={onClose}>
      <div className="card-lg ach-card" onClick={(e) => e.stopPropagation()}>
        <AchievementIcon
          achievement={achievement}
          earned={earned}
          share={progress ? progress.current / progress.target : undefined}
          size={72}
        />
        <span className="unlock-eyebrow">{earned ? 'Earned' : 'Locked'}</span>
        <b className="unlock-title">{achievement.title}</b>
        <span className="muted unlock-desc">{achievement.description}</span>
        {!earned && progress && (
          <span className="small">
            {progress.current}/{progress.target}
          </span>
        )}
        <span className="coin-line">+{ACHIEVEMENT_COINS} coins</span>
        {flair && <span className="unlock-flair-action">Flair: {flair}</span>}
        <div className="ad-ask-row">
          <button type="button" className="pill" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
