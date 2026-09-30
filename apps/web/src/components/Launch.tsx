import { useEffect, useRef, useState } from 'react';
import { press } from '../lib/haptics.ts';
import { launchDone, launchMode } from '../lib/launch.ts';
import { LOGO_PATH } from '../lib/logo.ts';

// Size and colour of the piece on the native splash (SPLASH_PIECE and FG in scripts/mark.mjs):
// the web launch starts exactly where the splash ends.
const PIECE = 96;
const FG = '#FFA833';
const SNAP_MS = 340;
const IMPACT = 0.72;
const FLY_MS = 420;
const RISE_MS = 560;

export function Launch() {
  const [mode, setMode] = useState(launchMode);
  const logo = useRef<SVGSVGElement>(null);
  const veil = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode === 'none') return;
    const root = document.documentElement;
    const anims: Animation[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const stop = () => {
      anims.forEach((a) => a.cancel());
      timers.forEach(clearTimeout);
      root.classList.remove('launch-in', 'launch-flying');
      document.removeEventListener('pointerdown', finish, true);
    };
    // A tap anywhere ends it at once; the page underneath is live the whole time.
    const finish = () => {
      stop();
      launchDone();
      setMode('none');
    };
    document.addEventListener('pointerdown', finish, true);

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (veil.current) anims.push(veil.current.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }));
      at(220, finish);
      return stop;
    }
    if (mode === 'page') {
      root.classList.add('launch-in');
      at(RISE_MS, finish);
      return stop;
    }

    const piece = logo.current!;
    // Lift, drop, squash on landing, settle: the piece clicking into its slot.
    anims.push(
      piece.animate(
        [
          { transform: 'none', easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
          { transform: 'translateY(-14px) scale(1.04)', offset: 0.4, easing: 'cubic-bezier(0.6, 0, 0.9, 0.5)' },
          { transform: 'scale(1.08, 0.9)', offset: IMPACT },
          { transform: 'scale(0.97, 1.03)', offset: 0.86 },
          { transform: 'none' },
        ],
        { duration: SNAP_MS },
      ),
    );
    at(SNAP_MS * IMPACT, () => {
      press();
      if (ring.current)
        anims.push(
          ring.current.animate(
            [
              { transform: 'scale(0.7)', opacity: 0.5 },
              { transform: 'scale(1.7)', opacity: 0 },
            ],
            { duration: 420, easing: 'ease-out', fill: 'forwards' },
          ),
        );
    });
    at(SNAP_MS, () => {
      root.classList.add('launch-in');
      if (veil.current) anims.push(veil.current.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FLY_MS * 0.8, easing: 'ease-in', fill: 'forwards' }));
      // Into the Hustle tab, where the piece lives as an icon; a page without the bar (a puzzle
      // opened from a link) lets it fade where it stands.
      const target = document.querySelector<SVGSVGElement>('.tabbar .tab-logo');
      const from = piece.getBoundingClientRect();
      const to = target?.getBoundingClientRect();
      if (target && to && to.height > 0) {
        root.classList.add('launch-flying');
        const dx = to.left + to.width / 2 - (from.left + from.width / 2);
        const dy = to.top + to.height / 2 - (from.top + from.height / 2);
        anims.push(
          piece.animate(
            [
              { transform: 'none', fill: FG },
              { transform: `translate(${dx}px, ${dy}px) scale(${to.height / from.height})`, fill: getComputedStyle(target).fill },
            ],
            { duration: FLY_MS, easing: 'cubic-bezier(0.5, 0, 0.2, 1)', fill: 'forwards' },
          ),
        );
      } else {
        anims.push(
          piece.animate(
            [
              { transform: 'none', opacity: 1 },
              { transform: 'scale(0.85)', opacity: 0 },
            ],
            { duration: FLY_MS * 0.6, easing: 'ease-in', fill: 'forwards' },
          ),
        );
      }
    });
    at(SNAP_MS + Math.max(FLY_MS, RISE_MS), finish);
    return stop;
  }, [mode]);

  if (mode !== 'welcome') return null;
  return (
    <div className="launch" aria-hidden="true">
      <div ref={veil} className="launch-veil" />
      <div ref={ring} className="launch-ring" />
      <svg ref={logo} className="launch-piece" viewBox="0 0 120 160" style={{ width: PIECE * 0.75, height: PIECE, fill: FG }}>
        <path d={LOGO_PATH} />
      </svg>
    </div>
  );
}
