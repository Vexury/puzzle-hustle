import { useEffect, useState } from 'react';
import { formatSeconds } from '../../lib/share.ts';
import { boardRect, useSolved } from '../shared.ts';
import './scene.css';

// Once per run of the app, the first time the pack is on screen.
let booted = false;

function Typed({ text, className, style }: { text: string; className: string; style?: React.CSSProperties }) {
  return (
    <div className={className} style={{ ...style, '--chars': text.length } as React.CSSProperties}>
      <span className="tm-text">{text}</span>
    </div>
  );
}

// A boot line when the pack comes up, and the solve reported like a command's output.
export default function TerminalScene() {
  const [boot, setBoot] = useState(!booted);
  const [line, setLine] = useState<{ n: number; text: string; x: number; y: number } | null>(null);
  useEffect(() => {
    booted = true;
    if (!boot) return;
    const timer = setTimeout(() => setBoot(false), 2600);
    return () => clearTimeout(timer);
  }, []);
  useSolved((event) => {
    const rect = boardRect();
    setLine((prev) => ({
      n: prev ? prev.n + 1 : 1,
      text: `> solved in ${formatSeconds(event.seconds)} ✓`,
      x: rect ? rect.left + rect.width / 2 : innerWidth / 2,
      y: rect ? rect.bottom - 36 : innerHeight / 2,
    }));
  });
  return (
    <div className="pack-front">
      {boot && <Typed className="tm-boot" text="PUZZLE HUSTLE v1.0 ... READY" />}
      {line && <Typed key={line.n} className="tm-line" text={line.text} style={{ left: line.x, top: line.y }} />}
    </div>
  );
}
