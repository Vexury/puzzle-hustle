import { useRoute } from '../../lib/router.ts';
import { InAnchor } from '../anchors.tsx';
import { Kitty } from './Kitty.tsx';
import { CAKE, CUP, Pixels, STEAM, TAIL } from './Pixels.tsx';
import './scene.css';

function SteamingCup({ className }: { className: string }) {
  return (
    <div className={className}>
      <Pixels art={STEAM} className="cc-steam" />
      <Pixels art={STEAM} className="cc-steam cc-steam-late" />
      <Pixels art={CUP} />
    </div>
  );
}

// One little shelf per page: a kitten asleep by a cup on Daily, one washing on Puzzles, one
// yawning by a slice of cake everywhere else, and in a puzzle two shelves below the board.
function Shelves({ path }: { path: string }) {
  if (path === '/play') {
    return (
      <div className="cc-row">
        <div className="cc-shelf cc-left">
          <Kitty coat="grey" anim="sleepRight" seconds={1.8} className="cc-loafer" />
          <Pixels art={TAIL} className="cc-tail" />
          <Pixels art={CAKE} className="cc-cake" />
          <i className="cc-plank" />
        </div>
        <div className="cc-shelf cc-right">
          <SteamingCup className="cc-cup" />
          <Kitty coat="white" anim="yawn" seconds={5} pause className="cc-sitter" />
          <i className="cc-plank" />
        </div>
      </div>
    );
  }
  if (path === '/') {
    return (
      <div className="cc-row">
        <div className="cc-shelf cc-left">
          <Kitty coat="white" anim="sleepLeft" seconds={1.8} className="cc-sleeper" />
          <SteamingCup className="cc-cup cc-cup-end" />
          <i className="cc-plank" />
        </div>
      </div>
    );
  }
  if (path.startsWith('/levels')) {
    return (
      <div className="cc-row">
        <div className="cc-shelf cc-right">
          <Kitty coat="grey" anim="wash" seconds={4.5} pause className="cc-sitter" />
          <i className="cc-plank" />
        </div>
      </div>
    );
  }
  return (
    <div className="cc-row">
      <div className="cc-shelf cc-mid">
        <Kitty coat="ginger" anim="yawn" seconds={6} pause className="cc-sitter" />
        <Pixels art={CAKE} className="cc-cake" />
        <i className="cc-plank" />
      </div>
    </div>
  );
}

// A little café with kittens in it: a striped awning over the top of the page, coffee beans on
// the wall, and at the end of every page a shelf with a kitten. The shelves take a row of their
// own in the page flow, so they never cover a control.
export default function CatCafeScene() {
  const route = useRoute();
  return (
    <>
      <div className="cc-awning" />
      <InAnchor name="page-end">
        <Shelves path={route.path} />
      </InAnchor>
    </>
  );
}
