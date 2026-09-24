import { useEffect, useRef, useState } from 'react';
import {
  MOSAIC_MARKED_EMPTY,
  emptyMosaicState,
  isMosaicSolved,
  mosaicClueBroken,
  mosaicClueSatisfied,
  mosaicHint,
  type MosaicSpec,
  type MosaicState,
} from '@puzzle-hustle/core';
import { useZoomViewport } from '../lib/useZoomViewport.ts';
import './mosaic.css';
import { gridLineClasses } from '../lib/gridLines.ts';
import { useHistory } from '../lib/useHistory.ts';
import { press } from '../lib/haptics.ts';
import { LONG_PRESS_MS } from '../lib/input.ts';
import { ResetButton } from '../components/ResetButton.tsx';
import { AdBadge, ToolButton } from '../components/ToolButton.tsx';

interface Drag {
  pointerId: number;
  value: number;
  r: number;
  c: number;
  lastR: number;
  lastC: number;
  applied: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface MosaicGameProps {
  spec: MosaicSpec;
  onMove(): void;
  onSolved(): void;
  onHintUsed(): void;
  requestHint(): Promise<boolean>;
  hintAd?: boolean;
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

function nextValue(current: number, mark: boolean): number {
  if (mark) return current === MOSAIC_MARKED_EMPTY ? 0 : MOSAIC_MARKED_EMPTY;
  if (current === 0) return 1;
  if (current === MOSAIC_MARKED_EMPTY) return 0;
  return MOSAIC_MARKED_EMPTY;
}

export function MosaicGame({ spec, onMove, onSolved, onHintUsed, requestHint, hintAd, locked, initialState, onStateChange, viewKey }: MosaicGameProps) {
  const { rows, cols } = spec.config;
  const [state, setState] = useState<MosaicState>(() => (initialState && initialState.length === emptyMosaicState(spec).length ? Uint8Array.from(initialState) : emptyMosaicState(spec)));
  const [flash, setFlash] = useState<number | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const history = useHistory<MosaicState>();
  const stateRef = useRef(state);
  const drag = useRef<Drag | null>(null);
  const solved = isMosaicSolved(spec, state);
  const { viewport, cellPx, pointerDown, pointerMove, pointerUp, pointerCancel } = useZoomViewport(cols, rows, 4, 4, viewKey);

  useEffect(() => {
    if (solved) onSolved();
  }, [solved, onSolved]);

  function commit(next: MosaicState) {
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
    const d: Drag = { pointerId: e.pointerId, value: nextValue(current, mark), r: pos.r, c: pos.c, lastR: pos.r, lastC: pos.c, applied: false, timer: null };
    if (!mark && e.pointerType !== 'mouse') {
      d.timer = setTimeout(() => {
        if (d.applied) return;
        d.value = nextValue(current, true);
        d.applied = true;
        setCells([idx], d.value);
        press();
      }, LONG_PRESS_MS);
    }
    drag.current = d;
  }

  function moveDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (pointerMove(e)) return;
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    // A stroke that completes the picture has to stop there, or the next cell it paints
    // unsolves a puzzle that is already recorded as solved.
    if (isMosaicSolved(spec, stateRef.current)) {
      cancelDrag();
      return;
    }
    const pos = cellAt(e.clientX, e.clientY);
    if (!pos || (pos.r === d.lastR && pos.c === d.lastC)) return;
    clearTimer(d);
    const cells = [d.r * cols + d.c];
    const steps = Math.max(Math.abs(pos.r - d.lastR), Math.abs(pos.c - d.lastC));
    for (let s = 1; s <= steps; s++) {
      const rr = Math.round(d.lastR + ((pos.r - d.lastR) * s) / steps);
      const cc = Math.round(d.lastC + ((pos.c - d.lastC) * s) / steps);
      cells.push(rr * cols + cc);
    }
    d.lastR = pos.r;
    d.lastC = pos.c;
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
    const h = mosaicHint(spec, stateRef.current);
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
    setTimeout(() => setFlash(null), 3000);
  }

  function reset() {
    if (locked || solved) return;
    history.remember(stateRef.current);
    commit(emptyMosaicState(spec));
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

  const cellClass = (r: number, c: number, v: number, clue: number) => {
    const cls = ['mosaic-cell'];
    if (v === MOSAIC_MARKED_EMPTY && !solved) cls.push('x');
    else if (v === 1) cls.push('filled');
    if (clue >= 0 && mosaicClueSatisfied(spec, state, r, c)) cls.push('done');
    else if (clue >= 0 && !solved && mosaicClueBroken(spec, state, r, c)) cls.push('broken');
    cls.push(...gridLineClasses(r, c, rows, cols, false));
    if (flash === r * cols + c) cls.push('flash');
    return cls.join(' ');
  };

  return (
    <div className="mosaic-wrap">
      <div
        ref={viewport}
        className={solved ? 'mosaic-viewport board-frame solved' : 'mosaic-viewport board-frame'}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={cancelPointer}
        onContextMenu={(e) => e.preventDefault()}
        role="application"
        aria-label="Mosaic board"
      >
        <div className="mosaic-board" style={{ '--rows': rows, '--cols': cols, '--cell': `${cellPx}px` } as React.CSSProperties}>
        {Array.from({ length: rows * cols }, (_, i) => {
          const r = Math.floor(i / cols);
          const c = i % cols;
          const clue = spec.clues[i]!;
          return (
            <div key={i} className={cellClass(r, c, state[i]!, clue)} data-r={r} data-c={c} style={{ '--r': r } as React.CSSProperties}>
              {clue >= 0 && <span className="mosaic-clue">{clue}</span>}
            </div>
          );
        })}
        </div>
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
