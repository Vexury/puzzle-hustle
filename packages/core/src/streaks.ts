import { PUZZLE_TYPES, type PuzzleTypeId } from './types.ts';
import { periodKey } from './schedule.ts';

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
  perfect: number;
  bestPerfect: number;
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
  const perfectOn = (i: number) => (solvedTypesByDay.get(keyOfDayIndex(i))?.size ?? 0) >= PUZZLE_TYPES.length;

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

  return {
    today: solvedTypesByDay.get(today)?.size ?? 0,
    current: run(anyOn),
    best: Math.max(best(anyOn), run(anyOn)),
    perfect: run(perfectOn),
    bestPerfect: Math.max(best(perfectOn), run(perfectOn)),
    daysPlayed: solvedTypesByDay.size,
  };
}
