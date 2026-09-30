import { DAILY_TYPES, PUZZLE_META } from '@puzzle-hustle/core';
import { Flame } from './Daily.tsx';
import { formatSeconds } from '../lib/share.ts';
import { useSolves } from '../lib/storage.ts';
import { dailyStreaks, totalSolved, typeStats } from '../lib/stats.ts';
import { SubpageHead } from '../components/SubpageHead.tsx';

export function Stats() {
  const solves = useSolves();
  const streaks = dailyStreaks(solves);
  const stats = typeStats(solves);

  return (
    <>
      <SubpageHead title="Stats" />
      <div className="stack">
        <div className="stat-grid">
          <Stat value={streaks.current} label="day streak" flame />
          <Stat value={streaks.best} label="best streak" />
          <Stat value={streaks.daysPlayed} label="days played" />
          <Stat value={totalSolved(solves)} label="puzzles solved" />
        </div>

        <div className="card-lg streak-card">
          <span className="streak-badge">
            <Flame />
          </span>
          <span>
            <b>
              {streaks.perfectDays} perfect {streaks.perfectDays === 1 ? 'day' : 'days'}
            </b>
            <span className="muted small">All {DAILY_TYPES.length} dailies in one day</span>
          </span>
        </div>

        <div className="card-lg">
          <h2>By puzzle</h2>
          <table className="stat-table">
            <tbody>
              {stats.map((s) => (
                <tr key={s.type}>
                  <td>{PUZZLE_META[s.type].name}</td>
                  <td className="num">{s.solved} solved</td>
                  <td className="num muted">{s.averageSeconds === null ? '–' : `avg ${formatSeconds(s.averageSeconds)}`}</td>
                  <td className="num muted">{s.bestSeconds === null ? '' : `best ${formatSeconds(s.bestSeconds)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Stat({ value, label, flame }: { value: number; label: string; flame?: boolean }) {
  return (
    <div className="stat">
      <b>
        {flame && <Flame />}
        {value}
      </b>
      <span className="muted small">{label}</span>
    </div>
  );
}
