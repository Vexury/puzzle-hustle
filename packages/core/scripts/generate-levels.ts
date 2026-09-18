import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DIFFICULTIES, PUZZLE_TYPES, isPuzzleTypeId, type Difficulty, type PuzzleTypeId } from '../src/types.ts';
import { adapter } from '../src/registry.ts';
import type { LevelEntry, LevelPack } from '../src/levels.ts';

const PER_DIFFICULTY = Number(process.argv[2] ?? 20);
const ONLY = process.argv[3];
const BUDGET = 5_000_000;

if (ONLY !== undefined && !isPuzzleTypeId(ONLY)) throw new Error(`unknown puzzle type ${ONLY}`);
const types = ONLY ? [ONLY] : [...PUZZLE_TYPES];

const out = fileURLToPath(new URL('../src/levels.json', import.meta.url));
const existing = JSON.parse(readFileSync(out, 'utf-8')) as LevelPack;
const levels = { ...existing.levels } as Record<PuzzleTypeId, Record<Difficulty, LevelEntry[]>>;
const versions = { ...existing.versions } as Record<PuzzleTypeId, number>;

for (const type of types) {
  const a = adapter(type);
  const keepOld = versions[type] === a.version;
  versions[type] = a.version;
  levels[type] = { ...(keepOld ? levels[type] : {}) } as Record<Difficulty, LevelEntry[]>;
  for (const difficulty of DIFFICULTIES) {
    const kept = keepOld ? (levels[type][difficulty] ?? []) : [];
    const missing = PER_DIFFICULTY - kept.length;
    if (missing <= 0) {
      console.log(`${type}/${difficulty}: ${kept.length} levels, nothing to add`);
      continue;
    }
    const seen = new Set<string>();
    for (const entry of kept) seen.add(a.key(entry.seed, difficulty));
    const found: LevelEntry[] = [];
    let seed = kept.reduce((m, e) => Math.max(m, e.seed), 1000);
    let tried = 0;
    const t0 = performance.now();
    while (found.length < missing * 3) {
      seed++;
      tried++;
      if (!a.accepts(seed, difficulty, a.options(undefined) as never, BUDGET)) continue;
      const key = a.key(seed, difficulty);
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ seed, score: a.score(seed, difficulty, BUDGET) });
    }
    found.sort((x, y) => x.score - y.score);
    const step = found.length / missing;
    const picked = Array.from({ length: missing }, (_, i) => found[Math.floor(i * step)]!);
    levels[type][difficulty] = [...kept, ...picked];
    const ms = Math.round(performance.now() - t0);
    console.log(
      `${type}/${difficulty}: kept ${kept.length}, tried ${tried} seeds, added ${picked.length} (score ${picked[0]!.score} .. ${picked.at(-1)!.score}), ${ms} ms`,
    );
  }
}

const pack: LevelPack = { generatedAt: new Date().toISOString().slice(0, 10), versions, levels };
writeFileSync(out, JSON.stringify(pack, null, 2) + '\n');
console.log(`wrote ${out}`);
