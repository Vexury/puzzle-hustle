import { levelList } from './levels.ts';
import { parseSolveId } from './solveId.ts';
import { dailyStreaks } from './streaks.ts';
import { DIFFICULTIES, PUZZLE_TYPES, type PuzzleTypeId } from './types.ts';

export interface SolveEntry {
  id: string;
  solvedAt: number;
  seconds: number;
  hints: number;
  moves: number;
}

export type AchievementGroup = 'arrival' | 'habit' | 'skill' | 'volume' | 'oddity';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  group: AchievementGroup;
}

// Nothing solved before this instant counts for anything. The test phase is not meant to
// carry into the release: a player who solved everything while testing starts the official
// release at zero like everyone else. Move this to the production release date when that
// happens; achievements earned before then re-lock, which is intended and belongs in the
// release notes.
//
// Pinned to Berlin midnight, not UTC midnight, because the streak and perfect-day conditions
// group solves by Berlin period keys (see schedule.ts). A UTC-midnight epoch would sit two
// hours into the Berlin day, so a daily solved in those first two hours would carry a
// post-epoch period key while its instant reads as pre-epoch: it would count on the Profile's
// streak but vanish from the achievement streak. Whoever moves this constant to the production
// release date must use that date's own Berlin offset (+01:00 or +02:00, depending on DST),
// not reuse +02:00 blindly.
export const ACHIEVEMENTS_EPOCH = Date.parse('2026-09-22T00:00:00+02:00');

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'every-type', title: 'One of each', description: 'Solve at least one puzzle of every type.', group: 'arrival' },
  { id: 'first-weekly', title: 'Weekly done', description: 'Solve a Weekly.', group: 'arrival' },
  { id: 'first-monthly', title: 'Monthly done', description: 'Solve a Monthly.', group: 'arrival' },
  { id: 'first-genius', title: 'Genius', description: 'Solve a puzzle on Genius.', group: 'arrival' },

  { id: 'streak-3', title: 'Three in a row', description: 'Keep a daily streak for 3 days.', group: 'habit' },
  { id: 'streak-7', title: 'A week in a row', description: 'Keep a daily streak for 7 days.', group: 'habit' },
  { id: 'streak-30', title: 'A month in a row', description: 'Keep a daily streak for 30 days.', group: 'habit' },
  { id: 'perfect-week', title: 'Perfect week', description: 'Solve every daily, seven days running.', group: 'habit' },

  { id: 'daily-no-hint', title: 'Unaided', description: 'Solve a daily without a hint.', group: 'skill' },
  { id: 'perfect-day', title: 'Perfect day', description: 'Solve every daily in one day.', group: 'skill' },
  { id: 'perfect-day-no-hint', title: 'Perfect and unaided', description: 'Solve every daily in one day, none with a hint.', group: 'skill' },
  { id: 'pack-complete', title: 'Pack cleared', description: 'Finish every level of one puzzle at one difficulty.', group: 'skill' },

  { id: 'solved-50', title: 'Fifty', description: 'Solve 50 puzzles.', group: 'volume' },
  { id: 'solved-250', title: 'Two hundred and fifty', description: 'Solve 250 puzzles.', group: 'volume' },
  { id: 'solved-1000', title: 'A thousand', description: 'Solve 1000 puzzles.', group: 'volume' },

  { id: 'night-owl', title: 'Night owl', description: 'Solve a daily between midnight and four.', group: 'oddity' },
  { id: 'early-bird', title: 'Early bird', description: 'Solve a daily between four and six in the morning.', group: 'oddity' },
];

interface Facts {
  types: Set<PuzzleTypeId>;
  weekly: boolean;
  monthly: boolean;
  genius: boolean;
  bestStreak: number;
  bestPerfect: number;
  dailyNoHint: boolean;
  perfectDay: boolean;
  perfectDayNoHint: boolean;
  packComplete: boolean;
  total: number;
  nightOwl: boolean;
  earlyBird: boolean;
}

function gather(solves: readonly SolveEntry[]): Facts {
  const types = new Set<PuzzleTypeId>();
  const levels = new Map<string, Set<number>>();
  const dailiesByDay = new Map<string, { types: Set<PuzzleTypeId>; hinted: boolean }>();
  const facts: Facts = {
    types,
    weekly: false,
    monthly: false,
    genius: false,
    bestStreak: 0,
    bestPerfect: 0,
    dailyNoHint: false,
    perfectDay: false,
    perfectDayNoHint: false,
    packComplete: false,
    total: 0,
    nightOwl: false,
    earlyBird: false,
  };

  for (const entry of solves) {
    const parsed = parseSolveId(entry.id);
    if (!parsed) continue;
    facts.total++;
    types.add(parsed.type);
    if (parsed.difficulty === 'genius') facts.genius = true;

    if (parsed.mode === 'level' && parsed.level !== undefined) {
      const key = `${parsed.type}:${parsed.difficulty}`;
      const seen = levels.get(key) ?? new Set<number>();
      seen.add(parsed.level);
      levels.set(key, seen);
    }

    if (parsed.mode !== 'period' || !parsed.key) continue;
    if (parsed.period === 'weekly') facts.weekly = true;
    if (parsed.period === 'monthly') facts.monthly = true;
    if (parsed.period !== 'daily') continue;

    if (entry.hints === 0) facts.dailyNoHint = true;

    // The player's own night, not Berlin's: unlike a period key, which must put the same
    // puzzle on the same day everywhere, "solved at one in the morning" is about them.
    const hour = new Date(entry.solvedAt).getHours();
    if (hour < 4) facts.nightOwl = true;
    if (hour >= 4 && hour < 6) facts.earlyBird = true;

    const day = dailiesByDay.get(parsed.key) ?? { types: new Set<PuzzleTypeId>(), hinted: false };
    day.types.add(parsed.type);
    if (entry.hints > 0) day.hinted = true;
    dailiesByDay.set(parsed.key, day);
  }

  for (const day of dailiesByDay.values()) {
    if (day.types.size < PUZZLE_TYPES.length) continue;
    facts.perfectDay = true;
    if (!day.hinted) facts.perfectDayNoHint = true;
  }

  for (const type of PUZZLE_TYPES) {
    for (const difficulty of DIFFICULTIES) {
      const total = levelList(type, difficulty).length;
      if (total === 0) continue;
      if ((levels.get(`${type}:${difficulty}`)?.size ?? 0) >= total) facts.packComplete = true;
    }
  }

  const streaks = dailyStreaks(solves.map((s) => s.id));
  facts.bestStreak = streaks.best;
  facts.bestPerfect = streaks.bestPerfect;

  return facts;
}

const CONDITIONS: Record<string, (f: Facts) => boolean> = {
  'every-type': (f) => f.types.size >= PUZZLE_TYPES.length,
  'first-weekly': (f) => f.weekly,
  'first-monthly': (f) => f.monthly,
  'first-genius': (f) => f.genius,
  'streak-3': (f) => f.bestStreak >= 3,
  'streak-7': (f) => f.bestStreak >= 7,
  'streak-30': (f) => f.bestStreak >= 30,
  'perfect-week': (f) => f.bestPerfect >= 7,
  'daily-no-hint': (f) => f.dailyNoHint,
  'perfect-day': (f) => f.perfectDay,
  'perfect-day-no-hint': (f) => f.perfectDayNoHint,
  'pack-complete': (f) => f.packComplete,
  'solved-50': (f) => f.total >= 50,
  'solved-250': (f) => f.total >= 250,
  'solved-1000': (f) => f.total >= 1000,
  'night-owl': (f) => f.nightOwl,
  'early-bird': (f) => f.earlyBird,
};

export function unlockedAchievements(
  solves: readonly SolveEntry[],
  epoch: number = ACHIEVEMENTS_EPOCH,
): Set<string> {
  const facts = gather(solves.filter((s) => s.solvedAt >= epoch));
  const out = new Set<string>();
  for (const achievement of ACHIEVEMENTS) {
    if (CONDITIONS[achievement.id]?.(facts)) out.add(achievement.id);
  }
  return out;
}
