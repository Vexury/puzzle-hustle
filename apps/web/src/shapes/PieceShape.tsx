import { shapeOutline, type ShapeKind } from '@puzzle-hustle/core';

export function outlinePoints(kind: ShapeKind, r = 0, c = 0): string {
  return shapeOutline(kind)
    .map(([x, y]) => `${x + c},${y + r}`)
    .join(' ');
}
