import { SHAPES, shapeOutline, type ShapeKind } from '@puzzle-hustle/core';

export function outlinePoints(kind: ShapeKind, r = 0, c = 0): string {
  return shapeOutline(kind)
    .map(([x, y]) => `${x + c},${y + r}`)
    .join(' ');
}

export function PieceShape({ kind, className }: { kind: ShapeKind; className?: string }) {
  const s = SHAPES[kind];
  const max = Math.max(s.width, s.height);
  const ox = (max - s.width) / 2;
  const oy = (max - s.height) / 2;
  return (
    <svg viewBox={`${-0.1 - ox} ${-0.1 - oy} ${max + 0.2} ${max + 0.2}`} className={className} aria-label={s.label}>
      <polygon points={outlinePoints(kind)} />
    </svg>
  );
}
