import { PUZZLE_TYPES, type PuzzleTypeId } from './types.ts';
import { DAILY_TYPES, periodKey } from './schedule.ts';

export const LAUNCH_DAY = '2026-09-18';
export const STREAK_MIN = Math.min(3, PUZZLE_TYPES.length);

export function dayIndex(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.floor(Date.UTC(y!, m! - 1, d!) / 86400000);
}

function keyOfDayIndex(index: number): string {
  const d = new Date(index * 86400000);
  return d.toISOString().slice(0, 10);
}

export interface DailyStreaks {
  today: number;
  current: number;
  best: number;
  perfectDays: number;
  daysPlayed: number;
}

export function dailyStreaks(ids: Iterable<string>, now: Date = new Date()): DailyStreaks {
  const solvedTypesByDay = new Map<string, Set<PuzzleTypeId>>();
  for (const id of ids) {
    const [type, period, key] = id.split(':');
    if (period !== 'daily' || !key) continue;
    // A malformed or truncated key (a mangled share link, say) parses to a non-finite day
    // index. keyOfDayIndex would then hand new Date() a NaN and throw on toISOString(), so
    // such an id is skipped here rather than let junk into the day map at all.
    if (!Number.isFinite(dayIndex(key))) continue;
    if (!solvedTypesByDay.has(key)) solvedTypesByDay.set(key, new Set());
    solvedTypesByDay.get(key)!.add(type as PuzzleTypeId);
  }
  const today = periodKey('daily', now);
  const todayIndex = dayIndex(today);
  const anyOn = (i: number) => (solvedTypesByDay.get(keyOfDayIndex(i))?.size ?? 0) >= STREAK_MIN;
  // A count of whole days, deliberately not a run: a day that was skipped costs nothing, it
  // only fails to add. Chaining perfect days pushed players into the types they do not enjoy
  // (tester feedback, 2026-09-22). Only the types that have a daily count, so a Sudoku daily
  // solved before Sudoku left the list cannot complete a day either.
  let perfectDays = 0;
  for (const solved of solvedTypesByDay.values()) {
    if (DAILY_TYPES.every((type) => solved.has(type))) perfectDays++;
  }

  const run = (test: (i: number) => boolean) => {
    let start = todayIndex;
    if (!test(start)) start--;
    let n = 0;
    while (test(start - n)) n++;
    return n;
  };

  const best = (test: (i: number) => boolean) => {
    let bestRun = 0;
    let cur = 0;
    const days = [...solvedTypesByDay.keys()].map(dayIndex).sort((a, b) => a - b);
    let prev = Number.NaN;
    for (const d of days) {
      if (!test(d)) {
        cur = 0;
        prev = d;
        continue;
      }
      cur = d === prev + 1 ? cur + 1 : 1;
      prev = d;
      bestRun = Math.max(bestRun, cur);
    }
    return bestRun;
  };

  const todaySolved = solvedTypesByDay.get(today);
  return {
    // Only the types that still have a daily, so the Daily progress bar cannot read 8/7 for
    // someone who solved a Killer daily before Killer left the list.
    today: todaySolved ? DAILY_TYPES.filter((type) => todaySolved.has(type)).length : 0,
    current: run(anyOn),
    best: Math.max(best(anyOn), run(anyOn)),
    perfectDays,
    daysPlayed: solvedTypesByDay.size,
  };
}
