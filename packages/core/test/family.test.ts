import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, PUZZLE_TYPES, type Difficulty } from '../src/types.ts';
import { adapter } from '../src/registry.ts';
import { levelList } from '../src/levels.ts';
import { generateShapes } from '../src/shapes/puzzle.ts';
import { shapesFamilyKey } from '../src/shapes/solver.ts';
import { generateZip } from '../src/zip/puzzle.ts';
import { zipFamilyKey } from '../src/zip/solver.ts';

// The family key answers "does this puzzle use the same building blocks as that one",
// ignoring where they sit. Two of them in a row is what made Shapes easy 34, 35 and 36
// feel like the same puzzle three times over.
describe('family key', () => {
  it('ignores the order of the pieces but not which pieces they are', () => {
    const spec = generateShapes(1001, 'easy');
    const reordered = { ...spec, pieces: [...spec.pieces].reverse() };
    expect(shapesFamilyKey(reordered)).toBe(shapesFamilyKey(spec));

    const first = spec.pieces[0]!;
    const other = first.kind === 'dia1' ? ('sq1' as const) : ('dia1' as const);
    const swapped = { ...spec, pieces: spec.pieces.map((p, i) => (i === 0 ? { ...p, kind: other } : p)) };
    expect(shapesFamilyKey(swapped)).not.toBe(shapesFamilyKey(spec));
  });

  it('separates zip puzzles by their segment lengths', () => {
    expect(zipFamilyKey(generateZip(1001, 'easy'))).toBe(zipFamilyKey(generateZip(1001, 'easy')));
    expect(zipFamilyKey(generateZip(1001, 'easy'))).not.toBe(zipFamilyKey(generateZip(1002, 'easy')));
  });

  it('is offered by every adapter that has a vocabulary to compare', () => {
    for (const type of PUZZLE_TYPES) {
      const a = adapter(type);
      // Sudoku is the exception: every puzzle uses the same nine digits, so the only thing
      // a family key could separate there is the difficulty, which the presets already fix.
      if (type === 'sudoku') {
        expect(a.family).toBeUndefined();
        continue;
      }
      expect(typeof a.family).toBe('function');
      expect(a.family!(1001, 'easy')).toBe(a.family!(1001, 'easy'));
    }
  });
});

// Regenerating a level costs a generator run, so this checks the difficulties where
// families are scarce enough for collisions to be likely: easy and medium everywhere, and
// all four for shapes, whose easy pack has only 37 families to draw on. Hard and genius
// have thousands of families each and no measured collision; `pnpm levels` reports the
// adjacent twins of every pack it writes, including those.
describe('level packs', () => {
  const covered = (type: string, difficulty: Difficulty): boolean =>
    type === 'shapes' || difficulty === 'easy' || difficulty === 'medium';

  it('never put two levels with the same family side by side', () => {
    for (const type of PUZZLE_TYPES) {
      const a = adapter(type);
      if (!a.family) continue;
      for (const difficulty of DIFFICULTIES) {
        if (!covered(type, difficulty)) continue;
        const twins: string[] = [];
        let previous = '';
        levelList(type, difficulty).forEach((entry, i) => {
          const key = a.family!(entry.seed, difficulty);
          if (i > 0 && key === previous) twins.push(`${type}/${difficulty} levels ${i} and ${i + 1}: ${key}`);
          previous = key;
        });
        expect(twins).toEqual([]);
      }
    }
  }, 300_000);
});
