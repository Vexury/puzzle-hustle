import { useEffect, useRef, useState } from 'react';
import { emptyZipState, isZipSolved, zipHint, zipStart, zipStepAllowed, type ZipSpec, type ZipState } from '@puzzle-hustle/core';
import { useHistory } from '../lib/useHistory.ts';
import { ResetButton } from '../components/ResetButton.tsx';
import { AdBadge, ToolButton } from '../components/ToolButton.tsx';
import './zip.css';

export interface ZipGameProps {
  spec: ZipSpec;
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
  remembered: boolean;
  last: number;
}

const KEY_DIRS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowRight: [0, 1],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
};

function stepToward(n: number, from: number, to: number): number {
  const fr = Math.floor(from / n);
  const fc = from % n;
  const tr = Math.floor(to / n);
  const tc = to % n;
  if (fr === tr) return from + Math.sign(tc - fc);
  if (fc === tc) return from + n * Math.sign(tr - fr);
  return -1;
}

// A drag walks the board cell by cell: it draws forward into free cells and rubs the line
// out backwards, but only from the head. Landing on any other collected cell does nothing,
// so brushing over an earlier part of the line mid-drag no longer cuts it back to there.
// Tapping such a cell still jumps back, that goes through moveTo.
export function zipDragPath(spec: ZipSpec, cur: ZipState, cell: number): ZipState | null {
  const n = spec.config.size;
  if (cur.length === 0) return cell === zipStart(spec) ? [cell] : null;
  const next = [...cur];
  let at = next[next.length - 1]!;
  let changed = false;
  while (at !== cell) {
    const step = stepToward(n, at, cell);
    if (step < 0) break;
    if (next.length >= 2 && next[next.length - 2] === step) next.pop();
    else if (!next.includes(step) && zipStepAllowed(spec, at, step)) next.push(step);
    else break;
    at = step;
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
  const [flash, setFlash] = useState<number | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const pathRef = useRef(path);
  const drag = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const history = useHistory<ZipState>();
  const solved = isZipSolved(spec, path);
  const head = path.length > 0 ? path[path.length - 1]! : -1;

  useEffect(() => {
    if (solved) onSolved();
  }, [solved, onSolved]);

  function commit(next: ZipState) {
    pathRef.current = next;
    setPath(next);
    onMove();
    onStateChange?.([...next]);
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
      commit([start]);
      return;
    }
    const pos = cur.indexOf(cell);
    if (pos >= 0) {
      if (pos === cur.length - 1) return;
      rememberOnce(d);
      commit(cur.slice(0, pos + 1));
      return;
    }
    const next = [...cur];
    let at = next[next.length - 1]!;
    let changed = false;
    while (at !== cell) {
      const step = stepToward(n, at, cell);
      if (step < 0 || next.includes(step) || !zipStepAllowed(spec, at, step)) break;
      next.push(step);
      at = step;
      changed = true;
    }
    if (!changed) return;
    rememberOnce(d);
    commit(next);
  }

  function dragTo(cell: number, d: Drag): void {
    const next = zipDragPath(spec, pathRef.current, cell);
    if (!next) return;
    rememberOnce(d);
    commit(next);
  }

  function retract(d: Drag | null): void {
    const cur = pathRef.current;
    if (cur.length === 0) return;
    rememberOnce(d);
    commit(cur.slice(0, -1));
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
    commit(next);
    setFlash(h.index);
    setTimeout(() => setFlash(null), 3000);
  }

  function reset() {
    if (locked || solved || pathRef.current.length === 0) return;
    history.remember(pathRef.current);
    commit(emptyZipState());
  }

  function undo() {
    if (locked || solved) return;
    const prev = history.undo(pathRef.current);
    if (prev) commit(prev);
  }

  function redo() {
    if (locked || solved) return;
    const next = history.redo(pathRef.current);
    if (next) commit(next);
  }

  const inPath = new Uint8Array(n * n);
  for (const cell of path) inPath[cell] = 1;
  const points = path.map((cell) => `${(cell % n) + 0.5},${Math.floor(cell / n) + 0.5}`).join(' ');

  const cells: React.ReactNode[] = [];
  const walls: React.ReactNode[] = [];
  const numbers: React.ReactNode[] = [];
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n);
    const c = i % n;
    const cls = ['zip-cell'];
    if (inPath[i]) cls.push('filled');
    if (flash === i) cls.push('flash');
    cells.push(<rect key={i} className={cls.join(' ')} x={c} y={r} width={1} height={1} />);
    const w = spec.walls[i]!;
    if (w & 2) walls.push(<line key={`w${i}r`} className="zip-wall" x1={c + 1} y1={r} x2={c + 1} y2={r + 1} />);
    if (w & 4) walls.push(<line key={`w${i}d`} className="zip-wall" x1={c} y1={r + 1} x2={c + 1} y2={r + 1} />);
    const v = spec.numbers[i]!;
    if (v) {
      numbers.push(
        <g key={`n${i}`} className={inPath[i] ? 'zip-number filled' : 'zip-number'} style={{ '--k': v } as React.CSSProperties}>
          <circle cx={c + 0.5} cy={r + 0.5} r={0.36} />
          <text x={c + 0.5} y={r + 0.5} dy="0.33em">
            {v}
          </text>
        </g>,
      );
    }
  }

  return (
    <div className="zip-wrap" style={{ '--size': n } as React.CSSProperties}>
      <div className={solved ? 'zip-board board-frame solved' : 'zip-board board-frame'}>
        <svg
          ref={svgRef}
          className="zip-svg"
          viewBox={`0 0 ${n} ${n}`}
          role="application"
          aria-label="Zip board"
          tabIndex={locked ? -1 : 0}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
          onContextMenu={(e) => e.preventDefault()}
        >
          <g className="zip-cells">{cells}</g>
          {path.length > 1 && <polyline className="zip-path" points={points} />}
          {path.length === 1 && <circle className="zip-path-dot" cx={(head % n) + 0.5} cy={Math.floor(head / n) + 0.5} r={0.21} />}
          <g className="zip-numbers">{numbers}</g>
          {head >= 0 && !solved && <circle className="zip-head" cx={(head % n) + 0.5} cy={Math.floor(head / n) + 0.5} r={0.3} />}
          <g className="zip-walls">{walls}</g>
        </svg>
      </div>

      {!solved && (
        <div className="tools">
          <ResetButton onReset={reset} disabled={locked} />
          <ToolButton icon="undo" label="Undo" onClick={undo} disabled={locked || !history.canUndo} />
          <ToolButton icon="redo" label="Redo" onClick={redo} disabled={locked || !history.canRedo(path)} />
          <ToolButton icon="hint" label="Hint" onClick={useHint} disabled={locked || hintBusy} badge={hintAd ? <AdBadge /> : null} />
        </div>
      )}
    </div>
  );
}
