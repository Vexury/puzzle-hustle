import { useEffect, useRef, useState } from 'react';
import {
  SHAPES,
  atomFromIndex,
  atomPolygon,
  coverage,
  fitsBoard,
  hint as computeHint,
  isSolved,
  litMask,
  type Placement,
  type ShapesSpec,
  type ShapesState,
} from '@puzzle-hustle/core';
import { outlinePoints } from './PieceShape.tsx';

interface Drag {
  pieceId: number;
  offsetR: number;
  offsetC: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
}

export interface ShapesGameProps {
  spec: ShapesSpec;
  onMove(): void;
  onSolved(): void;
  onHintUsed(): void;
  requestHint(): Promise<boolean>;
  locked: boolean;
  initialState?: number[] | undefined;
  onStateChange?(state: number[]): void;
}

export function ShapesGame({ spec, onMove, onSolved, onHintUsed, requestHint, locked, initialState, onStateChange }: ShapesGameProps) {
  const size = spec.config.size;
  const [state, setState] = useState<ShapesState>(() =>
    initialState && initialState.length === spec.pieces.length * 2
      ? spec.pieces.map((_, i) => ({ r: initialState[i * 2]!, c: initialState[i * 2 + 1]! }))
      : [...spec.start],
  );
  const [order, setOrder] = useState<number[]>(() => spec.pieces.map((_, i) => i));
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const boardRef = useRef<SVGSVGElement>(null);
  const solved = isSolved(spec, state);

  useEffect(() => {
    if (solved) onSolved();
  }, [solved, onSolved]);

  const lit = litMask(coverage(size, spec.pieces, state));
  const m = spec.config.margin;
  const inner = spec.config.inner;

  function boardCell(x: number, y: number): { r: number; c: number } | null {
    const el = boardRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const cell = rect.width / size;
    return { r: (y - rect.top) / cell, c: (x - rect.left) / cell };
  }

  function clampPlacement(pieceId: number, r: number, c: number): Placement {
    const s = SHAPES[spec.pieces[pieceId]!.kind];
    return { r: Math.min(Math.max(r, 0), size - s.height), c: Math.min(Math.max(c, 0), size - s.width) };
  }

  function dropTarget(d: Drag): Placement {
    const pos = boardCell(d.x, d.y);
    const cur = state[d.pieceId]!;
    if (!pos) return cur;
    const p = clampPlacement(d.pieceId, Math.round(pos.r - d.offsetR), Math.round(pos.c - d.offsetC));
    return fitsBoard(size, spec.pieces[d.pieceId]!.kind, p) ? p : cur;
  }

  function raise(pieceId: number) {
    setOrder((o) => [...o.filter((i) => i !== pieceId), pieceId]);
  }

  function place(pieceId: number, placement: Placement) {
    const cur = state[pieceId]!;
    if (cur.r === placement.r && cur.c === placement.c) return;
    const next = [...state];
    next[pieceId] = placement;
    setState(next);
    onMove();
    onStateChange?.(next.flatMap((p) => [p.r, p.c]));
  }

  function startDrag(e: React.PointerEvent, pieceId: number) {
    if (locked || solved) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const pos = boardCell(e.clientX, e.clientY);
    const p = state[pieceId]!;
    raise(pieceId);
    setDrag({
      pieceId,
      offsetR: pos ? pos.r - p.r : 0,
      offsetC: pos ? pos.c - p.c : 0,
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
    if (Math.hypot(d.x - d.startX, d.y - d.startY) < 4) {
      setSelected((cur) => (cur === d.pieceId ? null : d.pieceId));
      return;
    }
    setSelected(null);
    place(d.pieceId, dropTarget(d));
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
    setTimeout(() => setFlash(null), 1800);
  }

  function reset() {
    if (locked || solved) return;
    setState([...spec.start]);
    setSelected(null);
    onMove();
    onStateChange?.(spec.start.flatMap((p) => [p.r, p.c]));
  }

  const preview = drag ? dropTarget(drag) : null;

  return (
    <div className="shapes-wrap">
      <div className="shapes">
        <div className="board-panel">
          <svg
            ref={boardRef}
            className={solved ? 'board solved' : 'board'}
            viewBox={`0 0 ${size} ${size}`}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={() => setDrag(null)}
            onClick={tapBoard as unknown as React.MouseEventHandler<SVGSVGElement>}
            role="application"
            aria-label="Shapes board"
          >
            <rect className="inner-area" x={m} y={m} width={inner} height={inner} />
            {[...lit].map((v, i) => {
              const { r, c, dir } = atomFromIndex(size, i);
              const cls = v ? 'atom lit' : spec.target[i] ? 'atom ghost' : 'atom';
              return <polygon key={i} className={cls} points={atomPolygon(r, c, dir).map((p) => p.join(',')).join(' ')} />;
            })}
            {Array.from({ length: size + 1 }, (_, i) => (
              <g key={i}>
                <line className="grid-line" x1={0} y1={i} x2={size} y2={i} />
                <line className="grid-line" x1={i} y1={0} x2={i} y2={size} />
              </g>
            ))}
            <rect className="inner-frame" x={m} y={m} width={inner} height={inner} />
            {order.map((i) => {
              const piece = spec.pieces[i]!;
              const p = drag?.pieceId === i && preview ? preview : state[i]!;
              const dragging = drag?.pieceId === i;
              const cls = ['piece-outline', dragging ? 'dragging' : '', selected === i ? 'selected' : ''].join(' ');
              return (
                <g key={piece.id}>
                  <polygon className={cls} points={outlinePoints(piece.kind, p.r, p.c)} />
                  {flash === i && <polygon className="hint-flash" points={outlinePoints(piece.kind, p.r, p.c)} />}
                  {!solved && (
                    <polygon
                      className="piece-hit"
                      points={outlinePoints(piece.kind, p.r, p.c)}
                      onPointerDown={(e) => startDrag(e, i)}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={() => setDrag(null)}
                      aria-label={SHAPES[piece.kind].label}
                    />
                  )}
                </g>
              );
            })}
          </svg>

          <div className="actions">
            <button type="button" className="btn" onClick={useHint} disabled={solved || locked || hintBusy}>
              Hint
            </button>
            <button type="button" className="btn" onClick={reset} disabled={solved || locked}>
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
