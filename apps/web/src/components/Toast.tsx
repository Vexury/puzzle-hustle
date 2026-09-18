import { useEffect, useState } from 'react';

let show: ((msg: string) => void) | null = null;

export function toast(message: string) {
  show?.(message);
}

export function ToastHost() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let timer = 0;
    show = (msg) => {
      setMessage(msg);
      clearTimeout(timer);
      timer = window.setTimeout(() => setMessage(null), 2200);
    };
    return () => {
      show = null;
      clearTimeout(timer);
    };
  }, []);
  return message ? <div className="toast" role="status">{message}</div> : null;
}
