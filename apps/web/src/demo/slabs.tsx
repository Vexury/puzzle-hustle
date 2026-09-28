import type { SlabsSpec } from '@puzzle-hustle/core';
import { SlabsBoard, SlabsTray } from '../slabs/SlabsBoard.tsx';
import type { DemoScript } from './DemoPlayer.tsx';

// Seven open cells on a 3x3 board, unique and solvable by logic (checked in
// demo-shapesslabs.test.ts). By row: -BA / --A / .CC, with A '=', B '<3', C '11' and one cell
// without a rule. The 2|6 slab laid flat on C makes 8, which can no longer reach 11; turned up
// around its 6 it fills the '=' region with a second 2.
const COLS = 3;

export const SLABS_DEMO_SPEC: SlabsSpec = {
  version: 0,
  seed: 0,
  difficulty: 'easy',
  config: { cols: COLS, rows: 3, slabs: 3, maxTier: 1, minTopSteps: 0, minRegion: 1, maxRegion: 2, weaken: 0, blank: 0, maxTopSteps: 0, islands: 1, matchBias: 0, maxWaves: 3, minFirst: 1 },
  blocked: Uint8Array.from([1, 0, 0, 1, 1, 0, 0, 0, 0]),
  slabs: [
    [2, 2],
    [2, 6],
    [4, 5],
  ],
  regionOf: Int16Array.from([-1, 1, 0, -1, -1, 0, -1, 2, 2]),
  rules: [
    { kind: 'eq', target: 0 },
    { kind: 'lt', target: 3 },
    { kind: 'sum', target: 11 },
  ],
  solution: [
    { anchor: 1, dir: 0 },
    { anchor: 5, dir: 1 },
    { anchor: 6, dir: 0 },
  ],
  order: [0, 1, 2],
};

// Targets: 0 to 2 the drop spots (the middle of the two cells), 3 the 6 half turned on, 10 + s
// tray slot s.
const SPOTS: [number, number][] = [
  [1, 2],
  [7, 8],
  [6, 7],
  [8, 8],
];

export const SLABS_DEMO: DemoScript = {
  start: [-1, 0, -1, 0, -1, 0],
  steps: [
    { say: 'Drag every slab onto the board. Together they cover every open cell.', do: [{ swipe: [10, 0], set: [[], [[0, 1], [1, 0]]], ms: 700 }] },
    { say: 'Each colored region has a rule. <3 or >3 bound its pip sum, and green means it holds.', hl: [1], wait: 2600 },
    { say: 'A number is the exact sum. 2 and 6 make 8, not 11, so the badge turns red.', hl: [7, 8], do: [{ swipe: [11, 1], set: [[], [[2, 7], [3, 0]]], ms: 700 }], wait: 2000 },
    { say: 'Tap a slab to turn it.', do: [{ tap: 3, set: [[2, 5], [3, 1]] }] },
    { say: '= means all pips in a region are equal, ≠ means all different.', hl: [2, 5], wait: 2200 },
    { say: 'Cells without color have no rule.', hl: [6], do: [{ swipe: [12, 2], set: [[], [[4, 6], [5, 0]]], ms: 700 }], wait: 1800 },
    { say: 'Every puzzle has exactly one solution.', wait: 2400 },
  ],
};

export function renderSlabsDemo(state: number[], highlight: number[] | undefined) {
  return (
    <div className="slabs-wrap" style={{ '--cols': COLS, '--rows': 3, '--cell': '56px', width: 3 * 56 } as React.CSSProperties}>
      <SlabsBoard spec={SLABS_DEMO_SPEC} state={state} mistakes highlight={highlight}>
        {SPOTS.map(([a, b], k) => (
          <rect key={k} data-demo={k} x={Math.min(a % COLS, b % COLS)} y={Math.min(Math.floor(a / COLS), Math.floor(b / COLS))} width={Math.abs((a % COLS) - (b % COLS)) + 1} height={Math.abs(Math.floor(a / COLS) - Math.floor(b / COLS)) + 1} fill="none" />
        ))}
      </SlabsBoard>
      <SlabsTray spec={SLABS_DEMO_SPEC} state={state} slotProps={(s) => ({ 'data-demo': 10 + s })} />
    </div>
  );
}
