import { describe, expect, it } from 'vitest';
import { PUZZLE_TYPES } from '../src/types.ts';
import { levelList } from '../src/levels.ts';
import { ACHIEVEMENTS, ACHIEVEMENTS_EPOCH, unlockedAchievements, type SolveEntry } from '../src/achievements.ts';

const EPOCH = Date.parse('2026-01-01T00:00:00Z');

// Berlin noon: far from any day boundary, and outside both night windows.
function solve(id: string, day = '2026-06-01', hour = 12, hints = 0): SolveEntry {
  return { id, solvedAt: Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00`), seconds: 60, hints, moves: 30 };
}

function dailies(day: string, count: number, hints = 0): SolveEntry[] {
  return PUZZLE_TYPES.slice(0, count).map((t) => solve(`${t}:daily:${day}`, day, 12, hints));
}

const unlocked = (s: SolveEntry[]) => unlockedAchievements(s, EPOCH);

describe('unlockedAchievements', () => {
  it('has a definition for every id it can return, and no duplicates', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ACHIEVEMENTS.length).toBe(17);
    for (const a of ACHIEVEMENTS) {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.description.length).toBeGreaterThan(0);
    }
  });

  it('gives nothing for an empty history', () => {
    expect(unlocked([]).size).toBe(0);
  });

  it('ignores solves from before the epoch', () => {
    const before = PUZZLE_TYPES.map((t) => solve(`${t}:daily:2025-06-01`, '2025-06-01'));
    expect(unlocked(before).size).toBe(0);
    const after = PUZZLE_TYPES.map((t) => solve(`${t}:daily:2026-06-01`));
    expect(unlocked(after).has('every-type')).toBe(true);
  });

  it('every-type wants one of each, in any mode', () => {
    const mixed = PUZZLE_TYPES.map((t, i) =>
      i % 2 === 0 ? solve(`${t}:daily:2026-06-01`) : solve(`${t}:medium:1a2b${i}`),
    );
    expect(unlocked(mixed).has('every-type')).toBe(true);
    expect(unlocked(mixed.slice(0, -1)).has('every-type')).toBe(false);
  });

  it('first-weekly, first-monthly and first-genius', () => {
    expect(unlocked([solve('sudoku:weekly:2026-W23')]).has('first-weekly')).toBe(true);
    expect(unlocked([solve('sudoku:monthly:2026-06')]).has('first-monthly')).toBe(true);
    // A monthly is genius by schedule, so a level makes the point without overlap.
    expect(unlocked([solve('shapes:level:genius:1')]).has('first-genius')).toBe(true);
    expect(unlocked([solve('shapes:level:easy:1')]).has('first-genius')).toBe(false);
  });

  it('the streak achievements', () => {
    const run = (days: number) => {
      const out: SolveEntry[] = [];
      for (let i = 0; i < days; i++) {
        const d = new Date(Date.parse('2026-06-01T12:00:00Z') + i * 86400000).toISOString().slice(0, 10);
        out.push(...dailies(d, PUZZLE_TYPES.length));
      }
      return out;
    };
    expect(unlocked(run(2)).has('streak-3')).toBe(false);
    expect(unlocked(run(3)).has('streak-3')).toBe(true);
    expect(unlocked(run(7)).has('streak-7')).toBe(true);
    expect(unlocked(run(7)).has('perfect-week')).toBe(true);
    expect(unlocked(run(29)).has('streak-30')).toBe(false);
    expect(unlocked(run(30)).has('streak-30')).toBe(true);
  });

  it('the skill achievements', () => {
    expect(unlocked([solve('zip:daily:2026-06-01')]).has('daily-no-hint')).toBe(true);
    expect(unlocked([solve('zip:daily:2026-06-01', '2026-06-01', 12, 1)]).has('daily-no-hint')).toBe(false);

    const full = dailies('2026-06-01', PUZZLE_TYPES.length);
    expect(unlocked(full).has('perfect-day')).toBe(true);
    expect(unlocked(full).has('perfect-day-no-hint')).toBe(true);

    const hinted = dailies('2026-06-02', PUZZLE_TYPES.length, 1);
    expect(unlocked(hinted).has('perfect-day')).toBe(true);
    expect(unlocked(hinted).has('perfect-day-no-hint')).toBe(false);
  });

  it('pack-complete wants every level of one type at one difficulty', () => {
    const n = levelList('zip', 'easy').length;
    const all = Array.from({ length: n }, (_, i) => solve(`zip:level:easy:${i + 1}`));
    expect(unlocked(all).has('pack-complete')).toBe(true);
    expect(unlocked(all.slice(0, -1)).has('pack-complete')).toBe(false);
  });

  it('the volume achievements', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => solve(`zip:medium:seed${i}`));
    expect(unlocked(many(49)).has('solved-50')).toBe(false);
    expect(unlocked(many(50)).has('solved-50')).toBe(true);
    expect(unlocked(many(250)).has('solved-250')).toBe(true);
    expect(unlocked(many(1000)).has('solved-1000')).toBe(true);
  });

  it('night-owl and early-bird read the device clock, and only count dailies', () => {
    expect(unlocked([solve('zip:daily:2026-06-01', '2026-06-01', 1)]).has('night-owl')).toBe(true);
    expect(unlocked([solve('zip:daily:2026-06-01', '2026-06-01', 5)]).has('night-owl')).toBe(false);
    expect(unlocked([solve('zip:daily:2026-06-01', '2026-06-01', 5)]).has('early-bird')).toBe(true);
    expect(unlocked([solve('zip:daily:2026-06-01', '2026-06-01', 7)]).has('early-bird')).toBe(false);
    expect(unlocked([solve('zip:medium:1a2b', '2026-06-01', 1)]).has('night-owl')).toBe(false);
  });

  it('ships an epoch that is a real instant', () => {
    expect(Number.isFinite(ACHIEVEMENTS_EPOCH)).toBe(true);
    expect(ACHIEVEMENTS_EPOCH).toBeGreaterThan(Date.parse('2026-01-01T00:00:00Z'));
  });
});
