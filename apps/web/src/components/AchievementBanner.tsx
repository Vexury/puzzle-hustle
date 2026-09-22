import { useEffect, useState } from 'react';

let enqueue: ((title: string) => void) | null = null;

export function announceAchievement(title: string) {
  enqueue?.(title);
}

type Phase = 'enter' | 'open' | 'exit';

// Matches the CSS transition budget in theme.css: opening (opacity/transform 0.18s, width
// 0.1s delay + 0.34s) finishes around 0.44s, closing (width 0.24s, then opacity/transform
// 0.2s delay + 0.2s) finishes around 0.4s. The hold is the ~2.2s plateau the spec asks for,
// counted from the moment the open transition starts rather than from when it visually
// finishes, since the difference is a few hundred ms against a multi-second hold.
const HOLD_MS = 2200;
const EXIT_MS = 420;

// One at a time, in arrival order: a title lands in the queue, and only moves into `current`
// once the previous one has fully played out (including its exit animation), so two unlocks
// in a row never overwrite each other the way the old single-slot toast did.
export function AchievementBannerHost() {
  const [queue, setQueue] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('enter');

  useEffect(() => {
    enqueue = (title) => setQueue((q) => [...q, title]);
    return () => {
      enqueue = null;
    };
  }, []);

  useEffect(() => {
    if (current !== null || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setCurrent(next ?? null);
    setPhase('enter');
  }, [queue, current]);

  // A class/attribute change applied in the same tick as the mount would not transition (the
  // browser never paints the collapsed 'enter' state to transition away from), so the move to
  // 'open' happens one tick later.
  useEffect(() => {
    if (current === null || phase !== 'enter') return;
    const timer = window.setTimeout(() => setPhase('open'), 0);
    return () => clearTimeout(timer);
  }, [current, phase]);

  useEffect(() => {
    if (current === null || phase !== 'open') return;
    const timer = window.setTimeout(() => setPhase('exit'), HOLD_MS);
    return () => clearTimeout(timer);
  }, [current, phase]);

  useEffect(() => {
    if (phase !== 'exit') return;
    const timer = window.setTimeout(() => setCurrent(null), EXIT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (current === null) return null;

  return (
    <div className="achievement-banner" data-phase={phase} role="status">
      <span className="achievement-banner-text">Achievement unlocked: {current}</span>
    </div>
  );
}
