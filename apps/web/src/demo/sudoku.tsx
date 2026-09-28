import { KILLER_PRESETS, SUDOKU_PRESETS, sudokuCellValues, sudokuStateFromArray, type SudokuCage, type SudokuSpec } from '@puzzle-hustle/core';
import { DIGITS, SudokuBoard, SudokuPad } from '../sudoku/SudokuBoard.tsx';
import { ToolButton } from '../components/ToolButton.tsx';
import type { DemoGesture, DemoScript } from './DemoPlayer.tsx';

// State: 81 entered values, 81 note masks, then the selected cell, the notes switch and the lit
// pad key. Cells are found by data-i, pad keys by data-demo KEY + digit.
const NOTES_AT = 81;
const SEL = 162;
const MODE = 163;
const LIT = 164;
const KEY = 90;
const NOTES = 100;
const ERASE = 101;
const START = [...Array<number>(162).fill(0), -1, 0, 0];

const row = (r: number) => Array.from({ length: 9 }, (_, c) => r * 9 + c);
const col = (c: number) => Array.from({ length: 9 }, (_, r) => r * 9 + c);
const box = (b: number) => Array.from({ length: 9 }, (_, k) => (Math.floor(b / 3) * 3 + Math.floor(k / 3)) * 9 + (b % 3) * 3 + (k % 3));

const cell = (i: number, quick = false): DemoGesture => ({ tap: i, set: [[SEL, i]], quick });
const digit = (i: number, d: number, quick = false): DemoGesture => ({ tap: KEY + d, set: [[i, d], [NOTES_AT + i, 0], [LIT, d]], quick });
const note = (i: number, mask: number, d: number, quick = false): DemoGesture => ({ tap: KEY + d, set: [[NOTES_AT + i, mask], [LIT, d]], quick });
const notes = (on: number): DemoGesture => ({ tap: NOTES, set: [[MODE, on]] });
const erase = (i: number): DemoGesture => ({ tap: ERASE, set: [[i, 0], [NOTES_AT + i, 0]] });
const fill = (cells: [number, number][]): DemoGesture[] => cells.flatMap(([i, d]) => [cell(i, true), digit(i, d, true)]);
const bits = (...ds: number[]) => ds.reduce((m, d) => m | (1 << (d - 1)), 0);

function demoSpec(solution: string, holes: number[], config: SudokuSpec['config'], cages: SudokuCage[] = []): SudokuSpec {
  const sol = Uint8Array.from(solution, Number);
  return { version: 0, seed: 0, difficulty: 'easy', config, solution: sol, givens: sol.map((v, i) => (holes.includes(i) ? 0 : v)), cages };
}

// A classic solved grid with five holes. Row 4 misses only its 7, row 2 misses 3 and 8 and the
// box settles which is which; the rest are singles. The wrong digit has to be one the pad still
// offers, as the game refuses a tenth. Unique and logic-solvable (demo-sudoku.test.ts).
const SUDOKU_SOLUTION = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

export const SUDOKU_DEMO_SPEC = demoSpec(SUDOKU_SOLUTION, [12, 20, 21, 42, 60], SUDOKU_PRESETS.easy);

export const SUDOKU_DEMO: DemoScript = {
  start: START,
  steps: [
    { say: 'Fill the empty cells so every row, column and 3x3 box holds 1 to 9 exactly once.', hl: [...row(4), ...col(6), ...box(5)], wait: 2400 },
    { say: 'Tap a cell, then a number. This row only misses a 7.', hl: row(4), do: [cell(42), digit(42, 7)], wait: 1100 },
    { say: 'A digit twice in a row, column or box turns red.', hl: row(1), do: [cell(12), digit(12, 3)], wait: 1100 },
    { say: 'Tap Erase to clear it.', do: [erase(12)], wait: 700 },
    { say: 'Turn on Notes to pencil in candidates. This row misses 3 and 8.', hl: row(2), do: [cell(20), notes(1), note(20, bits(3), 3), note(20, bits(3, 8), 8, true)], wait: 1000 },
    { say: 'Its box already has a 3, so this cell is the 8.', hl: box(0), do: [notes(0), digit(20, 8)], wait: 1300 },
    {
      say: 'Fill the rest the same way until the board is solved.',
      do: fill([
        [21, 3],
        [12, 1],
        [60, 2],
      ]),
      wait: 1500,
    },
    { say: 'Every puzzle can be solved by logic alone, no guessing needed.', wait: 2200 },
  ],
};

// Cages of a generated easy Killer, one letter per cage. The 5 cage in the top row lacks one
// digit; the 8 cage in row 3 lies in a row missing 3, 4 and 5, so no repeats leaves 3 + 5, and
// the column decides the order. The three missing 4s let the wrong 4 + 4 go red for the cage
// and its row only, and keep 4 on the pad.
const KILLER_SOLUTION = '876951324325684791491237586534712869217869453689345172953428617142576938768193245';
const KILLER_CAGES = 'PYYYWXQQJPKKKWXRRJPdddHHGRJZZNNNHGDEIIOaaaGDEIFOOScccEBFAASSbbCBUUAMTLLCVVUMMTTLC';
const KILLER_SUMS: Record<string, number> = {
  A: 12, B: 10, C: 20, D: 11, E: 14, F: 13, G: 17, H: 12, I: 9, J: 11, K: 13, L: 16, M: 17, N: 12, O: 19,
  P: 15, Q: 5, R: 24, S: 14, T: 11, U: 14, V: 13, W: 13, X: 5, Y: 22, Z: 8, a: 23, b: 7, c: 13, d: 12,
};

export const KILLER_DEMO_SPEC = demoSpec(
  KILLER_SOLUTION,
  [7, 18, 27, 28, 29, 64],
  KILLER_PRESETS.easy,
  Object.entries(KILLER_SUMS).map(([id, sum]) => ({ sum, cells: [...KILLER_CAGES].flatMap((ch, i) => (ch === id ? [i] : [])) })),
);

export const KILLER_DEMO: DemoScript = {
  start: START,
  steps: [
    { say: 'Normal Sudoku rules apply: 1 to 9 once per row, column and 3x3 box.', hl: [...row(0), ...col(7), ...box(2)], wait: 1800 },
    { say: 'Dashed outlines are cages. Their colors only tell neighboring cages apart.', hl: [6, 7, 27, 28], wait: 1600 },
    { say: 'A cage adds up to its small number. Tap a cell, then a number: 5 is 3 + 2.', hl: [6, 7], do: [cell(7), digit(7, 2)], wait: 1100 },
    { say: 'Digits never repeat in a cage, so this 8 cannot be 4 + 4.', hl: [27, 28], do: [cell(27), digit(27, 4), cell(28, true), digit(28, 4, true)], wait: 1100 },
    { say: 'Tap Erase to clear a digit.', do: [erase(28), cell(27, true), erase(27)], wait: 700 },
    { say: 'Turn on Notes to pencil in candidates. Only 3 + 5 makes 8 here.', hl: [27, 28], do: [notes(1), note(27, bits(3), 3), note(27, bits(3, 5), 5, true)], wait: 1100 },
    { say: 'This column already has a 3, so this cell is the 5.', hl: col(0), do: [notes(0), digit(27, 5)], wait: 1300 },
    {
      say: 'Fill the rest the same way. Everything is solvable by logic, no guessing needed.',
      do: fill([
        [28, 3],
        [29, 4],
        [18, 4],
        [64, 4],
      ]),
      wait: 1800,
    },
    { say: 'Harder levels have no givens, so start from the smallest and largest cage sums.', wait: 2200 },
  ],
};

function renderSudokuLikeDemo(spec: SudokuSpec, state: number[], highlight: number[] | undefined) {
  const board = sudokuStateFromArray(state.slice(0, SEL));
  const values = sudokuCellValues(spec, board);
  const selected = state[SEL]! < 0 ? null : state[SEL]!;
  const lit = state[LIT]!;
  const remaining = DIGITS.map((d) => 9 - values.reduce((n, v) => n + (v === d ? 1 : 0), 0));
  return (
    <div className="sudoku-wrap sudoku-demo">
      <SudokuBoard spec={spec} state={board} selected={selected} marked={(selected === null ? 0 : values[selected]!) || lit} markNotes mistakes highlight={highlight} />
      <SudokuPad remaining={remaining} lit={lit} locked={false} markDigits demoBase={KEY} />
      <div className="tools">
        <span data-demo={NOTES}>
          <ToolButton icon="notes" label="Notes" className={state[MODE] ? 'active' : ''} onClick={() => {}} pressed={Boolean(state[MODE])} />
        </span>
        <span data-demo={ERASE}>
          <ToolButton icon="erase" label="Erase" onClick={() => {}} />
        </span>
      </div>
    </div>
  );
}

export const renderSudokuDemo = (state: number[], highlight: number[] | undefined) => renderSudokuLikeDemo(SUDOKU_DEMO_SPEC, state, highlight);
export const renderKillerDemo = (state: number[], highlight: number[] | undefined) => renderSudokuLikeDemo(KILLER_DEMO_SPEC, state, highlight);
