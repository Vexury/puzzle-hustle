import { parsePuzzleId } from './puzzleId.ts';
import { isDifficulty, isPuzzleTypeId, type Difficulty, type Period, type PuzzleTypeId } from './types.ts';

export type SolveMode = 'period' | 'level' | 'random';

export interface ParsedSolveId {
  type: PuzzleTypeId;
  mode: SolveMode;
  difficulty: Difficulty;
  period?: Period;
  key?: string;
  level?: number;
}

// `refId` writes three shapes and nothing records which one it used:
//   type:period:key              a daily, weekly or monthly
//   type:level:difficulty:n      a level from a pack
//   type:difficulty:seed36       a random puzzle
// The first and third both have three segments, so the middle one decides.
export function parseSolveId(id: string): ParsedSolveId | null {
  const parts = id.split(':');

  if (parts.length === 4) {
    const [type, marker, difficulty, level] = parts;
    if (!isPuzzleTypeId(type) || marker !== 'level' || !isDifficulty(difficulty)) return null;
    const n = Number(level);
    if (!Number.isInteger(n) || n < 1) return null;
    return { type, mode: 'level', difficulty, level: n };
  }

  if (parts.length !== 3) return null;

  const period = parsePuzzleId(id);
  if (period) {
    return {
      type: period.type,
      mode: 'period',
      difficulty: period.difficulty,
      period: period.period,
      key: period.key,
    };
  }

  const [type, difficulty] = parts;
  if (!isPuzzleTypeId(type) || !isDifficulty(difficulty)) return null;
  return { type, mode: 'random', difficulty };
}
