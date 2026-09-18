import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { readSetting, writeSetting } from './storage.ts';

const MIN_CELL = 12;
const MAX_CELL = 64;

interface Pinch {
  ids: [number, number];
  startDist: number;
  startCell: number;
  lastX: number;
  lastY: number;
}

interface SavedView {
  cell: number;
  x: number;
  y: number;
}

export interface ZoomViewport {
  viewport: React.RefObject<HTMLDivElement | null>;
  cellPx: number;
  pointerDown(e: React.PointerEvent<HTMLElement>): boolean;
  pointerMove(e: React.PointerEvent<HTMLElement>): boolean;
  pointerUp(e: React.PointerEvent<HTMLElement>): boolean;
  pointerCancel(e: React.PointerEvent<HTMLElement>): void;
}

export function useZoomViewport(cols: number, reserve: number, viewKey: string | undefined): ZoomViewport {
  const viewport = useRef<HTMLDivElement>(null);
  const [cellPx, setCellPx] = useState(24);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<Pinch | null>(null);
  const pendingZoom = useRef<{ from: number; to: number; x: number; y: number } | null>(null);
  const restore = useRef<SavedView | null>(null);
  const storageKey = viewKey ? `ph:view:${viewKey}` : null;

  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const saved = storageKey ? parseView(readSetting(storageKey)) : null;
    if (saved) {
      restore.current = saved;
      setCellPx(saved.cell);
      return;
    }
    const fit = Math.floor(((el.parentElement?.clientWidth ?? el.clientWidth) - reserve) / cols);
    setCellPx(Math.max(Math.min(fit, 44), 24));
  }, [cols, reserve, storageKey]);

  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const r = restore.current;
    if (r) {
      if (r.cell !== cellPx) return;
      restore.current = null;
      el.scrollLeft = r.x;
      el.scrollTop = r.y;
      return;
    }
    const z = pendingZoom.current;
    if (!z) return;
    pendingZoom.current = null;
    const k = z.to / z.from;
    el.scrollLeft = (el.scrollLeft + z.x) * k - z.x;
    el.scrollTop = (el.scrollTop + z.y) * k - z.y;
  }, [cellPx]);

  const saveTimer = useRef(0);
  const save = () => {
    const el = viewport.current;
    if (!el || !storageKey || restore.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => writeSetting(storageKey, JSON.stringify({ cell: cellPx, x: el.scrollLeft, y: el.scrollTop })), 200);
  };

  useEffect(() => {
    if (restore.current) return;
    save();
  }, [cellPx]);

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomTo(cellPx * (e.deltaY < 0 ? 1.1 : 0.9), e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('scroll', save, { passive: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('scroll', save);
    };
  });

  function zoomTo(next: number, x: number, y: number) {
    const to = Math.round(Math.min(Math.max(next, MIN_CELL), MAX_CELL));
    if (to === cellPx) return;
    pendingZoom.current = { from: cellPx, to, x, y };
    setCellPx(to);
  }

  function pointerDown(e: React.PointerEvent<HTMLElement>): boolean {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.entries()] as [[number, { x: number; y: number }], [number, { x: number; y: number }]];
      pinch.current = {
        ids: [a[0], b[0]],
        startDist: Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y),
        startCell: cellPx,
        lastX: (a[1].x + b[1].x) / 2,
        lastY: (a[1].y + b[1].y) / 2,
      };
      return true;
    }
    return pointers.current.size > 1;
  }

  function pointerMove(e: React.PointerEvent<HTMLElement>): boolean {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pinch.current;
    const el = viewport.current;
    if (!p || !el) return false;
    const a = pointers.current.get(p.ids[0]);
    const b = pointers.current.get(p.ids[1]);
    if (!a || !b) return true;
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    el.scrollLeft -= cx - p.lastX;
    el.scrollTop -= cy - p.lastY;
    p.lastX = cx;
    p.lastY = cy;
    const rect = el.getBoundingClientRect();
    zoomTo(p.startCell * (Math.hypot(a.x - b.x, a.y - b.y) / p.startDist), cx - rect.left, cy - rect.top);
    return true;
  }

  function pointerUp(e: React.PointerEvent<HTMLElement>): boolean {
    pointers.current.delete(e.pointerId);
    if (!pinch.current) return false;
    if (pointers.current.size < 2) pinch.current = null;
    return true;
  }

  function pointerCancel(e: React.PointerEvent<HTMLElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  return { viewport, cellPx, pointerDown, pointerMove, pointerUp, pointerCancel };
}

function parseView(raw: string | null): SavedView | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<SavedView>;
    if (typeof v.cell !== 'number' || typeof v.x !== 'number' || typeof v.y !== 'number') return null;
    return { cell: Math.min(Math.max(v.cell, MIN_CELL), MAX_CELL), x: v.x, y: v.y };
  } catch {
    return null;
  }
}
