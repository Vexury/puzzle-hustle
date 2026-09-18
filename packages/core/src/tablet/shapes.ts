export type AtomDir = 0 | 1 | 2 | 3;
export const ATOM_N: AtomDir = 0;
export const ATOM_E: AtomDir = 1;
export const ATOM_S: AtomDir = 2;
export const ATOM_W: AtomDir = 3;

export type AtomOffset = readonly [dr: number, dc: number, dir: AtomDir];

export interface ShapeDef {
  kind: ShapeKind;
  label: string;
  width: number;
  height: number;
  atoms: readonly AtomOffset[];
  family: 'square' | 'triangle' | 'diamond';
  size: 1 | 2;
}

export const SHAPE_KINDS = [
  'sq1',
  'sq2',
  'tri-nw',
  'tri-ne',
  'tri-se',
  'tri-sw',
  'tri2-nw',
  'tri2-ne',
  'tri2-se',
  'tri2-sw',
  'dia1',
  'dia2',
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

const full = (r: number, c: number): AtomOffset[] => [
  [r, c, ATOM_N],
  [r, c, ATOM_E],
  [r, c, ATOM_S],
  [r, c, ATOM_W],
];

const half = (r: number, c: number, a: AtomDir, b: AtomDir): AtomOffset[] => [
  [r, c, a],
  [r, c, b],
];

function def(kind: ShapeKind, label: string, width: number, height: number, family: ShapeDef['family'], size: 1 | 2, atoms: AtomOffset[]): ShapeDef {
  return { kind, label, width, height, family, size, atoms };
}

export const SHAPES: Record<ShapeKind, ShapeDef> = {
  sq1: def('sq1', 'Square', 1, 1, 'square', 1, full(0, 0)),
  sq2: def('sq2', 'Large square', 2, 2, 'square', 2, [...full(0, 0), ...full(0, 1), ...full(1, 0), ...full(1, 1)]),
  'tri-nw': def('tri-nw', 'Triangle', 1, 1, 'triangle', 1, half(0, 0, ATOM_N, ATOM_W)),
  'tri-ne': def('tri-ne', 'Triangle', 1, 1, 'triangle', 1, half(0, 0, ATOM_N, ATOM_E)),
  'tri-se': def('tri-se', 'Triangle', 1, 1, 'triangle', 1, half(0, 0, ATOM_S, ATOM_E)),
  'tri-sw': def('tri-sw', 'Triangle', 1, 1, 'triangle', 1, half(0, 0, ATOM_S, ATOM_W)),
  'tri2-nw': def('tri2-nw', 'Large triangle', 2, 2, 'triangle', 2, [...full(0, 0), ...half(0, 1, ATOM_N, ATOM_W), ...half(1, 0, ATOM_N, ATOM_W)]),
  'tri2-ne': def('tri2-ne', 'Large triangle', 2, 2, 'triangle', 2, [...full(0, 1), ...half(0, 0, ATOM_N, ATOM_E), ...half(1, 1, ATOM_N, ATOM_E)]),
  'tri2-se': def('tri2-se', 'Large triangle', 2, 2, 'triangle', 2, [...full(1, 1), ...half(0, 1, ATOM_S, ATOM_E), ...half(1, 0, ATOM_S, ATOM_E)]),
  'tri2-sw': def('tri2-sw', 'Large triangle', 2, 2, 'triangle', 2, [...full(1, 0), ...half(0, 0, ATOM_S, ATOM_W), ...half(1, 1, ATOM_S, ATOM_W)]),
  dia1: def('dia1', 'Diamond', 2, 2, 'diamond', 1, [
    ...half(0, 0, ATOM_E, ATOM_S),
    ...half(0, 1, ATOM_S, ATOM_W),
    ...half(1, 0, ATOM_N, ATOM_E),
    ...half(1, 1, ATOM_N, ATOM_W),
  ]),
  dia2: def('dia2', 'Large diamond', 4, 4, 'diamond', 2, [
    ...full(1, 1),
    ...full(1, 2),
    ...full(2, 1),
    ...full(2, 2),
    ...half(0, 1, ATOM_E, ATOM_S),
    ...half(1, 0, ATOM_E, ATOM_S),
    ...half(0, 2, ATOM_S, ATOM_W),
    ...half(1, 3, ATOM_S, ATOM_W),
    ...half(2, 3, ATOM_N, ATOM_W),
    ...half(3, 2, ATOM_N, ATOM_W),
    ...half(3, 1, ATOM_N, ATOM_E),
    ...half(2, 0, ATOM_N, ATOM_E),
  ]),
};

export function isShapeKind(value: unknown): value is ShapeKind {
  return typeof value === 'string' && (SHAPE_KINDS as readonly string[]).includes(value);
}

export function atomIndex(size: number, r: number, c: number, dir: AtomDir): number {
  return (r * size + c) * 4 + dir;
}

export function atomFromIndex(size: number, index: number): { r: number; c: number; dir: AtomDir } {
  const cell = Math.floor(index / 4);
  return { r: Math.floor(cell / size), c: cell % size, dir: (index % 4) as AtomDir };
}

export function atomPolygon(r: number, c: number, dir: AtomDir): [number, number][] {
  const cx = c + 0.5;
  const cy = r + 0.5;
  switch (dir) {
    case ATOM_N:
      return [[c, r], [c + 1, r], [cx, cy]];
    case ATOM_E:
      return [[c + 1, r], [c + 1, r + 1], [cx, cy]];
    case ATOM_S:
      return [[c + 1, r + 1], [c, r + 1], [cx, cy]];
    default:
      return [[c, r + 1], [c, r], [cx, cy]];
  }
}

export function shapeOutline(kind: ShapeKind): [number, number][] {
  const s = SHAPES[kind];
  switch (s.family) {
    case 'square':
      return [[0, 0], [s.width, 0], [s.width, s.height], [0, s.height]];
    case 'diamond': {
      const h = s.width / 2;
      return [[h, 0], [s.width, h], [h, s.height], [0, h]];
    }
    case 'triangle': {
      const w = s.width;
      const corner = kind.slice(-2);
      switch (corner) {
        case 'nw':
          return [[0, 0], [w, 0], [0, w]];
        case 'ne':
          return [[0, 0], [w, 0], [w, w]];
        case 'se':
          return [[w, 0], [w, w], [0, w]];
        default:
          return [[0, 0], [w, w], [0, w]];
      }
    }
  }
}
