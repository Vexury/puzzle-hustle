import { useRef, useState } from 'react';

const LIMIT = 200;

export function useHistory<T>() {
  const stack = useRef<T[]>([]);
  const [count, setCount] = useState(0);
  return {
    canUndo: count > 0,
    remember(snapshot: T) {
      stack.current.push(snapshot);
      if (stack.current.length > LIMIT) stack.current.shift();
      setCount(stack.current.length);
    },
    undo(): T | undefined {
      const s = stack.current.pop();
      setCount(stack.current.length);
      return s;
    },
  };
}
