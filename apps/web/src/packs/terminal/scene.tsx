import { useEffect, useState } from 'react';
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

// A boot line when the pack comes up. A solve shows as the .solved-stamp slot in pack.css.
export default function TerminalScene() {
  const [boot, setBoot] = useState(!booted);
  useEffect(() => {
    booted = true;
    if (!boot) return;
    const timer = setTimeout(() => setBoot(false), 2600);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="pack-front">
      {boot && <Typed className="tm-boot" text="PUZZLE HUSTLE v1.0 ... READY" />}
    </div>
  );
}
