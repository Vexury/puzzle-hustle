import { SHAPES, atomFromIndex, atomPolygon, coverage, isSolved, litMask, type Placement, type ShapesSpec, type ShapesState } from '@puzzle-hustle/core';
import { outlinePoints } from './PieceShape.tsx';

export interface ShapesBoardProps extends Omit<React.SVGAttributes<SVGSVGElement>, 'className' | 'viewBox' | 'order'> {
  ref?: React.Ref<SVGSVGElement>;
  spec: ShapesSpec;
  state: ShapesState;
  order?: readonly number[];
  // The piece in hand, drawn at its drop preview (or not at all) instead of where it lies.
  held?: number | null;
  preview?: Placement | null;
  selected?: number | null;
  flash?: number | null;
  // Cells (r * size + c) outlined for the how-to demo.
  highlight?: readonly number[] | undefined;
  onPieceDown?(e: React.PointerEvent, pieceId: number): void;
}

const points = (r: number, c: number, dir: 0 | 1 | 2 | 3) =>
  atomPolygon(r, c, dir)
    .map((p) => p.join(','))
    .join(' ');

export function ShapesBoard({ spec, state, order, held = null, preview = null, selected = null, flash = null, highlight, onPieceDown, children, ...rest }: ShapesBoardProps) {
  const { size, margin: m, inner } = spec.config;
  const solved = isSolved(spec, state);
  const lit = litMask(coverage(size, spec.pieces, state));
  return (
    <svg className={solved ? 'board board-frame solved' : 'board board-frame'} viewBox={`${m} ${m} ${inner} ${inner}`} {...rest}>
      <rect className="inner-area" x={m} y={m} width={inner} height={inner} />
      {[...lit].map((v, i) => {
        if (v && spec.target[i]) return null;
        const { r, c, dir } = atomFromIndex(size, i);
        const cls = v ? 'atom lit' : spec.target[i] ? 'atom ghost' : 'atom';
        return <polygon key={i} className={cls} points={points(r, c, dir)} />;
      })}
      <g className="match-pulse">
        {[...lit].map((v, i) => {
          if (!v || !spec.target[i]) return null;
          const { r, c, dir } = atomFromIndex(size, i);
          return <polygon key={i} className="atom lit match" points={points(r, c, dir)} />;
        })}
      </g>
      {Array.from({ length: inner + 1 }, (_, i) => (
        <g key={i}>
          <line className="grid-line" x1={m} y1={m + i} x2={m + inner} y2={m + i} />
          <line className="grid-line" x1={m + i} y1={m} x2={m + i} y2={m + inner} />
        </g>
      ))}
      {highlight?.map((cell) => (
        <rect key={`hl${cell}`} x={(cell % size) + 0.06} y={Math.floor(cell / size) + 0.06} width={0.88} height={0.88} rx={0.08} fill="none" stroke="var(--accent-text)" strokeWidth={0.05} />
      ))}
      {(order ?? spec.pieces.map((_, i) => i)).map((i) => {
        const piece = spec.pieces[i]!;
        const isHeld = held === i;
        const p = isHeld ? preview : state[i];
        if (!p) return null;
        const cls = ['piece-outline', isHeld ? 'dragging' : '', selected === i ? 'selected' : ''].join(' ');
        return (
          <g key={piece.id}>
            <polygon className={cls} points={outlinePoints(piece.kind, p.r, p.c)} />
            {flash === i && <polygon className="hint-flash" points={outlinePoints(piece.kind, p.r, p.c)} />}
            {!solved && onPieceDown && (
              <polygon className="piece-hit" points={outlinePoints(piece.kind, p.r, p.c)} onPointerDown={(e) => onPieceDown(e, i)} aria-label={SHAPES[piece.kind].label} />
            )}
          </g>
        );
      })}
      {children}
    </svg>
  );
}

export interface ShapesTrayProps {
  spec: ShapesSpec;
  state: ShapesState;
  held?: number | null;
  selected?: number | null;
  slotProps?(pieceId: number, away: boolean): React.HTMLAttributes<HTMLDivElement> & { 'data-demo'?: number };
}

export function ShapesTray({ spec, state, held = null, selected = null, slotProps }: ShapesTrayProps) {
  return (
    <div className="shapes-tray" aria-label="Shapes to place">
      {spec.pieces.map((piece, i) => {
        const s = SHAPES[piece.kind];
        const away = !!state[i] || held === i;
        const cls = ['shapes-slot', away ? 'empty' : '', selected === i && !state[i] ? 'selected' : ''].join(' ');
        return (
          <div key={piece.id} className={cls} style={{ '--w': s.width, '--h': s.height } as React.CSSProperties} aria-label={s.label} {...slotProps?.(i, away)}>
            <svg viewBox={`-0.15 -0.15 ${s.width + 0.3} ${s.height + 0.3}`} aria-hidden="true">
              {Array.from({ length: s.width * s.height }, (_, k) => (
                <rect key={k} className="tray-cell" x={k % s.width} y={Math.floor(k / s.width)} width={1} height={1} />
              ))}
              <polygon className="tray-piece" points={outlinePoints(piece.kind)} />
            </svg>
          </div>
        );
      })}
    </div>
  );
}
