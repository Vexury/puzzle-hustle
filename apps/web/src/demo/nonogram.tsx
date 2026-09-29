import { MARKED_EMPTY as X, type NonogramSpec } from '@puzzle-hustle/core';
import { NonogramBoard } from '../nonogram/NonogramBoard.tsx';
import type { DemoScript } from './DemoPlayer.tsx';

// A heart, line-solvable (checked in demo-nonomosaic.test.ts): the two 5s are the way in, then
// the outer 2s are complete and the 1 1 on top has three cells left. Clue highlights are
// 25 + row and 30 + column.
const HEART = '0101011111111110111000100';
const line = (...lens: number[]) => lens.map((len) => ({ len, color: 1 }));

export const NONOGRAM_DEMO_SPEC: NonogramSpec = {
  version: 0,
  seed: 0,
  difficulty: 'easy',
  config: { rows: 5, cols: 5, colors: 1, density: 0.5 },
  solution: Uint8Array.from(HEART, Number),
  rowClues: [line(1, 1), line(5), line(5), line(3), line(1)],
  colClues: [line(2), line(4), line(4), line(4), line(2)],
};

export const NONOGRAM_DEMO: DemoScript = {
  start: Array(25).fill(0),
  steps: [
    { say: 'The numbers count the filled cells in each row and column, in that order.', hl: [25, 26, 27, 28, 29, 30, 31, 32, 33, 34], wait: 2200 },
    {
      say: 'These rows need 5 filled cells and have only 5, so all of them are filled. Swipe to fill along a line.',
      hl: [26, 27, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
      do: [
        { swipe: [5, 6, 7, 8, 9], to: 1 },
        { swipe: [14, 13, 12, 11, 10], to: 1 },
      ],
    },
    {
      say: 'The outer columns need 2 filled cells and already have them, so the rest stay empty. Hold a cell to cross it out.',
      hl: [30, 34, 0, 15, 20, 4, 19, 24],
      do: [
        { hold: 0, to: X },
        { hold: 4, to: X },
      ],
    },
    {
      say: 'Blocks need an empty cell between them, so this clue turns red.',
      hl: [25],
      do: [
        { tap: 1, to: 1 },
        { tap: 2, to: 1 },
      ],
    },
    { say: 'Tap again for an X. A third tap clears the cell.', do: [{ tap: 2, to: X }], wait: 1200 },
    {
      say: 'Finish the picture. In color puzzles, different colors may touch.',
      do: [
        { tap: 3, to: 1, quick: true },
        { swipe: [16, 17, 18], to: 1 },
        { tap: 22, to: 1, quick: true },
      ],
      wait: 2000,
    },
    { say: 'Every puzzle can be solved by logic alone, no guessing needed.', wait: 2600 },
  ],
};

export const renderNonogramDemo = (state: number[], highlight: number[] | undefined) => <NonogramBoard spec={NONOGRAM_DEMO_SPEC} state={Uint8Array.from(state)} cell={40} mistakes highlight={highlight} />;
