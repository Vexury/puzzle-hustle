import { coverage, litMask, shapesConfig, type ShapesPiece, type ShapesSpec, type ShapesState } from '@puzzle-hustle/core';
import { ShapesBoard, ShapesTray } from '../shapes/ShapesBoard.tsx';
import type { DemoScript } from './DemoPlayer.tsx';

// 3x3 board, unique (checked in demo-shapesslabs.test.ts). The large square leaves its corner lit
// outside the target; the small square darkens that corner and the triangle lights half of it again.
const PIECES: ShapesPiece[] = [
  { id: 0, kind: 'sq2' },
  { id: 1, kind: 'sq1' },
  { id: 2, kind: 'tri-nw' },
];
const SOLUTION = [
  { r: 1, c: 1 },
  { r: 2, c: 2 },
  { r: 2, c: 2 },
];
const config = { ...shapesConfig('easy'), pieceCount: PIECES.length };

export const SHAPES_DEMO_SPEC: ShapesSpec = {
  version: 0,
  seed: 0,
  difficulty: 'easy',
  config,
  pieces: PIECES,
  target: litMask(coverage(config.size, PIECES, SOLUTION)),
  solution: SOLUTION,
};

// State: r, c per piece (-1 in the tray), then the piece picked by a tap (-1 for none).
// Targets: 0 the large square's spot, 1 the centre cell, 2 the corner cell, 10 + i tray slot i.
const SPOTS: [number, number, number, number][] = [
  [1, 1, 2, 2],
  [2, 2, 1, 1],
  [3, 3, 1, 1],
];
const SELECTED = 6;
const CENTRE = 2 * config.size + 2;

export const SHAPES_DEMO: DemoScript = {
  start: [-1, -1, -1, -1, -1, -1, -1],
  steps: [
    { say: 'Each tray shape is drawn to scale, one faint square per board cell.', wait: 2000 },
    { say: 'Drag every shape onto the board so the lit pattern matches the faint target.', do: [{ swipe: [10, 0], set: [[], [[0, 1], [1, 1]]], ms: 700 }] },
    {
      say: 'Or tap a shape, then tap a spot.',
      do: [
        { tap: 12, set: [[SELECTED, 2]] },
        { tap: 2, set: [[4, 3], [5, 3], [SELECTED, -1]] },
      ],
    },
    { say: 'That lights a cell outside the target. Drag it off the board to put it back.', do: [{ swipe: [2, 12], set: [[], [[4, -1], [5, -1]]], ms: 700 }] },
    { say: 'Where two shapes overlap, the overlap goes dark.', hl: [CENTRE], do: [{ swipe: [11, 1], set: [[], [[2, 2], [3, 2]]], ms: 700 }] },
    { say: 'A third shape on top lights it again.', hl: [CENTRE], do: [{ swipe: [12, 1], set: [[], [[4, 2], [5, 2]]], ms: 700 }], wait: 1800 },
    { say: 'All shapes must be used. There is exactly one arrangement that works.', wait: 2600 },
  ],
};

export function shapesDemoState(state: number[]): ShapesState {
  return PIECES.map((_, i) => (state[i * 2]! < 0 ? null : { r: state[i * 2]!, c: state[i * 2 + 1]! }));
}

export function renderShapesDemo(state: number[], highlight: number[] | undefined) {
  const placed = shapesDemoState(state);
  const selected = state[SELECTED]! >= 0 ? state[SELECTED]! : null;
  return (
    <div className="shapes-wrap" style={{ '--inner': config.inner, width: 190 } as React.CSSProperties}>
      <div className="shapes">
        <div className="board-panel">
          <ShapesBoard spec={SHAPES_DEMO_SPEC} state={placed} selected={selected} highlight={highlight}>
            {SPOTS.map(([r, c, h, w], k) => (
              <rect key={k} data-demo={k} x={c} y={r} width={w} height={h} fill="none" />
            ))}
          </ShapesBoard>
          <ShapesTray spec={SHAPES_DEMO_SPEC} state={placed} selected={selected} slotProps={(i) => ({ 'data-demo': 10 + i })} />
        </div>
      </div>
    </div>
  );
}
