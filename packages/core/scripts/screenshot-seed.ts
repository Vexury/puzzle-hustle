// Prints the localStorage a screenshot run should start from, so the store images show an
// account that has been played rather than "0 solved" everywhere.
import { generateNonogram } from '../src/nonogram/puzzle.ts';
import { MARKED_EMPTY } from '../src/nonogram/clues.ts';
import { generateCrowns } from '../src/regions/puzzle.ts';
import { REGIONS_MARKED_EMPTY } from '../src/regions/solver.ts';
import { dailyRef } from '../src/ref.ts';
import { periodKey } from '../src/schedule.ts';
import { PUZZLE_TYPES, type Difficulty, type PuzzleTypeId } from '../src/types.ts';

const DAY = 86_400_000;
const today = new Date();

const solves: Record<string, unknown> = {};
const record = (seconds: number, at: Date, hints = 0) => ({
  solvedAt: at.toISOString(),
  seconds,
  hints,
  moves: Math.round(seconds * 1.6),
});

// A week of dailies, today deliberately unfinished so the screen shows both states.
for (let back = 1; back <= 6; back++) {
  const day = new Date(today.getTime() - back * DAY);
  const key = periodKey('daily', day);
  for (const type of PUZZLE_TYPES) {
    solves[`${type}:daily:${key}`] = record(90 + ((back * 37 + type.length * 13) % 240), day);
  }
}
const todayKey = periodKey('daily', today);
// The four types the screenshots show a board for stay unsolved: a solve record wins over
// saved progress, which would put a Solved banner under a board nobody has touched.
for (const type of ['zip', 'mosaic', 'stars', 'sudoku'] as PuzzleTypeId[]) {
  solves[`${type}:daily:${todayKey}`] = record(120 + type.length * 11, today);
}
solves[`crowns:weekly:${periodKey('weekly', today)}`] = record(361, new Date(today.getTime() - 2 * DAY));

// Level packs, far enough in to look lived in without claiming the whole game is done.
const LEVELS: Record<string, Partial<Record<Difficulty, number>>> = {
  shapes: { easy: 23, medium: 11, hard: 4 },
  zip: { easy: 14, medium: 6 },
  nonogram: { easy: 17, medium: 9, hard: 3 },
  mosaic: { easy: 12, medium: 5 },
  crowns: { easy: 15, medium: 7, hard: 2 },
  stars: { easy: 9, medium: 3 },
  sudoku: { easy: 13, medium: 6 },
  killer: { easy: 8, medium: 2 },
};
for (const [type, byDifficulty] of Object.entries(LEVELS)) {
  for (const [difficulty, count] of Object.entries(byDifficulty)) {
    for (let n = 1; n <= (count as number); n++) {
      solves[`${type}:level:${difficulty}:${n}`] = record(70 + ((n * 29) % 200), new Date(today.getTime() - (n % 5) * DAY));
    }
  }
}

const out: Record<string, string> = {
  'ph:solves': JSON.stringify(solves),
  'ph:name': 'Moritz',
};
for (const type of PUZZLE_TYPES) out[`ph:howto:${type}`] = '1';

// Half solved boards read far better than empty ones.
const progress = (id: string, state: number[], seconds: number, moves: number) => {
  out[`ph:progress:${id}`] = JSON.stringify({ state, seconds, moves, hints: 0 });
};

{
  const ref = dailyRef('nonogram');
  const spec = generateNonogram(ref.seed, ref.difficulty);
  const state = [...spec.solution].map((v, i) => (i % 7 < 4 ? v : v ? 0 : MARKED_EMPTY));
  progress(`nonogram:daily:${todayKey}`, state, 142, 63);
}

{
  const ref = dailyRef('crowns');
  const spec = generateCrowns(ref.seed, ref.difficulty);
  const state = [...spec.solution].map((v, i) => (v ? (i % 3 ? 1 : 0) : i % 2 ? REGIONS_MARKED_EMPTY : 0));
  progress(`crowns:daily:${todayKey}`, state, 88, 41);
}

console.log(JSON.stringify(out));
