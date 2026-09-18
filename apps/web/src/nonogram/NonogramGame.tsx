import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import './nonogram.css';

const LONG_PRESS_MS = 450;
const MIN_CELL = 12;
const MAX_CELL = 64;

interface Pinch {
  ids: [number, number];
  startDist: number;
  startCell: number;
  lastX: number;
  lastY: number;
}

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

export function NonogramGame({ spec, onMove, onSolved, onHintUsed, requestHint, locked, initialState, onStateChange }: NonogramGameProps) {
  const { rows, cols, colors } = spec.config;
  const [state, setState] = useState<NonogramState>(() => (initialState && initialState.length === emptyState(spec).length ? Uint8Array.from(initialState) : emptyState(spec)));
  const [color, setColor] = useState(1);
  const [flash, setFlash] = useState<number | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const stateRef = useRef(state);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<Pinch | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [cellPx, setCellPx] = useState(24);
  const pendingZoom = useRef<{ from: number; to: number; x: number; y: number } | null>(null);
  const solved = isNonogramSolved(spec, state);

  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const clueW = 8 + Math.max(...spec.rowClues.map((c) => Math.max(c.length, 1))) * 14;
    const fit = Math.floor((el.clientWidth - clueW - 18) / cols);
    setCellPx(Math.max(Math.min(fit, 44), 24));
  }, [spec, cols]);

  useLayoutEffect(() => {
    const el = viewport.current;
    const z = pendingZoom.current;
    if (!el || !z) return;
    pendingZoom.current = null;
    const k = z.to / z.from;
    el.scrollLeft = (el.scrollLeft + z.x) * k - z.x;
    el.scrollTop = (el.scrollTop + z.y) * k - z.y;
  }, [cellPx]);

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomTo(cellPx * (e.deltaY < 0 ? 1.1 : 0.9), e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  function zoomTo(next: number, x: number, y: number) {
    const to = Math.round(Math.min(Math.max(next, MIN_CELL), MAX_CELL));
    if (to === cellPx) return;
    pendingZoom.current = { from: cellPx, to, x, y };
    setCellPx(to);
  }

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
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      cancelDrag();
      const [a, b] = [...pointers.current.entries()];
      const dist = Math.hypot(a![1].x - b![1].x, a![1].y - b![1].y);
      pinch.current = { ids: [a![0], b![0]], startDist: dist, startCell: cellPx, lastX: (a![1].x + b![1].x) / 2, lastY: (a![1].y + b![1].y) / 2 };
      return;
    }
    if (pointers.current.size > 1 || locked || solved || drag.current) return;
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
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pinch.current;
    const el = viewport.current;
    if (p && el) {
      const a = pointers.current.get(p.ids[0]);
      const b = pointers.current.get(p.ids[1]);
      if (!a || !b) return;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      el.scrollLeft -= cx - p.lastX;
      el.scrollTop -= cy - p.lastY;
      p.lastX = cx;
      p.lastY = cy;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = el.getBoundingClientRect();
      zoomTo(p.startCell * (dist / p.startDist), cx - rect.left, cy - rect.top);
      return;
    }
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
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
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
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
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
    setCells([idx], h.value);
    setFlash(idx);
    setTimeout(() => setFlash(null), 1800);
  }

  function reset() {
    if (locked || solved) return;
    commit(emptyState(spec));
  }

  const cellClass = (r: number, c: number, v: number) => {
    const cls = ['nono-cell'];
    if (v === MARKED_EMPTY && !solved) cls.push('x');
    else if (v !== 0 && v !== MARKED_EMPTY) cls.push(`f${v}`);
    if (c === 0) cls.push('first-col');
    if (r === 0) cls.push('first-row');
    if ((c + 1) % 5 === 0 && c + 1 < cols) cls.push('gr');
    if ((r + 1) % 5 === 0 && r + 1 < rows) cls.push('gb');
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

      <div className="actions">
        <button type="button" className="btn" onClick={useHint} disabled={solved || locked || hintBusy}>
          Hint
        </button>
        <button type="button" className="btn" onClick={reset} disabled={solved || locked}>
          Reset
        </button>
      </div>
    </div>
  );
}
