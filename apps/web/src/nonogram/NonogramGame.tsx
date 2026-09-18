import { useEffect, useRef, useState } from 'react';
import {
  MARKED_EMPTY,
  emptyState,
  isNonogramSolved,
  lineSatisfied,
  nonogramHint,
  type Clue,
  type NonogramSpec,
  type NonogramState,
} from '@puzzle-hustle/core';
import { useZoomViewport } from '../lib/useZoomViewport.ts';
import './nonogram.css';
import { gridLineClasses } from '../lib/gridLines.ts';
import { useHistory } from '../lib/useHistory.ts';

const LONG_PRESS_MS = 450;

interface Drag {
  pointerId: number;
  value: number;
  r: number;
  c: number;
  axis: 'row' | 'col' | null;
  applied: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface NonogramGameProps {
  spec: NonogramSpec;
  onMove(): void;
  onSolved(): void;
  onHintUsed(): void;
  requestHint(): Promise<boolean>;
  locked: boolean;
  initialState?: number[] | undefined;
  onStateChange?(state: number[]): void;
  viewKey?: string | undefined;
}

function cellAt(x: number, y: number): { r: number; c: number } | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-r]');
  if (!el) return null;
  return { r: Number(el.dataset['r']), c: Number(el.dataset['c']) };
}

function nextValue(current: number, color: number, mark: boolean): number {
  if (mark) return current === MARKED_EMPTY ? 0 : MARKED_EMPTY;
  if (current === 0) return color;
  if (current === MARKED_EMPTY) return 0;
  return current === color ? MARKED_EMPTY : color;
}

function ClueList({ clues, done, axis, index }: { clues: Clue[]; done: boolean; axis: 'row' | 'col'; index: number }) {
  const style = axis === 'row' ? { gridRow: index + 2, gridColumn: 1 } : { gridRow: 1, gridColumn: index + 2 };
  return (
    <div className={['nono-clues', axis, done ? 'done' : ''].join(' ')} style={style}>
      {clues.length === 0 && <span className="clue zero">0</span>}
      {clues.map((k, i) => (
        <span key={i} className={`clue c${k.color}`}>
          {k.len}
        </span>
      ))}
    </div>
  );
}

export function NonogramGame({ spec, onMove, onSolved, onHintUsed, requestHint, locked, initialState, onStateChange, viewKey }: NonogramGameProps) {
  const { rows, cols, colors } = spec.config;
  const [state, setState] = useState<NonogramState>(() => (initialState && initialState.length === emptyState(spec).length ? Uint8Array.from(initialState) : emptyState(spec)));
  const [color, setColor] = useState(1);
  const [flash, setFlash] = useState<number | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const history = useHistory<NonogramState>();
  const stateRef = useRef(state);
  const drag = useRef<Drag | null>(null);
  const solved = isNonogramSolved(spec, state);
  const clueW = 26 + Math.max(...spec.rowClues.map((c) => Math.max(c.length, 1))) * 14;
  const { viewport, cellPx, pointerDown, pointerMove, pointerUp, pointerCancel } = useZoomViewport(cols, clueW, viewKey);


  useEffect(() => {
    if (solved) onSolved();
  }, [solved, onSolved]);

  function commit(next: NonogramState) {
    stateRef.current = next;
    setState(next);
    onMove();
    onStateChange?.([...next]);
  }

  function setCells(cells: number[], value: number) {
    const cur = stateRef.current;
    if (cells.every((i) => cur[i] === value)) return;
    const next = Uint8Array.from(cur);
    for (const i of cells) next[i] = value;
    commit(next);
  }

  function clearTimer(d: Drag) {
    if (d.timer) clearTimeout(d.timer);
    d.timer = null;
  }

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (pointerDown(e)) {
      cancelDrag();
      return;
    }
    if (locked || solved || drag.current) return;
    history.remember(stateRef.current);
    const pos = cellAt(e.clientX, e.clientY);
    if (!pos) return;
    e.preventDefault();
    const idx = pos.r * cols + pos.c;
    const current = stateRef.current[idx]!;
    const mark = e.button === 2;
    const d: Drag = { pointerId: e.pointerId, value: nextValue(current, color, mark), r: pos.r, c: pos.c, axis: null, applied: false, timer: null };
    if (!mark && e.pointerType !== 'mouse') {
      d.timer = setTimeout(() => {
        if (d.applied) return;
        d.value = nextValue(current, color, true);
        d.applied = true;
        setCells([idx], d.value);
      }, LONG_PRESS_MS);
    }
    drag.current = d;
  }

  function moveDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (pointerMove(e)) return;
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const pos = cellAt(e.clientX, e.clientY);
    if (!pos || (pos.r === d.r && pos.c === d.c)) return;
    clearTimer(d);
    if (!d.axis) d.axis = pos.r === d.r ? 'row' : 'col';
    const r = d.axis === 'row' ? d.r : pos.r;
    const c = d.axis === 'col' ? d.c : pos.c;
    const cells = [d.r * cols + d.c];
    const steps = d.axis === 'row' ? Math.abs(c - d.c) : Math.abs(r - d.r);
    for (let s = 1; s <= steps; s++) {
      const rr = d.axis === 'row' ? d.r : d.r + Math.sign(r - d.r) * s;
      const cc = d.axis === 'col' ? d.c : d.c + Math.sign(c - d.c) * s;
      cells.push(rr * cols + cc);
    }
    d.applied = true;
    setCells(cells, d.value);
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (pointerUp(e)) return;
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    clearTimer(d);
    drag.current = null;
    if (!d.applied) setCells([d.r * cols + d.c], d.value);
  }

  function cancelDrag() {
    const d = drag.current;
    if (!d) return;
    clearTimer(d);
    drag.current = null;
  }

  function cancelPointer(e: React.PointerEvent<HTMLDivElement>) {
    pointerCancel(e);
    cancelDrag();
  }

  async function useHint() {
    if (hintBusy || locked || solved) return;
    const h = nonogramHint(spec, stateRef.current);
    if (!h) return;
    setHintBusy(true);
    const ok = await requestHint();
    setHintBusy(false);
    if (!ok) return;
    onHintUsed();
    const idx = h.r * cols + h.c;
    history.remember(stateRef.current);
    setCells([idx], h.value);
    setFlash(idx);
    setTimeout(() => setFlash(null), 1800);
  }

  function reset() {
    if (locked || solved) return;
    history.remember(stateRef.current);
    commit(emptyState(spec));
  }

  function undo() {
    if (locked || solved) return;
    const prev = history.undo();
    if (prev) commit(prev);
  }

  const cellClass = (r: number, c: number, v: number) => {
    const cls = ['nono-cell'];
    if (v === MARKED_EMPTY && !solved) cls.push('x');
    else if (v !== 0 && v !== MARKED_EMPTY) cls.push(`f${v}`);
    cls.push(...gridLineClasses(r, c, rows, cols));
    if (flash === r * cols + c) cls.push('flash');
    return cls.join(' ');
  };

  return (
    <div className="nono-wrap">
      <div
        ref={viewport}
        className={solved ? 'nono-viewport solved' : 'nono-viewport'}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={cancelPointer}
        onContextMenu={(e) => e.preventDefault()}
        role="application"
        aria-label="Nonogram board"
      >
        <div className="nono-board" style={{ '--rows': rows, '--cols': cols, '--cell': `${cellPx}px` } as React.CSSProperties}>
        <div className="nono-corner" />
        {spec.colClues.map((clues, c) => (
          <ClueList key={`c${c}`} clues={clues} axis="col" index={c} done={lineSatisfied(spec, state, 'col', c)} />
        ))}
        {spec.rowClues.map((clues, r) => (
          <ClueList key={`r${r}`} clues={clues} axis="row" index={r} done={lineSatisfied(spec, state, 'row', r)} />
        ))}
        {Array.from({ length: rows * cols }, (_, i) => {
          const r = Math.floor(i / cols);
          const c = i % cols;
          return <div key={i} className={cellClass(r, c, state[i]!)} style={{ gridRow: r + 2, gridColumn: c + 2 }} data-r={r} data-c={c} />;
        })}
        </div>
      </div>

      {colors > 1 && (
        <div className="nono-palette" role="radiogroup" aria-label="Color">
          {Array.from({ length: colors }, (_, i) => i + 1).map((k) => (
            <button
              key={k}
              type="button"
              className={['nono-chip', `c${k}`, color === k ? 'active' : ''].join(' ')}
              onClick={() => setColor(k)}
              disabled={solved || locked}
              role="radio"
              aria-checked={color === k}
              aria-label={`Color ${k}`}
            />
          ))}
        </div>
      )}

      {!solved && (
        <div className="actions">
          <button type="button" className="btn" onClick={reset} disabled={locked}>
            Reset
          </button>
          <button type="button" className="btn" onClick={undo} disabled={locked || !history.canUndo}>
            Undo
          </button>
          <button type="button" className="btn" onClick={useHint} disabled={locked || hintBusy}>
            Hint
          </button>
        </div>
      )}
    </div>
  );
}
