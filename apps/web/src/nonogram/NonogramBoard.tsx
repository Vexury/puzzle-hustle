import { MARKED_EMPTY, isNonogramSolved, lineBroken, lineSatisfied, type Clue, type NonogramSpec, type NonogramState } from '@puzzle-hustle/core';
import { gridLineClasses } from '../lib/gridLines.ts';
import './nonogram.css';

// Highlight indices past the cells stand for clues: rows*cols + r for a row, then + rows + c
// for a column.
export interface NonogramBoardProps extends Omit<React.ComponentProps<'div'>, 'className'> {
  spec: NonogramSpec;
  state: NonogramState;
  cell: number;
  mistakes: boolean;
  flash?: number | null;
  highlight?: readonly number[] | undefined;
}

function ClueList({ clues, done, broken, hl, axis, index }: { clues: Clue[]; done: boolean; broken: boolean; hl: boolean; axis: 'row' | 'col'; index: number }) {
  const style = axis === 'row' ? { gridRow: index + 2, gridColumn: 1 } : { gridRow: 1, gridColumn: index + 2 };
  return (
    <div className={['nono-clues', axis, done ? 'done' : '', broken ? 'broken' : '', hl ? 'hl' : ''].join(' ')} style={style}>
      {clues.length === 0 && <span className="clue zero">0</span>}
      {clues.map((k, i) => (
        <span key={i} className={`clue c${k.color}`}>
          {k.len}
        </span>
      ))}
    </div>
  );
}

export function NonogramBoard({ spec, state, cell, mistakes, flash = null, highlight, ...rest }: NonogramBoardProps) {
  const { rows, cols } = spec.config;
  const solved = isNonogramSolved(spec, state);
  const hl = (i: number) => highlight?.includes(i) ?? false;

  const cellClass = (r: number, c: number, v: number) => {
    const cls = ['nono-cell'];
    if (v === MARKED_EMPTY && !solved) cls.push('x');
    else if (v !== 0 && v !== MARKED_EMPTY) cls.push(`f${v}`);
    cls.push(...gridLineClasses(r, c, rows, cols));
    if (flash === r * cols + c) cls.push('flash');
    if (hl(r * cols + c)) cls.push('hl');
    return cls.join(' ');
  };

  return (
    <div className={solved ? 'nono-viewport board-frame solved' : 'nono-viewport board-frame'} {...rest}>
      <div className="nono-board" style={{ '--rows': rows, '--cols': cols, '--cell': `${cell}px` } as React.CSSProperties}>
        <div className="nono-corner" />
        {spec.colClues.map((clues, c) => (
          <ClueList key={`c${c}`} clues={clues} axis="col" index={c} done={lineSatisfied(spec, state, 'col', c)} broken={mistakes && lineBroken(spec, state, 'col', c)} hl={hl(rows * cols + rows + c)} />
        ))}
        {spec.rowClues.map((clues, r) => (
          <ClueList key={`r${r}`} clues={clues} axis="row" index={r} done={lineSatisfied(spec, state, 'row', r)} broken={mistakes && lineBroken(spec, state, 'row', r)} hl={hl(rows * cols + r)} />
        ))}
        {Array.from({ length: rows * cols }, (_, i) => {
          const r = Math.floor(i / cols);
          const c = i % cols;
          return <div key={i} className={cellClass(r, c, state[i]!)} style={{ gridRow: r + 2, gridColumn: c + 2, '--r': r } as React.CSSProperties} data-r={r} data-c={c} data-i={i} />;
        })}
      </div>
    </div>
  );
}
