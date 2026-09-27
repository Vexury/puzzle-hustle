import type { PuzzleTypeId } from '@puzzle-hustle/core';

// The controls in brief, shown above the rules: each gesture and what it does. A swipe is a
// stroke across cells; it only changes cells that look like the one it started on.
const GRID_SWIPE: [string, string] = ['Swipe', "Repeats the first cell's change along the stroke, skipping cells that looked different"];
const SUDOKU_CONTROLS: [string, string][] = [
  ['Tap', 'Pick a cell, then tap a number'],
  ['Notes', 'Numbers go in as small pencil marks'],
  ['Erase', 'Clears the picked cell'],
  ['Keys', '1 to 9, Delete, N for notes, arrows'],
];
const SYMBOL_CONTROLS = (symbol: string): [string, string][] => [
  ['Tap', `Place a ${symbol}, tap again to clear`],
  ['Hold', 'Mark an X (right-click too)'],
  ['Swipe', 'Marks X in empty cells; from an X it clears X'],
];

export const CONTROLS: Record<PuzzleTypeId, [string, string][]> = {
  shapes: [
    ['Drag', 'Move a shape'],
    ['Tap, tap', 'Tap a shape, then the spot it should go to'],
  ],
  nonogram: [
    ['Tap', 'Fill, then X, then clear'],
    ['Hold', 'Mark an X (right-click too)'],
    GRID_SWIPE,
    ['Pinch', 'Zoom big boards, two fingers pan'],
  ],
  mosaic: [
    ['Tap', 'Fill, then X, then clear'],
    ['Hold', 'Mark an X (right-click too)'],
    GRID_SWIPE,
    ['Pinch', 'Zoom big boards, two fingers pan'],
  ],
  crowns: SYMBOL_CONTROLS('cat'),
  stars: SYMBOL_CONTROLS('heart'),
  sudoku: SUDOKU_CONTROLS,
  killer: SUDOKU_CONTROLS,
  zip: [
    ['Swipe', 'Draw from 1 on, swipe back to erase'],
    ['Tap', 'On the path: cut it back to there. In line with its end: extend it'],
  ],
  tracks: [
    ['Tap', 'X, then track mark, then clear'],
    ['Swipe', 'Marks X in empty cells; from an X it clears X'],
    ['Hold, swipe', 'Puts track marks (track goes here, way open); from a mark it clears marks'],
    ['From track', 'A swipe lays track, also from A, B and given pieces; back along it lifts it'],
  ],
  slabs: [
    ['Drag', 'Move a slab; off the board it goes back to the tray'],
    ['Tap', 'Turn it around the half you touched'],
  ],
};

export const HOW_TO: Record<PuzzleTypeId, string[]> = {
  shapes: [
    'Move every shape into the framed area so the lit pattern matches the faint target.',
    'Where two shapes overlap, the overlap goes dark. A third shape on top lights it again.',
    'The ring around the frame is free space to park shapes in.',
    'All shapes must be used. There is exactly one arrangement that works.',
  ],
  nonogram: [
    'The numbers tell you how many cells in a row or column are filled, in that order.',
    'Blocks of the same color need at least one empty cell between them. Different colors can touch.',
    'Every puzzle can be solved by logic alone, no guessing needed.',
  ],
  mosaic: [
    'Every number counts the filled cells in the 3x3 block around it, the numbered cell included.',
    'A 0 means the whole block stays empty, a 9 means all of it is filled. Edge and corner blocks are smaller.',
    'Numbers fade once their block is satisfied. Every puzzle can be solved by logic alone.',
  ],
  crowns: [
    'Place exactly one cat in every row, every column and every coloured region.',
    'Cats may never touch, not even diagonally.',
    'Every puzzle has exactly one solution and can be solved by logic alone.',
  ],
  stars: [
    'Place exactly two hearts in every row, every column and every coloured region.',
    'Hearts may never touch, not even diagonally, so two hearts in one row need a gap between them.',
    'Every puzzle has exactly one solution. Small regions are the best place to start.',
  ],
  sudoku: [
    'Fill every empty cell with a digit from 1 to 9.',
    'Each row, each column and each 3x3 box must contain every digit exactly once.',
    'Every puzzle can be solved by logic alone, no guessing needed.',
  ],
  zip: [
    'Draw one path that starts at 1 and ends at the highest number.',
    'Pass the numbers in ascending order.',
    'The path must visit every cell exactly once.',
    'Thick lines are walls: the path cannot cross them.',
  ],
  tracks: [
    'Lay one track from A on the left edge to B on the bottom edge.',
    'The numbers count the track cells in each row and column. A number turns green when its line is right.',
    'Pieces are straight or curved. The track never branches, never crosses itself and forms no separate loops. Given pieces stay put.',
  ],
  slabs: [
    'Place every slab from the tray on the board. Together they cover every open cell.',
    'Each coloured region has a rule: a number is the sum of its pips, <N and >N bound the sum, = means all pips equal, ≠ means all different. Cells without colour have no rule.',
    'A badge turns green when its region is right and red when it can no longer work. Every puzzle has exactly one solution.',
  ],
  killer: [
    'Normal Sudoku rules apply: 1 to 9 once per row, column and 3x3 box.',
    'The dashed outlines are cages. The digits inside a cage add up to the small number in its corner. Their colours only tell neighbouring cages apart and mean nothing for the solution.',
    'Digits inside a cage cannot repeat. Harder levels have no givens at all, so start from the smallest and largest cage sums.',
    'Everything is solvable by logic, no guessing needed.',
  ],
};
