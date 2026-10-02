import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';

export interface CarouselPage {
  key: string;
  label: string;
  color: string;
}

// How far a drag must travel before it turns the page, and how far it must move at all before
// it counts as a drag rather than a tap.
const TURN_PX = 50;
const SLOP_PX = 8;

// One card per puzzle side by side, the neighbours peeking in at the edges; a horizontal drag
// turns the page, the dots jump (2026-10-02, replaces the pill rows). Only the open card and its
// neighbours render their content, so opening Social fetches three boards, not eleven.
export function StandingsCarousel({
  pages,
  index,
  onIndex,
  render,
}: {
  pages: readonly CarouselPage[];
  index: number;
  onIndex: (index: number) => void;
  render: (page: CarouselPage) => ReactNode;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; id: number; horizontal: boolean | null } | null>(null);
  const go = (i: number) => onIndex(Math.max(0, Math.min(pages.length - 1, i)));

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, horizontal: null };
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (s.horizontal === null) {
      if (Math.abs(dx) < SLOP_PX && Math.abs(dy) < SLOP_PX) return;
      s.horizontal = Math.abs(dx) > Math.abs(dy);
      if (s.horizontal) e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (!s.horizontal) return;
    const atEdge = (dx > 0 && index === 0) || (dx < 0 && index === pages.length - 1);
    setDrag(atEdge ? dx / 3 : dx);
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    start.current = null;
    setDrag(null);
    if (!s?.horizontal || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    if (dx <= -TURN_PX) go(index + 1);
    else if (dx >= TURN_PX) go(index - 1);
  };

  const track = { '--i': index, '--drag': `${drag ?? 0}px` } as CSSProperties;
  return (
    <>
      <div className="standings-dots" role="tablist" aria-label="Puzzles">
        {pages.map((page, i) => (
          <button
            key={page.key}
            type="button"
            role="tab"
            className={i === index ? 'standings-dot on' : 'standings-dot'}
            style={{ '--dot-c': page.color } as CSSProperties}
            aria-label={page.label}
            aria-selected={i === index}
            onClick={() => go(i)}
          />
        ))}
      </div>
      <div className="standings-viewport" data-no-swipe onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className={drag === null ? 'standings-track' : 'standings-track dragging'} style={track}>
          {pages.map((page, i) => (
            <section key={page.key} className="standings-card" aria-label={page.label} inert={i !== index}>
              {Math.abs(i - index) <= 1 ? render(page) : <div className="standings-head"><b>{page.label}</b></div>}
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
