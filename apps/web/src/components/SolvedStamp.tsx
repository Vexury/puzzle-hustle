import { useLayoutEffect, useRef, useState } from 'react';

// How long the stamp stays before it is gone; its CSS animation fades it out by then.
export const STAMP_MS = 2400;

// "Solved" laid big over a freshly solved board, a slot every pack restyles (packs/README.md).
// It sits in the page, so it scrolls with the board, and leaves the board free again after a
// moment: the green frame and the Solved pill say it for good.
export function SolvedStamp({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const play = el?.closest('.play');
    const board = play?.querySelector('.board-frame, .slabs-board');
    if (!el || !play || !board) return;
    const p = play.getBoundingClientRect();
    const b = board.getBoundingClientRect();
    setAt({ left: b.left - p.left + b.width / 2, top: b.top - p.top + b.height / 2 });
  }, []);

  useLayoutEffect(() => {
    const timer = setTimeout(onDone, STAMP_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div ref={ref} className="solved-stamp" style={at ?? { visibility: 'hidden' }} role="status">
      <span>Solved</span>
    </div>
  );
}
