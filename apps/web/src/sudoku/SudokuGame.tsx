import { useEffect, useMemo, useRef, useState } from 'react';
import {
  emptySudokuState,
  isSudokuSolved,
  sudokuCellValues,
  sudokuHint,
  sudokuPeers,
  sudokuStateFromArray,
  sudokuStateToArray,
  type SudokuSpec,
  type SudokuState,
} from '@puzzle-hustle/core';
import { useHistory } from '../lib/useHistory.ts';
import { useFlash } from '../lib/useFlash.ts';
import { readSetting } from '../lib/storage.ts';
import { showMistakes } from '../lib/mistakes.ts';
import { DIGITS, SudokuBoard, SudokuPad } from './SudokuBoard.tsx';
import { ResetButton } from '../components/ResetButton.tsx';
import { AdBadge, ToolButton } from '../components/ToolButton.tsx';

export interface SudokuGameProps {
  spec: SudokuSpec;
  onMove(): void;
  onSolved(): void;
  onHintUsed(): void;
  requestHint(): Promise<boolean>;
  hintAd?: boolean;
  locked: boolean;
  initialState?: number[] | undefined;
  onStateChange?(state: number[]): void;
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

export function SudokuGame({ spec, onMove, onSolved, onHintUsed, requestHint, hintAd, locked, initialState, onStateChange }: SudokuGameProps) {
  const [state, setState] = useState<SudokuState>(() => initialSudokuState(spec, initialState));
  const [selected, setSelected] = useState<number | null>(null);
  const [notesMode, setNotesMode] = useState(false);
  const [highlight, setHighlight] = useState(0);
  // Read once per puzzle: the switch lives on the Profile tab, which cannot be open while a
  // board is.
  const highlightEnabled = useRef(readSetting('ph:sudokuHighlight') !== '0').current;
  const mistakes = useRef(showMistakes()).current;
  const [flash, setFlash] = useFlash<number>();
  const [hintBusy, setHintBusy] = useState(false);
  const history = useHistory<SudokuState>();
  const stateRef = useRef(state);
  const values = useMemo(() => sudokuCellValues(spec, state), [spec, state]);
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
  }

  function reset() {
    if (frozen) return;
    commit(emptySudokuState(spec));
  }

  function undo() {
    if (frozen) return;
    const prev = history.undo(stateRef.current);
    if (prev) commit(prev, false);
  }

  function redo() {
    if (frozen) return;
    const next = history.redo(stateRef.current);
    if (next) commit(next, false);
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

  return (
    <div className="sudoku-wrap">
      <SudokuBoard spec={spec} state={state} selected={selected} marked={marked} markNotes={highlightEnabled} mistakes={mistakes} flash={flash} onCell={setSelected} />

      {!solved && (
        <>
          <SudokuPad remaining={remaining} lit={highlight} locked={locked} markDigits={highlightEnabled} onDigit={tapDigit} />
          <div className="tools">
            <ToolButton icon="notes" label="Notes" className={notesMode ? 'active' : ''} onClick={() => setNotesMode((v) => !v)} disabled={locked} pressed={notesMode} />
            <ToolButton icon="erase" label="Erase" onClick={erase} disabled={locked} />
            <ToolButton icon="undo" label="Undo" onClick={undo} disabled={locked || !history.canUndo} />
            <ToolButton icon="redo" label="Redo" onClick={redo} disabled={locked || !history.canRedo(state)} />
            <ToolButton icon="hint" label="Hint" onClick={useHint} disabled={locked || hintBusy} badge={hintAd ? <AdBadge /> : null} />
            <ResetButton onReset={reset} disabled={locked} />
          </div>
        </>
      )}
    </div>
  );
}
