import { MOSAIC_MARKED_EMPTY as X, type MosaicSpec } from '@puzzle-hustle/core';
import { MosaicBoard } from '../mosaic/MosaicBoard.tsx';
import type { DemoScript } from './DemoPlayer.tsx';

// Hand-made 5x5 with seven clues, solvable by logic (checked in demo-nonomosaic.test.ts). The
// 9, the 0 and the corner 4 are forced on their own; the 8 then keeps its lower right corner
// empty, the 1 below fills the bottom middle, and the top 4 and 2 settle the right edge.
const SOLUTION = '1110111101111001100011100';
const CLUES = '..4.2/.9.../.8.../....0/4..1.';

export const MOSAIC_DEMO_SPEC: MosaicSpec = {
  version: 0,
  seed: 0,
  difficulty: 'easy',
  config: { rows: 5, cols: 5, density: 0.5, clueRatio: 0.3 },
  solution: Uint8Array.from(SOLUTION, Number),
  clues: Int8Array.from(CLUES.replaceAll('/', ''), (ch) => (ch === '.' ? -1 : Number(ch))),
};

export const MOSAIC_DEMO: DemoScript = {
  start: Array(25).fill(0),
  steps: [
    { say: 'Each number counts the filled cells in the 3x3 block around it, itself included.', hl: [5, 6, 7, 10, 11, 12, 15, 16, 17], wait: 2400 },
    {
      say: 'A 9 means the whole block is filled. Swipe to fill several cells.',
      hl: [0, 1, 2, 5, 6, 7, 10, 11, 12],
      do: [{ swipe: [0, 1, 2, 7, 6, 5, 10, 11, 12], to: 1 }],
    },
    {
      say: 'A 0 keeps its whole block empty. Hold a cell to cross it out, keep holding and swipe for more.',
      hl: [13, 14, 18, 19, 23, 24],
      do: [
        { hold: 14, to: X },
        { swipe: [13, 18, 23, 24, 19], hold: true, to: X },
      ],
    },
    {
      say: 'Edge and corner blocks are smaller: this 4 fills its corner. Tap to fill a cell.',
      hl: [15, 16, 20, 21],
      do: [
        { tap: 15, to: 1 },
        { tap: 16, to: 1, quick: true },
        { tap: 20, to: 1, quick: true },
        { tap: 21, to: 1, quick: true },
      ],
    },
    { say: 'Too many filled cells turn a number red.', do: [{ tap: 17, to: 1 }], wait: 1300 },
    { say: 'Tap again for an X. A third tap clears the cell.', do: [{ tap: 17, to: X }], wait: 1200 },
    {
      say: 'Numbers fade once their block is satisfied. Finish the rest.',
      do: [
        { swipe: [4, 9], to: 1 },
        { tap: 22, to: 1, quick: true },
      ],
      wait: 2000,
    },
    { say: 'Every puzzle can be solved by logic alone.', wait: 2600 },
  ],
};

export const renderMosaicDemo = (state: number[], highlight: number[] | undefined) => <MosaicBoard spec={MOSAIC_DEMO_SPEC} state={Uint8Array.from(state)} cell={48} mistakes highlight={highlight} />;
