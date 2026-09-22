import { useEffect, useMemo, useRef, useState } from 'react';
import {
  REGIONS_MARKED_EMPTY,
  emptyRegionsState,
  isRegionsSolved,
  regionsBorders,
  regionsConflicts,
  regionsHint,
  regionsLineCounts,
  regionsPalette,
  regionsUnitComplete,
  type RegionsSpec,
  type RegionsState,
} from '@puzzle-hustle/core';
import './regions.css';
import { useHistory } from '../lib/useHistory.ts';
import { LONG_PRESS_MS } from '../lib/input.ts';
import { ResetButton } from '../components/ResetButton.tsx';

const REGION_COLORS = 12;

interface Drag {
  pointerId: number;
  idx: number;
  paint: number | null;
  applied: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface RegionsGameProps {
  spec: RegionsSpec;
  symbol: 'crown' | 'star';
  onMove(): void;
  onSolved(): void;
  onHintUsed(): void;
  requestHint(): Promise<boolean>;
  locked: boolean;
  initialState?: number[] | undefined;
  onStateChange?(state: number[]): void;
}

function cellAt(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-i]');
  return el ? Number(el.dataset['i']) : null;
}

function toggleSymbol(current: number): number {
  return current === 1 ? 0 : 1;
}

function toggleX(current: number): number {
  return current === REGIONS_MARKED_EMPTY ? 0 : REGIONS_MARKED_EMPTY;
}

function paintValue(current: number): number | null {
  if (current === 0) return REGIONS_MARKED_EMPTY;
  if (current === REGIONS_MARKED_EMPTY) return 0;
  return null;
}

function Glyph({ symbol }: { symbol: 'crown' | 'star' }) {
  return (
    <svg viewBox="0 0 24 24" className="regions-glyph" aria-hidden="true">
      {symbol === 'crown' ? (
        <path d="M3 18 L2.5 7.5 L8 11.5 L12 4.5 L16 11.5 L21.5 7.5 L21 18 Z M3.5 19.5 H20.5 V21.5 H3.5 Z" />
      ) : (
        <path d="M12 2.5 L14.9 9 L22 9.6 L16.6 14.3 L18.3 21.3 L12 17.6 L5.7 21.3 L7.4 14.3 L2 9.6 L9.1 9 Z" />
      )}
    </svg>
  );
}

export function RegionsGame({ spec, symbol, onMove, onSolved, onHintUsed, requestHint, locked, initialState, onStateChange }: RegionsGameProps) {
  const n = spec.config.size;
  const [state, setState] = useState<RegionsState>(() => (initialState && initialState.length === spec.config.size * spec.config.size ? Uint8Array.from(initialState) : emptyRegionsState(spec)));
  const [flash, setFlash] = useState<number | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const history = useHistory<RegionsState>();
  const stateRef = useRef(state);
  const drag = useRef<Drag | null>(null);
  const solved = isRegionsSolved(spec, state);
  const palette = useMemo(() => regionsPalette(spec, REGION_COLORS), [spec]);
  const borders = useMemo(() => Array.from({ length: n * n }, (_, i) => regionsBorders(spec, i)), [spec, n]);
  const conflicts = regionsConflicts(spec, state);
  const counts = regionsLineCounts(spec, state);

  useEffect(() => {
    if (solved) onSolved();
  }, [solved, onSolved]);

  function commit(next: RegionsState) {
    stateRef.current = next;
    setState(next);
    onMove();
    onStateChange?.([...next]);
  }

  function setCell(idx: number, value: number) {
    const cur = stateRef.current;
    if (cur[idx] === value) return;
    const next = Uint8Array.from(cur);
    next[idx] = value;
    commit(next);
  }

  function clearTimer(d: Drag) {
    if (d.timer) clearTimeout(d.timer);
    d.timer = null;
  }

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (locked || solved || drag.current) return;
    history.remember(stateRef.current);
    const idx = cellAt(e.clientX, e.clientY);
    if (idx === null) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const current = stateRef.current[idx]!;
    const d: Drag = { pointerId: e.pointerId, idx, paint: paintValue(current), applied: false, timer: null };
    if (e.button === 2) {
      d.applied = true;
      setCell(idx, toggleX(current));
    } else {
      d.timer = setTimeout(() => {
        if (d.applied) return;
        d.applied = true;
        // Carry the written value into the drag so a long press can keep going.
        d.paint = toggleX(current);
        setCell(idx, d.paint);
      }, LONG_PRESS_MS);
    }
    drag.current = d;
  }

  function moveDrag(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId || d.paint === null) return;
    const idx = cellAt(e.clientX, e.clientY);
    if (idx === null || idx === d.idx) return;
    clearTimer(d);
    if (!d.applied) {
      d.applied = true;
      setCell(d.idx, d.paint);
    }
    const current = stateRef.current[idx]!;
    if (current === 1) return;
    if (d.paint === REGIONS_MARKED_EMPTY ? current === 0 : current === REGIONS_MARKED_EMPTY) setCell(idx, d.paint);
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    clearTimer(d);
    drag.current = null;
    if (!d.applied) setCell(d.idx, toggleSymbol(stateRef.current[d.idx]!));
  }

  function cancelDrag() {
    const d = drag.current;
    if (!d) return;
    clearTimer(d);
    drag.current = null;
  }

  async function useHint() {
    if (hintBusy || locked || solved) return;
    const h = regionsHint(spec, stateRef.current);
    if (!h) return;
    setHintBusy(true);
    const ok = await requestHint();
    setHintBusy(false);
    if (!ok) return;
    onHintUsed();
    const idx = h.r * n + h.c;
    history.remember(stateRef.current);
    setCell(idx, h.value);
    setFlash(idx);
    setTimeout(() => setFlash(null), 3000);
  }

  function reset() {
    if (locked || solved) return;
    history.remember(stateRef.current);
    commit(emptyRegionsState(spec));
  }

  function undo() {
    if (locked || solved) return;
    const prev = history.undo();
    if (prev) commit(prev);
  }

  const cellClass = (i: number, v: number) => {
    const cls = ['regions-cell'];
    const b = borders[i]!;
    const r = Math.floor(i / n);
    const c = i % n;
    if (b.top && r > 0) cls.push('bt');
    if (b.right && c < n - 1) cls.push('br');
    if (b.bottom && r < n - 1) cls.push('bb');
    if (b.left && c > 0) cls.push('bl');
    if (v === REGIONS_MARKED_EMPTY && !solved) cls.push('x');
    if (v === 1 && conflicts[i]) cls.push('conflict');
    if (regionsUnitComplete(spec, counts, i)) cls.push('done');
    if (flash === i) cls.push('flash');
    return cls.join(' ');
  };

  return (
    <div className="regions-wrap" style={{ '--size': n } as React.CSSProperties}>
      <div
        className={solved ? 'regions-board board-frame solved' : 'regions-board board-frame'}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={cancelDrag}
        onContextMenu={(e) => e.preventDefault()}
        role="application"
        aria-label={symbol === 'crown' ? 'Crowns board' : 'Stars board'}
      >
        {Array.from({ length: n * n }, (_, i) => {
          const v = state[i]!;
          const color = palette[spec.regions[i]!]!;
          return (
            <div key={i} className={cellClass(i, v)} data-i={i} style={{ '--region-bg': `var(--region-${color})`, '--r': Math.floor(i / n) } as React.CSSProperties}>
              {v === 1 && <Glyph symbol={symbol} />}
            </div>
          );
        })}
      </div>

      {!solved && (
        <div className="actions">
          <ResetButton onReset={reset} disabled={locked} />
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
