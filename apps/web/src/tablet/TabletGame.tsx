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
  type TabletSpec,
  type TabletState,
} from '@puzzle-hustle/core';
import { PieceShape, outlinePoints } from './PieceShape.tsx';
import { TargetView } from './TargetView.tsx';

interface Drag {
  pieceId: number;
  offsetR: number;
  offsetC: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  origin: 'tray' | 'board';
}

export interface TabletGameProps {
  spec: TabletSpec;
  onMove(): void;
  onSolved(): void;
  onHintUsed(): void;
  requestHint(): Promise<boolean>;
  locked: boolean;
}

export function TabletGame({ spec, onMove, onSolved, onHintUsed, requestHint, locked }: TabletGameProps) {
  const size = spec.config.size;
  const [state, setState] = useState<TabletState>(() => spec.pieces.map(() => null));
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const boardRef = useRef<SVGSVGElement>(null);
  const solved = isSolved(spec, state);

  useEffect(() => {
    setState(spec.pieces.map(() => null));
    setSelected(null);
    setDrag(null);
  }, [spec]);

  useEffect(() => {
    if (solved) onSolved();
  }, [solved, onSolved]);

  const lit = litMask(coverage(size, spec.pieces, state));

  function boardCell(x: number, y: number): { r: number; c: number } | null {
    const el = boardRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const cell = rect.width / size;
    return { r: (y - rect.top) / cell, c: (x - rect.left) / cell };
  }

  function dropTarget(d: Drag): Placement | null {
    const pos = boardCell(d.x, d.y);
    if (!pos) return null;
    const kind = spec.pieces[d.pieceId]!.kind;
    const s = SHAPES[kind];
    const r = Math.round(pos.r - d.offsetR);
    const c = Math.round(pos.c - d.offsetC);
    const inside = pos.r >= -0.5 && pos.c >= -0.5 && pos.r <= size + 0.5 && pos.c <= size + 0.5;
    if (!inside) return null;
    const clamped = { r: Math.min(Math.max(r, 0), size - s.height), c: Math.min(Math.max(c, 0), size - s.width) };
    return fitsBoard(size, kind, clamped) ? clamped : null;
  }

  function place(pieceId: number, placement: Placement | null) {
    const cur = state[pieceId] ?? null;
    if (cur?.r === placement?.r && cur?.c === placement?.c) return;
    const next = [...state];
    next[pieceId] = placement;
    setState(next);
    onMove();
  }

  function startDrag(e: React.PointerEvent, pieceId: number, origin: Drag['origin']) {
    if (locked || solved) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const s = SHAPES[spec.pieces[pieceId]!.kind];
    let offsetR = s.height / 2;
    let offsetC = s.width / 2;
    if (origin === 'board') {
      const pos = boardCell(e.clientX, e.clientY);
      const p = state[pieceId];
      if (pos && p) {
        offsetR = pos.r - p.r;
        offsetC = pos.c - p.c;
      }
    }
    setSelected(null);
    setDrag({ pieceId, offsetR, offsetC, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, origin });
  }

  function moveDrag(e: React.PointerEvent) {
    if (!drag) return;
    setDrag({ ...drag, x: e.clientX, y: e.clientY });
  }

  function endDrag(e: React.PointerEvent) {
    if (!drag) return;
    const d = { ...drag, x: e.clientX, y: e.clientY };
    const moved = Math.hypot(d.x - d.startX, d.y - d.startY);
    setDrag(null);
    if (d.origin === 'tray' && moved < 4) {
      setSelected((cur) => (cur === d.pieceId ? null : d.pieceId));
      return;
    }
    place(d.pieceId, dropTarget(d));
  }

  function tapBoard(e: React.PointerEvent<SVGSVGElement>) {
    if (selected === null || locked || solved) return;
    const pos = boardCell(e.clientX, e.clientY);
    if (!pos) return;
    const kind = spec.pieces[selected]!.kind;
    const s = SHAPES[kind];
    const r = Math.min(Math.max(Math.round(pos.r - s.height / 2), 0), size - s.height);
    const c = Math.min(Math.max(Math.round(pos.c - s.width / 2), 0), size - s.width);
    place(selected, { r, c });
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
    setFlash(h.pieceId);
    setTimeout(() => setFlash(null), 1800);
  }

  function reset() {
    if (locked || solved) return;
    setState(spec.pieces.map(() => null));
    setSelected(null);
    onMove();
  }

  const preview = drag ? dropTarget(drag) : null;
  const dragKind = drag ? spec.pieces[drag.pieceId]!.kind : null;
  const cellPx = boardRef.current ? boardRef.current.getBoundingClientRect().width / size : 48;

  return (
    <div className="tablet-wrap">
      <div className="tablet">
        <div className="target-panel">
          <h3>Prophecy</h3>
          <TargetView size={size} target={spec.target} />
        </div>
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
            aria-label="Tablet board"
          >
            {[...lit].map((v, i) => {
              const { r, c, dir } = atomFromIndex(size, i);
              return <polygon key={i} className={v ? 'atom lit' : 'atom'} points={atomPolygon(r, c, dir).map((p) => p.join(',')).join(' ')} />;
            })}
            {Array.from({ length: size + 1 }, (_, i) => (
              <g key={i}>
                <line className="grid-line" x1={0} y1={i} x2={size} y2={i} />
                <line className="grid-line" x1={i} y1={0} x2={i} y2={size} />
              </g>
            ))}
            {spec.pieces.map((piece, i) => {
              const p = state[i];
              if (!p) return null;
              const dragging = drag?.pieceId === i;
              return (
                <g key={piece.id}>
                  <polygon className={dragging ? 'piece-outline dragging' : 'piece-outline'} points={outlinePoints(piece.kind, p.r, p.c)} />
                  {flash === i && <polygon className="hint-flash" points={outlinePoints(piece.kind, p.r, p.c)} />}
                  {!dragging && !solved && (
                    <polygon
                      className="piece-hit"
                      points={outlinePoints(piece.kind, p.r, p.c)}
                      onPointerDown={(e) => startDrag(e, i, 'board')}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                    />
                  )}
                </g>
              );
            })}
            {drag && dragKind && (
              <polygon
                className={preview ? 'drop-preview' : 'drop-preview invalid'}
                points={preview ? outlinePoints(dragKind, preview.r, preview.c) : ''}
              />
            )}
          </svg>

          <div className="tray" aria-label="Fragments">
            {spec.pieces.map((piece, i) =>
              state[i] ? null : (
                <button
                  type="button"
                  key={piece.id}
                  className={[
                    'tray-piece',
                    selected === i ? 'selected' : '',
                    drag?.pieceId === i ? 'hidden' : '',
                  ].join(' ')}
                  onPointerDown={(e) => startDrag(e, i, 'tray')}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={() => setDrag(null)}
                  aria-label={SHAPES[piece.kind].label}
                  aria-pressed={selected === i}
                >
                  <PieceShape kind={piece.kind} />
                </button>
              ),
            )}
            {state.every((p) => p !== null) && !solved && <span className="tray-empty">All fragments placed. Something is off.</span>}
            {solved && <span className="tray-empty">Prophecy fulfilled.</span>}
          </div>

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

      {drag && dragKind && (
        <svg
          className="ghost"
          style={{
            left: drag.x - drag.offsetC * cellPx,
            top: drag.y - drag.offsetR * cellPx,
            width: SHAPES[dragKind].width * cellPx,
            height: SHAPES[dragKind].height * cellPx,
          }}
          viewBox={`0 0 ${SHAPES[dragKind].width} ${SHAPES[dragKind].height}`}
        >
          <polygon points={outlinePoints(dragKind)} />
        </svg>
      )}
    </div>
  );
}
