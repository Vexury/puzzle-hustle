import { useRef } from 'react';
import { boardRect, useSolved } from '../shared.ts';
import { PeekingCat, SittingCat } from './Cat.tsx';
import './scene.css';

// Two cats keep the player company: one sits in the corner swinging its tail, one peeks in from
// the side. On a solve a third one jumps up and settles on top of the board for a moment.
export default function CatCafeScene() {
  const jumper = useRef<HTMLDivElement>(null);
  useSolved(() => {
    const el = jumper.current;
    const rect = boardRect();
    if (!el || !rect) return;
    const size = 64;
    const x = rect.left + rect.width * 0.7 - size / 2;
    const y = rect.top - size + 6;
    el.animate(
      [
        { transform: `translate(${-size}px, ${innerHeight}px)`, opacity: 1, offset: 0, easing: 'ease-out' },
        { transform: `translate(${x - 60}px, ${y - 110}px)`, opacity: 1, offset: 0.28, easing: 'ease-in' },
        { transform: `translate(${x}px, ${y}px) scale(1.08, 0.9)`, opacity: 1, offset: 0.4 },
        { transform: `translate(${x}px, ${y}px)`, opacity: 1, offset: 0.46 },
        { transform: `translate(${x}px, ${y}px)`, opacity: 1, offset: 0.88 },
        { transform: `translate(${x}px, ${y}px)`, opacity: 0, offset: 1 },
      ],
      { duration: 3000, fill: 'forwards' },
    );
  });
  return (
    <>
      <div className="pack-back">
        <SittingCat className="cc-sitter" />
        <PeekingCat className="cc-peeker" />
      </div>
      <div className="pack-front">
        <div ref={jumper} className="cc-jumper">
          <SittingCat />
        </div>
      </div>
    </>
  );
}
