import { useEffect, useRef, useState } from 'react';

// The hint mark. Each call replaces the previous mark and restarts its clock, so an earlier
// hint's timer never wipes a later one. The mark drops for one frame first, which restarts the
// CSS animation even when the same cell is hinted twice in a row.
export function useFlash<T>(ms = 3000): [T | null, (value: T) => void] {
  const [flash, setFlash] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const frame = useRef(0);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      cancelAnimationFrame(frame.current);
    },
    [],
  );

  const show = (value: T) => {
    clearTimeout(timer.current);
    cancelAnimationFrame(frame.current);
    setFlash(null);
    frame.current = requestAnimationFrame(() => {
      setFlash(value);
      timer.current = setTimeout(() => setFlash(null), ms);
    });
  };

  return [flash, show];
}
