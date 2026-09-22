import { ACHIEVEMENTS, type AchievementGroup } from '@puzzle-hustle/core';
import { currentUnlocked } from '../lib/achievements.ts';

const GROUPS: { id: AchievementGroup; title: string }[] = [
  { id: 'arrival', title: 'Getting started' },
  { id: 'habit', title: 'Habit' },
  { id: 'skill', title: 'Skill' },
  { id: 'volume', title: 'Volume' },
  { id: 'oddity', title: 'Odd hours' },
];

export function Achievements() {
  const unlocked = currentUnlocked();
  return (
    <>
      <section className="page-head">
        <h1>Achievements</h1>
        <p className="muted small">
          {unlocked.size} of {ACHIEVEMENTS.length} earned
        </p>
      </section>

      {GROUPS.map((group) => (
        <section key={group.id} className="card-lg">
          <h2>{group.title}</h2>
          {ACHIEVEMENTS.filter((a) => a.group === group.id).map((a) => (
            <div key={a.id} className={unlocked.has(a.id) ? 'achievement earned' : 'achievement'}>
              <span className="achievement-mark" aria-hidden="true">
                {unlocked.has(a.id) ? '★' : '☆'}
              </span>
              <span className="achievement-text">
                <span className="achievement-title">{a.title}</span>
                <span className="row-sub">{a.description}</span>
              </span>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
