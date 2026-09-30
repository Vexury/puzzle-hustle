import { useEffect, type RefObject } from 'react';
import { href, navigate } from './router.ts';

const MIN_DX = 60;
// Android and iOS keep the screen edges for their own back gestures.
const EDGE = 24;

// Something that owns the horizontal drag itself: text fields, the how-to demo, and any strip
// that can still scroll sideways in the direction of the swipe.
function claimed(target: EventTarget | null, dx: number): boolean {
  for (let el = target instanceof Element ? target : null; el; el = el.parentElement) {
    if (el.matches('input, textarea, select, .demo, [data-no-swipe]')) return true;
    if (el.scrollWidth > el.clientWidth && ['auto', 'scroll'].includes(getComputedStyle(el).overflowX)) {
      if (dx < 0 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 0) return true;
    }
  }
  return false;
}

// A horizontal swipe on the page moves one tab along the bar: to the left shows the next tab,
// to the right the previous one. Touch only, a mouse drag selects text as before.
// `current` is the index of the open tab in `paths`, -1 where swiping does nothing.
export function useTabSwipe(ref: RefObject<HTMLElement | null>, paths: readonly string[], current: number) {
  useEffect(() => {
    const el = ref.current;
    if (!el || current < 0) return;
    let start: { x: number; y: number; target: EventTarget | null } | null = null;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]!;
      start = e.touches.length === 1 && t.clientX > EDGE && t.clientX < innerWidth - EDGE ? { x: t.clientX, y: t.clientY, target: e.target } : null;
    };
    const onEnd = (e: TouchEvent) => {
      const s = start;
      start = null;
      const t = e.changedTouches[0];
      if (!s || !t) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < MIN_DX || Math.abs(dy) * 2 > Math.abs(dx) || claimed(s.target, dx)) return;
      const next = paths[current + (dx < 0 ? 1 : -1)];
      if (next) navigate(href(next));
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length > 1) start = null;
    };
    const onCancel = () => (start = null);
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onCancel);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
    };
  }, [ref, paths, current]);
}
