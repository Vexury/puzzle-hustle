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
import { readSetting } from '../lib/storage.ts';
import { cageLayout } from './cages.ts';
import { ResetButton } from '../components/ResetButton.tsx';

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



// The sum sits in the cell with the lowest index, the top left one of its cage.
function cageSums(spec: SudokuSpec): (number | null)[] {
  const sums = Array.from({ length: 81 }, () => null as number | null);
  for (const cage of spec.cages) sums[Math.min(...cage.cells)] = cage.sum;
  return sums;
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
  const [highlight, setHighlight] = useState(0);
  // Read once per puzzle: the switch lives on the Profile tab, which cannot be open while a
  // board is.
  const highlightEnabled = useRef(readSetting('ph:sudokuHighlight') !== '0').current;
  const [flash, setFlash] = useState<number | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const history = useHistory<SudokuState>();
  const stateRef = useRef(state);
  const cages = useMemo(() => cageLayout(spec), [spec]);
  const sums = useMemo(() => cageSums(spec), [spec]);
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
    setTimeout(() => setFlash(null), 3000);
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
  // The digit the board lights up: the one in the selected cell, otherwise the one tapped in
  // the pad. Tapping a digit that cannot be entered anywhere only lights it up.
  const marked = selectedValue || highlight;

  const tapDigit = (d: number) => {
    if (!frozen && selected !== null && !spec.givens[selected] && remaining[d - 1]! > 0) {
      enter(d);
      if (highlightEnabled) setHighlight(d);
      return;
    }
    if (highlightEnabled) setHighlight((h) => (h === d ? 0 : d));
  };
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
      else if (marked && values[i] === marked) cls.push('same');
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
          const sum = sums[i]!;
          const v = values[i]!;
          const notes = state.notes[i]!;
          return (
            <div key={i} className={cellClass(i)} role="gridcell" aria-selected={i === selected} style={{ '--r': Math.floor(i / 9) } as React.CSSProperties} onPointerDown={() => !solved && setSelected(i)}>
              {sum !== null && <span className={`sudoku-cage-sum k${cages.colourOfCell[i]}`}>{sum}</span>}
              {v ? (
                <span className="sudoku-value">{v}</span>
              ) : notes ? (
                <span className={sum !== null ? 'sudoku-notes with-sum' : 'sudoku-notes'}>
                  {DIGITS.map((d) => (
                    <i key={d} className={highlightEnabled && marked === d && notes & (1 << (d - 1)) ? 'on' : undefined}>
                      {notes & (1 << (d - 1)) ? d : ''}
                    </i>
                  ))}
                </span>
              ) : null}
            </div>
          );
        })}
        {cages.shapes.length > 0 && (
          <svg className="sudoku-cages" viewBox="0 0 9 9" preserveAspectRatio="none" aria-hidden="true">
            {cages.shapes.map((shape, k) => (
              <path key={k} d={shape.path} className={`k${shape.colour}`} />
            ))}
          </svg>
        )}
      </div>

      {!solved && (
        <>
          <div className="sudoku-pad">
            {DIGITS.map((d, k) => (
              <button
                type="button"
                key={d}
                className={`sudoku-key${remaining[k]! <= 0 ? ' done' : ''}${highlight === d ? ' lit' : ''}`}
                onClick={() => tapDigit(d)}
                disabled={locked || (!highlightEnabled && remaining[k]! <= 0)}
                aria-pressed={highlight === d}
                aria-label={`Enter ${d}`}
              >
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
            <ResetButton onReset={reset} disabled={locked} />
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
