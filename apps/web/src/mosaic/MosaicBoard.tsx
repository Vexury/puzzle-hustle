import { MOSAIC_MARKED_EMPTY, isMosaicSolved, mosaicClueBroken, mosaicClueSatisfied, type MosaicSpec, type MosaicState } from '@puzzle-hustle/core';
import { gridLineClasses } from '../lib/gridLines.ts';
import './mosaic.css';

export interface MosaicBoardProps extends Omit<React.ComponentProps<'div'>, 'className'> {
  spec: MosaicSpec;
  state: MosaicState;
  cell: number;
  mistakes: boolean;
  flash?: number | null;
  highlight?: readonly number[] | undefined;
}

export function MosaicBoard({ spec, state, cell, mistakes, flash = null, highlight, ...rest }: MosaicBoardProps) {
  const { rows, cols } = spec.config;
  const solved = isMosaicSolved(spec, state);

  const cellClass = (r: number, c: number, v: number, clue: number) => {
    const cls = ['mosaic-cell'];
    if (v === MOSAIC_MARKED_EMPTY && !solved) cls.push('x');
    else if (v === 1) cls.push('filled');
    if (clue >= 0 && mosaicClueSatisfied(spec, state, r, c)) cls.push('done');
    else if (mistakes && clue >= 0 && !solved && mosaicClueBroken(spec, state, r, c)) cls.push('broken');
    cls.push(...gridLineClasses(r, c, rows, cols, false));
    if (flash === r * cols + c) cls.push('flash');
    if (highlight?.includes(r * cols + c)) cls.push('hl');
    return cls.join(' ');
  };

  return (
    <div className={solved ? 'mosaic-viewport board-frame solved' : 'mosaic-viewport board-frame'} {...rest}>
      <div className="mosaic-board" style={{ '--rows': rows, '--cols': cols, '--cell': `${cell}px` } as React.CSSProperties}>
        {Array.from({ length: rows * cols }, (_, i) => {
          const r = Math.floor(i / cols);
          const c = i % cols;
          const clue = spec.clues[i]!;
          return (
            <div key={i} className={cellClass(r, c, state[i]!, clue)} data-r={r} data-c={c} data-i={i} style={{ '--r': r } as React.CSSProperties}>
              {clue >= 0 && <span className="mosaic-clue">{clue}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
