import type { PuzzleTypeId } from '@puzzle-hustle/core';

export const HOW_TO: Record<PuzzleTypeId, string[]> = {
  shapes: [
    'Move every shape into the framed area so the lit pattern matches the faint target.',
    'Where two shapes overlap, the overlap goes dark. A third shape on top lights it again.',
    'Drag a shape, or tap it and then tap where it should go. The ring around the frame is free space.',
    'All shapes must be used. There is exactly one arrangement that works.',
  ],
  nonogram: [
    'The numbers tell you how many cells in a row or column are filled, in that order.',
    'Blocks of the same color need at least one empty cell between them. Different colors can touch.',
    'Tap to fill, tap again to mark an X, tap once more to clear. Drag to paint a whole line.',
    'Every puzzle can be solved by logic alone, no guessing needed.',
  ],
  mosaic: [
    'Every number counts the filled cells in the 3x3 block around it, the numbered cell included.',
    'A 0 means the whole block stays empty, a 9 means all of it is filled. Edge and corner blocks are smaller.',
    'Tap to fill, tap again to mark an X, tap once more to clear. Drag to paint a line.',
    'Numbers fade once their block is satisfied. Every puzzle can be solved by logic alone.',
  ],
  crowns: [
    'Place exactly one cat in every row, every column and every coloured region.',
    'Cats may never touch, not even diagonally.',
    'Tap a cell to place a cat, tap it again to clear. Long-press or right-click marks an X, and dragging marks a whole row of them.',
    'Every puzzle has exactly one solution and can be solved by logic alone.',
  ],
  stars: [
    'Place exactly two hearts in every row, every column and every coloured region.',
    'Hearts may never touch, not even diagonally, so two hearts in one row need a gap between them.',
    'Tap a cell to place a heart, tap it again to clear. Long-press or right-click marks an X, and dragging marks a whole row of them.',
    'Every puzzle has exactly one solution. Small regions are the best place to start.',
  ],
  sudoku: [
    'Fill every empty cell with a digit from 1 to 9.',
    'Each row, each column and each 3x3 box must contain every digit exactly once.',
    'Tap a cell, then a number. Notes mode (or the N key) writes small pencil marks instead.',
    'Every puzzle can be solved by logic alone, no guessing needed.',
  ],
  zip: [
    'Draw one path that starts at 1 and ends at the highest number.',
    'Pass the numbers in ascending order.',
    'The path must visit every cell exactly once. Drag to draw, drag back to erase.',
    'Thick lines are walls: the path cannot cross them.',
  ],
  tracks: [
    'Lay one track from A on the left edge to B on the bottom edge.',
    'The numbers count the track cells in each row and column. A number turns green when its line is right.',
    'Pieces are straight or curved. The track never branches, never crosses itself and forms no separate loops. Given pieces stay put.',
    'Drag across cells to lay track, drag along it again to lift it. Tap an empty cell to cycle an X, a track mark (track goes here, direction open), and empty.',
  ],
  killer: [
    'Normal Sudoku rules apply: 1 to 9 once per row, column and 3x3 box.',
    'The dashed outlines are cages. The digits inside a cage add up to the small number in its corner. Their colours only tell neighbouring cages apart and mean nothing for the solution.',
    'Digits inside a cage cannot repeat. Harder levels have no givens at all, so start from the smallest and largest cage sums.',
    'Tap a cell, then a number. Notes mode keeps track of candidates. Everything is solvable by logic.',
  ],
};
