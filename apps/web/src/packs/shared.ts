import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { onAppEvent, type AppEvent } from '../lib/appEvents.ts';

// Calls the handler for every solve while the scene is mounted, always with the latest closure.
export function useSolved(handler: (event: AppEvent) => void) {
  const latest = useRef(handler);
  // Updated in an effect, not during render: a ref written while rendering makes the React
  // Compiler skip the whole function without a warning.
  useLayoutEffect(() => {
    latest.current = handler;
  });
  useEffect(() => onAppEvent((event) => event.type === 'solved' && latest.current(event)), []);
}

// A counter that goes up with every solve: keyed on it, a moment element remounts and replays.
export function useSolveCount(): number {
  const [count, setCount] = useState(0);
  useSolved(() => setCount((n) => n + 1));
  return count;
}

// Where the board sits right now, in viewport pixels. Board frames are a slot, see README.md.
export function boardRect(): DOMRect | null {
  return document.querySelector('.board-frame')?.getBoundingClientRect() ?? null;
}

// Fixed pseudo-random spots, so decoration sits in the same places on every start.
export function scatter(count: number, seed: number): Array<{ x: number; y: number; r: number }> {
  let s = seed;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  return Array.from({ length: count }, () => ({ x: next() * 100, y: next() * 100, r: next() }));
}
