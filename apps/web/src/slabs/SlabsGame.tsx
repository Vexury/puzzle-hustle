import { useEffect, useRef, useState } from 'react';
import {
  SLAB_DC,
  SLAB_DR,
  applySlabsHint,
  classifySlabsGesture,
  emptySlabsState,
  isSlabsSolved,
  slabCells,
  slabNeighbour,
  slabsHint,
  slabsOccupancy,
  slabsOrient,
  slabsPivotCell,
  slabsPlace,
  slabsRegionStatus,
  slabsRegions,
  slabsRotate,
  slabsToTray,
  validSlabsState,
  type SlabsRule,
  type SlabsSpec,
  type SlabsState,
} from '@puzzle-hustle/core';
import { useHistory } from '../lib/useHistory.ts';
import { ResetButton } from '../components/ResetButton.tsx';
import { AdBadge, ToolButton } from '../components/ToolButton.tsx';
import * as haptics from '../lib/haptics.ts';
import './slabs.css';

export interface SlabsGameProps {
  spec: SlabsSpec;
  onMove(): void;
  onSolved(): void;
  onHintUsed(): void;
  requestHint(): Promise<boolean>;
  hintAd?: boolean;
  locked: boolean;
  initialState?: number[] | undefined;
  onStateChange?(state: number[]): void;
}

interface Drag {
  pointerId: number;
  slab: number;
  pivot: 0 | 1;
  from: 'board' | 'tray';
  x0: number;
  y0: number;
  t0: number;
  // Pointer minus the pivot half's centre, in pixels, so the half stays under the finger.
  grabX: number;
  grabY: number;
  cell: number;
}

interface Ghost {
  slab: number;
  pivot: 0 | 1;
  x: number;
  y: number;
  grabX: number;
  grabY: number;
  cell: number;
}

interface Turn {
  slab: number;
  px: number;
  py: number;
  from: number;
  start: number;
  // Degrees still to turn; eased from `from` to 0 frame by frame.
  angle: number;
}

const TURN_MS = 150;
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

// Where the other half points, seen from the pivot.
function otherDir(dir: number, pivot: 0 | 1): number {
  return pivot === 0 ? dir : (dir + 2) % 4;
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// One slab in cell units, first half centred on (x0, y0), second on (x1, y1).
function SlabShape({ x0, y0, x1, y1, a, b, className }: { x0: number; y0: number; x1: number; y1: number; a: number; b: number; className?: string | undefined }) {
  const inset = 0.07;
  const left = Math.min(x0, x1) - 0.5 + inset;
  const top = Math.min(y0, y1) - 0.5 + inset;
  const horizontal = y0 === y1;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  return (
    <g className={className ? `slab ${className}` : 'slab'}>
      <rect className="slab-body" x={left} y={top} width={Math.abs(x1 - x0) + 1 - 2 * inset} height={Math.abs(y1 - y0) + 1 - 2 * inset} rx={0.16} />
      {horizontal ? (
        <line className="slab-divider" x1={mx} y1={y0 - 0.32} x2={mx} y2={y0 + 0.32} />
      ) : (
        <line className="slab-divider" x1={x0 - 0.32} y1={my} x2={x0 + 0.32} y2={my} />
      )}
      {PIPS[a]!.map(([dx, dy], i) => (
        <circle key={`a${i}`} className="slab-pip" cx={x0 + dx * 0.22} cy={y0 + dy * 0.22} r={0.075} />
      ))}
      {PIPS[b]!.map(([dx, dy], i) => (
        <circle key={`b${i}`} className="slab-pip" cx={x1 + dx * 0.22} cy={y1 + dy * 0.22} r={0.075} />
      ))}
    </g>
  );
}

// Tray slots are 2x2 units; a slab lies centred in its current orientation.
function trayCentres(dir: number): [number, number, number, number] {
  const dx = SLAB_DC[dir as 0]! * 0.5;
  const dy = SLAB_DR[dir as 0]! * 0.5;
  return [1 - dx, 1 - dy, 1 + dx, 1 + dy];
}

export function SlabsGame({ spec, onMove, onSolved, onHintUsed, requestHint, hintAd, locked, initialState, onStateChange }: SlabsGameProps) {
  const { cols, rows } = spec.config;
  const [state, setState] = useState<SlabsState>(() => validSlabsState(spec, initialState));
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [shake, setShake] = useState<number | null>(null);
  const [flash, setFlash] = useState<number[] | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const stateRef = useRef(state);
  const drag = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const history = useHistory<SlabsState>();
  const solved = isSlabsSolved(spec, state);

  useEffect(() => {
    if (solved) onSolved();
  }, [solved, onSolved]);

  useEffect(() => {
    if (!turn) return;
    let raf = 0;
    const tick = () => {
      const t = (performance.now() - turn.start) / TURN_MS;
      if (t >= 1) {
        setTurn(null);
        return;
      }
      const angle = turn.from * (1 - t) ** 3;
      setTurn((cur) => (cur && cur.start === turn.start ? { ...cur, angle } : cur));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [turn?.start]);

  function commit(next: SlabsState) {
    stateRef.current = next;
    setState(next);
    onMove();
    onStateChange?.([...next]);
  }

  function cellPx(): number {
    const rect = svgRef.current?.getBoundingClientRect();
    return rect ? rect.width / cols : 40;
  }

  function cellAt(x: number, y: number): number {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return -1;
    const c = Math.floor(((x - rect.left) / rect.width) * cols);
    const r = Math.floor(((y - rect.top) / rect.height) * rows);
    if (r < 0 || c < 0 || r >= rows || c >= cols) return -1;
    return r * cols + c;
  }

  function overTray(x: number, y: number): boolean {
    const rect = trayRef.current?.getBoundingClientRect();
    return !!rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function flashShake(slab: number) {
    setShake(slab);
    setTimeout(() => setShake((s) => (s === slab ? null : s)), 320);
  }

  // Animate the new pose from the old one, turning around the pivot half.
  function animateTurn(slab: number, pivot: 0 | 1, before: SlabsState, after: SlabsState) {
    if (before[slab * 2]! < 0 || after[slab * 2]! < 0 || reducedMotion()) return;
    const cell = slabsPivotCell(spec, after, slab, pivot);
    const oldAngle = otherDir(before[slab * 2 + 1]!, pivot) * 90;
    const newAngle = otherDir(after[slab * 2 + 1]!, pivot) * 90;
    let delta = (((oldAngle - newAngle) % 360) + 540) % 360 - 180;
    if (delta === -180) delta = 180;
    setTurn({ slab, px: (cell % cols) + 0.5, py: Math.floor(cell / cols) + 0.5, from: delta, start: performance.now(), angle: delta });
  }

  function beginDrag(e: React.PointerEvent, slab: number, pivot: 0 | 1, from: 'board' | 'tray', grabX: number, grabY: number) {
    if (locked || solved || drag.current) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { pointerId: e.pointerId, slab, pivot, from, x0: e.clientX, y0: e.clientY, t0: performance.now(), grabX, grabY, cell: cellPx() };
  }

  function boardDown(e: React.PointerEvent<SVGSVGElement>) {
    const cell = cellAt(e.clientX, e.clientY);
    if (cell < 0) return;
    const slab = slabsOccupancy(spec, stateRef.current)[cell]!;
    if (slab < 0) return;
    const pivot = slabsPivotCell(spec, stateRef.current, slab, 0) === cell ? 0 : 1;
    const rect = svgRef.current!.getBoundingClientRect();
    const size = rect.width / cols;
    const cx = rect.left + ((cell % cols) + 0.5) * size;
    const cy = rect.top + (Math.floor(cell / cols) + 0.5) * size;
    beginDrag(e, slab, pivot, 'board', e.clientX - cx, e.clientY - cy);
  }

  function trayDown(e: React.PointerEvent<HTMLDivElement>, slab: number) {
    const rect = e.currentTarget.getBoundingClientRect();
    const [ax, ay, bx, by] = trayCentres(stateRef.current[slab * 2 + 1]!);
    const lx = ((e.clientX - rect.left) / rect.width) * 2;
    const ly = ((e.clientY - rect.top) / rect.height) * 2;
    const pivot = Math.hypot(lx - ax, ly - ay) <= Math.hypot(lx - bx, ly - by) ? 0 : 1;
    beginDrag(e, slab, pivot, 'tray', 0, 0);
  }

  function pointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < d.cell * 0.2) return;
    setGhost({ slab: d.slab, pivot: d.pivot, x: e.clientX, y: e.clientY, grabX: d.grabX, grabY: d.grabY, cell: d.cell });
  }

  // The pose a drop at (x, y) would give: the pivot half on the cell under the finger.
  function dropPose(d: { slab: number; pivot: 0 | 1; grabX: number; grabY: number }, x: number, y: number, current: SlabsState): { anchor: number; dir: number } | null {
    const cell = cellAt(x - d.grabX, y - d.grabY);
    if (cell < 0) return null;
    const dir = current[d.slab * 2 + 1]!;
    if (d.pivot === 0) return { anchor: cell, dir };
    const anchor = slabNeighbour(cols, rows, cell, (dir + 2) % 4);
    return anchor < 0 ? null : { anchor, dir };
  }

  function pointerUp(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    setGhost(null);
    const cur = stateRef.current;
    const gesture = classifySlabsGesture(e.clientX - d.x0, e.clientY - d.y0, performance.now() - d.t0, d.cell);
    if (gesture.kind === 'tap' || gesture.kind === 'flick') {
      if (gesture.kind === 'flick' && otherDir(cur[d.slab * 2 + 1]!, d.pivot) === gesture.dir) return;
      const next = gesture.kind === 'tap' ? slabsRotate(spec, cur, d.slab, d.pivot) : slabsOrient(spec, cur, d.slab, d.pivot, gesture.dir);
      if (!next) {
        flashShake(d.slab);
        return;
      }
      history.remember(cur);
      animateTurn(d.slab, d.pivot, cur, next);
      commit(next);
      return;
    }
    if (overTray(e.clientX, e.clientY)) {
      if (d.from === 'tray') return;
      history.remember(cur);
      commit(slabsToTray(cur, d.slab));
      return;
    }
    const pose = dropPose(d, e.clientX, e.clientY, cur);
    const next = pose && slabsPlace(spec, cur, d.slab, pose.anchor, pose.dir);
    if (!next) return;
    history.remember(cur);
    commit(next);
    haptics.tap();
  }

  function pointerCancel(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    setGhost(null);
  }

  async function useHint() {
    if (hintBusy || locked || solved) return;
    if (!slabsHint(spec, stateRef.current)) return;
    setHintBusy(true);
    const ok = await requestHint();
    setHintBusy(false);
    if (!ok) return;
    const fresh = slabsHint(spec, stateRef.current);
    if (!fresh) return;
    const before = stateRef.current;
    const where =
      fresh.kind === 'remove'
        ? slabCells(spec, before[fresh.slab * 2]!, before[fresh.slab * 2 + 1]!)
        : slabCells(spec, spec.solution[fresh.slab]!.anchor, spec.solution[fresh.slab]!.dir);
    onHintUsed();
    history.remember(before);
    commit(applySlabsHint(spec, before, fresh));
    setFlash(where ? [...where] : null);
    setTimeout(() => setFlash(null), 3000);
  }

  function reset() {
    if (locked || solved) return;
    if (stateRef.current.every((v, i) => (i % 2 ? true : v === -1))) return;
    history.remember(stateRef.current);
    commit(emptySlabsState(spec));
  }

  function undo() {
    if (locked || solved) return;
    const prev = history.undo(stateRef.current);
    if (prev) commit(prev);
  }

  function redo() {
    if (locked || solved) return;
    const next = history.redo(stateRef.current);
    if (next) commit(next);
  }

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
        className={flash?.includes(i) ? 'slabs-cell flash' : 'slabs-cell'}
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
    if (state[s * 2]! < 0 || ghost?.slab === s) continue;
    const pair = slabCells(spec, state[s * 2]!, state[s * 2 + 1]!);
    if (!pair) continue;
    const [x0, y0] = center(pair[0]);
    const [x1, y1] = center(pair[1]);
    const transform = turn?.slab === s ? `rotate(${turn.angle} ${turn.px} ${turn.py})` : undefined;
    pieces.push(
      <g key={s} transform={transform}>
        <SlabShape x0={x0} y0={y0} x1={x1} y1={y1} a={spec.slabs[s]![0]} b={spec.slabs[s]![1]} className={shake === s ? 'shake' : undefined} />
      </g>,
    );
  }

  const badges = regions.map((regionCells, reg) => {
    const first = Math.min(...regionCells);
    const r = Math.floor(first / cols);
    const c = first % cols;
    const label = ruleLabel(spec.rules[reg]!);
    const w = 0.2 + label.length * 0.17;
    return (
      <g key={reg} className={`slabs-badge ${status[reg]}`}>
        <rect x={c + 0.04} y={r + 0.04} width={w} height={0.34} rx={0.12} />
        <text x={c + 0.04 + w / 2} y={r + 0.215}>
          {label}
        </text>
      </g>
    );
  });

  let preview: React.ReactNode = null;
  if (ghost) {
    const pose = dropPose(ghost, ghost.x, ghost.y, state);
    const pair = pose && slabCells(spec, pose.anchor, pose.dir);
    if (pair) {
      const [x0, y0] = center(pair[0]);
      const [x1, y1] = center(pair[1]);
      preview = <rect className="slabs-preview" x={Math.min(x0, x1) - 0.46} y={Math.min(y0, y1) - 0.46} width={Math.abs(x1 - x0) + 0.92} height={Math.abs(y1 - y0) + 0.92} rx={0.16} />;
    }
  }

  let ghostView: React.ReactNode = null;
  if (ghost) {
    const dir = state[ghost.slab * 2 + 1]!;
    const pivot = ghost.pivot;
    // The pivot half sits at the pointer; the other half extends in its direction.
    const od = otherDir(dir, pivot);
    const px = 1.5;
    const py = 1.5;
    const ox = px + SLAB_DC[od as 0]!;
    const oy = py + SLAB_DR[od as 0]!;
    const [x0, y0, x1, y1] = pivot === 0 ? [px, py, ox, oy] : [ox, oy, px, py];
    ghostView = (
      <svg
        className="slabs-ghost"
        viewBox="0 0 3 3"
        style={{ left: ghost.x - ghost.grabX - 1.5 * ghost.cell, top: ghost.y - ghost.grabY - 1.5 * ghost.cell, width: 3 * ghost.cell, height: 3 * ghost.cell }}
        aria-hidden="true"
      >
        <SlabShape x0={x0} y0={y0} x1={x1} y1={y1} a={spec.slabs[ghost.slab]![0]} b={spec.slabs[ghost.slab]![1]} />
      </svg>
    );
  }

  return (
    <div className="slabs-wrap" style={{ '--cols': cols, '--rows': rows } as React.CSSProperties}>
      <div className={solved ? 'slabs-board board-frame solved' : 'slabs-board board-frame'}>
        <svg
          ref={svgRef}
          className="slabs-svg"
          viewBox={`0 0 ${cols} ${rows}`}
          role="application"
          aria-label="Slabs board"
          onPointerDown={boardDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerCancel}
          onContextMenu={(e) => e.preventDefault()}
        >
          <g>{cells}</g>
          <g>{lines}</g>
          {preview}
          <g>{pieces}</g>
          <g>{badges}</g>
        </svg>
      </div>

      {!solved && (
        <div ref={trayRef} className="slabs-tray" aria-label="Slabs to place">
          {spec.slabs.map(([a, b], s) => {
            const placed = state[s * 2]! >= 0;
            const [x0, y0, x1, y1] = trayCentres(state[s * 2 + 1]!);
            return (
              <div
                key={s}
                className={placed || ghost?.slab === s ? 'slabs-slot empty' : shake === s ? 'slabs-slot shake' : 'slabs-slot'}
                onPointerDown={placed || locked ? undefined : (e) => trayDown(e, s)}
                onPointerMove={pointerMove}
                onPointerUp={pointerUp}
                onPointerCancel={pointerCancel}
              >
                <svg viewBox="0 0 2 2" aria-hidden="true">
                  <SlabShape x0={x0} y0={y0} x1={x1} y1={y1} a={a} b={b} />
                </svg>
              </div>
            );
          })}
        </div>
      )}

      {ghostView}

      {!solved && (
        <div className="tools">
          <ResetButton onReset={reset} disabled={locked} />
          <ToolButton icon="undo" label="Undo" onClick={undo} disabled={locked || !history.canUndo} />
          <ToolButton icon="redo" label="Redo" onClick={redo} disabled={locked || !history.canRedo(state)} />
          <ToolButton icon="hint" label="Hint" onClick={useHint} disabled={locked || hintBusy} badge={hintAd ? <AdBadge /> : null} />
        </div>
      )}
    </div>
  );
}
