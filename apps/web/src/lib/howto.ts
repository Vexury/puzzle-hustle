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
};
