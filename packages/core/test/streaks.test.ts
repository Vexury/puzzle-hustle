import { describe, expect, it } from 'vitest';
import { STREAK_MIN, dailyStreaks } from '../src/streaks.ts';
import { DAILY_TYPES } from '../src/schedule.ts';

// Berlin noon, so no time zone can move a solve into a neighbouring day.
const at = (day: string) => new Date(`${day}T10:00:00Z`);
const day = (key: string, count: number) => DAILY_TYPES.slice(0, count).map((t) => `${t}:daily:${key}`);

describe('dailyStreaks', () => {
  it('counts a day only once it reaches the minimum', () => {
    const one = dailyStreaks(day('2026-09-22', STREAK_MIN - 1), at('2026-09-22'));
    expect(one.current).toBe(0);
    const enough = dailyStreaks(day('2026-09-22', STREAK_MIN), at('2026-09-22'));
    expect(enough.current).toBe(1);
  });

  it('counts consecutive days and remembers the best run', () => {
    const ids = [...day('2026-09-20', 8), ...day('2026-09-21', 8), ...day('2026-09-22', 8)];
    const s = dailyStreaks(ids, at('2026-09-22'));
    expect(s.current).toBe(3);
    expect(s.best).toBe(3);
    expect(s.daysPlayed).toBe(3);
  });

  it('breaks a run on a missed day but keeps the best', () => {
    const ids = [...day('2026-09-18', 8), ...day('2026-09-19', 8), ...day('2026-09-22', 8)];
    const s = dailyStreaks(ids, at('2026-09-22'));
    expect(s.current).toBe(1);
    expect(s.best).toBe(2);
  });

  it('counts a perfect day only when every daily type is solved', () => {
    const short = dailyStreaks(day('2026-09-22', DAILY_TYPES.length - 1), at('2026-09-22'));
    expect(short.perfectDays).toBe(0);
    const full = dailyStreaks(day('2026-09-22', DAILY_TYPES.length), at('2026-09-22'));
    expect(full.perfectDays).toBe(1);
  });

  it('counts perfect days that are not neighbours, a gap does not reset them', () => {
    const ids = [...day('2026-09-18', DAILY_TYPES.length), ...day('2026-09-22', DAILY_TYPES.length)];
    expect(dailyStreaks(ids, at('2026-09-22')).perfectDays).toBe(2);
  });

  it('does not let a Sudoku solve stand in for a missing daily', () => {
    const ids = [...day('2026-09-22', DAILY_TYPES.length - 1), 'sudoku:daily:2026-09-22'];
    expect(dailyStreaks(ids, at('2026-09-22')).perfectDays).toBe(0);
  });

  it('counts only types that still have a daily towards today', () => {
    const ids = [...DAILY_TYPES.map((t) => `${t}:daily:2026-09-22`), 'sudoku:daily:2026-09-22'];
    expect(dailyStreaks(ids, at('2026-09-22')).today).toBe(DAILY_TYPES.length);
  });

  it('still counts a Sudoku daily from before the change towards the plain streak', () => {
    const ids = ['sudoku:daily:2026-09-22', ...day('2026-09-22', STREAK_MIN - 1)];
    expect(dailyStreaks(ids, at('2026-09-22')).current).toBe(1);
  });

  it('ignores anything that is not a daily', () => {
    const s = dailyStreaks(['sudoku:weekly:2026-W39', 'shapes:level:easy:3', 'zip:medium:1a2b'], at('2026-09-22'));
    expect(s.daysPlayed).toBe(0);
  });

  it('ignores a daily id whose day key does not parse into a real day, instead of throwing', () => {
    expect(() => dailyStreaks(['shapes:daily:zzz'], at('2026-09-22'))).not.toThrow();
    expect(dailyStreaks(['shapes:daily:zzz'], at('2026-09-22'))).toEqual({
      today: 0,
      current: 0,
      best: 0,
      perfectDays: 0,
      daysPlayed: 0,
    });

    expect(() => dailyStreaks(['shapes:daily:2026-09'], at('2026-09-22'))).not.toThrow();
    expect(dailyStreaks(['shapes:daily:2026-09'], at('2026-09-22')).daysPlayed).toBe(0);
  });

  it('a junk daily id mixed into a real history does not disturb the real numbers', () => {
    const ids = [...day('2026-09-20', 8), ...day('2026-09-21', 8), ...day('2026-09-22', 8), 'shapes:daily:zzz'];
    const clean = [...day('2026-09-20', 8), ...day('2026-09-21', 8), ...day('2026-09-22', 8)];
    expect(dailyStreaks(ids, at('2026-09-22'))).toEqual(dailyStreaks(clean, at('2026-09-22')));
  });
});
