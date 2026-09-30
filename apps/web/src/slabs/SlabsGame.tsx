import { useEffect, useRef, useState } from 'react';
import {
  SLAB_DC,
  SLAB_DR,
  applySlabsHint,
  emptySlabsState,
  isSlabsSolved,
  slabCells,
  slabNeighbour,
  slabsHint,
  slabsOccupancy,
  slabsPivotCell,
  slabsPlace,
  slabsRotate,
  slabsToTray,
  validSlabsState,
  type SlabsSpec,
  type SlabsState,
} from '@puzzle-hustle/core';
import { useHistory } from '../lib/useHistory.ts';
import { useFlash } from '../lib/useFlash.ts';
import { ResetButton } from '../components/ResetButton.tsx';
import { AdBadge, ToolButton } from '../components/ToolButton.tsx';
import * as haptics from '../lib/haptics.ts';
import { showMistakes } from '../lib/mistakes.ts';
import { SlabShape, SlabsBoard, SlabsTray, trayCentres, type SlabsPending as Pending } from './SlabsBoard.tsx';

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
  // The pose the slab will drop in.
  dir: number;
  moved: boolean;
  // Grabbed in its pending pose, which the drag keeps instead of springing back.
  fromPending: boolean;
}

interface Ghost {
  slab: number;
  pivot: 0 | 1;
  dir: number;
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

const REVERT_MS = 900;

const TURN_MS = 150;

// Where the other half points, seen from the pivot.
function otherDir(dir: number, pivot: 0 | 1): number {
  return pivot === 0 ? dir : (dir + 2) % 4;
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function SlabsGame({ spec, onMove, onSolved, onHintUsed, requestHint, hintAd, locked, initialState, onStateChange }: SlabsGameProps) {
  const { cols, rows } = spec.config;
  const [state, setState] = useState<SlabsState>(() => validSlabsState(spec, initialState));
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [pending, setPendingView] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const revertTimer = useRef(0);
  const [flash, setFlash] = useFlash<number[]>();
  const [hintBusy, setHintBusy] = useState(false);
  const stateRef = useRef(state);
  const drag = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const history = useHistory<SlabsState>();
  const mistakes = useRef(showMistakes()).current;
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

  useEffect(() => () => clearTimeout(revertTimer.current), []);

  function setPending(p: Pending | null) {
    clearTimeout(revertTimer.current);
    pendingRef.current = p;
    setPendingView(p);
  }

  function commit(next: SlabsState) {
    setPending(null);
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

  // Turn `degrees` back from the drawn pose, around the pivot half's cell.
  function spin(slab: number, pivot: 0 | 1, degrees: number) {
    if (reducedMotion()) return;
    const cell = slabsPivotCell(spec, stateRef.current, slab, pivot);
    setTurn({ slab, px: (cell % cols) + 0.5, py: Math.floor(cell / cols) + 0.5, from: degrees, start: performance.now(), angle: degrees });
  }

  // A tap turns a quarter clockwise. A pose that fits is taken at once; one that does not is only
  // drawn, and the next tap turns on from there.
  function tapTurn(slab: number, pivot: 0 | 1) {
    const cur = stateRef.current;
    const committed = otherDir(cur[slab * 2 + 1]!, pivot);
    const p = pendingRef.current;
    const from = p && p.slab === slab && p.pivot === pivot ? p.od : committed;
    const od = (from + 1) % 4;
    const turns = (od - committed + 4) % 4;
    setPending(null);
    spin(slab, pivot, -90);
    if (turns === 0) return;
    const next = slabsRotate(spec, cur, slab, pivot, turns);
    if (next) {
      history.remember(cur);
      commit(next);
      return;
    }
    setPending({ slab, pivot, od });
    revertTimer.current = window.setTimeout(revertPending, REVERT_MS);
  }

  function revertPending() {
    const p = pendingRef.current;
    if (!p) return;
    setPending(null);
    const committed = otherDir(stateRef.current[p.slab * 2 + 1]!, p.pivot);
    let delta = (((p.od - committed) * 90) % 360 + 540) % 360 - 180;
    if (delta === -180) delta = 180;
    spin(p.slab, p.pivot, delta);
  }

  function beginDrag(e: React.PointerEvent, slab: number, pivot: 0 | 1, from: 'board' | 'tray', grabX: number, grabY: number) {
    if (locked || solved || drag.current) return;
    e.preventDefault();
    const p = pendingRef.current;
    const fromPending = !!p && p.slab === slab && from === 'board';
    if (p && !fromPending) setPending(null);
    // Holding a pending slab stops it springing back, so it can be picked up in its turned pose.
    if (fromPending) clearTimeout(revertTimer.current);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const t0 = performance.now();
    drag.current = {
      pointerId: e.pointerId,
      slab,
      pivot,
      from,
      x0: e.clientX,
      y0: e.clientY,
      t0,
      grabX,
      grabY,
      cell: cellPx(),
      dir: fromPending ? (p!.pivot === 0 ? p!.od : (p!.od + 2) % 4) : stateRef.current[slab * 2 + 1]!,
      moved: false,
      fromPending,
    };
  }

  function boardDown(e: React.PointerEvent<SVGSVGElement>) {
    const cell = cellAt(e.clientX, e.clientY);
    if (cell < 0) return;
    // A pending slab is drawn over whatever lies under its turned half, so it takes the touch first.
    const p = pendingRef.current;
    const pendPivot = p ? slabsPivotCell(spec, stateRef.current, p.slab, p.pivot) : -1;
    let slab: number;
    let pivot: 0 | 1;
    if (p && cell === pendPivot) {
      slab = p.slab;
      pivot = p.pivot;
    } else if (p && cell === slabNeighbour(cols, rows, pendPivot, p.od)) {
      slab = p.slab;
      pivot = p.pivot === 0 ? 1 : 0;
    } else {
      slab = slabsOccupancy(spec, stateRef.current)[cell]!;
      if (slab < 0) return;
      pivot = slabsPivotCell(spec, stateRef.current, slab, 0) === cell ? 0 : 1;
    }
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
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < d.cell * 0.2) return;
    d.moved = true;
    setGhost({ slab: d.slab, pivot: d.pivot, dir: d.dir, x: e.clientX, y: e.clientY, grabX: d.grabX, grabY: d.grabY, cell: d.cell });
  }

  // The pose a drop at (x, y) would give: the pivot half on the cell under the finger.
  function dropPose(d: { pivot: 0 | 1; dir: number; grabX: number; grabY: number }, x: number, y: number): { anchor: number; dir: number } | null {
    const cell = cellAt(x - d.grabX, y - d.grabY);
    if (cell < 0) return null;
    const dir = d.dir;
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
    // Only a finger that never left its spot turns the slab; any real movement moves it.
    const still = !d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < d.cell * 0.2;
    if (still) {
      if (d.from === 'tray') {
        const next = slabsRotate(spec, cur, d.slab, d.pivot)!;
        history.remember(cur);
        commit(next);
        return;
      }
      tapTurn(d.slab, d.fromPending ? pendingRef.current!.pivot : d.pivot);
      return;
    }
    setPending(null);
    // Blocked cells are not drawn, so a release there counts as off the board too.
    const under = cellAt(e.clientX, e.clientY);
    if (overTray(e.clientX, e.clientY) || under < 0 || spec.blocked[under]) {
      if (d.from === 'tray') return;
      const next = slabsToTray(cur, d.slab);
      next[d.slab * 2 + 1] = d.dir;
      history.remember(cur);
      commit(next);
      return;
    }
    const pose = dropPose(d, e.clientX, e.clientY);
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
    if (d.fromPending) revertPending();
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
    if (where) setFlash([...where]);
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

  let preview: [number, number] | null = null;
  if (ghost) {
    const pose = dropPose(ghost, ghost.x, ghost.y);
    preview = pose && slabCells(spec, pose.anchor, pose.dir);
  }

  let ghostView: React.ReactNode = null;
  if (ghost) {
    const dir = ghost.dir;
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
        <g transform={turn?.slab === ghost.slab ? `rotate(${turn.angle} ${turn.px} ${turn.py})` : undefined}>
          <SlabShape x0={x0} y0={y0} x1={x1} y1={y1} a={spec.slabs[ghost.slab]![0]} b={spec.slabs[ghost.slab]![1]} />
        </g>
      </svg>
    );
  }

  return (
    <div className="slabs-wrap" style={{ '--cols': cols, '--rows': rows } as React.CSSProperties}>
      <SlabsBoard
        ref={svgRef}
        spec={spec}
        state={state}
        mistakes={mistakes}
        held={ghost?.slab ?? null}
        pending={pending}
        turn={turn}
        preview={preview}
        flash={flash}
        role="application"
        aria-label="Slabs board"
        onPointerDown={boardDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      />

      {!solved && (
        <SlabsTray
          ref={trayRef}
          spec={spec}
          state={state}
          held={ghost?.slab ?? null}
          slotProps={(s) => ({
            onPointerDown: state[s * 2]! >= 0 || locked ? undefined : (e) => trayDown(e, s),
            onPointerMove: pointerMove,
            onPointerUp: pointerUp,
            onPointerCancel: pointerCancel,
          })}
        />
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
