import { Kitty } from './Kitty.tsx';
import './scene.css';

// Pixel rows of a tail hanging over a shelf's edge, in the grey kitten's colours: 1 outline,
// 2 fur, 3 shade. Drawn here because no sleeping frame of the sheet lets the tail hang.
const TAIL = ['1221', '1231', '1221', '1231', '1221', '01221', '01221', '01231', '01221', '0011'];
const TAIL_COLOURS: Record<string, string> = { '1': '#120e14', '2': '#626773', '3': '#414752' };

function HangingTail({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 5 10" shapeRendering="crispEdges" aria-hidden="true">
      {TAIL.flatMap((row, y) =>
        [...row].map((c, x) => (c === '0' ? null : <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={TAIL_COLOURS[c]} />)),
      )}
    </svg>
  );
}

// Kittens around the café. On the tab bar one sleeps and one washes now and then, and a third
// walks in from the right, sits beside them a while and walks off again, never crossing them.
// In a puzzle, where there is no tab bar, two keep the player company on shelves below the board.
export default function CatCafeScene() {
  return (
    <>
      <div className="pack-back cc-play-only">
        <div className="cc-shelf cc-shelf-low">
          <Kitty coat="grey" anim="sleepRight" seconds={1.8} className="cc-loafer" />
          <HangingTail className="cc-tail" />
          <i className="cc-plank" />
        </div>
        <div className="cc-shelf cc-shelf-high">
          <Kitty coat="white" anim="yawn" seconds={5} pause className="cc-shelf-sitter" />
          <i className="cc-plank" />
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
      </div>
    </>
  );
}
