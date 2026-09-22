import { useRef, useState } from 'react';

const LIMIT = 200;

// Games remember the board when a touch starts, before they know whether it changes anything:
// a tap on a clue, a pinch or a cancelled drag leaves a snapshot that is still the current board.
// States are replaced, never mutated, so such a snapshot is the current state by reference, and
// undo skips it instead of spending a press on nothing.
export function useHistory<T>() {
  const stack = useRef<T[]>([]);
  const [count, setCount] = useState(0);
  return {
    canUndo: count > 0,
    remember(snapshot: T) {
      if (stack.current.at(-1) === snapshot) return;
      stack.current.push(snapshot);
      if (stack.current.length > LIMIT) stack.current.shift();
      setCount(stack.current.length);
    },
    undo(current: T): T | undefined {
      let s = stack.current.pop();
      while (s !== undefined && s === current) s = stack.current.pop();
      setCount(stack.current.length);
      return s;
    },
  };
}
