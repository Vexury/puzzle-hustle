import { parseSolveId } from './solveId.ts';
import { DAILY_TYPES } from './schedule.ts';
import { dailyStreaks } from './streaks.ts';
import { PUZZLE_META, PUZZLE_TYPES, type PuzzleTypeId } from './types.ts';

export interface SolveEntry {
  id: string;
  solvedAt: number;
  seconds: number;
  hints: number;
  moves: number;
}

export type AchievementGroup = 'start' | 'streak' | 'perfect' | 'volume' | 'oddity' | 'type';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  group: AchievementGroup;
  type?: PuzzleTypeId;
  target?: number;
}

export interface AchievementProgress {
  id: string;
  counter: string;
  current: number;
  target: number;
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

// Seconds, strictly under, hint-free dailies only. Calibrated 2026-09-25 from the leaderboard's
// hint-free daily times near the fastest quarter; see the 2026-09-25 rework spec.
export const SPEED_TARGETS = { zip: 25, shapes: 10, crowns: 30, stars: 30, tracks: 45 } as const;
type SpeedType = keyof typeof SPEED_TARGETS;

const isSpeedType = (type: PuzzleTypeId): type is SpeedType => type in SPEED_TARGETS;

const TYPE_VOLUME = 100;

const TYPE_TITLES: Record<PuzzleTypeId, { volume: string; signature: string }> = {
  zip: { volume: 'Zip Fan', signature: 'Lightning' },
  shapes: { volume: 'In Good Shape', signature: 'Quick Fit' },
  nonogram: { volume: 'Pixel Pusher', signature: 'Picture Perfect' },
  mosaic: { volume: 'Piece by Piece', signature: 'Fine Art' },
  crowns: { volume: 'Cat Person', signature: 'Fast Paws' },
  stars: { volume: 'Big Heart', signature: 'Swift Heart' },
  sudoku: { volume: 'Nine by Nine', signature: 'Pure Logic' },
  killer: { volume: 'Sum of All', signature: 'Cold Calculation' },
  tracks: { volume: 'Railway Worker', signature: 'Express' },
  slabs: { volume: 'Rock Collector', signature: 'Rock Solid' },
};

const GENERAL: readonly Achievement[] = [
  { id: 'first-solve', title: 'Hello, Hustler', description: 'Solve your first puzzle.', group: 'start' },
  { id: 'every-type', title: 'Sampler', description: 'Solve at least one puzzle of every daily type.', group: 'start', target: DAILY_TYPES.length },
  { id: 'daily-no-hint', title: 'No Help Needed', description: 'Solve a daily without a hint.', group: 'start' },
  { id: 'first-weekly', title: 'Weekender', description: 'Solve a Weekly.', group: 'start' },
  { id: 'first-monthly', title: "Month's Finest", description: 'Solve a Monthly.', group: 'start' },
  { id: 'first-genius', title: 'Big Brain', description: 'Solve a puzzle on Genius.', group: 'start' },

  { id: 'streak-3', title: 'Warming Up', description: 'Keep a daily streak for 3 days.', group: 'streak', target: 3 },
  { id: 'streak-7', title: 'Week Warrior', description: 'Keep a daily streak for 7 days.', group: 'streak', target: 7 },
  { id: 'streak-30', title: 'Creature of Habit', description: 'Keep a daily streak for 30 days.', group: 'streak', target: 30 },
  { id: 'streak-100', title: 'Unstoppable', description: 'Keep a daily streak for 100 days.', group: 'streak', target: 100 },
  { id: 'streak-365', title: 'Year of Puzzles', description: 'Keep a daily streak for 365 days.', group: 'streak', target: 365 },

  { id: 'perfect-day', title: 'Clean Sweep', description: 'Solve every daily in one day.', group: 'perfect' },
  { id: 'perfect-10', title: 'Spotless', description: 'Solve every daily on ten days.', group: 'perfect', target: 10 },
  { id: 'perfect-day-no-hint', title: 'Flawless', description: 'Solve every daily in one day, none with a hint.', group: 'perfect' },

  { id: 'solved-50', title: 'Getting Hooked', description: 'Solve 50 puzzles.', group: 'volume', target: 50 },
  { id: 'solved-250', title: 'Puzzle Addict', description: 'Solve 250 puzzles.', group: 'volume', target: 250 },
  { id: 'solved-1000', title: 'Thousand Club', description: 'Solve 1000 puzzles.', group: 'volume', target: 1000 },
  { id: 'weekly-10', title: 'Weekly Regular', description: 'Solve the Weekly in ten different weeks.', group: 'volume', target: 10 },

  { id: 'night-owl', title: 'Night Owl', description: 'Solve a daily between midnight and four.', group: 'oddity' },
  { id: 'early-bird', title: 'Early Bird', description: 'Solve a daily between four and six in the morning.', group: 'oddity' },
];

function typeAchievements(type: PuzzleTypeId): Achievement[] {
  const name = PUZZLE_META[type].name;
  const titles = TYPE_TITLES[type];
  const volume: Achievement = {
    id: `${type}-100`,
    title: titles.volume,
    description: `Solve ${TYPE_VOLUME} ${name} puzzles.`,
    group: 'type',
    type,
    target: TYPE_VOLUME,
  };
  const signature: Achievement = isSpeedType(type)
    ? {
        id: `${type}-speed`,
        title: titles.signature,
        description: `Solve the ${name} daily in under ${SPEED_TARGETS[type]} seconds without a hint.`,
        group: 'type',
        type,
      }
    : {
        id: `${type}-genius`,
        title: titles.signature,
        description: `Solve a ${name} puzzle on Genius without a hint.`,
        group: 'type',
        type,
      };
  return [volume, signature];
}

export const ACHIEVEMENTS: readonly Achievement[] = [...GENERAL, ...PUZZLE_TYPES.flatMap(typeAchievements)];

interface Facts {
  total: number;
  types: Set<PuzzleTypeId>;
  perType: Map<PuzzleTypeId, number>;
  weeks: Set<string>;
  monthly: boolean;
  genius: boolean;
  geniusNoHint: Set<PuzzleTypeId>;
  fastestDaily: Map<PuzzleTypeId, number>;
  bestStreak: number;
  perfectDays: number;
  dailyNoHint: boolean;
  perfectDayNoHint: boolean;
  nightOwl: boolean;
  earlyBird: boolean;
}

function gather(solves: readonly SolveEntry[]): Facts {
  const dailiesByDay = new Map<string, { types: Set<PuzzleTypeId>; hinted: boolean }>();
  const facts: Facts = {
    total: 0,
    types: new Set(),
    perType: new Map(),
    weeks: new Set(),
    monthly: false,
    genius: false,
    geniusNoHint: new Set(),
    fastestDaily: new Map(),
    bestStreak: 0,
    perfectDays: 0,
    dailyNoHint: false,
    perfectDayNoHint: false,
    nightOwl: false,
    earlyBird: false,
  };

  for (const entry of solves) {
    const parsed = parseSolveId(entry.id);
    if (!parsed) continue;
    facts.total++;
    facts.types.add(parsed.type);
    facts.perType.set(parsed.type, (facts.perType.get(parsed.type) ?? 0) + 1);
    if (parsed.difficulty === 'genius') {
      facts.genius = true;
      if (entry.hints === 0) facts.geniusNoHint.add(parsed.type);
    }

    if (parsed.mode !== 'period' || !parsed.key) continue;
    if (parsed.period === 'weekly') facts.weeks.add(parsed.key);
    if (parsed.period === 'monthly') facts.monthly = true;
    if (parsed.period !== 'daily') continue;

    if (entry.hints === 0) {
      facts.dailyNoHint = true;
      // A record without a usable time reads as 0 seconds (storedSolves' default); that is a
      // missing value, not a fast solve.
      if (entry.seconds > 0) {
        const best = facts.fastestDaily.get(parsed.type);
        if (best === undefined || entry.seconds < best) facts.fastestDaily.set(parsed.type, entry.seconds);
      }
    }

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
    if (!DAILY_TYPES.every((type) => day.types.has(type))) continue;
    facts.perfectDays++;
    if (!day.hinted) facts.perfectDayNoHint = true;
  }

  facts.bestStreak = dailyStreaks(solves.map((s) => s.id)).best;
  return facts;
}

// Counter achievements: the name of the counter they read (shared along a ladder) and its value.
function counterOf(a: Achievement, f: Facts): { counter: string; value: number } | null {
  if (a.target === undefined) return null;
  if (a.type) return { counter: `type:${a.type}`, value: f.perType.get(a.type) ?? 0 };
  switch (a.group) {
    case 'streak':
      return { counter: 'streak', value: f.bestStreak };
    case 'perfect':
      return { counter: 'perfect', value: f.perfectDays };
    case 'volume':
      return a.id === 'weekly-10' ? { counter: 'weekly', value: f.weeks.size } : { counter: 'solved', value: f.total };
    case 'start':
      // every-type, the only counter in its group.
      return { counter: 'daily-types', value: DAILY_TYPES.filter((t) => f.types.has(t)).length };
    default:
      return null;
  }
}

// Yes/no achievements, by id. The per-type signatures are filled in below.
const FLAGS: Record<string, (f: Facts) => boolean> = {
  'first-solve': (f) => f.total > 0,
  'daily-no-hint': (f) => f.dailyNoHint,
  'first-weekly': (f) => f.weeks.size > 0,
  'first-monthly': (f) => f.monthly,
  'first-genius': (f) => f.genius,
  'perfect-day': (f) => f.perfectDays > 0,
  'perfect-day-no-hint': (f) => f.perfectDayNoHint,
  'night-owl': (f) => f.nightOwl,
  'early-bird': (f) => f.earlyBird,
};
for (const type of PUZZLE_TYPES) {
  if (isSpeedType(type)) FLAGS[`${type}-speed`] = (f) => (f.fastestDaily.get(type) ?? Infinity) < SPEED_TARGETS[type];
  else FLAGS[`${type}-genius`] = (f) => f.geniusNoHint.has(type);
}

function earned(a: Achievement, f: Facts): boolean {
  const c = counterOf(a, f);
  if (c) return c.value >= a.target!;
  return FLAGS[a.id]?.(f) ?? false;
}

export function unlockedAchievements(solves: readonly SolveEntry[], epoch: number = ACHIEVEMENTS_EPOCH): Set<string> {
  const facts = gather(solves.filter((s) => s.solvedAt >= epoch));
  const out = new Set<string>();
  for (const a of ACHIEVEMENTS) if (earned(a, facts)) out.add(a.id);
  return out;
}

export function achievementProgress(solves: readonly SolveEntry[], epoch: number = ACHIEVEMENTS_EPOCH): AchievementProgress[] {
  const facts = gather(solves.filter((s) => s.solvedAt >= epoch));
  const out: AchievementProgress[] = [];
  for (const a of ACHIEVEMENTS) {
    const c = counterOf(a, facts);
    if (c) out.push({ id: a.id, counter: c.counter, current: Math.min(c.value, a.target!), target: a.target! });
  }
  return out;
}
