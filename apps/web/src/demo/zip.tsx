import type { ZipSpec } from '@puzzle-hustle/core';
import { ZipBoard } from '../zip/ZipBoard.tsx';
import { zipDragPath } from '../zip/ZipGame.tsx';
import type { DemoGesture, DemoScript } from './DemoPlayer.tsx';

// Hand-made 5x5, unique (checked in demo-ziptracks.test.ts). The wall right of the top row sends
// the path down to 2; the wall right of 4 sends it down again.
const N = 5;
const PATH = [0, 1, 2, 7, 6, 5, 10, 15, 20, 21, 16, 11, 12, 17, 22, 23, 24, 19, 18, 13, 14, 9, 8, 3, 4];
const NUMBERS: Record<number, number> = { 0: 1, 7: 2, 20: 3, 12: 4, 4: 5 };
const WALLS: [number, number][] = [
  [2, 3],
  [12, 13],
];

function wallBits(): Uint8Array {
  const walls = new Uint8Array(N * N);
  for (const [a, b] of WALLS) {
    walls[a]! |= 2;
    walls[b]! |= 8;
  }
  return walls;
}

export const ZIP_DEMO_SPEC: ZipSpec = {
  version: 0,
  seed: 0,
  difficulty: 'easy',
  config: { size: N, numbers: 5, walls: WALLS.length },
  numbers: Uint8Array.from({ length: N * N }, (_, i) => NUMBERS[i] ?? 0),
  walls: wallBits(),
  solution: Uint16Array.from(PATH),
};

// Demo state: the path length, then the path's cells. Gestures run through the game's own drag
// rule, so the demo draws exactly what a finger on the real board would.
function zipScript() {
  let path: number[] = [];
  const writes = (prev: number[], next: number[]): [number, number][] => [[0, next.length], ...next.flatMap((cell, k): [number, number][] => (prev[k] === cell ? [] : [[k + 1, cell]]))];
  const press = (cell: number) => {
    const pos = path.indexOf(cell);
    if (pos >= 0) return path.slice(0, pos + 1);
    if (path.length === 0 && cell === PATH[0]) return [cell];
    throw new Error(`zip demo: press on ${cell} does nothing`);
  };
  const step = (next: number[]) => {
    const w = writes(path, next);
    path = next;
    return w;
  };
  const swipe = (cells: number[], ms?: number): DemoGesture => ({
    swipe: cells,
    set: cells.map((cell, k) => step(k === 0 ? press(cell) : (zipDragPath(ZIP_DEMO_SPEC, path, cell) ?? path))),
    ...(ms ? { ms } : {}),
  });
  const tap = (cell: number): DemoGesture => ({ tap: cell, set: step(press(cell)) });

  return {
    start: Array(N * N + 1).fill(0),
    steps: [
      { say: 'Draw one path that starts at 1 and ends at the highest number.', hl: [0, 4], do: [swipe([0, 1, 2])] },
      { say: 'Thick lines are walls. The path cannot cross them.', hl: [2, 3], do: [swipe([2, 3, 2, 7])] },
      { say: 'Pass the numbers in ascending order. This path hits 4 before 3.', do: [swipe([7, 6, 5, 10, 11, 12])], wait: 1300 },
      { say: 'Swipe back along the path to erase it.', do: [swipe([12, 11, 10])], wait: 900 },
      { say: 'The path must visit every cell exactly once. This one leaves two out.', hl: [11, 16], do: [swipe([10, 15, 20, 21, 22, 17, 12])], wait: 1300 },
      { say: 'Tap a cell on the path to cut it back to there.', do: [tap(21)], wait: 900 },
      { say: 'Fill every cell on the way to the highest number.', do: [swipe([21, 16, 11, 12, 17, 22, 23, 24, 19, 18, 13, 14, 9, 8, 3, 4], 170)], wait: 2600 },
    ],
  } satisfies DemoScript;
}

export const ZIP_DEMO: DemoScript = zipScript();

export function zipDemoPath(state: number[]): number[] {
  return state.slice(1, 1 + state[0]!);
}

const CELL = 48;

export function renderZipDemo(state: number[], highlight: number[] | undefined) {
  return (
    <div className="zip-wrap" style={{ '--size': N, '--cell': `${CELL}px`, width: `calc(${N} * ${CELL}px + 2 * var(--frame-border))` } as React.CSSProperties}>
      <ZipBoard spec={ZIP_DEMO_SPEC} path={zipDemoPath(state)} highlight={highlight} />
    </div>
  );
}
