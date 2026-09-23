import { ACHIEVEMENTS_EPOCH, unlockedAchievements, type SolveEntry } from './achievements.ts';
import { COSMETICS } from './cosmetics.ts';
import { levelList } from './levels.ts';
import { parseSolveId } from './solveId.ts';
import type { Difficulty, PuzzleTypeId } from './types.ts';

// Distinct level numbers solved per type:difficulty pack, from `type:level:difficulty:n` solves
// only. A number outside 1..levelList(type, difficulty).length is kept here (it is still a real
// solve) but never counts towards completing or displaying the pack, since the pack only has
// that many levels.
function solvedLevelsByPack(solves: readonly SolveEntry[], epoch: number): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const entry of solves) {
    if (entry.solvedAt < epoch) continue;
    const parsed = parseSolveId(entry.id);
    if (!parsed || parsed.mode !== 'level' || parsed.level === undefined) continue;
    const key = `${parsed.type}:${parsed.difficulty}`;
    const seen = out.get(key) ?? new Set<number>();
    seen.add(parsed.level);
    out.set(key, seen);
  }
  return out;
}

function packComplete(solved: Set<number> | undefined, total: number): boolean {
  if (total === 0) return false;
  for (let n = 1; n <= total; n++) {
    if (!solved?.has(n)) return false;
  }
  return true;
}

export function packProgress(
  solves: readonly SolveEntry[],
  type: PuzzleTypeId,
  difficulty: Difficulty,
  epoch: number = ACHIEVEMENTS_EPOCH,
): { solved: number; total: number } {
  const total = levelList(type, difficulty).length;
  const levels = solvedLevelsByPack(solves, epoch).get(`${type}:${difficulty}`);
  let solved = 0;
  if (levels) for (const n of levels) if (n >= 1 && n <= total) solved++;
  return { solved, total };
}

export function earnedFlairs(solves: readonly SolveEntry[], epoch: number = ACHIEVEMENTS_EPOCH): Set<string> {
  const levels = solvedLevelsByPack(solves, epoch);
  const unlocked = unlockedAchievements(solves, epoch);
  const out = new Set<string>();
  for (const cosmetic of COSMETICS) {
    if (cosmetic.kind !== 'flair') continue;
    const req = cosmetic.requires;
    if ('achievement' in req) {
      if (unlocked.has(req.achievement)) out.add(cosmetic.id);
      continue;
    }
    const total = levelList(req.pack, req.difficulty).length;
    if (packComplete(levels.get(`${req.pack}:${req.difficulty}`), total)) out.add(cosmetic.id);
  }
  return out;
}
