import { useEffect, useMemo, useRef, useState } from 'react';
import {
  emptyKakuroState,
  isKakuroSolved,
  kakuroClues,
  kakuroConflicts,
  kakuroHint,
  kakuroRunSatisfied,
  kakuroStateFromArray,
  kakuroStateToArray,
  type KakuroSpec,
  type KakuroState,
  kakuroRunMap,
} from '@puzzle-hustle/core';
import { useHistory } from '../lib/useHistory.ts';
import { useZoomViewport } from '../lib/useZoomViewport.ts';
import './kakuro.css';

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export interface KakuroGameProps {
  spec: KakuroSpec;
  onMove(): void;
  onSolved(): void;
  onHintUsed(): void;
  requestHint(): Promise<boolean>;
  locked: boolean;
  initialState?: number[] | undefined;
  onStateChange?(state: number[]): void;
  viewKey?: string | undefined;
}

function cellAt(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-i]');
  return el ? Number(el.dataset['i']) : null;
}

function moveSelection(spec: KakuroSpec, from: number | null, key: string): number | null {
  const { rows, cols } = spec.config;
  const n = rows * cols;
  if (from === null) return spec.cells.findIndex((v) => v === 1);
  const dr = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
  const dc = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
  let r = Math.floor(from / cols);
  let c = from % cols;
  for (let step = 0; step < n; step++) {
    r = (r + dr + rows) % rows;
    c = (c + dc + cols) % cols;
    const i = r * cols + c;
    if (spec.cells[i]) return i;
  }
  return from;
}

export function KakuroGame({ spec, onMove, onSolved, onHintUsed, requestHint, locked, initialState, onStateChange, viewKey }: KakuroGameProps) {
  const { rows, cols } = spec.config;
  const [state, setState] = useState<KakuroState>(() => (initialState ? kakuroStateFromArray(spec, initialState) : emptyKakuroState(spec)));
  const [selected, setSelected] = useState<number | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const history = useHistory<KakuroState>();
  const stateRef = useRef(state);
  const map = useMemo(() => kakuroRunMap(spec), [spec]);
  const clues = useMemo(() => kakuroClues(spec), [spec]);
  const conflicts = useMemo(() => kakuroConflicts(spec, state), [spec, state]);
  const runDone = useMemo(() => spec.runs.map((run) => kakuroRunSatisfied(run, state)), [spec, state]);
  const solved = isKakuroSolved(spec, state);
  const frozen = locked || solved;
  const { viewport, cellPx, pointerDown, pointerMove, pointerUp, pointerCancel } = useZoomViewport(cols, 18, viewKey);

  useEffect(() => {
    if (solved) onSolved();
  }, [solved, onSolved]);

  function commit(next: KakuroState, record = true) {
    if (record) history.remember(stateRef.current);
    stateRef.current = next;
    setState(next);
    onMove();
    onStateChange?.(kakuroStateToArray(next));
  }

  function setValue(i: number, d: number) {
    if (stateRef.current[i] === d) return;
    const next = Uint8Array.from(stateRef.current);
    next[i] = d;
    commit(next);
  }

  function enter(d: number) {
    if (frozen || selected === null) return;
    setValue(selected, stateRef.current[selected] === d ? 0 : d);
  }

  function erase() {
    if (frozen || selected === null) return;
    setValue(selected, 0);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key >= '1' && e.key <= '9') enter(Number(e.key));
      else if (e.key === 'Backspace' || e.key === 'Delete') erase();
      else if (e.key.startsWith('Arrow')) setSelected((s) => moveSelection(spec, s, e.key));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    if (pointerDown(e) || solved) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i === null || !spec.cells[i]) return;
    e.preventDefault();
    setSelected(i);
  }

  async function useHint() {
    if (hintBusy || frozen) return;
    const h = kakuroHint(spec, stateRef.current);
    if (!h) return;
    setHintBusy(true);
    const ok = await requestHint();
    setHintBusy(false);
    if (!ok) return;
    onHintUsed();
    setValue(h.index, h.digit);
    setSelected(h.index);
    setFlash(h.index);
    setTimeout(() => setFlash(null), 1800);
  }

  function reset() {
    if (frozen) return;
    commit(emptyKakuroState(spec));
  }

  function undo() {
    if (frozen) return;
    const prev = history.undo();
    if (prev) commit(prev, false);
  }

  const peers = useMemo(() => {
    const set = new Set<number>();
    if (selected === null) return set;
    for (const k of [map.h[selected]!, map.v[selected]!]) for (const i of spec.runs[k]!.cells) set.add(i);
    return set;
  }, [spec, map, selected]);

  const usedDigits = useMemo(() => {
    let mask = 0;
    if (selected === null) return mask;
    for (const i of peers) if (i !== selected && state[i]) mask |= 1 << (state[i]! - 1);
    return mask;
  }, [peers, selected, state]);

  const selectedValue = selected === null ? 0 : state[selected]!;

  const cellClass = (i: number) => {
    const cls = ['kakuro-cell'];
    if (!spec.cells[i]) {
      cls.push('black');
      return cls.join(' ');
    }
    if (!solved) {
      if (i === selected) cls.push('selected');
      else if (selectedValue && state[i] === selectedValue) cls.push('same');
      else if (peers.has(i)) cls.push('peer');
      if (conflicts[i]) cls.push('conflict');
    }
    if (flash === i) cls.push('flash');
    return cls.join(' ');
  };

  return (
    <div className="kakuro-wrap">
      <div
        ref={viewport}
        className={solved ? 'kakuro-viewport solved' : 'kakuro-viewport'}
        onPointerDown={onDown}
        onPointerMove={(e) => void pointerMove(e)}
        onPointerUp={(e) => void pointerUp(e)}
        onPointerCancel={pointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        role="application"
        aria-label="Kakuro board"
      >
        <div className="kakuro-board" style={{ '--rows': rows, '--cols': cols, '--cell': `${cellPx}px` } as React.CSSProperties}>
          {Array.from({ length: rows * cols }, (_, i) => {
            const clue = clues[i];
            const v = state[i]!;
            return (
              <div key={i} className={cellClass(i)} data-i={i} aria-selected={i === selected} style={{ '--r': Math.floor(i / cols) } as React.CSSProperties}>
                {clue && (
                  <>
                    <span className="kakuro-diag" />
                    {clue.right > 0 && <span className={runDone[clue.rightRun] ? 'kakuro-clue right done' : 'kakuro-clue right'}>{clue.right}</span>}
                    {clue.down > 0 && <span className={runDone[clue.downRun] ? 'kakuro-clue down done' : 'kakuro-clue down'}>{clue.down}</span>}
                  </>
                )}
                {spec.cells[i] && v ? <span className="kakuro-value">{v}</span> : null}
              </div>
            );
          })}
        </div>
      </div>

      {!solved && (
        <>
          <div className="kakuro-pad">
            {DIGITS.map((d) => (
              <button
                type="button"
                key={d}
                className={usedDigits & (1 << (d - 1)) ? 'kakuro-key used' : 'kakuro-key'}
                onClick={() => enter(d)}
                disabled={locked || selected === null}
                aria-label={`Enter ${d}`}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="actions">
            <button type="button" className="btn" onClick={erase} disabled={locked}>
              Erase
            </button>
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
        </>
      )}
    </div>
  );
}
