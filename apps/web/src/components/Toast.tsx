import { useEffect, useState } from 'react';

let show: ((msg: string) => void) | null = null;

export function toast(message: string) {
  show?.(message);
}

// Long enough to read: a requirement like "Finish all 50 Zip levels on Hard." needs more time
// than "Reported".
export function toastDuration(message: string): number {
  return Math.min(4000, 1800 + message.length * 40);
}

export function ToastHost() {
  const [current, setCurrent] = useState<{ text: string; key: number } | null>(null);
  useEffect(() => {
    let timer = 0;
    let key = 0;
    show = (msg) => {
      setCurrent({ text: msg, key: ++key });
      clearTimeout(timer);
      timer = window.setTimeout(() => setCurrent(null), toastDuration(msg));
    };
    return () => {
      show = null;
      clearTimeout(timer);
    };
  }, []);
  // Keyed per message so the entrance plays again when a second toast replaces the first.
  return current ? (
    <div key={current.key} className="toast" role="status">
      {current.text}
    </div>
  ) : null;
}
