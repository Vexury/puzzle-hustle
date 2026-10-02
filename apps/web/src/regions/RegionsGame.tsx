import { useEffect, useRef, useState } from 'react';
import { REGIONS_MARKED_EMPTY, emptyRegionsState, isRegionsSolved, regionsConflicts, regionsHint, regionsLineCounts, type RegionsSpec, type RegionsState } from '@puzzle-hustle/core';
import { RegionsBoard } from './RegionsBoard.tsx';
import { useHistory } from '../lib/useHistory.ts';
import { useFlash } from '../lib/useFlash.ts';
import type { Cue, CueOpts } from '../lib/sound.ts';
import { playFeedback, type Units } from '../lib/feedback.ts';
import { LONG_PRESS_MS } from '../lib/input.ts';
import { showMistakes } from '../lib/mistakes.ts';
import { ResetButton } from '../components/ResetButton.tsx';
import { AdBadge, ToolButton } from '../components/ToolButton.tsx';

interface Drag {
  pointerId: number;
  idx: number;
  paint: number | null;
  applied: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface RegionsGameProps {
  spec: RegionsSpec;
  symbol: 'cat' | 'heart';
  onMove(cue?: Cue, opts?: CueOpts): void;
  onSolved(): void;
  onHintUsed(): void;
  requestHint(): Promise<boolean>;
  hintAd?: boolean;
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

function valueCue(value: number): Cue {
  return value === 0 ? 'clear' : value === REGIONS_MARKED_EMPTY ? 'cross' : 'place';
}

export function RegionsGame({ spec, symbol, onMove, onSolved, onHintUsed, requestHint, hintAd, locked, initialState, onStateChange }: RegionsGameProps) {
  const n = spec.config.size;
  const [state, setState] = useState<RegionsState>(() => (initialState && initialState.length === spec.config.size * spec.config.size ? Uint8Array.from(initialState) : emptyRegionsState(spec)));
  const [flash, setFlash] = useFlash<number>();
  const [hintBusy, setHintBusy] = useState(false);
  const history = useHistory<RegionsState>();
  const mistakes = useRef(showMistakes()).current;
  const units = (s: RegionsState): Units => {
    const counts = regionsLineCounts(spec, s);
    return {
      done: [...counts.rows, ...counts.cols, ...counts.regions].map((v) => v === spec.config.stars),
      broken: mistakes ? Array.from(regionsConflicts(spec, s), Boolean) : [],
    };
  };
  const stateRef = useRef(state);
  const drag = useRef<Drag | null>(null);
  const solved = isRegionsSolved(spec, state);

  useEffect(() => {
    if (solved) onSolved();
  }, [solved, onSolved]);

  function commit(next: RegionsState, cue?: Cue) {
    const before = stateRef.current;
    stateRef.current = next;
    setState(next);
    onMove(cue);
    playFeedback(cue, units, before, next, isRegionsSolved(spec, next));
    onStateChange?.([...next]);
  }

  function setCell(idx: number, value: number, cue: Cue = valueCue(value)) {
    const cur = stateRef.current;
    if (cur[idx] === value) return;
    const next = Uint8Array.from(cur);
    next[idx] = value;
    commit(next, cue);
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
    if (!d || d.pointerId !== e.pointerId) return;
    const idx = cellAt(e.clientX, e.clientY);
    if (idx === null || idx === d.idx) return;
    clearTimer(d);
    // A stroke that starts on a symbol paints nothing, and having moved it is no tap either.
    if (d.paint === null) {
      d.applied = true;
      return;
    }
    if (!d.applied) {
      d.applied = true;
      setCell(d.idx, d.paint);
    }
    const current = stateRef.current[idx]!;
    if (current === 1) return;
    if (d.paint === REGIONS_MARKED_EMPTY ? current === 0 : current === REGIONS_MARKED_EMPTY) setCell(idx, d.paint, 'step');
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
    setCell(idx, h.value, 'hint');
    setFlash(idx);
  }

  function reset() {
    if (locked || solved) return;
    history.remember(stateRef.current);
    commit(emptyRegionsState(spec));
  }

  function undo() {
    if (locked || solved) return;
    const prev = history.undo(stateRef.current);
    if (prev) commit(prev, 'undo');
  }

  function redo() {
    if (locked || solved) return;
    const next = history.redo(stateRef.current);
    if (next) commit(next, 'redo');
  }

  return (
    <div className="regions-wrap" style={{ '--size': n } as React.CSSProperties}>
      <RegionsBoard
        spec={spec}
        state={state}
        symbol={symbol}
        mistakes={mistakes}
        flash={flash}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={cancelDrag}
        onContextMenu={(e) => e.preventDefault()}
        role="application"
        aria-label={symbol === 'cat' ? 'Cats board' : 'Hearts board'}
      />

      {!solved && (
        <div className="tools">
          <ToolButton icon="undo" label="Undo" onClick={undo} disabled={locked || !history.canUndo} />
          <ToolButton icon="redo" label="Redo" onClick={redo} disabled={locked || !history.canRedo(state)} />
          <ToolButton icon="hint" label="Hint" onClick={useHint} disabled={locked || hintBusy} badge={hintAd ? <AdBadge /> : null} />
          <ResetButton onReset={reset} disabled={locked} />
        </div>
      )}
    </div>
  );
}
