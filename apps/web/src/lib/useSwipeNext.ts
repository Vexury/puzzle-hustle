import { useEffect } from 'react';
import { EDGE, MIN_DX, claimed } from './useTabSwipe.ts';

// On a solved puzzle a swipe to the left goes on to the next one, like the pill at the bottom of
// the result card. The board takes no input once solved, so nothing else wants the gesture.
export function useSwipeNext(onNext: (() => void) | null) {
  useEffect(() => {
    if (!onNext) return;
    let start: { x: number; y: number; target: EventTarget | null } | null = null;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]!;
      start = e.touches.length === 1 && t.clientX > EDGE && t.clientX < innerWidth - EDGE ? { x: t.clientX, y: t.clientY, target: e.target } : null;
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length > 1) start = null;
    };
    const onEnd = (e: TouchEvent) => {
      const s = start;
      start = null;
      const t = e.changedTouches[0];
      if (!s || !t) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (dx > -MIN_DX || Math.abs(dy) * 2 > Math.abs(dx) || claimed(s.target, dx)) return;
      onNext();
    };
    const onCancel = () => (start = null);
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onCancel);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
    };
  }, [onNext]);
}
