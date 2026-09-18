import { useEffect, useMemo, useRef, useState } from 'react';
import {
  emptySudokuState,
  isSudokuSolved,
  sudokuCellValues,
  sudokuConflicts,
  sudokuHint,
  sudokuPeers,
  sudokuStateFromArray,
  sudokuStateToArray,
  type SudokuSpec,
  type SudokuState,
} from '@puzzle-hustle/core';
import './sudoku.css';
import { useHistory } from '../lib/useHistory.ts';

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export interface SudokuGameProps {
  spec: SudokuSpec;
  onMove(): void;
  onSolved(): void;
  onHintUsed(): void;
  requestHint(): Promise<boolean>;
  locked: boolean;
  initialState?: number[] | undefined;
  onStateChange?(state: number[]): void;
}

interface CageEdge {
  side: 't' | 'r' | 'b' | 'l';
  start: number;
  end: number;
}

interface CageCell {
  edges: CageEdge[];
  sum: number | null;
}


function neighbor(i: number, side: CageEdge['side']): number {
  const r = Math.floor(i / 9);
  const c = i % 9;
  if (side === 't') return r === 0 ? -1 : i - 9;
  if (side === 'b') return r === 8 ? -1 : i + 9;
  if (side === 'l') return c === 0 ? -1 : i - 1;
  return c === 8 ? -1 : i + 1;
}

function cageCells(spec: SudokuSpec): CageCell[] {
  const cageOf = new Int16Array(81).fill(-1);
  spec.cages.forEach((cage, k) => {
    for (const i of cage.cells) cageOf[i] = k;
  });
  const first = new Set(spec.cages.map((cage) => Math.min(...cage.cells)));
  return Array.from({ length: 81 }, (_, i) => {
    const k = cageOf[i]!;
    if (k < 0) return { edges: [], sum: null };
    const boundary = (cell: number, side: CageEdge['side']) => {
      const n = neighbor(cell, side);
      return n < 0 || cageOf[n] !== k;
    };
    const extent = (side: CageEdge['side'], along: CageEdge['side']) => {
      const n = neighbor(i, along);
      if (n < 0 || cageOf[n] !== k) return 1;
      return boundary(n, side) ? 0 : -1;
    };
    const edges: CageEdge[] = [];
    for (const [side, a, b] of [['t', 'l', 'r'], ['b', 'l', 'r'], ['l', 't', 'b'], ['r', 't', 'b']] as const) {
      if (boundary(i, side)) edges.push({ side, start: extent(side, a), end: extent(side, b) });
    }
    return { edges, sum: first.has(i) ? spec.cages[k]!.sum : null };
  });
}

function cloneState(state: SudokuState): SudokuState {
  return { values: Uint8Array.from(state.values), notes: Uint16Array.from(state.notes) };
}

function initialSudokuState(spec: SudokuSpec, initial: number[] | undefined): SudokuState {
  return initial && initial.length === 162 ? sudokuStateFromArray(initial) : emptySudokuState(spec);
}

function moveSelection(from: number | null, key: string): number {
  if (from === null) return 0;
  const r = Math.floor(from / 9);
  const c = from % 9;
  if (key === 'ArrowUp') return ((r + 8) % 9) * 9 + c;
  if (key === 'ArrowDown') return ((r + 1) % 9) * 9 + c;
  if (key === 'ArrowLeft') return r * 9 + ((c + 8) % 9);
  return r * 9 + ((c + 1) % 9);
}

export function SudokuGame({ spec, onMove, onSolved, onHintUsed, requestHint, locked, initialState, onStateChange }: SudokuGameProps) {
  const [state, setState] = useState<SudokuState>(() => initialSudokuState(spec, initialState));
  const [selected, setSelected] = useState<number | null>(null);
  const [notesMode, setNotesMode] = useState(false);
  const [flash, setFlash] = useState<number | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const history = useHistory<SudokuState>();
  const stateRef = useRef(state);
  const cages = useMemo(() => cageCells(spec), [spec]);
  const values = useMemo(() => sudokuCellValues(spec, state), [spec, state]);
  const conflicts = useMemo(() => sudokuConflicts(spec, state), [spec, state]);
  const solved = isSudokuSolved(spec, state);
  const frozen = locked || solved;

  useEffect(() => {
    if (solved) onSolved();
  }, [solved, onSolved]);

  function commit(next: SudokuState, record = true) {
    if (record) history.remember(stateRef.current);
    stateRef.current = next;
    setState(next);
    onMove();
    onStateChange?.(sudokuStateToArray(next));
  }

  function setValue(i: number, d: number) {
    const next = cloneState(stateRef.current);
    next.values[i] = d;
    next.notes[i] = 0;
    if (d) for (const p of sudokuPeers(i)) next.notes[p]! &= ~(1 << (d - 1));
    commit(next);
  }

  function enter(d: number) {
    if (frozen || selected === null || spec.givens[selected]) return;
    const cur = stateRef.current;
    if (notesMode) {
      if (cur.values[selected]) return;
      const next = cloneState(cur);
      next.notes[selected]! ^= 1 << (d - 1);
      commit(next);
      return;
    }
    setValue(selected, cur.values[selected] === d ? 0 : d);
  }

  function erase() {
    if (frozen || selected === null || spec.givens[selected]) return;
    const cur = stateRef.current;
    if (!cur.values[selected] && !cur.notes[selected]) return;
    setValue(selected, 0);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key >= '1' && e.key <= '9') enter(Number(e.key));
      else if (e.key === 'Backspace' || e.key === 'Delete') erase();
      else if (e.key === 'n' || e.key === 'N') setNotesMode((v) => !v);
      else if (e.key.startsWith('Arrow')) setSelected((s) => moveSelection(s, e.key));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function useHint() {
    if (hintBusy || frozen) return;
    const h = sudokuHint(spec, stateRef.current);
    if (!h) return;
    setHintBusy(true);
    const ok = await requestHint();
    setHintBusy(false);
    if (!ok) return;
    onHintUsed();
    setValue(h.cell, h.value);
    setSelected(h.cell);
    setFlash(h.cell);
    setTimeout(() => setFlash(null), 1800);
  }

  function reset() {
    if (frozen) return;
    commit(emptySudokuState(spec));
  }

  function undo() {
    if (frozen) return;
    const prev = history.undo();
    if (prev) commit(prev, false);
  }

  const remaining = DIGITS.map((d) => 9 - values.reduce((n, v) => n + (v === d ? 1 : 0), 0));
  const selectedValue = selected === null ? 0 : values[selected]!;
  const peers = useMemo(() => (selected === null ? new Set<number>() : new Set(sudokuPeers(selected))), [selected]);

  const cellClass = (i: number) => {
    const cls = ['sudoku-cell'];
    const c = i % 9;
    const r = Math.floor(i / 9);
    if (c % 3 === 2 && c < 8) cls.push('box-r');
    if (r % 3 === 2 && r < 8) cls.push('box-b');
    if (c === 8) cls.push('last-c');
    if (r === 8) cls.push('last-r');
    if (spec.givens[i]) cls.push('given');
    if (!solved) {
      if (i === selected) cls.push('selected');
      else if (selectedValue && values[i] === selectedValue) cls.push('same');
      else if (peers.has(i)) cls.push('peer');
      if (conflicts[i]) cls.push('conflict');
    }
    if (flash === i) cls.push('flash');
    return cls.join(' ');
  };

  return (
    <div className="sudoku-wrap">
      <div className={solved ? 'sudoku-board board-frame solved' : 'sudoku-board board-frame'} role="grid" aria-label="Sudoku board">
        {Array.from({ length: 81 }, (_, i) => {
          const cage = cages[i]!;
          const v = values[i]!;
          const notes = state.notes[i]!;
          return (
            <div key={i} className={cellClass(i)} role="gridcell" aria-selected={i === selected} style={{ '--r': Math.floor(i / 9) } as React.CSSProperties} onPointerDown={() => !solved && setSelected(i)}>
              {cage.edges.map((e) => (
                <span key={e.side} className={`sudoku-cage ${e.side}`} style={{ '--a': e.start, '--b': e.end } as React.CSSProperties} />
              ))}
              {cage.sum !== null && <span className="sudoku-cage-sum">{cage.sum}</span>}
              {v ? (
                <span className="sudoku-value">{v}</span>
              ) : notes ? (
                <span className={cage.sum !== null ? 'sudoku-notes with-sum' : 'sudoku-notes'}>
                  {DIGITS.map((d) => (
                    <i key={d}>{notes & (1 << (d - 1)) ? d : ''}</i>
                  ))}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {!solved && (
        <>
          <div className="sudoku-pad">
            {DIGITS.map((d, k) => (
              <button type="button" key={d} className="sudoku-key" onClick={() => enter(d)} disabled={locked || remaining[k]! <= 0} aria-label={`Enter ${d}`}>
                {d}
                <small>{remaining[k]}</small>
              </button>
            ))}
          </div>
          <div className="actions">
            <button type="button" className={notesMode ? 'btn active' : 'btn'} onClick={() => setNotesMode((v) => !v)} disabled={locked} aria-pressed={notesMode}>
              Notes
            </button>
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
