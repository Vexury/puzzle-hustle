import pack from './levels.json' with { type: 'json' };
import type { Difficulty, PuzzleTypeId } from './types.ts';

export interface LevelEntry {
  seed: number;
  score: number;
}

export interface LevelPack {
  generatedAt: string;
  versions: Record<PuzzleTypeId, number>;
  levels: Record<PuzzleTypeId, Record<Difficulty, LevelEntry[]>>;
}

export const LEVEL_PACK = pack as LevelPack;

export function levelList(type: PuzzleTypeId, difficulty: Difficulty): LevelEntry[] {
  return LEVEL_PACK.levels[type]?.[difficulty] ?? [];
}

export function levelEntry(type: PuzzleTypeId, difficulty: Difficulty, level: number): LevelEntry | undefined {
  return levelList(type, difficulty)[level - 1];
}
