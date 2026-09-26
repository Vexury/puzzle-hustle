import { useRef } from 'react';
import { boardRect, useSolved } from '../shared.ts';
import { Kitty } from './Kitty.tsx';
import './scene.css';

// Kittens around the café. On the tab bar one sleeps and one washes now and then, and a third
// walks in from the right, sits beside them a while and walks off again, never crossing them.
// In a puzzle, where there is no tab bar, two sit on shelves below the board. A solve brings one
// hopping up onto the board, meowing.
export default function CatCafeScene() {
  const jumper = useRef<HTMLDivElement>(null);
  useSolved(() => {
    const el = jumper.current;
    const rect = boardRect();
    if (!el || !rect) return;
    // The kitten's feet are 7 of 32 cells above the bottom of its box, at 3x.
    const x = rect.left + rect.width * 0.72 - 48;
    const y = rect.top - 96 + 21 + 2;
    el.animate(
      [
        { transform: `translate(${innerWidth}px, ${innerHeight}px)`, opacity: 1, offset: 0, easing: 'ease-out' },
        { transform: `translate(${x + 50}px, ${y - 90}px)`, opacity: 1, offset: 0.22, easing: 'ease-in' },
        { transform: `translate(${x}px, ${y}px) scale(1.1, 0.88)`, opacity: 1, offset: 0.32 },
        { transform: `translate(${x}px, ${y}px)`, opacity: 1, offset: 0.38 },
        { transform: `translate(${x}px, ${y}px)`, opacity: 1, offset: 0.9 },
        { transform: `translate(${x}px, ${y}px)`, opacity: 0, offset: 1 },
      ],
      { duration: 3600, fill: 'forwards' },
    );
  });
  return (
    <>
      <div className="pack-back cc-play-only">
        <div className="cc-shelf cc-shelf-low">
          <Kitty coat="grey" anim="sleepRight" seconds={1.8} className="cc-on-shelf cc-lying" />
        </div>
        <div className="cc-shelf cc-shelf-high">
          <Kitty coat="white" anim="yawn" seconds={5} pause className="cc-on-shelf" />
        </div>
      </div>
      <div className="pack-front">
        <div className="cc-perch">
          <Kitty coat="white" anim="sleepLeft" seconds={1.8} className="cc-sleeper cc-lying" />
          <Kitty coat="grey" anim="wash" seconds={4.5} pause className="cc-washer" />
          <div className="cc-visit">
            <Kitty coat="ginger" anim="walkLeft" seconds={0.9} className="cc-visit-in" />
            <Kitty coat="ginger" anim="look" seconds={6} pause className="cc-visit-sit" />
            <Kitty coat="ginger" anim="walkRight" seconds={0.9} className="cc-visit-out" />
          </div>
        </div>
        <div ref={jumper} className="cc-jumper">
          <Kitty coat="ginger" anim="meow" seconds={0.9} />
        </div>
      </div>
    </>
  );
}
