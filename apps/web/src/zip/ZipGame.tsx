import { useEffect, useRef, useState } from 'react';
import { emptyZipState, isZipSolved, zipHint, zipOrderBreak, zipStart, zipStepAllowed, zipStranded, type ZipSpec, type ZipState } from '@puzzle-hustle/core';
import { useHistory } from '../lib/useHistory.ts';
import { useFlash } from '../lib/useFlash.ts';
import { showMistakes } from '../lib/mistakes.ts';
import * as sound from '../lib/sound.ts';
import type { Cue, CueOpts } from '../lib/sound.ts';
import { playConflict } from '../lib/feedback.ts';
import { ResetButton } from '../components/ResetButton.tsx';
import { AdBadge, ToolButton } from '../components/ToolButton.tsx';
import { ZipBoard } from './ZipBoard.tsx';
import './zip.css';

export interface ZipGameProps {
  spec: ZipSpec;
  onMove(cue?: Cue, opts?: CueOpts): void;
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
  remembered: boolean;
  last: number;
}

const KEY_DIRS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowRight: [0, 1],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
};

// The straight steps from `from` toward `to`, best first. A finger that rounds a corner fast
// can land diagonally from the head between two pointer events; then both axes are candidates,
// the longer one first, and on a tie the one the line was already running along.
function stepsToward(n: number, from: number, to: number, prev: number | undefined): number[] {
  const dr = Math.floor(to / n) - Math.floor(from / n);
  const dc = (to % n) - (from % n);
  if (dr === 0) return [from + Math.sign(dc)];
  if (dc === 0) return [from + n * Math.sign(dr)];
  const row = from + n * Math.sign(dr);
  const col = from + Math.sign(dc);
  const ranRow = prev !== undefined && Math.abs(from - prev) === n;
  const rowFirst = Math.abs(dr) > Math.abs(dc) || (Math.abs(dr) === Math.abs(dc) && ranRow);
  return rowFirst ? [row, col] : [col, row];
}

// A drag walks the board cell by cell: it draws forward into free cells and rubs the line
// out backwards, but only from the head. Landing on any other collected cell does nothing,
// so brushing over an earlier part of the line mid-drag no longer cuts it back to there.
// Tapping such a cell still jumps back, that goes through moveTo. A diagonal jump only ever
// draws forward, so a corner taken fast never rubs anything out.
export function zipDragPath(spec: ZipSpec, cur: ZipState, cell: number): ZipState | null {
  const n = spec.config.size;
  if (cur.length === 0) return cell === zipStart(spec) ? [cell] : null;
  const next = [...cur];
  let at = next[next.length - 1]!;
  let changed = false;
  while (at !== cell) {
    const steps = stepsToward(n, at, cell, next[next.length - 2]);
    const straight = steps.length === 1;
    let moved = false;
    for (const step of steps) {
      if (straight && next.length >= 2 && next[next.length - 2] === step) next.pop();
      else if (!next.includes(step) && zipStepAllowed(spec, at, step)) next.push(step);
      else continue;
      at = step;
      moved = true;
      break;
    }
    if (!moved) break;
    changed = true;
  }
  return changed ? next : null;
}

function validInitial(spec: ZipSpec, initial: number[] | undefined): ZipState {
  if (!initial || initial.length === 0) return emptyZipState();
  const total = spec.config.size * spec.config.size;
  const seen = new Set<number>();
  if (initial[0] !== zipStart(spec)) return emptyZipState();
  for (let i = 0; i < initial.length; i++) {
    const cell = initial[i]!;
    if (cell < 0 || cell >= total || seen.has(cell)) return emptyZipState();
    if (i > 0 && !zipStepAllowed(spec, initial[i - 1]!, cell)) return emptyZipState();
    seen.add(cell);
  }
  return [...initial];
}

export function ZipGame({ spec, onMove, onSolved, onHintUsed, requestHint, hintAd, locked, initialState, onStateChange }: ZipGameProps) {
  const n = spec.config.size;
  const start = zipStart(spec);
  const [path, setPath] = useState<ZipState>(() => validInitial(spec, initialState));
  const [flash, setFlash] = useFlash<number>();
  const [hintBusy, setHintBusy] = useState(false);
  const pathRef = useRef(path);
  const drag = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const history = useHistory<ZipState>();
  const mistakes = useRef(showMistakes()).current;
  // One flag per cell that can no longer be reached, plus one for the order of the numbers.
  const broken = (p: ZipState) => {
    if (!mistakes) return [];
    const out = new Array<boolean>(n * n + 1).fill(false);
    for (const cell of zipStranded(spec, p)) out[cell] = true;
    out[n * n] = zipOrderBreak(spec, p) !== null;
    return out;
  };
  const solved = isZipSolved(spec, path);
  // The path runs up its ladder with the glow, so only for a solve made here and only while it glows.
  const openedSolved = useRef(solved).current;
  const calm = useRef(matchMedia('(prefers-reduced-motion: reduce)').matches).current;

  useEffect(() => {
    if (solved) onSolved();
  }, [solved, onSolved]);

  useEffect(() => {
    if (solved && !openedSolved && !calm) sound.play('trail');
  }, [solved, openedSolved, calm]);

  function commit(next: ZipState, cue?: Cue, opts?: CueOpts) {
    const before = pathRef.current;
    pathRef.current = next;
    setPath(next);
    onMove(cue, opts);
    playConflict(cue, broken, before, next, isZipSolved(spec, next));
    onStateChange?.([...next]);
  }

  // A longer path is a step up the ladder, a shorter one a step back down, so a full path climbs
  // into the solve.
  function walk(next: ZipState) {
    commit(next, next.length > pathRef.current.length ? 'step' : 'retract', { progress: (next.length - 1) / (n * n - 1) });
  }

  function rememberOnce(d: Drag | null) {
    if (d) {
      if (d.remembered) return;
      d.remembered = true;
    }
    history.remember(pathRef.current);
  }

  function moveTo(cell: number, d: Drag | null): void {
    const cur = pathRef.current;
    if (cur.length === 0) {
      if (cell !== start) return;
      rememberOnce(d);
      walk([start]);
      return;
    }
    const pos = cur.indexOf(cell);
    if (pos >= 0) {
      if (pos === cur.length - 1) return;
      rememberOnce(d);
      walk(cur.slice(0, pos + 1));
      return;
    }
    const next = [...cur];
    let at = next[next.length - 1]!;
    let changed = false;
    while (at !== cell) {
      // A tap only reaches along a straight line from the head.
      const steps = stepsToward(n, at, cell, undefined);
      const step = steps.length === 1 ? steps[0]! : -1;
      if (step < 0 || next.includes(step) || !zipStepAllowed(spec, at, step)) break;
      next.push(step);
      at = step;
      changed = true;
    }
    if (!changed) return;
    rememberOnce(d);
    walk(next);
  }

  function dragTo(cell: number, d: Drag): void {
    const next = zipDragPath(spec, pathRef.current, cell);
    if (!next) return;
    rememberOnce(d);
    walk(next);
  }

  function retract(d: Drag | null): void {
    const cur = pathRef.current;
    if (cur.length === 0) return;
    rememberOnce(d);
    walk(cur.slice(0, -1));
  }

  function cellAt(e: React.PointerEvent): number | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * n);
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * n);
    if (r < 0 || c < 0 || r >= n || c >= n) return null;
    return r * n + c;
  }

  function startDrag(e: React.PointerEvent<SVGSVGElement>) {
    if (locked || solved || drag.current) return;
    const cell = cellAt(e);
    if (cell === null) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const d: Drag = { pointerId: e.pointerId, remembered: false, last: cell };
    drag.current = d;
    moveTo(cell, d);
  }

  function moveDrag(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    // The drag that completed the path must not keep going: moving back onto the line
    // would cut it and unsolve a puzzle that is already recorded as solved.
    if (isZipSolved(spec, pathRef.current)) {
      drag.current = null;
      return;
    }
    const cell = cellAt(e);
    if (cell === null || cell === d.last) return;
    d.last = cell;
    dragTo(cell, d);
  }

  function endDrag(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
  }

  function onKeyDown(e: React.KeyboardEvent<SVGSVGElement>) {
    if (locked || solved) return;
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      retract(null);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (pathRef.current.length === 0) moveTo(start, null);
      return;
    }
    const dir = KEY_DIRS[e.key];
    if (!dir) return;
    e.preventDefault();
    const cur = pathRef.current;
    if (cur.length === 0) {
      moveTo(start, null);
      return;
    }
    const from = cur[cur.length - 1]!;
    const r = Math.floor(from / n) + dir[0];
    const c = (from % n) + dir[1];
    if (r < 0 || c < 0 || r >= n || c >= n) return;
    const target = r * n + c;
    if (cur.length >= 2 && cur[cur.length - 2] === target) retract(null);
    else moveTo(target, null);
  }

  async function useHint() {
    if (hintBusy || locked || solved) return;
    const h = zipHint(spec, pathRef.current);
    if (!h) return;
    setHintBusy(true);
    const ok = await requestHint();
    setHintBusy(false);
    if (!ok) return;
    onHintUsed();
    const cur = pathRef.current;
    history.remember(cur);
    const next = h.truncate === null ? [...cur] : cur.slice(0, h.truncate);
    next.push(h.index);
    commit(next, 'hint');
    setFlash(h.index);
  }

  function reset() {
    if (locked || solved || pathRef.current.length === 0) return;
    history.remember(pathRef.current);
    commit(emptyZipState());
  }

  function undo() {
    if (locked || solved) return;
    const prev = history.undo(pathRef.current);
    if (prev) commit(prev, 'undo');
  }

  function redo() {
    if (locked || solved) return;
    const next = history.redo(pathRef.current);
    if (next) commit(next, 'redo');
  }

  return (
    <div className="zip-wrap" style={{ '--size': n } as React.CSSProperties}>
      <ZipBoard
        spec={spec}
        path={path}
        mistakes={mistakes}
        flash={flash}
        ref={svgRef}
        role="application"
        aria-label="Zip board"
        tabIndex={locked ? -1 : 0}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
      />

      {!solved && (
        <div className="tools">
          <ToolButton icon="undo" label="Undo" onClick={undo} disabled={locked || !history.canUndo} />
          <ToolButton icon="redo" label="Redo" onClick={redo} disabled={locked || !history.canRedo(path)} />
          <ToolButton icon="hint" label="Hint" onClick={useHint} disabled={locked || hintBusy} badge={hintAd ? <AdBadge /> : null} />
          <ResetButton onReset={reset} disabled={locked} />
        </div>
      )}
    </div>
  );
}
