// Writes src/boards/<type>.json: every level board of the pack, generated once here so the app
// never has to, plus a pool of extra boards for Random where building one live is too slow.
//   pnpm boards [type]
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { boardKey, encodeBoard, generateBoard, type BoardPack } from '../src/boards.ts';
import { levelList } from '../src/levels.ts';
import { adapter } from '../src/registry.ts';
import { DIFFICULTIES, PUZZLE_TYPES, isPuzzleTypeId, type Difficulty, type PuzzleTypeId } from '../src/types.ts';

const ONLY = process.argv[2];
if (ONLY !== undefined && !isPuzzleTypeId(ONLY)) throw new Error(`unknown puzzle type ${ONLY}`);

// Random takes these from the pool: live they need tens of seconds on a phone.
export const POOLS: Partial<Record<PuzzleTypeId, Partial<Record<Difficulty, number>>>> = {
  zip: { hard: 40, genius: 40 },
};
// Pool seeds start far above the level seeds, which the level script counts up from 1000.
const POOL_SEED_START = 5_000_000;

for (const type of ONLY ? [ONLY] : PUZZLE_TYPES) {
  const a = adapter(type);
  const pack: BoardPack = { version: a.version, boards: {} };
  const t0 = performance.now();
  for (const difficulty of DIFFICULTIES) {
    const levelSeeds = levelList(type, difficulty).map((e) => e.seed);
    for (const seed of levelSeeds) pack.boards[boardKey(difficulty, seed)] = encodeBoard(generateBoard({ type, seed, difficulty }));

    const want = POOLS[type]?.[difficulty];
    if (!want) continue;
    const keys = new Set(levelSeeds.map((s) => a.key(s, difficulty)));
    const pool: number[] = [];
    for (let seed = POOL_SEED_START; pool.length < want; seed++) {
      if (!a.accepts(seed, difficulty, a.options(undefined) as never)) continue;
      const key = a.key(seed, difficulty);
      if (keys.has(key)) continue;
      keys.add(key);
      pool.push(seed);
      pack.boards[boardKey(difficulty, seed)] = encodeBoard(generateBoard({ type, seed, difficulty }));
    }
    (pack.pool ??= {})[difficulty] = pool;
  }
  const out = fileURLToPath(new URL(`../src/boards/${type}.json`, import.meta.url));
  const text = JSON.stringify(pack) + '\n';
  writeFileSync(out, text);
  console.log(`${type}: ${Object.keys(pack.boards).length} boards, ${(text.length / 1024).toFixed(0)} KB, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}
