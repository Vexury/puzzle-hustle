import { useEffect, useRef, useState } from 'react';
import {
  SHAPES,
  atomFromIndex,
  atomPolygon,
  coverage,
  hint as computeHint,
  isSolved,
  litMask,
  type Placement,
  type ShapesSpec,
  type ShapesState,
} from '@puzzle-hustle/core';
import { outlinePoints } from './PieceShape.tsx';
import { useHistory } from '../lib/useHistory.ts';
import { useFlash } from '../lib/useFlash.ts';
import { ResetButton } from '../components/ResetButton.tsx';
import { AdBadge, ToolButton } from '../components/ToolButton.tsx';

interface Drag {
  pieceId: number;
  from: 'board' | 'tray';
  // Pointer minus the piece's top-left corner, in cells.
  offsetR: number;
  offsetC: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
}

// Stored as r, c per piece; -1, -1 is a piece in the tray. Anything not fully inside the target
// area also goes to the tray, which covers boards saved while the ring around it was parking space.
function readState(spec: ShapesSpec, saved: number[] | undefined): ShapesState {
  const { margin: m, inner } = spec.config;
  return spec.pieces.map((piece, i) => {
    if (!saved || saved.length !== spec.pieces.length * 2) return null;
    const r = saved[i * 2]!;
    const c = saved[i * 2 + 1]!;
    const s = SHAPES[piece.kind];
    return r >= m && c >= m && r + s.height <= m + inner && c + s.width <= m + inner ? { r, c } : null;
  });
}

function encode(state: ShapesState): number[] {
  return state.flatMap((p) => (p ? [p.r, p.c] : [-1, -1]));
}

function moved(d: Drag): boolean {
  return Math.hypot(d.x - d.startX, d.y - d.startY) >= 4;
}

export interface ShapesGameProps {
  spec: ShapesSpec;
  onMove(): void;
  onSolved(): void;
  onHintUsed(): void;
  requestHint(): Promise<boolean>;
  hintAd?: boolean;
  locked: boolean;
  initialState?: number[] | undefined;
  onStateChange?(state: number[]): void;
  viewKey?: string | undefined;
}

export function ShapesGame({ spec, onMove, onSolved, onHintUsed, requestHint, hintAd, locked, initialState, onStateChange }: ShapesGameProps) {
  const size = spec.config.size;
  const [state, setState] = useState<ShapesState>(() => readState(spec, initialState));
  const [order, setOrder] = useState<number[]>(() => spec.pieces.map((_, i) => i));
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [flash, setFlash] = useFlash<number>();
  const [hintBusy, setHintBusy] = useState(false);
  const history = useHistory<ShapesState>();
  const boardRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const solved = isSolved(spec, state);

  useEffect(() => {
    if (solved) onSolved();
  }, [solved, onSolved]);

  const lit = litMask(coverage(size, spec.pieces, state));
  const m = spec.config.margin;
  const inner = spec.config.inner;

  function cellPx(): number {
    const rect = boardRef.current?.getBoundingClientRect();
    return rect ? rect.width / inner : 40;
  }

  // Board coordinates under the pointer, or null when it is not over the board.
  function boardCell(x: number, y: number): { r: number; c: number } | null {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
    const cell = rect.width / inner;
    return { r: m + (y - rect.top) / cell, c: m + (x - rect.left) / cell };
  }

  function clampPlacement(pieceId: number, r: number, c: number): Placement {
    const s = SHAPES[spec.pieces[pieceId]!.kind];
    return { r: Math.min(Math.max(r, m), m + inner - s.height), c: Math.min(Math.max(c, m), m + inner - s.width) };
  }

  // Where a release would put the piece; null is off the board, which means the tray.
  function dropTarget(d: Drag): Placement | null {
    const pos = boardCell(d.x, d.y);
    if (!pos) return null;
    return clampPlacement(d.pieceId, Math.round(pos.r - d.offsetR), Math.round(pos.c - d.offsetC));
  }

  function raise(pieceId: number) {
    setOrder((o) => [...o.filter((i) => i !== pieceId), pieceId]);
  }

  function place(pieceId: number, placement: Placement | null) {
    const cur = state[pieceId]!;
    if (cur === placement || (cur && placement && cur.r === placement.r && cur.c === placement.c)) return;
    const next = [...state];
    next[pieceId] = placement;
    history.remember(state);
    setState(next);
    onMove();
    onStateChange?.(encode(next));
  }

  function startDrag(e: React.PointerEvent, pieceId: number, from: 'board' | 'tray') {
    if (locked || solved) return;
    e.preventDefault();
    e.stopPropagation();
    // Captured on the wrapper, not the piece: raise() moves the piece's node, which would drop a
    // capture held there, and a piece from the tray has to reach the board.
    wrapRef.current?.setPointerCapture?.(e.pointerId);
    const s = SHAPES[spec.pieces[pieceId]!.kind];
    const pos = boardCell(e.clientX, e.clientY);
    const p = state[pieceId];
    raise(pieceId);
    setDrag({
      pieceId,
      from,
      // From the tray the piece hangs centred under the finger.
      offsetR: from === 'board' && pos && p ? pos.r - p.r : s.height / 2,
      offsetC: from === 'board' && pos && p ? pos.c - p.c : s.width / 2,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
    });
  }

  function moveDrag(e: React.PointerEvent) {
    if (!drag) return;
    setDrag({ ...drag, x: e.clientX, y: e.clientY });
  }

  function endDrag(e: React.PointerEvent) {
    if (!drag) return;
    const d = { ...drag, x: e.clientX, y: e.clientY };
    setDrag(null);
    if (!moved(d)) {
      setSelected((cur) => (cur === d.pieceId ? null : d.pieceId));
      return;
    }
    setSelected(null);
    const target = dropTarget(d);
    if (target || d.from === 'board') place(d.pieceId, target);
  }

  function tapBoard(e: React.PointerEvent<SVGSVGElement>) {
    if (selected === null || locked || solved) return;
    const pos = boardCell(e.clientX, e.clientY);
    if (!pos) return;
    const s = SHAPES[spec.pieces[selected]!.kind];
    place(selected, clampPlacement(selected, Math.round(pos.r - s.height / 2), Math.round(pos.c - s.width / 2)));
    raise(selected);
    setSelected(null);
  }

  async function useHint() {
    if (hintBusy || locked || solved) return;
    const h = computeHint(spec, state);
    if (!h) return;
    setHintBusy(true);
    const ok = await requestHint();
    setHintBusy(false);
    if (!ok) return;
    onHintUsed();
    place(h.pieceId, h.placement);
    raise(h.pieceId);
    setFlash(h.pieceId);
  }

  function reset() {
    if (locked || solved) return;
    const next = spec.pieces.map(() => null);
    history.remember(state);
    setState(next);
    setSelected(null);
    onMove();
    onStateChange?.(encode(next));
  }

  function undo() {
    if (locked || solved) return;
    const prev = history.undo(state);
    if (!prev) return;
    setState(prev);
    setSelected(null);
    onMove();
    onStateChange?.(encode(prev));
  }

  function redo() {
    if (locked || solved) return;
    const next = history.redo(state);
    if (!next) return;
    setState(next);
    setSelected(null);
    onMove();
    onStateChange?.(encode(next));
  }

  const dragging = drag && moved(drag) ? drag : null;
  const preview = dragging ? dropTarget(dragging) : null;
  let ghost: React.ReactNode = null;
  if (dragging && !preview) {
    const kind = spec.pieces[dragging.pieceId]!.kind;
    const s = SHAPES[kind];
    const cell = cellPx();
    ghost = (
      <svg
        className="shapes-ghost"
        viewBox={`0 0 ${s.width} ${s.height}`}
        style={{ left: dragging.x - dragging.offsetC * cell, top: dragging.y - dragging.offsetR * cell, width: s.width * cell, height: s.height * cell }}
        aria-hidden="true"
      >
        <polygon className="tray-piece" points={outlinePoints(kind)} />
      </svg>
    );
  }

  return (
    <div className="shapes-wrap" style={{ '--inner': inner } as React.CSSProperties}>
      <div
        ref={wrapRef}
        className="shapes"
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={() => setDrag(null)}
        onLostPointerCapture={() => setDrag(null)}
      >
        <div className="board-panel">
          <svg
            ref={boardRef}
            className={solved ? 'board board-frame solved' : 'board board-frame'}
            viewBox={`${m} ${m} ${inner} ${inner}`}
            onPointerUp={(e) => {
              if (!drag) tapBoard(e);
            }}
            role="application"
            aria-label="Shapes board"
          >
            <rect className="inner-area" x={m} y={m} width={inner} height={inner} />
            {[...lit].map((v, i) => {
              if (v && spec.target[i]) return null;
              const { r, c, dir } = atomFromIndex(size, i);
              const cls = v ? 'atom lit' : spec.target[i] ? 'atom ghost' : 'atom';
              return <polygon key={i} className={cls} points={atomPolygon(r, c, dir).map((p) => p.join(',')).join(' ')} />;
            })}
            <g className="match-pulse">
              {[...lit].map((v, i) => {
                if (!v || !spec.target[i]) return null;
                const { r, c, dir } = atomFromIndex(size, i);
                return <polygon key={i} className="atom lit match" points={atomPolygon(r, c, dir).map((p) => p.join(',')).join(' ')} />;
              })}
            </g>
            {Array.from({ length: inner + 1 }, (_, i) => (
              <g key={i}>
                <line className="grid-line" x1={m} y1={m + i} x2={m + inner} y2={m + i} />
                <line className="grid-line" x1={m + i} y1={m} x2={m + i} y2={m + inner} />
              </g>
            ))}
            {order.map((i) => {
              const piece = spec.pieces[i]!;
              const held = dragging?.pieceId === i;
              const p = held ? preview : state[i];
              if (!p) return null;
              const cls = ['piece-outline', held ? 'dragging' : '', selected === i ? 'selected' : ''].join(' ');
              return (
                <g key={piece.id}>
                  <polygon className={cls} points={outlinePoints(piece.kind, p.r, p.c)} />
                  {flash === i && <polygon className="hint-flash" points={outlinePoints(piece.kind, p.r, p.c)} />}
                  {!solved && (
                    <polygon
                      className="piece-hit"
                      points={outlinePoints(piece.kind, p.r, p.c)}
                      onPointerDown={(e) => startDrag(e, i, 'board')}
                      aria-label={SHAPES[piece.kind].label}
                    />
                  )}
                </g>
              );
            })}
          </svg>

          {!solved && (
            <div className="shapes-tray" aria-label="Shapes to place">
              {spec.pieces.map((piece, i) => {
                const s = SHAPES[piece.kind];
                const away = !!state[i] || dragging?.pieceId === i;
                const cls = ['shapes-slot', away ? 'empty' : '', selected === i && !state[i] ? 'selected' : ''].join(' ');
                return (
                  <div
                    key={piece.id}
                    className={cls}
                    style={{ '--w': s.width, '--h': s.height } as React.CSSProperties}
                    onPointerDown={away || locked ? undefined : (e) => startDrag(e, i, 'tray')}
                    aria-label={s.label}
                  >
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
          )}

          {ghost}

          {!solved && (
            <div className="tools">
              <ResetButton onReset={reset} disabled={locked} />
              <ToolButton icon="undo" label="Undo" onClick={undo} disabled={locked || !history.canUndo} />
              <ToolButton icon="redo" label="Redo" onClick={redo} disabled={locked || !history.canRedo(state)} />
              <ToolButton icon="hint" label="Hint" onClick={useHint} disabled={locked || hintBusy} badge={hintAd ? <AdBadge /> : null} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
