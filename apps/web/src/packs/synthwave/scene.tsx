import { useSolveCount } from '../shared.ts';
import './scene.css';

// A retro sun and a grid rolling toward the horizon behind everything, and a short scanline
// glitch over the screen when a puzzle is solved.
export default function SynthwaveScene() {
  const glitch = useSolveCount();
  return (
    <>
      <div className="pack-back sw-back">
        <div className="sw-sun" />
        <div className="sw-floor">
          <div className="sw-grid" />
        </div>
      </div>
      {glitch > 0 && (
        <div className="pack-front">
          <div key={glitch} className="sw-glitch" />
        </div>
      )}
    </>
  );
}
