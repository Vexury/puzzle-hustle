import { REGIONS_MARKED_EMPTY as X, type RegionsSpec } from '@puzzle-hustle/core';
import { RegionsBoard } from '../regions/RegionsBoard.tsx';
import type { DemoScript } from './DemoPlayer.tsx';

// Cats: hand-made 5x5, unique and solvable by logic (checked in demo.test.ts). Regions by row:
// AABBB / CCBBB / CDDDB / CDDDB / CCDDE, the lone E in the corner is the way in.
const REGIONS = 'AABBBCCBBBCDDDBCDDDBCCDDE';
const CATS = [1, 8, 10, 17, 24];

export const CROWNS_DEMO_SPEC: RegionsSpec = {
  version: 0,
  seed: 0,
  difficulty: 'easy',
  config: { size: 5, stars: 1 },
  regions: Uint8Array.from(REGIONS, (ch) => ch.charCodeAt(0) - 65),
  solution: Uint8Array.from({ length: 25 }, (_, i) => (CATS.includes(i) ? 1 : 0)),
};

export const CROWNS_DEMO: DemoScript = {
  start: Array(25).fill(0),
  steps: [
    { say: 'One cat in every row, every column and every colored region.', wait: 1800 },
    { say: 'This region is a single cell, so its cat goes here.', hl: [24], do: [{ tap: 24, to: 1 }] },
    { say: 'Cats never touch, not even diagonally.', do: [{ tap: 18, to: 1 }], wait: 1300 },
    { say: 'Tap again to take it back.', do: [{ tap: 18, to: 0 }], wait: 600 },
    { say: 'Hold a cell to cross it out.', do: [{ hold: 18, to: X }], wait: 900 },
    {
      say: "Swipe to cross out more. A cat's row and column stay empty.",
      hl: [4, 9, 14, 19, 20, 21, 22, 23],
      do: [
        { swipe: [19, 14, 9, 4], to: X },
        { swipe: [23, 22, 21, 20], to: X },
      ],
    },
    { say: 'Swipe from an X to clear X marks again.', do: [{ swipe: [22, 21, 20], to: 0 }], wait: 900 },
    {
      say: 'Keep going until every row, column and region has its cat.',
      do: [
        { swipe: [20, 21, 22], to: X },
        { tap: 17, to: 1, quick: true },
        { tap: 10, to: 1, quick: true },
        { tap: 8, to: 1, quick: true },
        { tap: 1, to: 1, quick: true },
      ],
      wait: 2000,
    },
    { say: 'Every puzzle has exactly one solution, and logic alone gets you there.', wait: 2600 },
  ],
};

// Seed 31 of the 8x8 easy generator, logic-solvable. The two three-cell lines (C in row 5, D in
// row 7) only fit their hearts on the ends, which is the way in.
const HEARTS_REGIONS = 'AAAFGBBBAAGFGBBBAAGFGGGEGGGGGEEEGGHHHHHHGGHHCCCHGGHHHHHHGGHHDDDH';
const HEARTS = [1, 3, 13, 15, 17, 19, 29, 31, 32, 34, 44, 46, 48, 50, 60, 62];

export const STARS_DEMO_SPEC: RegionsSpec = {
  version: 0,
  seed: 0,
  difficulty: 'easy',
  config: { size: 8, stars: 2 },
  regions: Uint8Array.from(HEARTS_REGIONS, (ch) => ch.charCodeAt(0) - 65),
  solution: Uint8Array.from({ length: 64 }, (_, i) => (HEARTS.includes(i) ? 1 : 0)),
};

export const STARS_DEMO: DemoScript = {
  start: Array(64).fill(0),
  steps: [
    { say: 'Two hearts in every row, every column and every colored region.', wait: 1800 },
    {
      say: 'Three cells in a line: two hearts that must not touch only fit on the ends.',
      hl: [44, 45, 46],
      do: [
        { tap: 44, to: 1 },
        { tap: 46, to: 1 },
      ],
    },
    { say: 'Hearts never touch, not even diagonally.', do: [{ tap: 45, to: 1 }], wait: 1300 },
    { say: 'Tap again to take it back.', do: [{ tap: 45, to: 0 }], wait: 600 },
    { say: 'Hold a cell to cross it out.', do: [{ hold: 45, to: X }], wait: 900 },
    {
      say: 'Swipe to cross out more. A row with two hearts is full.',
      hl: [40, 41, 42, 43, 47],
      do: [
        { swipe: [43, 42, 41, 40], to: X },
        { hold: 47, to: X },
      ],
    },
    { say: 'Swipe from an X to clear X marks again.', do: [{ swipe: [40, 41], to: 0 }], wait: 900 },
    {
      say: 'Keep going until every row, column and region has its two hearts.',
      do: [{ swipe: [41, 40], to: X }, ...HEARTS.filter((i) => i !== 44 && i !== 46).map((i) => ({ tap: i, to: 1, quick: true }))],
      wait: 2000,
    },
    { say: 'Every puzzle has exactly one solution, and logic alone gets you there.', wait: 2600 },
  ],
};

function renderRegionsDemo(spec: RegionsSpec, symbol: 'cat' | 'heart', cell: number, state: number[], highlight: number[] | undefined) {
  const n = spec.config.size;
  return (
    <div className="regions-wrap" style={{ '--size': n, '--cell': `${cell}px`, width: `calc(${n} * ${cell}px + 2 * var(--frame-border))` } as React.CSSProperties}>
      <RegionsBoard spec={spec} state={Uint8Array.from(state)} symbol={symbol} mistakes highlight={highlight} />
    </div>
  );
}

export const renderCrownsDemo = (state: number[], highlight: number[] | undefined) => renderRegionsDemo(CROWNS_DEMO_SPEC, 'cat', 44, state, highlight);
export const renderStarsDemo = (state: number[], highlight: number[] | undefined) => renderRegionsDemo(STARS_DEMO_SPEC, 'heart', 32, state, highlight);
