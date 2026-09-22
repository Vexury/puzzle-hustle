import {
  LAUNCH_DAY,
  PUZZLE_TYPES,
  dailyStreaks as coreDailyStreaks,
  isoWeek,
  levelList,
  localDateParts,
  periodKey,
  type DailyStreaks,
  type PuzzleTypeId,
} from '@puzzle-hustle/core';
import type { SolveRecord } from './storage.ts';

export { LAUNCH_DAY, STREAK_MIN, type DailyStreaks } from '@puzzle-hustle/core';

function dayIndex(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.floor(Date.UTC(y!, m! - 1, d!) / 86400000);
}

export function dailyNumber(key: string): number {
  return dayIndex(key) - dayIndex(LAUNCH_DAY) + 1;
}

function isoWeekStartIndex(year: number, week: number): number {
  const jan4 = Date.UTC(year, 0, 4);
  const jan4Day = new Date(jan4).getUTCDay() || 7;
  return Math.floor(jan4 / 86400000) - (jan4Day - 1) + (week - 1) * 7;
}

export function weeklyNumber(key: string): number {
  const [y, w] = key.split('-W').map(Number);
  const launch = isoWeek(localDateParts(new Date(`${LAUNCH_DAY}T12:00:00Z`)));
  return Math.round((isoWeekStartIndex(y!, w!) - isoWeekStartIndex(launch.year, launch.week)) / 7) + 1;
}

export function monthlyNumber(key: string): number {
  const [y, m] = key.split('-').map(Number);
  const [ly, lm] = LAUNCH_DAY.split('-').map(Number);
  return (y! - ly!) * 12 + (m! - lm!) + 1;
}

// The record's values were never read here — only its keys, which are refIds.
export function dailyStreaks(solves: Record<string, SolveRecord>, now: Date = new Date()): DailyStreaks {
  return coreDailyStreaks(Object.keys(solves), now);
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
