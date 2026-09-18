import { useEffect, useRef, useState } from 'react';
import {
  MOSAIC_MARKED_EMPTY,
  emptyMosaicState,
  isMosaicSolved,
  mosaicClueSatisfied,
  mosaicHint,
  type MosaicSpec,
  type MosaicState,
} from '@puzzle-hustle/core';
import './mosaic.css';

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

export interface MosaicGameProps {
  spec: MosaicSpec;
  onMove(): void;
  onSolved(): void;
  onHintUsed(): void;
  requestHint(): Promise<boolean>;
  locked: boolean;
}

function cellAt(x: number, y: number): { r: number; c: number } | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-r]');
  if (!el) return null;
  return { r: Number(el.dataset['r']), c: Number(el.dataset['c']) };
}

function nextValue(current: number, mark: boolean): number {
  if (mark) return current === MOSAIC_MARKED_EMPTY ? 0 : MOSAIC_MARKED_EMPTY;
  if (current === 0) return 1;
  if (current === MOSAIC_MARKED_EMPTY) return 0;
  return MOSAIC_MARKED_EMPTY;
}

export function MosaicGame({ spec, onMove, onSolved, onHintUsed, requestHint, locked }: MosaicGameProps) {
  const { rows, cols } = spec.config;
  const [state, setState] = useState<MosaicState>(() => emptyMosaicState(spec));
  const [flash, setFlash] = useState<number | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const stateRef = useRef(state);
  const drag = useRef<Drag | null>(null);
  const solved = isMosaicSolved(spec, state);

  useEffect(() => {
    if (solved) onSolved();
  }, [solved, onSolved]);

  function commit(next: MosaicState) {
    stateRef.current = next;
    setState(next);
    onMove();
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
    if (locked || solved || drag.current) return;
    const pos = cellAt(e.clientX, e.clientY);
    if (!pos) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const idx = pos.r * cols + pos.c;
    const current = stateRef.current[idx]!;
    const mark = e.button === 2;
    const d: Drag = { pointerId: e.pointerId, value: nextValue(current, mark), r: pos.r, c: pos.c, axis: null, applied: false, timer: null };
    if (!mark && e.pointerType !== 'mouse') {
      d.timer = setTimeout(() => {
        if (d.applied) return;
        d.value = nextValue(current, true);
        d.applied = true;
        setCells([idx], d.value);
      }, LONG_PRESS_MS);
    }
    drag.current = d;
  }

  function moveDrag(e: React.PointerEvent<HTMLDivElement>) {
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

  async function useHint() {
    if (hintBusy || locked || solved) return;
    const h = mosaicHint(spec, stateRef.current);
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
    commit(emptyMosaicState(spec));
  }

  const cellClass = (r: number, c: number, v: number, clue: number) => {
    const cls = ['mosaic-cell'];
    if (v === MOSAIC_MARKED_EMPTY && !solved) cls.push('x');
    else if (v === 1) cls.push('filled');
    if (clue >= 0 && mosaicClueSatisfied(spec, state, r, c)) cls.push('done');
    if (c === 0) cls.push('first-col');
    if (r === 0) cls.push('first-row');
    if ((c + 1) % 5 === 0 && c + 1 < cols) cls.push('gr');
    if ((r + 1) % 5 === 0 && r + 1 < rows) cls.push('gb');
    if (flash === r * cols + c) cls.push('flash');
    return cls.join(' ');
  };

  return (
    <div className="mosaic-wrap">
      <div
        className={solved ? 'mosaic-board solved' : 'mosaic-board'}
        style={{ '--rows': rows, '--cols': cols } as React.CSSProperties}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={cancelDrag}
        onContextMenu={(e) => e.preventDefault()}
        role="application"
        aria-label="Mosaic board"
      >
        {Array.from({ length: rows * cols }, (_, i) => {
          const r = Math.floor(i / cols);
          const c = i % cols;
          const clue = spec.clues[i]!;
          return (
            <div key={i} className={cellClass(r, c, state[i]!, clue)} data-r={r} data-c={c}>
              {clue >= 0 && <span className="mosaic-clue">{clue}</span>}
            </div>
          );
        })}
      </div>

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
