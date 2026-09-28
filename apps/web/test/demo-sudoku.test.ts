import { expect, it } from 'vitest';
import { isSudokuSolved, isSudokuUnique, sudokuSolveByLogic, sudokuStateFromArray, type SudokuSpec } from '@puzzle-hustle/core';
import { finalState, type DemoScript } from '../src/demo/DemoPlayer.tsx';
import { KILLER_DEMO, KILLER_DEMO_SPEC, SUDOKU_DEMO, SUDOKU_DEMO_SPEC } from '../src/demo/sudoku.tsx';

it.each<[string, SudokuSpec, DemoScript]>([
  ['sudoku', SUDOKU_DEMO_SPEC, SUDOKU_DEMO],
  ['killer', KILLER_DEMO_SPEC, KILLER_DEMO],
])('plays the %s demo to its unique solution', (_, spec, script) => {
  for (const cage of spec.cages) expect(cage.cells.reduce((s, i) => s + spec.solution[i]!, 0)).toBe(cage.sum);
  expect(isSudokuUnique(spec)).toBe(true);
  expect(sudokuSolveByLogic(spec).solved).toBe(true);
  expect(isSudokuSolved(spec, sudokuStateFromArray(finalState(script).slice(0, 162)))).toBe(true);
});
