import { useMemo } from 'react';
import {
  REGIONS_MARKED_EMPTY,
  isRegionsSolved,
  regionsBorders,
  regionsConflicts,
  regionsLineCounts,
  regionsPalette,
  regionsUnitComplete,
  type RegionsSpec,
  type RegionsState,
} from '@puzzle-hustle/core';
import './regions.css';

const REGION_COLORS = 12;

export interface RegionsBoardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'className'> {
  spec: RegionsSpec;
  state: RegionsState;
  symbol: 'cat' | 'heart';
  mistakes: boolean;
  flash?: number | null;
  highlight?: readonly number[] | undefined;
}

function Glyph({ symbol }: { symbol: 'cat' | 'heart' }) {
  return (
    <svg viewBox="0 0 24 24" className="regions-glyph" aria-hidden="true">
      {symbol === 'cat' ? <path d="M4 4l5 5h6l5-5v12a8 6 0 0 1-16 0Z" /> : <path d="M12 21C6 16.5 2 13 2 8.5 2 5.5 4.3 3.5 7 3.5c2 0 3.8 1.1 5 3 1.2-1.9 3-3 5-3 2.7 0 5 2 5 5 0 4.5-4 8-10 12.5Z" />}
    </svg>
  );
}

export function RegionsBoard({ spec, state, symbol, mistakes, flash = null, highlight, ...rest }: RegionsBoardProps) {
  const n = spec.config.size;
  const solved = isRegionsSolved(spec, state);
  const palette = useMemo(() => regionsPalette(spec, REGION_COLORS), [spec]);
  const borders = useMemo(() => Array.from({ length: n * n }, (_, i) => regionsBorders(spec, i)), [spec, n]);
  const conflicts = regionsConflicts(spec, state);
  const counts = regionsLineCounts(spec, state);

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
    if (mistakes && v === 1 && conflicts[i]) cls.push('conflict');
    if (regionsUnitComplete(spec, counts, i)) cls.push('done');
    if (flash === i) cls.push('flash');
    if (highlight?.includes(i)) cls.push('hl');
    return cls.join(' ');
  };

  return (
    <div className={solved ? 'regions-board board-frame solved' : 'regions-board board-frame'} {...rest}>
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
  );
}
