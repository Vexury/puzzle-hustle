import { useState } from 'react';
import { boardRect, useSolved } from '../shared.ts';
import './scene.css';

// Pencil doodles in the margins of the exercise book, and an ink stamp on a solved board.
export default function PaperScene() {
  const [stamp, setStamp] = useState<{ n: number; x: number; y: number } | null>(null);
  useSolved(() => {
    const rect = boardRect();
    setStamp((prev) => ({
      n: prev ? prev.n + 1 : 1,
      x: rect ? rect.left + rect.width / 2 : innerWidth / 2,
      y: rect ? rect.top + rect.height / 2 : innerHeight / 2,
    }));
  });
  return (
    <>
      <div className="pack-back">
        <svg className="pp-doodle pp-star" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M20 4l4.5 11 11.5.8-9 7.4 3 11.3L20 28l-10 6.5 3-11.3-9-7.4 11.5-.8Z" />
        </svg>
        <svg className="pp-doodle pp-spiral" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M20 20c0-2 3-2 3 0s-2 5-6 4-5-6-2-9 10-2 11 4-4 12-11 11-11-9-8-15 12-8 18-4" />
        </svg>
        <svg className="pp-doodle pp-arrow" viewBox="0 0 60 30" aria-hidden="true">
          <path d="M4 22c12-10 28-14 48-10M44 5l8 7-9 6" />
        </svg>
        <svg className="pp-doodle pp-smile" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M20 5c9 0 15 6 15 15s-6 15-15 15S5 29 5 20 11 5 20 5ZM14 16v2M26 16v2M13 24c4 5 10 5 14 0" />
        </svg>
      </div>
      {stamp && (
        <div className="pack-front">
          <div key={stamp.n} className="pp-stamp" style={{ left: stamp.x, top: stamp.y }}>
            Solved
          </div>
        </div>
      )}
    </>
  );
}
