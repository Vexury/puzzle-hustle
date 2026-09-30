import {
  TRACK_E,
  TRACK_N,
  TRACK_S,
  TRACK_W,
  TRACKS_PRESETS,
  TRACKS_STATE_T,
  TRACKS_STATE_X,
  emptyTracksState,
  tracksCycleMark,
  tracksHasEdge,
  tracksMask,
  tracksPaintMark,
  tracksReroute,
  tracksSetEdge,
  type TracksSpec,
  type TracksState,
} from '@puzzle-hustle/core';
import { TracksBoard } from '../tracks/TracksBoard.tsx';
import type { DemoGesture, DemoScript } from './DemoPlayer.tsx';

// Hand-made 5x5 with one given curve, unique and solvable by the easy rules (checked in
// demo-ziptracks.test.ts). Column 0 counts 1, and A's cell is that one, which is the way in.
const N = 5;
const ENTRY_ROW = 1;
const EXIT_COL = 4;
const PATH = [5, 6, 7, 2, 3, 8, 9, 14, 13, 18, 19, 24];
const GIVEN = 7;

function solutionMasks(): Uint8Array {
  const masks = new Uint8Array(N * N);
  masks[ENTRY_ROW * N]! |= TRACK_W;
  masks[(N - 1) * N + EXIT_COL]! |= TRACK_S;
  for (let k = 1; k < PATH.length; k++) {
    const a = PATH[k - 1]!;
    const b = PATH[k]!;
    const [fwd, back] = b === a + 1 ? [TRACK_E, TRACK_W] : b === a - 1 ? [TRACK_W, TRACK_E] : b === a + N ? [TRACK_S, TRACK_N] : [TRACK_N, TRACK_S];
    masks[a]! |= fwd;
    masks[b]! |= back;
  }
  return masks;
}

const SOLUTION = solutionMasks();

export const TRACKS_DEMO_SPEC: TracksSpec = {
  version: 0,
  seed: 0,
  difficulty: 'easy',
  config: { ...TRACKS_PRESETS.easy, cols: N, rows: N },
  rowCounts: Uint8Array.from({ length: N }, (_, r) => PATH.filter((i) => Math.floor(i / N) === r).length),
  colCounts: Uint8Array.from({ length: N }, (_, c) => PATH.filter((i) => i % N === c).length),
  entryRow: ENTRY_ROW,
  exitCol: EXIT_COL,
  given: Uint8Array.from({ length: N * N }, (_, i) => (i === GIVEN ? SOLUTION[i]! : 0)),
  solution: SOLUTION,
  path: Uint16Array.from(PATH),
};

// Demo state is the game's own state. Every gesture runs through the same core calls the game
// makes for that gesture, so the demo shows exactly what a finger on the real board would do.
function tracksScript(): DemoScript {
  const spec = TRACKS_DEMO_SPEC;
  const empty = emptyTracksState(spec);
  let state: TracksState = empty;
  const step = (next: TracksState | null): [number, number][] => {
    if (!next) return [];
    const writes = next.flatMap((v, i): [number, number][] => (v === state[i] ? [] : [[i, v]]));
    state = next;
    return writes;
  };
  const tap = (cell: number): DemoGesture => ({ tap: cell, set: step(tracksCycleMark(spec, state, cell)), quick: true });
  // A stroke of X from a cell without track, or of track marks after a hold; it takes its mark
  // off instead when it starts on one.
  const paint = (cells: number[], mark: number, from: number) => {
    const on = (state[cells[0]!]! & mark) === 0;
    return cells.map((cell, k) => (k < from ? [] : step(tracksPaintMark(spec, state, k === from ? cells.slice(0, k + 1) : [cell], mark, on))));
  };
  const cross = (cells: number[], ms?: number): DemoGesture => {
    if (tracksMask(spec, state, cells[0]!)) throw new Error('tracks demo: cross stroke starts on track');
    return { swipe: cells, set: paint(cells, TRACKS_STATE_X, 1), ...(ms ? { ms } : {}) };
  };
  const holdMark = (cells: number[]): DemoGesture => ({ swipe: cells, hold: true, set: paint(cells, TRACKS_STATE_T, 0) });
  // A stroke from track: given edges are ridden over, the first free edge decides lay or lift.
  const lay = (cells: number[], ms?: number): DemoGesture => {
    if (!tracksMask(spec, state, cells[0]!)) throw new Error('tracks demo: lay stroke starts off track');
    let mode: 'lay' | 'lift' | null = null;
    const set = cells.map((cell, k) => {
      if (k === 0) return [];
      const from = cells[k - 1]!;
      if (tracksHasEdge(spec, empty, from, cell)) return [];
      mode ??= tracksHasEdge(spec, state, from, cell) ? 'lift' : 'lay';
      const turned = mode === 'lay' ? () => tracksReroute(spec, state, from, cell, k > 1 ? cells[k - 2]! : null) : () => null;
      return step(tracksSetEdge(spec, state, from, cell, mode === 'lay') ?? turned());
    });
    return { swipe: cells, set, ...(ms ? { ms } : {}) };
  };

  return {
    start: [...empty],
    steps: [
      { say: 'Lay one track from A on the left edge to B on the bottom edge.', hl: [5, 24], wait: 1400 },
      { say: "Numbers count the track cells in each row and column. Here only A's cell counts.", hl: [0, 5, 10, 15, 20], wait: 1400 },
      { say: 'Swipe over empty cells to cross them out.', do: [cross([0, 5, 10, 15, 20])], wait: 700 },
      { say: 'Swipe from an X to clear X marks.', do: [cross([20, 15])], wait: 700 },
      { say: 'Tap a cell to cycle X, track mark, clear.', do: [tap(1), tap(1), tap(1)], wait: 700 },
      { say: 'Hold, then swipe to mark track cells. Too many turns a number red.', do: [holdMark([12, 13, 14])], wait: 1400 },
      { say: 'Hold on a mark, then swipe to clear marks.', do: [holdMark([12, 13, 14])], wait: 700 },
      { say: 'Swipe from A or any track to lay straight or curved pieces.', do: [lay([5, 6, 7, 2, 3, 8])], wait: 900 },
      { say: 'Swipe back along the track to lift it. Given pieces stay put.', hl: [7], do: [lay([8, 3, 2, 7, 6])], wait: 900 },
      { say: 'Took a wrong turn? No need to lift it first.', do: [lay([2, 3, 4])], wait: 900 },
      { say: 'Swipe a new way from a full piece to turn the track there.', hl: [3], do: [lay([3, 8])], wait: 1200 },
      { say: 'No branches, crossings or loops. Green numbers are right.', do: [lay([8, 9, 14, 13, 18, 19, 24], 170)], wait: 2600 },
    ],
  };
}

export const TRACKS_DEMO: DemoScript = tracksScript();

const CELL = 38;

export function renderTracksDemo(state: number[], highlight: number[] | undefined) {
  return (
    <div className="tracks-wrap" style={{ '--cols': N, '--rows': N, '--cell': `${CELL}px`, width: `calc(${N + 1.6} * ${CELL}px + 2 * var(--frame-border))` } as React.CSSProperties}>
      <TracksBoard spec={TRACKS_DEMO_SPEC} state={state} mistakes highlight={highlight} />
    </div>
  );
}
