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

// A little café with kittens in it: a striped awning over the top of the screen and coffee beans
// on the wall. On the tab bar one kitten sleeps and one washes now and then, and another walks in
// from the right to the last tab, sits a while and walks off again, never crossing the others;
// with the Social tab a fourth one sits over Profile. In a puzzle, where there is no tab bar,
// two keep the player company on shelves below the board, with a cup and a slice of cake.
export default function CatCafeScene() {
  return (
    <>
      <div className="pack-back cc-play-only">
        <div className="cc-shelf cc-shelf-low">
          <Kitty coat="grey" anim="sleepRight" seconds={1.8} className="cc-loafer" />
          <Pixels art={TAIL} className="cc-tail" />
          <Pixels art={CAKE} className="cc-cake" />
          <i className="cc-plank" />
        </div>
        <div className="cc-shelf cc-shelf-high">
          <SteamingCup className="cc-shelf-cup" />
          <Kitty coat="white" anim="yawn" seconds={5} pause className="cc-shelf-sitter" />
          <i className="cc-plank" />
        </div>
      </div>
      <div className="pack-front">
        <div className="cc-awning" />
        <div className="cc-perch">
          <Kitty coat="white" anim="sleepLeft" seconds={1.8} className="cc-sleeper cc-lying" />
          <Kitty coat="grey" anim="wash" seconds={4.5} pause className="cc-washer" />
          <Kitty coat="white" anim="yawn" seconds={6} pause className="cc-profile" />
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
