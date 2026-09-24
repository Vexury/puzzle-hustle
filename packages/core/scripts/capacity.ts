// Measures, per puzzle type and difficulty: how many distinct puzzles the generator can
// produce at all, how fast it produces them, and how often two puzzles share the same
// building blocks ("family") even though they are different puzzles.
//
//   node --experimental-strip-types scripts/capacity.ts [msPerCell] [maxSeeds] [type] [difficulties]
//
// The family key is the generalisation of the Shapes feedback (levels 34/35/36 use the same
// three fragments in the same counts, only placed elsewhere): it ignores position and
// symmetry and keeps only the vocabulary of the puzzle.

import { DIFFICULTIES, PUZZLE_TYPES, isPuzzleTypeId, type Difficulty, type PuzzleTypeId } from '../src/types.ts';
import { levelList } from '../src/levels.ts';
import { generateShapes } from '../src/shapes/puzzle.ts';
import { canonicalKey as shapesKey, isUnique as shapesUnique } from '../src/shapes/solver.ts';
import { generateNonogram } from '../src/nonogram/puzzle.ts';
import { nonogramCanonicalKey } from '../src/nonogram/solver.ts';
import { generateMosaic } from '../src/mosaic/puzzle.ts';
import { mosaicCanonicalKey } from '../src/mosaic/solver.ts';
import { generateCrowns, generateStars } from '../src/regions/puzzle.ts';
import { regionsCanonicalKey } from '../src/regions/solver.ts';
import { generateSudoku, generateKiller } from '../src/sudoku/puzzle.ts';
import { sudokuCanonicalKey, sudokuDifficultyReport, SUDOKU_TECHNIQUES } from '../src/sudoku/solver.ts';
import { generateZip } from '../src/zip/puzzle.ts';
import { zipCanonicalKey, zipDifficultyReport } from '../src/zip/solver.ts';
import { generateTracks } from '../src/tracks/puzzle.ts';
import { tracksCanonicalKey, tracksFamilyKey } from '../src/tracks/solver.ts';

const MS_PER_CELL = Number(process.argv[2] ?? 20_000);
const MAX_SEEDS = Number(process.argv[3] ?? 20_000);
const ONLY = process.argv[4];
const ONLY_DIFFS = process.argv[5]?.split(',') as Difficulty[] | undefined;
const BUDGET = 5_000_000;

if (ONLY !== undefined && !isPuzzleTypeId(ONLY)) throw new Error(`unknown puzzle type ${ONLY}`);
const types = ONLY ? [ONLY as PuzzleTypeId] : [...PUZZLE_TYPES];
const difficulties = ONLY_DIFFS ?? DIFFICULTIES;

interface Probe {
  build(seed: number, difficulty: Difficulty): unknown;
  key(spec: never): string;
  family(spec: never): string;
}

function histogram(values: Iterable<number>): string {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([v, n]) => `${v}x${n}`)
    .join('.');
}

function regionSizes(regions: Uint8Array): number[] {
  const counts = new Map<number, number>();
  for (const r of regions) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts.values()];
}

const probes: Record<PuzzleTypeId, Probe> = {
  // Vocabulary = the multiset of fragment kinds the player pushes around.
  shapes: {
    build(seed, difficulty) {
      const spec = generateShapes(seed, difficulty);
      return shapesUnique(spec, BUDGET) ? spec : null;
    },
    key: (spec: ReturnType<typeof generateShapes>) => shapesKey(spec),
    family: (spec: ReturnType<typeof generateShapes>) =>
      spec.pieces
        .map((p) => p.kind)
        .sort()
        .join(','),
  },
  // Vocabulary = how many runs of each length exist, per colour, over rows and columns.
  nonogram: {
    build: (seed, difficulty) => generateNonogram(seed, difficulty),
    key: (spec: ReturnType<typeof generateNonogram>) => nonogramCanonicalKey(spec),
    family(spec: ReturnType<typeof generateNonogram>) {
      const runs: number[] = [];
      for (const line of [...spec.rowClues, ...spec.colClues]) for (const c of line) runs.push(c.len * 10 + c.color);
      return `c${spec.config.colors}/${histogram(runs)}`;
    },
  },
  // Vocabulary = how many clues of each value survive the reduction.
  mosaic: {
    build: (seed, difficulty) => generateMosaic(seed, difficulty),
    key: (spec: ReturnType<typeof generateMosaic>) => mosaicCanonicalKey(spec),
    family: (spec: ReturnType<typeof generateMosaic>) => histogram([...spec.clues].filter((v) => v >= 0)),
  },
  // Vocabulary = the region size distribution; where the regions sit is not part of it.
  crowns: {
    build: (seed, difficulty) => generateCrowns(seed, difficulty),
    key: (spec: ReturnType<typeof generateCrowns>) => regionsCanonicalKey(spec),
    family: (spec: ReturnType<typeof generateCrowns>) => histogram(regionSizes(spec.regions)),
  },
  stars: {
    build: (seed, difficulty) => generateStars(seed, difficulty),
    key: (spec: ReturnType<typeof generateStars>) => regionsCanonicalKey(spec),
    family: (spec: ReturnType<typeof generateStars>) => histogram(regionSizes(spec.regions)),
  },
  // Vocabulary = number of givens plus which techniques the logic solver actually needed.
  sudoku: {
    build: (seed, difficulty) => generateSudoku(seed, difficulty),
    key: (spec: ReturnType<typeof generateSudoku>) => sudokuCanonicalKey(spec),
    family(spec: ReturnType<typeof generateSudoku>) {
      const used = sudokuDifficultyReport(spec).used;
      const givens = [...spec.givens].filter((v) => v > 0).length;
      return `g${givens}/${SUDOKU_TECHNIQUES.filter((t) => used[t] > 0).join(',')}`;
    },
  },
  killer: {
    build: (seed, difficulty) => generateKiller(seed, difficulty),
    key: (spec: ReturnType<typeof generateKiller>) => sudokuCanonicalKey(spec),
    family(spec: ReturnType<typeof generateKiller>) {
      const used = sudokuDifficultyReport(spec).used;
      const givens = [...spec.givens].filter((v) => v > 0).length;
      const cages = histogram(spec.cages.map((c) => c.cells.length));
      return `g${givens}/${cages}/${SUDOKU_TECHNIQUES.filter((t) => used[t] > 0).join(',')}`;
    },
  },
  // Vocabulary = how long the path segments between consecutive numbers are, plus the turns.
  zip: {
    build: (seed, difficulty) => generateZip(seed, difficulty),
    key: (spec: ReturnType<typeof generateZip>) => zipCanonicalKey(spec),
    family(spec: ReturnType<typeof generateZip>) {
      const at: number[] = [];
      spec.solution.forEach((cell, i) => {
        if (spec.numbers[cell]! > 0) at.push(i);
      });
      const gaps = at.slice(1).map((p, i) => p - at[i]!);
      const report = zipDifficultyReport(spec);
      return `t${report.turns}/${gaps.sort((a, b) => a - b).join('.')}`;
    },
  },
  // Vocabulary = turns, length and handed-over pieces, same as the level generator's family.
  tracks: {
    build: (seed, difficulty) => generateTracks(seed, difficulty),
    key: (spec: ReturnType<typeof generateTracks>) => tracksCanonicalKey(spec),
    family: (spec: ReturnType<typeof generateTracks>) => tracksFamilyKey(spec),
  },
};

// Chao1, bias-corrected: how many keys exist in total, given how many were seen exactly
// once (f1) and exactly twice (f2). With no repeats at all it degenerates, so the caller
// reports a lower bound instead.
function chao1(observed: number, f1: number, f2: number): number {
  return observed + (f1 * (f1 - 1)) / (2 * (f2 + 1));
}

function tally(counts: Map<string, number>): { distinct: number; f1: number; f2: number; top: number } {
  let f1 = 0;
  let f2 = 0;
  let top = 0;
  for (const n of counts.values()) {
    if (n === 1) f1++;
    else if (n === 2) f2++;
    if (n > top) top = n;
  }
  return { distinct: counts.size, f1, f2, top };
}

function estimate(samples: number, t: { distinct: number; f1: number; f2: number }): string {
  if (t.distinct === samples) return `>${samples} (no repeat yet)`;
  return String(Math.round(chao1(t.distinct, t.f1, t.f2)));
}

interface Row {
  type: PuzzleTypeId;
  difficulty: Difficulty;
  tried: number;
  accepted: number;
  ms: number;
  puzzles: ReturnType<typeof tally>;
  families: ReturnType<typeof tally>;
  packSize: number;
  packFamilies: number;
  packAdjacent: number;
  packWorst: number;
}

const rows: Row[] = [];

for (const type of types) {
  const probe = probes[type];
  for (const difficulty of difficulties) {
    const keyCounts = new Map<string, number>();
    const familyCounts = new Map<string, number>();
    let tried = 0;
    let accepted = 0;
    const t0 = performance.now();
    for (let seed = 1; seed <= MAX_SEEDS; seed++) {
      if (performance.now() - t0 > MS_PER_CELL) break;
      tried++;
      let spec: unknown;
      try {
        spec = probe.build(seed, difficulty);
      } catch {
        continue;
      }
      if (!spec) continue;
      accepted++;
      const k = probe.key(spec as never);
      keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1);
      const f = probe.family(spec as never);
      familyCounts.set(f, (familyCounts.get(f) ?? 0) + 1);
    }
    const ms = performance.now() - t0;

    // The shipped pack, measured with the same family key.
    const pack = levelList(type, difficulty);
    const packFams: string[] = [];
    for (const entry of pack) {
      try {
        const spec = probe.build(entry.seed, difficulty);
        packFams.push(spec ? probe.family(spec as never) : '?');
      } catch {
        packFams.push('?');
      }
    }
    const packCounts = new Map<string, number>();
    for (const f of packFams) packCounts.set(f, (packCounts.get(f) ?? 0) + 1);
    let adjacent = 0;
    for (let i = 1; i < packFams.length; i++) if (packFams[i] === packFams[i - 1]) adjacent++;
    let worst = 0;
    for (const n of packCounts.values()) if (n > worst) worst = n;

    rows.push({
      type,
      difficulty,
      tried,
      accepted,
      ms,
      puzzles: tally(keyCounts),
      families: tally(familyCounts),
      packSize: pack.length,
      packFamilies: packCounts.size,
      packAdjacent: adjacent,
      packWorst: worst,
    });
    const r = rows.at(-1)!;
    console.log(
      [
        `${type}/${difficulty}`.padEnd(18),
        `tried ${String(r.tried).padStart(5)}`,
        `ok ${String(r.accepted).padStart(5)} (${((100 * r.accepted) / Math.max(1, r.tried)).toFixed(0)}%)`,
        `${(r.ms / Math.max(1, r.accepted)).toFixed(0).padStart(5)} ms/puzzle`,
        `distinct ${String(r.puzzles.distinct).padStart(5)}`,
        `total~${estimate(r.accepted, r.puzzles).padStart(16)}`,
        `families ${String(r.families.distinct).padStart(5)}`,
        `total~${estimate(r.accepted, r.families).padStart(16)}`,
        `biggest family ${((100 * r.families.top) / Math.max(1, r.accepted)).toFixed(1).padStart(5)}%`,
        `pack ${r.packSize}: ${r.packFamilies} families, ${r.packAdjacent} adjacent twins, worst ${r.packWorst}x`,
      ].join('  '),
    );
  }
}

console.log('\n--- summary (markdown) ---\n');
console.log('| type | diff | ok/tried | ms/puzzle | distinct puzzles~ | distinct families~ | biggest family | pack families | adjacent twins |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  console.log(
    `| ${r.type} | ${r.difficulty} | ${r.accepted}/${r.tried} | ${(r.ms / Math.max(1, r.accepted)).toFixed(0)} | ` +
      `${estimate(r.accepted, r.puzzles)} | ${estimate(r.accepted, r.families)} | ` +
      `${((100 * r.families.top) / Math.max(1, r.accepted)).toFixed(1)}% | ${r.packFamilies}/${r.packSize} | ${r.packAdjacent} |`,
  );
}
