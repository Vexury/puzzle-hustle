import { SLAB_DC, SLAB_DR, isSlabsSolved, slabCells, slabNeighbour, slabsPivotCell, slabsRegionStatus, slabsRegions, type SlabsRule, type SlabsSpec, type SlabsState } from '@puzzle-hustle/core';
import { HintMark } from '../components/HintMark.tsx';
import './slabs.css';

const PIPS: Record<number, [number, number][]> = {
  0: [],
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
};

function ruleLabel(rule: SlabsRule): string {
  if (rule.kind === 'sum') return String(rule.target);
  if (rule.kind === 'lt') return `<${rule.target}`;
  if (rule.kind === 'gt') return `>${rule.target}`;
  return rule.kind === 'eq' ? '=' : '≠';
}

// One slab in cell units, first half centred on (x0, y0), second on (x1, y1). Placed on the board it is
// see-through and drops its divider, so the region colours and dashed boundaries under it stay visible.
export function SlabShape({ x0, y0, x1, y1, a, b, placed, className }: { x0: number; y0: number; x1: number; y1: number; a: number; b: number; placed?: boolean; className?: string | undefined }) {
  const inset = 0.07;
  const left = Math.min(x0, x1) - 0.5 + inset;
  const top = Math.min(y0, y1) - 0.5 + inset;
  const horizontal = y0 === y1;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  // The pip patterns are drawn for a slab lying left to right and turn with it.
  const ux = x1 - x0;
  const uy = y1 - y0;
  return (
    <g className={[className ? `slab ${className}` : 'slab', placed ? 'placed' : ''].join(' ').trim()}>
      <rect className="slab-body" x={left} y={top} width={Math.abs(x1 - x0) + 1 - 2 * inset} height={Math.abs(y1 - y0) + 1 - 2 * inset} rx={0.16} />
      {placed ? null : horizontal ? (
        <line className="slab-divider" x1={mx} y1={y0 - 0.32} x2={mx} y2={y0 + 0.32} />
      ) : (
        <line className="slab-divider" x1={x0 - 0.32} y1={my} x2={x0 + 0.32} y2={my} />
      )}
      {PIPS[a]!.map(([dx, dy], i) => (
        <circle key={`a${i}`} className="slab-pip" cx={x0 + (dx * ux - dy * uy) * 0.22} cy={y0 + (dx * uy + dy * ux) * 0.22} r={0.075} />
      ))}
      {PIPS[b]!.map(([dx, dy], i) => (
        <circle key={`b${i}`} className="slab-pip" cx={x1 + (dx * ux - dy * uy) * 0.22} cy={y1 + (dx * uy + dy * ux) * 0.22} r={0.075} />
      ))}
    </g>
  );
}

// Tray slots are 2x2 units; a slab lies centred in its current orientation.
export function trayCentres(dir: number): [number, number, number, number] {
  const dx = SLAB_DC[dir as 0]! * 0.5;
  const dy = SLAB_DR[dir as 0]! * 0.5;
  return [1 - dx, 1 - dy, 1 + dx, 1 + dy];
}

export interface SlabsTurn {
  slab: number;
  px: number;
  py: number;
  angle: number;
}

// A slab turned into a pose that does not fit yet; `od` is where the other half points, seen
// from the pivot half.
// A tap may turn a slab into a pose that does not fit, so it can be turned on over the rim to one
// that does. It stays drawn there, and springs back if no further tap follows within REVERT_MS.
export interface SlabsPending {
  slab: number;
  pivot: 0 | 1;
  // Where the other half points, seen from the pivot half.
  od: number;
}

export interface SlabsBoardProps extends Omit<React.SVGAttributes<SVGSVGElement>, 'className' | 'viewBox'> {
  ref?: React.Ref<SVGSVGElement>;
  spec: SlabsSpec;
  state: SlabsState;
  mistakes: boolean;
  // The slab in hand, left out of the board.
  held?: number | null;
  pending?: SlabsPending | null;
  turn?: SlabsTurn | null;
  preview?: readonly [number, number] | null;
  flash?: readonly number[] | null;
  highlight?: readonly number[] | undefined;
}

export function SlabsBoard({ spec, state, mistakes, held = null, pending = null, turn = null, preview = null, flash = null, highlight, children, ...rest }: SlabsBoardProps) {
  const { cols, rows } = spec.config;
  const solved = isSlabsSolved(spec, state);
  const regions = slabsRegions(spec);
  const status = slabsRegionStatus(spec, state);
  const center = (cell: number): [number, number] => [(cell % cols) + 0.5, Math.floor(cell / cols) + 0.5];
  const free = (cell: number) => cell >= 0 && !spec.blocked[cell];

  const cells: React.ReactNode[] = [];
  const lines: React.ReactNode[] = [];
  for (let i = 0; i < cols * rows; i++) {
    if (spec.blocked[i]) continue;
    const r = Math.floor(i / cols);
    const c = i % cols;
    const reg = spec.regionOf[i]!;
    cells.push(
      <rect
        key={i}
        className="slabs-cell"
        x={c}
        y={r}
        width={1}
        height={1}
        style={reg >= 0 ? { fill: `var(--region-${reg % 12})` } : undefined}
      />,
    );
    // Each edge once: east and south, plus the north and west rim of the playable area.
    for (const dir of [0, 1, 2, 3]) {
      const n = slabNeighbour(cols, rows, i, dir);
      if ((dir === 2 || dir === 3) && free(n)) continue;
      const [x1, y1, x2, y2] =
        dir === 0 ? [c + 1, r, c + 1, r + 1] : dir === 1 ? [c, r + 1, c + 1, r + 1] : dir === 2 ? [c, r, c, r + 1] : [c, r, c + 1, r];
      const rim = !free(n);
      const boundary = !rim && spec.regionOf[n] !== reg && (reg >= 0 || spec.regionOf[n]! >= 0);
      lines.push(<line key={`${i}-${dir}`} className={rim ? 'slabs-rim' : boundary ? 'slabs-boundary' : 'slabs-grid'} x1={x1} y1={y1} x2={x2} y2={y2} />);
    }
  }

  const pieces: React.ReactNode[] = [];
  for (let s = 0; s < spec.slabs.length; s++) {
    if (state[s * 2]! < 0 || held === s) continue;
    const pair = slabCells(spec, state[s * 2]!, state[s * 2 + 1]!);
    if (!pair) continue;
    let [x0, y0] = center(pair[0]);
    let [x1, y1] = center(pair[1]);
    const pend = pending?.slab === s ? pending : null;
    if (pend) {
      // Drawn in its pending pose, which may hang over the rim or onto another slab.
      const [px, py] = center(slabsPivotCell(spec, state, s, pend.pivot));
      const ox = px + SLAB_DC[pend.od as 0]!;
      const oy = py + SLAB_DR[pend.od as 0]!;
      [x0, y0, x1, y1] = pend.pivot === 0 ? [px, py, ox, oy] : [ox, oy, px, py];
    }
    const transform = turn?.slab === s ? `rotate(${turn.angle} ${turn.px} ${turn.py})` : undefined;
    pieces.push(
      <g key={s} transform={transform}>
        <SlabShape x0={x0} y0={y0} x1={x1} y1={y1} a={spec.slabs[s]![0]} b={spec.slabs[s]![1]} placed className={pend ? 'pending' : undefined} />
      </g>,
    );
  }

  const badges = regions.map((regionCells, reg) => {
    const first = Math.min(...regionCells);
    const r = Math.floor(first / cols);
    const c = first % cols;
    const label = ruleLabel(spec.rules[reg]!);
    const w = 0.18 + label.length * 0.155;
    // The badge rides on the cell's top edge and reaches only 0.15 into any cell; pips keep 0.2
    // clear of every edge, so no badge ever covers a pip.
    return (
      <g key={reg} className={`slabs-badge ${status[reg] === 'broken' && !mistakes ? '' : status[reg]}`}>
        <rect x={c + 0.06} y={r - 0.15} width={w} height={0.3} rx={0.1} />
        <text x={c + 0.06 + w / 2} y={r} dy="0.33em">
          {label}
        </text>
      </g>
    );
  });

  let hintMark: React.ReactNode = null;
  if (flash) {
    const xs = flash.map((cell) => cell % cols);
    const ys = flash.map((cell) => Math.floor(cell / cols));
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    hintMark = <HintMark x={x} y={y} w={Math.max(...xs) - x + 1} h={Math.max(...ys) - y + 1} rx={0.16} />;
  }

  let previewRect: React.ReactNode = null;
  if (preview) {
    const [x0, y0] = center(preview[0]);
    const [x1, y1] = center(preview[1]);
    previewRect = <rect className="slabs-preview" x={Math.min(x0, x1) - 0.46} y={Math.min(y0, y1) - 0.46} width={Math.abs(x1 - x0) + 0.92} height={Math.abs(y1 - y0) + 0.92} rx={0.16} />;
  }

  return (
    <div className={solved ? 'slabs-board solved' : 'slabs-board'}>
      <svg className="slabs-svg" viewBox={`0 0 ${cols} ${rows}`} {...rest}>
        <g>{cells}</g>
        <g>{lines}</g>
        {previewRect}
        <g>{pieces}</g>
        {hintMark}
        {highlight?.map((cell) => (
          <rect key={`hl${cell}`} className="slabs-hl" x={(cell % cols) + 0.05} y={Math.floor(cell / cols) + 0.05} width={0.9} height={0.9} rx={0.14} />
        ))}
        <g>{badges}</g>
        {children}
      </svg>
    </div>
  );
}

export interface SlabsTrayProps {
  ref?: React.Ref<HTMLDivElement>;
  spec: SlabsSpec;
  state: SlabsState;
  held?: number | null;
  slotProps?(slab: number, away: boolean): React.HTMLAttributes<HTMLDivElement> & { 'data-demo'?: number };
}

export function SlabsTray({ ref, spec, state, held = null, slotProps }: SlabsTrayProps) {
  return (
    <div ref={ref} className="slabs-tray" aria-label="Slabs to place">
      {spec.slabs.map(([a, b], s) => {
        const away = state[s * 2]! >= 0 || held === s;
        const [x0, y0, x1, y1] = trayCentres(state[s * 2 + 1]!);
        return (
          <div key={s} className={away ? 'slabs-slot empty' : 'slabs-slot'} {...slotProps?.(s, away)}>
            <svg viewBox="0 0 2 2" aria-hidden="true">
              <SlabShape x0={x0} y0={y0} x1={x1} y1={y1} a={a} b={b} />
            </svg>
          </div>
        );
      })}
    </div>
  );
}
