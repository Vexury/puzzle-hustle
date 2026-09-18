import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DIFFICULTIES, type Difficulty } from '../src/types.ts';
import { SHAPES_VERSION, generateShapes } from '../src/shapes/puzzle.ts';
import { canonicalKey, difficultyReport, isUnique } from '../src/shapes/solver.ts';
import type { LevelEntry, LevelPack } from '../src/levels.ts';

const PER_DIFFICULTY = Number(process.argv[2] ?? 20);
const CANDIDATES = PER_DIFFICULTY * 3;
const BUDGET = 5_000_000;

const out = fileURLToPath(new URL('../src/levels.json', import.meta.url));
const levels = {} as Record<Difficulty, LevelEntry[]>;

for (const difficulty of DIFFICULTIES) {
  const seen = new Set<string>();
  const found: LevelEntry[] = [];
  let seed = 1000;
  let tried = 0;
  const t0 = performance.now();
  while (found.length < CANDIDATES) {
    seed++;
    tried++;
    const spec = generateShapes(seed, difficulty);
    if (!isUnique(spec, BUDGET)) continue;
    const key = canonicalKey(spec);
    if (seen.has(key)) continue;
    seen.add(key);
    const report = difficultyReport(spec, BUDGET);
    found.push({ seed, score: report.score });
  }
  found.sort((a, b) => a.score - b.score);
  const step = found.length / PER_DIFFICULTY;
  const picked = Array.from({ length: PER_DIFFICULTY }, (_, i) => found[Math.floor(i * step)]!);
  levels[difficulty] = picked;
  const ms = Math.round(performance.now() - t0);
  console.log(
    `${difficulty}: tried ${tried} seeds, ${found.length} unique, picked ${picked.length}, score ${picked[0]!.score} .. ${picked.at(-1)!.score}, ${ms} ms`,
  );
}

const pack: LevelPack = {
  generatedAt: new Date().toISOString().slice(0, 10),
  versions: { shapes: SHAPES_VERSION },
  levels: { shapes: levels },
};
writeFileSync(out, JSON.stringify(pack, null, 2) + '\n');
console.log(`wrote ${out}`);
