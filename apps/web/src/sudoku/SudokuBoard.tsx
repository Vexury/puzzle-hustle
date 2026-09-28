import { useMemo } from 'react';
import { isSudokuSolved, sudokuCellValues, sudokuConflicts, sudokuPeers, type SudokuSpec, type SudokuState } from '@puzzle-hustle/core';
import './sudoku.css';
import { cageLayout, SUM_FONT, type CageSum } from './cages.ts';

export const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export interface SudokuBoardProps {
  spec: SudokuSpec;
  state: SudokuState;
  selected: number | null;
  // The digit the board lights up: the one in the selected cell, otherwise the one tapped in the pad.
  marked: number;
  markNotes: boolean;
  mistakes: boolean;
  flash?: number | null;
  highlight?: readonly number[] | undefined;
  onCell?(i: number): void;
}

export function SudokuBoard({ spec, state, selected, marked, markNotes, mistakes, flash = null, highlight, onCell }: SudokuBoardProps) {
  const cages = useMemo(() => cageLayout(spec), [spec]);
  const sums = useMemo(() => {
    const out: (CageSum | undefined)[] = [];
    for (const shape of cages.shapes) out[shape.sum.cell] = shape.sum;
    return out;
  }, [cages]);
  const values = useMemo(() => sudokuCellValues(spec, state), [spec, state]);
  const conflicts = useMemo(() => sudokuConflicts(spec, state), [spec, state]);
  const solved = isSudokuSolved(spec, state);
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
      if (mistakes && conflicts[i]) cls.push('conflict');
    }
    if (flash === i) cls.push('flash');
    if (highlight?.includes(i)) cls.push('hl');
    return cls.join(' ');
  };

  return (
    <div className={solved ? 'sudoku-board board-frame solved' : 'sudoku-board board-frame'} role="grid" aria-label="Sudoku board">
      {Array.from({ length: 81 }, (_, i) => {
        const sum = sums[i];
        const v = values[i]!;
        const notes = state.notes[i]!;
        return (
          <div key={i} className={cellClass(i)} data-i={i} role="gridcell" aria-selected={i === selected} style={{ '--r': Math.floor(i / 9) } as React.CSSProperties} onPointerDown={() => !solved && onCell?.(i)}>
            {sum && (
              <span
                className={`sudoku-cage-sum k${cages.colourOfCell[i]}`}
                style={{ left: `${sum.left * 100}%`, top: `${sum.top * 100}%`, width: `${sum.width * 100}%`, fontSize: `${(SUM_FONT * 100) / 9}cqw` }}
              >
                {sum.value}
              </span>
            )}
            {v ? (
              <span className="sudoku-value">{v}</span>
            ) : notes ? (
              <span className={sum ? 'sudoku-notes with-sum' : 'sudoku-notes'}>
                {DIGITS.map((d) => (
                  <i key={d} className={markNotes && marked === d && notes & (1 << (d - 1)) ? 'on' : undefined}>
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
          {cages.shapes.map((shape, k) => shape.outlines.map((o, j) => <path key={`${k}.${j}`} d={o.d} strokeDasharray={o.dash} className={`k${shape.colour}`} />))}
        </svg>
      )}
    </div>
  );
}

export interface SudokuPadProps {
  remaining: readonly number[];
  lit: number;
  locked: boolean;
  markDigits: boolean;
  onDigit?(d: number): void;
  // The demo finds each key by data-demo = demoBase + digit.
  demoBase?: number;
}

export function SudokuPad({ remaining, lit, locked, markDigits, onDigit, demoBase }: SudokuPadProps) {
  return (
    <div className="sudoku-pad">
      {DIGITS.map((d, k) => (
        <button
          type="button"
          key={d}
          className={`sudoku-key${remaining[k]! <= 0 ? ' done' : ''}${lit === d ? ' lit' : ''}`}
          onClick={() => onDigit?.(d)}
          disabled={locked || (!markDigits && remaining[k]! <= 0)}
          aria-pressed={lit === d}
          aria-label={`Enter ${d}`}
          data-demo={demoBase === undefined ? undefined : demoBase + d}
        >
          {d}
          <small>{remaining[k]}</small>
        </button>
      ))}
    </div>
  );
}
