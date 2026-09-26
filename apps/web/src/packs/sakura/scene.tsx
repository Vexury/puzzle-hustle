import confetti from 'canvas-confetti';
import { useRef } from 'react';
import { boardRect, scatter, useSolved } from '../shared.ts';
import './scene.css';

// A sakura petal with the notch at its tip, in a 24 box.
const PETAL = 'M12 22C6 16 5 9 8 4c1.3-1.6 2.7-1.6 4 .5 1.3-2.1 2.7-2.1 4-.5 3 5 2 12-4 18Z';
const PETALS = scatter(12, 7);

function Blossom({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <path key={a} className="sk-bloom" d="M0 0C-5-4-5-10-2-12c.8-.8 1.5-.6 2 .4.5-1 1.2-1.2 2-.4 3 2 3 8-2 12Z" transform={`rotate(${a})`} />
      ))}
      <circle className="sk-heart" r="2" />
    </g>
  );
}

// Petals drift down behind everything, a flowering branch reaches in from the top corner, and a
// solved board throws a handful of petals.
export default function SakuraScene() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const cannon = useRef<confetti.CreateTypes | null>(null);
  useSolved(() => {
    if (!canvas.current) return;
    cannon.current ??= confetti.create(canvas.current, { resize: true, useWorker: false });
    const rect = boardRect();
    const origin = rect
      ? { x: (rect.left + rect.width / 2) / innerWidth, y: (rect.top + rect.height / 2) / innerHeight }
      : { x: 0.5, y: 0.45 };
    void cannon.current({
      particleCount: 60,
      spread: 100,
      startVelocity: 28,
      gravity: 0.5,
      drift: 0.4,
      ticks: 260,
      scalar: 1.6,
      origin,
      shapes: [confetti.shapeFromPath({ path: PETAL })],
      colors: ['#f7a8c0', '#e0567f', '#ffd1dc', '#fbe3ea'],
      disableForReducedMotion: true,
    });
  });
  return (
    <>
      <div className="pack-back">
        <svg className="sk-branch" viewBox="0 0 160 200" aria-hidden="true">
          <path className="sk-wood" d="M165 6C120 22 96 48 78 86 66 112 50 128 22 140M104 42c-8-14-6-26 4-36M78 86c16 4 30 16 36 32" />
          <Blossom x={120} y={24} size={1} />
          <Blossom x={96} y={56} size={0.8} />
          <Blossom x={108} y={10} size={0.6} />
          <Blossom x={70} y={100} size={0.9} />
          <Blossom x={112} y={116} size={0.7} />
          <Blossom x={34} y={132} size={0.75} />
        </svg>
        {PETALS.map((p, i) => (
          <div
            key={i}
            className="sk-fall"
            style={{ left: `${p.x}%`, animationDuration: `${11 + p.r * 8}s`, animationDelay: `${-p.y * 0.19}s` }}
          >
            <svg className="sk-petal" viewBox="0 0 24 24" style={{ animationDuration: `${3 + p.r * 2}s`, width: 10 + p.r * 8 }}>
              <path d={PETAL} />
            </svg>
          </div>
        ))}
      </div>
      <div className="pack-front">
        <canvas ref={canvas} className="pack-canvas" />
      </div>
    </>
  );
}
