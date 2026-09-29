import { useEffect, useRef, useState } from 'react';
import {
  TRACKS_STATE_T,
  TRACKS_STATE_X,
  applyTracksHint,
  emptyTracksState,
  isTracksSolved,
  tracksCompleteFromMarks,
  tracksCycleMark,
  tracksHasEdge,
  tracksHint,
  tracksMask,
  tracksPaintMark,
  tracksSetEdge,
  tracksStepToward,
  validTracksState,
  type TracksSpec,
  type TracksState,
} from '@puzzle-hustle/core';
import { press } from '../lib/haptics.ts';
import { LONG_PRESS_MS } from '../lib/input.ts';
import { useHistory } from '../lib/useHistory.ts';
import { useFlash } from '../lib/useFlash.ts';
import { showMistakes } from '../lib/mistakes.ts';
import { ResetButton } from '../components/ResetButton.tsx';
import { AdBadge, ToolButton } from '../components/ToolButton.tsx';
import { PAD_B, PAD_L, PAD_R, PAD_T, TracksBoard } from './TracksBoard.tsx';
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

// A drag that starts on track lays or lifts track, also from the given pieces at A and B. Any
// other drag paints crosses, or track marks once the finger has been held first; a stroke that
// starts on its own mark takes that mark off again.
interface Drag {
  pointerId: number;
  start: number;
  last: number;
  track: boolean;
  mode: 'lay' | 'lift' | null;
  paint: { mark: number; on: boolean };
  held: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  moved: boolean;
  remembered: boolean;
}

export function TracksGame({ spec, onMove, onSolved, onHintUsed, requestHint, hintAd, locked, initialState, onStateChange }: TracksGameProps) {
  const { cols, rows } = spec.config;
  const [state, setState] = useState<TracksState>(() => validTracksState(spec, initialState));
  const [flash, setFlash] = useFlash<number>();
  const [hintBusy, setHintBusy] = useState(false);
  const stateRef = useRef(state);
  const drag = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const history = useHistory<TracksState>();
  const mistakes = useRef(showMistakes()).current;
  const solved = isTracksSolved(spec, state);
  // The train runs for a solve made here, not for a board that opened solved.
  const openedSolved = useRef(solved).current;
  const calm = useRef(matchMedia('(prefers-reduced-motion: reduce)').matches).current;

  useEffect(() => {
    if (solved) onSolved();
  }, [solved, onSolved]);

  function commit(move: TracksState) {
    const next = tracksCompleteFromMarks(spec, move) ?? move;
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
    const cur = stateRef.current;
    const v = cur[cell]!;
    const d: Drag = {
      pointerId: e.pointerId,
      start: cell,
      last: cell,
      track: tracksMask(spec, cur, cell) !== 0,
      mode: null,
      paint: { mark: TRACKS_STATE_X, on: (v & TRACKS_STATE_X) === 0 },
      held: false,
      timer: null,
      moved: false,
      remembered: false,
    };
    drag.current = d;
    if (d.track) return;
    // Holding, or the right mouse button, switches the stroke to track marks.
    const hold = () => {
      d.timer = null;
      d.held = true;
      d.paint = { mark: TRACKS_STATE_T, on: (v & TRACKS_STATE_T) === 0 };
      paint(d, [cell]);
    };
    if (e.button === 2) hold();
    else if (e.pointerType !== 'mouse')
      d.timer = setTimeout(() => {
        hold();
        press();
      }, LONG_PRESS_MS);
  }

  function clearTimer(d: Drag) {
    if (d.timer) clearTimeout(d.timer);
    d.timer = null;
  }

  function paint(d: Drag, cells: number[]) {
    const next = tracksPaintMark(spec, stateRef.current, cells, d.paint.mark, d.paint.on);
    if (!next) return;
    rememberOnce(d);
    commit(next);
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
    clearTimer(d);
    if (!d.track) {
      const cells = d.moved ? [] : [d.start];
      while (d.last !== cell) {
        d.last = tracksStepToward(cols, d.last, cell);
        cells.push(d.last);
      }
      d.moved = true;
      paint(d, cells);
      return;
    }
    const empty = emptyTracksState(spec);
    while (d.last !== cell) {
      const step = tracksStepToward(cols, d.last, cell);
      const cur = stateRef.current;
      // A given edge is ridden over, so a drag can start on a given piece; the first free edge
      // decides whether this drag lays or lifts.
      const given = tracksHasEdge(spec, empty, d.last, step);
      if (!given) d.mode ??= tracksHasEdge(spec, cur, d.last, step) ? 'lift' : 'lay';
      const next = given ? null : tracksSetEdge(spec, cur, d.last, step, d.mode === 'lay');
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
    clearTimer(d);
    if (d.moved || d.held) return;
    const next = tracksCycleMark(spec, stateRef.current, d.start);
    if (!next) return;
    rememberOnce(d);
    commit(next);
  }

  function cancelDrag(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    clearTimer(d);
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

  return (
    <div className="tracks-wrap" style={{ '--cols': cols, '--rows': rows } as React.CSSProperties}>
      <TracksBoard
        spec={spec}
        state={state}
        mistakes={mistakes}
        flash={flash}
        celebrate={!openedSolved && !calm}
        ref={svgRef}
        role="application"
        aria-label="Tracks board"
        tabIndex={locked ? -1 : 0}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={cancelDrag}
        onContextMenu={(e) => e.preventDefault()}
      />

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
