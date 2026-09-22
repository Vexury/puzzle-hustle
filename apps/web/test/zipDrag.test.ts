import { expect, it } from 'vitest';
import type { ZipSpec } from '@puzzle-hustle/core';
import { zipDragPath } from '../src/zip/ZipGame.tsx';

// 4x4 board, serpentine solution starting top left.
function spec(walls: number[] = []): ZipSpec {
  const w = new Uint8Array(16);
  for (let i = 0; i < walls.length; i += 2) {
    const a = walls[i]!;
    const b = walls[i + 1]!;
    const right = b === a + 1;
    w[a]! |= right ? 2 : 4;
    w[b]! |= right ? 8 : 1;
  }
  const numbers = new Uint8Array(16);
  numbers[0] = 1;
  numbers[1] = 2;
  numbers[12] = 3;
  return {
    version: 1,
    seed: 1,
    difficulty: 'easy',
    config: { size: 4, numbers: 3, walls: walls.length / 2 },
    numbers,
    walls: w,
    solution: Uint16Array.from([0, 1, 2, 3, 7, 6, 5, 4, 8, 9, 10, 11, 15, 14, 13, 12]),
  };
}

it('starts the path when the drag reaches the start cell', () => {
  expect(zipDragPath(spec(), [], 0)).toEqual([0]);
  expect(zipDragPath(spec(), [], 5)).toBeNull();
});

it('extends along a straight run of free cells', () => {
  expect(zipDragPath(spec(), [0], 3)).toEqual([0, 1, 2, 3]);
});

it('stops the extension at a wall', () => {
  expect(zipDragPath(spec([1, 2]), [0], 3)).toEqual([0, 1]);
});

it('erases backwards one cell at a time', () => {
  expect(zipDragPath(spec(), [0, 1, 2, 3], 2)).toEqual([0, 1, 2]);
});

it('erases the whole run when the drag jumps back along it', () => {
  expect(zipDragPath(spec(), [0, 1, 2, 3], 1)).toEqual([0, 1]);
});

it('never erases the start cell itself', () => {
  expect(zipDragPath(spec(), [0, 1], 0)).toEqual([0]);
  expect(zipDragPath(spec(), [0], 0)).toBeNull();
});

// The bug: the path runs right along row 0 and back left along row 1, and the finger
// slips up from row 1 onto a cell of row 0 that is already collected. Tapping that cell
// jumps back to it on purpose, but a drag must not throw the run away.
it('ignores a cell that is in the path but not the one just drawn', () => {
  expect(zipDragPath(spec(), [0, 1, 2, 3, 7, 6, 5], 1)).toBeNull();
  expect(zipDragPath(spec(), [0, 1, 2, 3, 7, 6, 5], 2)).toBeNull();
});

it('turns around after erasing when the drag runs on past the head', () => {
  expect(zipDragPath(spec(), [0, 4, 8], 0)).toEqual([0]);
  expect(zipDragPath(spec(), [4, 5, 6], 4)).toEqual([4]);
});

it('reports no change when the drag stays on the head', () => {
  expect(zipDragPath(spec(), [0, 1, 2], 2)).toBeNull();
});

it('ignores a diagonal jump', () => {
  expect(zipDragPath(spec(), [0, 1], 6)).toBeNull();
});
