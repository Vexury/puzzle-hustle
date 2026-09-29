import { isZipSolved, zipOrderBreak, type ZipSpec, type ZipState } from '@puzzle-hustle/core';
import { HintMark } from '../components/HintMark.tsx';
import './zip.css';

export interface ZipBoardProps extends Omit<React.SVGProps<SVGSVGElement>, 'className' | 'viewBox' | 'path'> {
  spec: ZipSpec;
  path: ZipState;
  mistakes: boolean;
  flash?: number | null;
  highlight?: readonly number[] | undefined;
}

export function ZipBoard({ spec, path, mistakes, flash = null, highlight, ...rest }: ZipBoardProps) {
  const n = spec.config.size;
  const solved = isZipSolved(spec, path);
  const head = path.length > 0 ? path[path.length - 1]! : -1;
  const inPath = new Uint8Array(n * n);
  for (const cell of path) inPath[cell] = 1;
  // From the last number reached in order on, the path is drawn as a mistake, numbers included.
  const brk = mistakes && !solved ? zipOrderBreak(spec, path) : null;
  const wrong = new Uint8Array(n * n);
  if (brk !== null) for (const cell of path.slice(brk + 1)) wrong[cell] = 1;
  const pointsOf = (cells: ZipState) => cells.map((cell) => `${(cell % n) + 0.5},${Math.floor(cell / n) + 0.5}`).join(' ');
  const good = brk === null ? path : path.slice(0, brk + 1);
  const bad = brk === null ? [] : path.slice(brk);

  const cells: React.ReactNode[] = [];
  const walls: React.ReactNode[] = [];
  const numbers: React.ReactNode[] = [];
  const hl: React.ReactNode[] = [];
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n);
    const c = i % n;
    const cls = ['zip-cell'];
    if (inPath[i]) cls.push('filled');
    cells.push(<rect key={i} className={cls.join(' ')} x={c} y={r} width={1} height={1} data-i={i} />);
    if (highlight?.includes(i)) hl.push(<rect key={`h${i}`} className="zip-hl" x={c + 0.06} y={r + 0.06} width={0.88} height={0.88} rx={0.08} />);
    const w = spec.walls[i]!;
    if (w & 2) walls.push(<line key={`w${i}r`} className="zip-wall" x1={c + 1} y1={r} x2={c + 1} y2={r + 1} />);
    if (w & 4) walls.push(<line key={`w${i}d`} className="zip-wall" x1={c} y1={r + 1} x2={c + 1} y2={r + 1} />);
    const v = spec.numbers[i]!;
    if (v) {
      numbers.push(
        <g key={`n${i}`} className={wrong[i] ? 'zip-number filled wrong' : inPath[i] ? 'zip-number filled' : 'zip-number'} style={{ '--k': v } as React.CSSProperties}>
          <circle cx={c + 0.5} cy={r + 0.5} r={0.36} />
          <text x={c + 0.5} y={r + 0.5} dy="0.33em">
            {v}
          </text>
        </g>,
      );
    }
  }

  return (
    <div className={solved ? 'zip-board board-frame solved' : 'zip-board board-frame'}>
      <svg className="zip-svg" viewBox={`0 0 ${n} ${n}`} {...rest}>
        <g className="zip-cells">{cells}</g>
        {hl}
        {flash !== null && <HintMark x={flash % n} y={Math.floor(flash / n)} />}
        {good.length > 1 && <polyline className="zip-path" points={pointsOf(good)} />}
        {bad.length > 1 && <polyline className="zip-path wrong" points={pointsOf(bad)} />}
        {path.length === 1 && <circle className="zip-path-dot" cx={(head % n) + 0.5} cy={Math.floor(head / n) + 0.5} r={0.21} />}
        <g className="zip-numbers">{numbers}</g>
        {head >= 0 && !solved && <circle className="zip-head" cx={(head % n) + 0.5} cy={Math.floor(head / n) + 0.5} r={0.3} />}
        <g className="zip-walls">{walls}</g>
      </svg>
    </div>
  );
}
