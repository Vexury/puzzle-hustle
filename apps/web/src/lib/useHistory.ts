import { useRef, useState } from 'react';

const LIMIT = 200;

// Games remember the board when a touch starts, before they know whether it changes anything:
// a tap on a clue, a pinch or a cancelled drag leaves a snapshot that is still the current board.
// States are replaced, never mutated, so such a snapshot is the current state by reference, and
// undo skips it instead of spending a press on nothing.
//
// Redo holds while the board is still the one the last undo or redo put there. A real move
// replaces it and ends the redo line; a touch that changed nothing does not.
export function useHistory<T>() {
  const stack = useRef<T[]>([]);
  const ahead = useRef<T[]>([]);
  const landed = useRef<T | null>(null);
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  const push = (snapshot: T) => {
    if (stack.current.at(-1) === snapshot) return;
    stack.current.push(snapshot);
    if (stack.current.length > LIMIT) stack.current.shift();
  };

  return {
    canUndo: stack.current.length > 0,
    canRedo(current: T): boolean {
      return ahead.current.length > 0 && current === landed.current;
    },
    remember(snapshot: T) {
      push(snapshot);
      bump();
    },
    undo(current: T): T | undefined {
      let s = stack.current.pop();
      while (s !== undefined && s === current) s = stack.current.pop();
      if (s !== undefined) {
        if (current !== landed.current) ahead.current = [];
        ahead.current.push(current);
        landed.current = s;
      }
      bump();
      return s;
    },
    redo(current: T): T | undefined {
      if (current !== landed.current) {
        ahead.current = [];
        bump();
        return undefined;
      }
      const s = ahead.current.pop();
      if (s !== undefined) {
        push(current);
        landed.current = s;
      }
      bump();
      return s;
    },
  };
}
