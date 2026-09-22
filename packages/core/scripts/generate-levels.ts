import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DIFFICULTIES, PUZZLE_TYPES, isPuzzleTypeId, type Difficulty, type PuzzleTypeId } from '../src/types.ts';
import { adapter } from '../src/registry.ts';
import type { LevelEntry, LevelPack } from '../src/levels.ts';
import { adjacentTwins, selectLevels, type Candidate } from './select-levels.ts';

const PER_DIFFICULTY = Number(process.argv[2] ?? 20);
const ONLY = process.argv[3];
const ONLY_DIFFS = process.argv[4]?.split(',') as Difficulty[] | undefined;
const BUDGET = 5_000_000;

if (ONLY !== undefined && !isPuzzleTypeId(ONLY)) throw new Error(`unknown puzzle type ${ONLY}`);
const types = ONLY ? [ONLY] : [...PUZZLE_TYPES];
for (const d of ONLY_DIFFS ?? []) if (!(DIFFICULTIES as readonly string[]).includes(d)) throw new Error(`unknown difficulty ${d}`);
const difficulties = ONLY_DIFFS ?? DIFFICULTIES;

const out = fileURLToPath(new URL('../src/levels.json', import.meta.url));
const existing = JSON.parse(readFileSync(out, 'utf-8')) as LevelPack;
const levels = { ...existing.levels } as Record<PuzzleTypeId, Record<Difficulty, LevelEntry[]>>;
const versions = { ...existing.versions } as Record<PuzzleTypeId, number>;

for (const type of types) {
  const a = adapter(type);
  const keepOld = versions[type] === a.version;
  versions[type] = a.version;
  levels[type] = { ...(keepOld ? levels[type] : {}) } as Record<Difficulty, LevelEntry[]>;
  for (const difficulty of difficulties) {
    const kept = keepOld ? (levels[type][difficulty] ?? []) : [];
    if (kept.length >= PER_DIFFICULTY) {
      console.log(`${type}/${difficulty}: ${kept.length} levels, nothing to add`);
      continue;
    }
    // Levels already in the pack join the candidate pool instead of being pinned to the
    // front: a pack that grows has to be re-sorted by score anyway, and pinning them
    // would put the variety rule out of reach for exactly the levels players see first.
    // Their numbers change as a result, which the caller is told about below.
    const family = (seed: number): string => a.family?.(seed, difficulty) ?? String(seed);
    const pool: Candidate[] = kept.map((entry) => ({ seed: entry.seed, score: entry.score, family: family(entry.seed) }));
    const seen = new Set<string>();
    for (const entry of kept) seen.add(a.key(entry.seed, difficulty));

    let seed = kept.reduce((m, e) => Math.max(m, e.seed), 1000);
    let tried = 0;
    const t0 = performance.now();
    while (pool.length < PER_DIFFICULTY * 3) {
      seed++;
      tried++;
      if (!a.accepts(seed, difficulty, a.options(undefined) as never, BUDGET)) continue;
      const key = a.key(seed, difficulty);
      if (seen.has(key)) continue;
      seen.add(key);
      pool.push({ seed, score: a.score(seed, difficulty, BUDGET), family: family(seed) });
    }
    pool.sort((x, y) => x.score - y.score || x.seed - y.seed);
    const picked = selectLevels(pool, PER_DIFFICULTY);
    levels[type][difficulty] = picked.map(({ seed: s, score }) => ({ seed: s, score }));

    const twins = adjacentTwins(picked);
    const survivors = picked.filter((c) => kept.some((e) => e.seed === c.seed)).length;
    const ms = Math.round(performance.now() - t0);
    console.log(
      `${type}/${difficulty}: ${picked.length} levels from ${pool.length} candidates (${tried} seeds tried), ` +
        `score ${picked[0]!.score} .. ${picked.at(-1)!.score}, ` +
        `${new Set(picked.map((c) => c.family)).size} families, ${twins} adjacent twins, ` +
        `${survivors}/${kept.length} previous levels kept (renumbered), ${ms} ms`,
    );
  }
}

const pack: LevelPack = { generatedAt: new Date().toISOString().slice(0, 10), versions, levels };
writeFileSync(out, JSON.stringify(pack, null, 2) + '\n');
console.log(`wrote ${out}`);
