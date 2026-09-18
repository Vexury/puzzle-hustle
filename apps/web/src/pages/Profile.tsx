import { useState } from 'react';
import { PUZZLE_META, PUZZLE_TYPES } from '@puzzle-hustle/core';
import { Flame } from './Daily.tsx';
import { readSetting, useSolves, writeSetting } from '../lib/storage.ts';
import { formatSeconds } from '../lib/share.ts';
import { dailyStreaks, totalSolved, typeStats } from '../lib/stats.ts';
import { useTheme } from '../lib/theme.ts';

export function Profile() {
  const solves = useSolves();
  const streaks = dailyStreaks(solves);
  const stats = typeStats(solves);
  const [theme, toggleTheme] = useTheme();
  const [name, setName] = useState(readSetting('ph:name') ?? '');
  const [editing, setEditing] = useState(false);

  const commitName = () => {
    const v = name.trim().slice(0, 24);
    setName(v);
    writeSetting('ph:name', v);
    setEditing(false);
  };

  return (
    <>
      <header className="page-head">
        <h1>Profile</h1>
      </header>

      <div className="stack">
        <div className="card-lg">
          <span className="label">Display name</span>
          {editing ? (
            <form
              className="name-form"
              onSubmit={(e) => {
                e.preventDefault();
                commitName();
              }}
            >
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} maxLength={24} placeholder="Your name" />
            </form>
          ) : (
            <button type="button" className="name-btn" onClick={() => setEditing(true)}>
              {name || 'Add a name'} <span className="muted">✎</span>
            </button>
          )}
        </div>

        <div className="card-lg streak-card">
          <span className="streak-badge">
            <Flame />
          </span>
          <span>
            <b>{streaks.perfect}-day perfect streak</b>
            <span className="muted small">
              All {PUZZLE_TYPES.length} dailies every day · best {streaks.bestPerfect}
            </span>
          </span>
        </div>

        <div className="stat-grid">
          <Stat value={streaks.current} label="day streak" flame />
          <Stat value={streaks.best} label="best streak" />
          <Stat value={streaks.daysPlayed} label="days played" />
          <Stat value={totalSolved(solves)} label="puzzles solved" />
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

        <div className="card-lg row-between">
          <span>
            <b>Appearance</b>
            <span className="muted small">{theme === 'dark' ? 'Dark' : 'Light'}</span>
          </span>
          <button type="button" className="pill outline" onClick={toggleTheme}>
            Switch to {theme === 'dark' ? 'light' : 'dark'}
          </button>
        </div>

        <p className="muted small center">
          Progress is stored on this device. Sign-in and sync will come later. ·{' '}
          <a href="https://vexury.dev" target="_blank" rel="noreferrer">
            vexury.dev
          </a>
        </p>
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
