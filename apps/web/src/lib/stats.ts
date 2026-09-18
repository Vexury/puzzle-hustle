import { PUZZLE_TYPES, levelList, localDateParts, periodKey, type PuzzleTypeId } from '@puzzle-hustle/core';
import type { SolveRecord } from './storage.ts';

export const LAUNCH_DAY = '2026-09-18';

function dayIndex(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.floor(Date.UTC(y!, m! - 1, d!) / 86400000);
}

export function dailyNumber(key: string): number {
  return dayIndex(key) - dayIndex(LAUNCH_DAY) + 1;
}

function keyOfDayIndex(index: number): string {
  const d = new Date(index * 86400000);
  return d.toISOString().slice(0, 10);
}

export interface DailyStreaks {
  current: number;
  best: number;
  perfect: number;
  bestPerfect: number;
  daysPlayed: number;
}

export function dailyStreaks(solves: Record<string, SolveRecord>, now: Date = new Date()): DailyStreaks {
  const solvedTypesByDay = new Map<string, Set<PuzzleTypeId>>();
  for (const id of Object.keys(solves)) {
    const [type, period, key] = id.split(':');
    if (period !== 'daily' || !key) continue;
    if (!solvedTypesByDay.has(key)) solvedTypesByDay.set(key, new Set());
    solvedTypesByDay.get(key)!.add(type as PuzzleTypeId);
  }
  const today = periodKey('daily', now);
  const todayIndex = dayIndex(today);
  const anyOn = (i: number) => (solvedTypesByDay.get(keyOfDayIndex(i))?.size ?? 0) > 0;
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
    current: run(anyOn),
    best: Math.max(best(anyOn), run(anyOn)),
    perfect: run(perfectOn),
    bestPerfect: Math.max(best(perfectOn), run(perfectOn)),
    daysPlayed: solvedTypesByDay.size,
  };
}

export interface TypeStats {
  type: PuzzleTypeId;
  levelsSolved: number;
  levelsTotal: number;
  solved: number;
  averageSeconds: number | null;
  bestSeconds: number | null;
}

export function typeStats(solves: Record<string, SolveRecord>): TypeStats[] {
  return PUZZLE_TYPES.map((type) => {
    const records = Object.entries(solves)
      .filter(([id]) => id.startsWith(`${type}:`))
      .map(([, r]) => r);
    const levelsSolved = Object.keys(solves).filter((id) => id.startsWith(`${type}:level:`)).length;
    const levelsTotal = ['easy', 'medium', 'hard', 'genius'].reduce((n, d) => n + levelList(type, d as 'easy').length, 0);
    const secs = records.map((r) => r.seconds);
    return {
      type,
      levelsSolved,
      levelsTotal,
      solved: records.length,
      averageSeconds: secs.length ? Math.round(secs.reduce((a, b) => a + b, 0) / secs.length) : null,
      bestSeconds: secs.length ? Math.min(...secs) : null,
    };
  });
}

export function totalSolved(solves: Record<string, SolveRecord>): number {
  return Object.keys(solves).length;
}

export function formatDateLong(now: Date = new Date()): string {
  const p = localDateParts(now);
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}
