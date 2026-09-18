import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, type Difficulty } from '../src/types.ts';
import {
  KILLER_PRESETS,
  SUDOKU_PRESETS,
  emptySudokuState,
  generateKiller,
  generateSudoku,
  isSudokuSolved,
  sudokuCellValues,
  sudokuConflicts,
  sudokuHint,
  sudokuProgress,
  sudokuStateFromArray,
  sudokuStateToArray,
  type SudokuSpec,
} from '../src/sudoku/puzzle.ts';
import {
  SUDOKU_UNITS,
  countSudokuSolutions,
  isSudokuLogicSolvable,
  isSudokuUnique,
  sudokuCanonicalKey,
  sudokuDifficultyReport,
  sudokuSolveByLogic,
} from '../src/sudoku/solver.ts';

function seedsFor(difficulty: Difficulty): number {
  return difficulty === 'easy' || difficulty === 'medium' ? 20 : 3;
}

function givenCount(spec: SudokuSpec): number {
  return [...spec.givens].filter(Boolean).length;
}

function isLatin(solution: Uint8Array): boolean {
  return SUDOKU_UNITS.every((unit) => new Set(unit.map((i) => solution[i])).size === 9);
}

function transposed(spec: SudokuSpec): SudokuSpec {
  const t = (i: number) => (i % 9) * 9 + Math.floor(i / 9);
  const out = structuredClone(spec);
  for (let i = 0; i < 81; i++) {
    out.solution[t(i)] = spec.solution[i]!;
    out.givens[t(i)] = spec.givens[i]!;
  }
  out.cages = spec.cages.map((cage) => ({ sum: cage.sum, cells: cage.cells.map(t).sort((a, b) => a - b) }));
  return out;
}

function relabeled(spec: SudokuSpec): SudokuSpec {
  const perm = [0, 4, 9, 1, 7, 2, 8, 3, 6, 5];
  const out = structuredClone(spec);
  for (let i = 0; i < 81; i++) {
    out.solution[i] = perm[spec.solution[i]!]!;
    out.givens[i] = perm[spec.givens[i]!]!;
  }
  out.cages = spec.cages.map((cage) => ({ cells: [...cage.cells], sum: cage.cells.reduce((s, i) => s + out.solution[i]!, 0) }));
  return out;
}

describe('generation', () => {
  it('is deterministic per seed', () => {
    for (const gen of [generateSudoku, generateKiller]) {
      const a = gen(42, 'medium');
      const b = gen(42, 'medium');
      expect([...a.solution]).toEqual([...b.solution]);
      expect([...a.givens]).toEqual([...b.givens]);
      expect(a.cages).toEqual(b.cages);
      expect([...a.solution]).not.toEqual([...gen(43, 'medium').solution]);
    }
  });

  const cases: [string, (seed: number, d: Difficulty) => SudokuSpec, Record<Difficulty, { maxCage: number }>][] = [
    ['sudoku', generateSudoku, SUDOKU_PRESETS],
    ['killer', generateKiller, KILLER_PRESETS],
  ];

  for (const [name, gen, presets] of cases) {
    for (const difficulty of DIFFICULTIES) {
      it(`${name} ${difficulty}: ${seedsFor(difficulty)} seeds are valid, unique and logic-solvable`, () => {
        const seeds = seedsFor(difficulty);
        const t0 = performance.now();
        for (let seed = 1; seed <= seeds; seed++) {
          const spec = gen(seed, difficulty);
          expect(spec.solution.length).toBe(81);
          expect(spec.givens.length).toBe(81);
          expect(isLatin(spec.solution)).toBe(true);
          spec.givens.forEach((v, i) => {
            if (v) expect(v).toBe(spec.solution[i]);
          });
          if (name === 'killer') {
            const covered = new Uint8Array(81);
            for (const cage of spec.cages) {
              expect(cage.cells.length).toBeGreaterThanOrEqual(1);
              expect(cage.cells.length).toBeLessThanOrEqual(presets[difficulty].maxCage);
              expect(new Set(cage.cells.map((i) => spec.solution[i])).size).toBe(cage.cells.length);
              expect(cage.cells.reduce((s, i) => s + spec.solution[i]!, 0)).toBe(cage.sum);
              for (const i of cage.cells) covered[i]!++;
            }
            expect([...covered].every((n) => n === 1)).toBe(true);
            if (difficulty === 'hard' || difficulty === 'genius') expect(givenCount(spec)).toBe(0);
          } else {
            expect(spec.cages).toEqual([]);
            expect(givenCount(spec)).toBeGreaterThanOrEqual(22);
          }
          expect(isSudokuLogicSolvable(spec, spec.config.techniques)).toBe(true);
          expect(isSudokuUnique(spec)).toBe(true);
          expect(isSudokuSolved(spec, { values: spec.solution, notes: new Uint16Array(81) })).toBe(true);
          expect(isSudokuSolved(spec, emptySudokuState(spec))).toBe(false);
        }
        const ms = performance.now() - t0;
        console.info(`${name} ${difficulty}: ${(ms / seeds).toFixed(0)} ms/puzzle`);
        expect(ms).toBeLessThan(60_000);
      });
    }
  }

  it('killer easy keeps a handful of givens', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const n = givenCount(generateKiller(seed, 'easy'));
      expect(n).toBeGreaterThanOrEqual(6);
      expect(n).toBeLessThanOrEqual(14);
    }
  });
});

describe('exact solver', () => {
  it('counts one solution on generated puzzles and finds the right one', () => {
    for (const spec of [generateSudoku(7, 'hard'), generateKiller(7, 'hard')]) {
      const r = countSudokuSolutions(spec, 2);
      expect(r).toMatchObject({ solutions: 1, complete: true });
      const logic = sudokuSolveByLogic(spec);
      expect(logic.solved).toBe(true);
      expect([...logic.state]).toEqual([...spec.solution]);
    }
  });

  it('counts more than one once symmetric givens are cleared past uniqueness', () => {
    const spec = generateSudoku(3, 'easy');
    let broken = false;
    for (let i = 0; i < 40 && !broken; i++) {
      if (!spec.givens[i] || !spec.givens[80 - i]) continue;
      spec.givens[i] = 0;
      spec.givens[80 - i] = 0;
      broken = !isSudokuUnique(spec);
    }
    expect(broken).toBe(true);
    expect(countSudokuSolutions(spec, 5).solutions).toBeGreaterThan(1);
    expect(sudokuSolveByLogic(spec).solved).toBe(false);
  });

  it('reports zero solutions for a contradictory grid', () => {
    const spec = generateSudoku(4, 'easy');
    const i = spec.givens.findIndex((v) => v === 0);
    const wrong = (spec.solution[i]! % 9) + 1;
    spec.givens[i] = wrong;
    expect(countSudokuSolutions(spec).solutions).toBe(0);
  });
});

describe('state', () => {
  it('serializes to a 162 element array and back', () => {
    const spec = generateSudoku(9, 'easy');
    const state = emptySudokuState(spec);
    state.values[3] = 5;
    state.notes[10] = 0b101;
    const arr = sudokuStateToArray(state);
    expect(arr.length).toBe(162);
    const back = sudokuStateFromArray(arr);
    expect([...back.values]).toEqual([...state.values]);
    expect([...back.notes]).toEqual([...state.notes]);
    expect([...sudokuStateFromArray([1, 2, 3]).values].every((v) => v === 0)).toBe(true);
  });

  it('reports progress over non-given cells', () => {
    const spec = generateSudoku(9, 'easy');
    const state = emptySudokuState(spec);
    const total = 81 - givenCount(spec);
    expect(sudokuProgress(spec, state)).toEqual({ matching: 0, total });
    const i = spec.givens.findIndex((v) => v === 0);
    state.values[i] = spec.solution[i]!;
    expect(sudokuProgress(spec, state).matching).toBe(1);
  });

  it('flags duplicates in rows, columns, boxes and cages', () => {
    const spec = generateKiller(5, 'medium');
    const state = emptySudokuState(spec);
    expect([...sudokuConflicts(spec, state)].every((f) => f === 0)).toBe(true);
    const empty = [...spec.givens].map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    const a = empty[0]!;
    const rowMate = empty.find((i) => i !== a && Math.floor(i / 9) === Math.floor(a / 9))!;
    state.values[a] = 5;
    state.values[rowMate] = 5;
    const flags = sudokuConflicts(spec, state);
    expect(flags[a]).toBe(1);
    expect(flags[rowMate]).toBe(1);
    state.values[rowMate] = 0;
    const cage = spec.cages.find((c) => c.cells.length >= 2 && c.cells.every((i) => !spec.givens[i]))!;
    for (const i of cage.cells) state.values[i] = 0;
    state.values[cage.cells[0]!] = 9;
    state.values[cage.cells[1]!] = 9;
    const dup = sudokuConflicts(spec, state);
    expect(dup[cage.cells[0]!]).toBe(1);
    expect(dup[cage.cells[1]!]).toBe(1);
    state.values[a] = 0;
    for (const i of cage.cells) state.values[i] = spec.solution[i]!;
    expect([...sudokuConflicts(spec, state)].every((f) => f === 0)).toBe(true);
    const big = cage.cells.map((i) => spec.solution[i]!);
    big[0] = big[0]! === 9 ? 8 : 9;
    if (big.reduce((s, v) => s + v, 0) !== cage.sum && new Set(big).size === big.length) {
      cage.cells.forEach((i, k) => {
        state.values[i] = big[k]!;
      });
      const wrongSum = sudokuConflicts(spec, state);
      expect(cage.cells.some((i) => wrongSum[i] === 1)).toBe(true);
    }
  });
});

describe('hint', () => {
  it('walks from the empty state to the solution', () => {
    for (const spec of [generateSudoku(11, 'genius'), generateKiller(11, 'hard')]) {
      const state = emptySudokuState(spec);
      let steps = 0;
      while (!isSudokuSolved(spec, state)) {
        const h = sudokuHint(spec, state);
        expect(h).not.toBeNull();
        expect(sudokuCellValues(spec, state)[h!.cell]).toBe(0);
        expect(h!.value).toBe(spec.solution[h!.cell]);
        expect(h!.reason.length).toBeGreaterThan(0);
        state.values[h!.cell] = h!.value;
        steps++;
      }
      expect(steps).toBe(81 - givenCount(spec));
      expect(sudokuHint(spec, state)).toBeNull();
    }
  });

  it('fixes a wrong cell first', () => {
    const spec = generateSudoku(5, 'medium');
    const state = emptySudokuState(spec);
    const i = spec.givens.findIndex((v) => v === 0);
    state.values[i] = (spec.solution[i]! % 9) + 1;
    expect(sudokuHint(spec, state)).toMatchObject({ cell: i, value: spec.solution[i] });
  });
});

describe('reports', () => {
  it('difficulty grows with the preset', () => {
    const avg = (gen: typeof generateSudoku, d: Difficulty) => {
      let sum = 0;
      for (let seed = 1; seed <= 8; seed++) sum += sudokuDifficultyReport(gen(seed, d)).score;
      return sum / 8;
    };
    expect(avg(generateSudoku, 'easy')).toBeLessThan(avg(generateSudoku, 'hard'));
    expect(avg(generateSudoku, 'hard')).toBeLessThan(avg(generateSudoku, 'genius'));
    expect(avg(generateKiller, 'easy')).toBeLessThan(avg(generateKiller, 'hard'));
  });

  it('easy uses singles only and killer relies on cage sums', () => {
    expect(sudokuDifficultyReport(generateSudoku(2, 'easy')).hardest).toBe('naked-single');
    expect(sudokuDifficultyReport(generateKiller(2, 'easy')).used['cage-sum']).toBeGreaterThan(0);
  });

  it('canonical key is invariant under transpose and digit relabeling', () => {
    for (const spec of [generateSudoku(13, 'medium'), generateKiller(13, 'medium')]) {
      const key = sudokuCanonicalKey(spec);
      expect(sudokuCanonicalKey(transposed(spec))).toBe(key);
      expect(sudokuCanonicalKey(relabeled(spec))).toBe(key);
      expect(sudokuCanonicalKey(transposed(relabeled(spec)))).toBe(key);
      const other = structuredClone(spec);
      other.givens[spec.givens.findIndex((v) => v > 0)] = 0;
      expect(sudokuCanonicalKey(other)).not.toBe(key);
    }
    expect(sudokuCanonicalKey(generateSudoku(14, 'medium'))).not.toBe(sudokuCanonicalKey(generateSudoku(13, 'medium')));
  });
});
