import { useEffect, useRef, useState } from 'react';
import {
  TRACK_E,
  TRACK_N,
  TRACK_S,
  TRACK_W,
  TRACKS_STATE_E,
  TRACKS_STATE_S,
  TRACKS_STATE_T,
  TRACKS_STATE_X,
  applyTracksHint,
  emptyTracksState,
  isTracksSolved,
  tracksCycleMark,
  tracksHasEdge,
  tracksHint,
  tracksLineCounts,
  tracksMask,
  tracksSetEdge,
  tracksStepToward,
  validTracksState,
  type TracksSpec,
  type TracksState,
} from '@puzzle-hustle/core';
import { useHistory } from '../lib/useHistory.ts';
import { ResetButton } from '../components/ResetButton.tsx';
import { AdBadge, ToolButton } from '../components/ToolButton.tsx';
import './tracks.css';

export interface TracksGameProps {
  spec: TracksSpec;
  onMove(): void;
  onSolved(): void;
  onHintUsed(): void;
  requestHint(): Promise<boolean>;
  hintAd?: boolean;
  locked: boolean;
  initialState?: number[] | undefined;
  onStateChange?(state: number[]): void;
}

interface Drag {
  pointerId: number;
  start: number;
  last: number;
  mode: 'lay' | 'lift' | null;
  moved: boolean;
  remembered: boolean;
}

// Room around the grid: A's stub on the left, the column numbers on top, the row numbers on the
// right, B's stub below. In cell units, matching the viewBox.
const PAD_L = 0.6;
const PAD_T = 1;
const PAD_R = 1;
const PAD_B = 0.6;

function edgePoint(c: number, r: number, dir: number): [number, number] {
  if (dir === TRACK_N) return [c + 0.5, r];
  if (dir === TRACK_E) return [c + 1, r + 0.5];
  if (dir === TRACK_S) return [c + 0.5, r + 1];
  return [c, r + 0.5];
}

// Straight pieces are lines, curves a quadratic bend through the cell centre, a dangling end a
// stub from the centre to the edge.
function piecePath(c: number, r: number, mask: number): string {
  const dirs = [TRACK_N, TRACK_E, TRACK_S, TRACK_W].filter((d) => mask & d);
  const cx = c + 0.5;
  const cy = r + 0.5;
  if (dirs.length === 1) {
    const [x, y] = edgePoint(c, r, dirs[0]!);
    return `M${cx} ${cy}L${x} ${y}`;
  }
  const [x1, y1] = edgePoint(c, r, dirs[0]!);
  const [x2, y2] = edgePoint(c, r, dirs[1]!);
  const straight = (dirs[0]! | dirs[1]!) === (TRACK_N | TRACK_S) || (dirs[0]! | dirs[1]!) === (TRACK_E | TRACK_W);
  return straight ? `M${x1} ${y1}L${x2} ${y2}` : `M${x1} ${y1}Q${cx} ${cy} ${x2} ${y2}`;
}

export function TracksGame({ spec, onMove, onSolved, onHintUsed, requestHint, hintAd, locked, initialState, onStateChange }: TracksGameProps) {
  const { cols, rows } = spec.config;
  const [state, setState] = useState<TracksState>(() => validTracksState(spec, initialState));
  const [flash, setFlash] = useState<number | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const stateRef = useRef(state);
  const drag = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const history = useHistory<TracksState>();
  const solved = isTracksSolved(spec, state);

  useEffect(() => {
    if (solved) onSolved();
  }, [solved, onSolved]);

  function commit(next: TracksState) {
    stateRef.current = next;
    setState(next);
    onMove();
    onStateChange?.([...next]);
  }

  function rememberOnce(d: Drag) {
    if (d.remembered) return;
    d.remembered = true;
    history.remember(stateRef.current);
  }

  function cellAt(e: React.PointerEvent): number | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * (cols + PAD_L + PAD_R) - PAD_L;
    const y = ((e.clientY - rect.top) / rect.height) * (rows + PAD_T + PAD_B) - PAD_T;
    const c = Math.floor(x);
    const r = Math.floor(y);
    if (r < 0 || c < 0 || r >= rows || c >= cols) return null;
    return r * cols + c;
  }

  function startDrag(e: React.PointerEvent<SVGSVGElement>) {
    if (locked || solved || drag.current) return;
    const cell = cellAt(e);
    if (cell === null) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { pointerId: e.pointerId, start: cell, last: cell, mode: null, moved: false, remembered: false };
  }

  function moveDrag(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const cell = cellAt(e);
    if (cell === null || cell === d.last) return;
    // The drag that completed the track must not keep going and lift a piece of it again.
    if (isTracksSolved(spec, stateRef.current)) {
      drag.current = null;
      return;
    }
    while (d.last !== cell) {
      const step = tracksStepToward(cols, d.last, cell);
      const cur = stateRef.current;
      d.mode ??= tracksHasEdge(spec, cur, d.last, step) ? 'lift' : 'lay';
      const next = tracksSetEdge(spec, cur, d.last, step, d.mode === 'lay');
      if (next) {
        rememberOnce(d);
        commit(next);
        // One fast pointermove can complete the track mid-loop; stop laying stray edges past B.
        if (isTracksSolved(spec, stateRef.current)) {
          drag.current = null;
          return;
        }
      }
      d.last = step;
      d.moved = true;
    }
  }

  function endDrag(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (d.moved) return;
    const next = tracksCycleMark(spec, stateRef.current, d.start);
    if (!next) return;
    rememberOnce(d);
    commit(next);
  }

  function cancelDrag(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
  }

  async function useHint() {
    if (hintBusy || locked || solved) return;
    const h = tracksHint(spec, stateRef.current);
    if (!h) return;
    setHintBusy(true);
    const ok = await requestHint();
    setHintBusy(false);
    if (!ok) return;
    const fresh = tracksHint(spec, stateRef.current);
    if (!fresh) return;
    onHintUsed();
    history.remember(stateRef.current);
    commit(applyTracksHint(spec, stateRef.current, fresh));
    const at = fresh.kind === 'remove-edge' ? fresh.a : fresh.cell;
    setFlash(at);
    setTimeout(() => setFlash(null), 3000);
  }

  function reset() {
    if (locked || solved) return;
    if (stateRef.current.every((v) => v === 0)) return;
    history.remember(stateRef.current);
    commit(emptyTracksState(spec));
  }

  function undo() {
    if (locked || solved) return;
    const prev = history.undo(stateRef.current);
    if (prev) commit(prev);
  }

  function redo() {
    if (locked || solved) return;
    const next = history.redo(stateRef.current);
    if (next) commit(next);
  }

  // A cell is drawn in the given style when every direction of its track comes from a given
  // piece or the A/B stub; touched by any player-laid edge (its own E/S bit, or the neighbour's
  // matching S/E bit), it draws as a normal, player-laid piece instead.
  function hasPlayerEdge(i: number, c: number, r: number): boolean {
    if (state[i]! & (TRACKS_STATE_E | TRACKS_STATE_S)) return true;
    if (c > 0 && state[i - 1]! & TRACKS_STATE_E) return true;
    if (r > 0 && state[i - cols]! & TRACKS_STATE_S) return true;
    return false;
  }

  const counts = tracksLineCounts(spec, state);
  const cells: React.ReactNode[] = [];
  const pieces: React.ReactNode[] = [];
  const marks: React.ReactNode[] = [];
  for (let i = 0; i < cols * rows; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    cells.push(<rect key={i} className={flash === i ? 'tracks-cell flash' : 'tracks-cell'} x={c} y={r} width={1} height={1} />);
    const m = tracksMask(spec, state, i);
    if (m) pieces.push(<path key={`p${i}`} className={hasPlayerEdge(i, c, r) ? 'tracks-piece' : 'tracks-piece given'} d={piecePath(c, r, m)} />);
    if (state[i]! & TRACKS_STATE_X) {
      marks.push(
        <g key={`x${i}`} className="tracks-cross">
          <line x1={c + 0.35} y1={r + 0.35} x2={c + 0.65} y2={r + 0.65} />
          <line x1={c + 0.65} y1={r + 0.35} x2={c + 0.35} y2={r + 0.65} />
        </g>,
      );
    } else if (state[i]! & TRACKS_STATE_T) {
      const railTop = r + 0.36;
      const railBottom = r + 0.64;
      marks.push(
        <g key={`t${i}`} className="tracks-mark">
          <line x1={c + 0.22} y1={railTop} x2={c + 0.78} y2={railTop} />
          <line x1={c + 0.22} y1={railBottom} x2={c + 0.78} y2={railBottom} />
          <line x1={c + 0.32} y1={railTop - 0.06} x2={c + 0.32} y2={railBottom + 0.06} />
          <line x1={c + 0.5} y1={railTop - 0.06} x2={c + 0.5} y2={railBottom + 0.06} />
          <line x1={c + 0.68} y1={railTop - 0.06} x2={c + 0.68} y2={railBottom + 0.06} />
        </g>,
      );
    }
  }
  const lineClass = (have: number, want: number) => (have === want ? 'tracks-count done' : have > want ? 'tracks-count over' : 'tracks-count');
  const entryY = spec.entryRow + 0.5;
  const exitX = spec.exitCol + 0.5;

  return (
    <div className="tracks-wrap" style={{ '--cols': cols, '--rows': rows } as React.CSSProperties}>
      <div className={solved ? 'tracks-board board-frame solved' : 'tracks-board board-frame'}>
        <svg
          ref={svgRef}
          className="tracks-svg"
          viewBox={`${-PAD_L} ${-PAD_T} ${cols + PAD_L + PAD_R} ${rows + PAD_T + PAD_B}`}
          role="application"
          aria-label="Tracks board"
          tabIndex={locked ? -1 : 0}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={cancelDrag}
          onContextMenu={(e) => e.preventDefault()}
        >
          <g className="tracks-cells">{cells}</g>
          <g className="tracks-marks">{marks}</g>
          <line className="tracks-piece given" x1={-PAD_L} y1={entryY} x2={0} y2={entryY} />
          <line className="tracks-piece given" x1={exitX} y1={rows} x2={exitX} y2={rows + PAD_B} />
          <g className="tracks-pieces">{pieces}</g>
          <text className="tracks-end" x={-PAD_L / 2} y={entryY - 0.28} dy="0.33em">
            A
          </text>
          <text className="tracks-end" x={exitX + 0.3} y={rows + PAD_B / 2} dy="0.33em">
            B
          </text>
          {[...spec.colCounts].map((want, c) => (
            <text key={`c${c}`} className={lineClass(counts.cols[c]!, want)} x={c + 0.5} y={-0.5} dy="0.33em">
              {want}
            </text>
          ))}
          {[...spec.rowCounts].map((want, r) => (
            <text key={`r${r}`} className={lineClass(counts.rows[r]!, want)} x={cols + 0.5} y={r + 0.5} dy="0.33em">
              {want}
            </text>
          ))}
        </svg>
      </div>

      {!solved && (
        <div className="tools">
          <ResetButton onReset={reset} disabled={locked} />
          <ToolButton icon="undo" label="Undo" onClick={undo} disabled={locked || !history.canUndo} />
          <ToolButton icon="redo" label="Redo" onClick={redo} disabled={locked || !history.canRedo(state)} />
          <ToolButton icon="hint" label="Hint" onClick={useHint} disabled={locked || hintBusy} badge={hintAd ? <AdBadge /> : null} />
        </div>
      )}
    </div>
  );
}
