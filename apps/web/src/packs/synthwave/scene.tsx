import { useSolveCount } from '../shared.ts';
import './scene.css';

// The pyramids of the Synthwave nameplate, light face then shadow face, smallest in front.
const PEAKS: Array<[number, number, number]> = [[54, 30, 40], [168, 28, 40], [64, 46, 26], [158, 47, 26], [110, 34, 38]];

// A retro sun with pyramids on the horizon and a grid rolling toward it behind everything, and a
// short scanline glitch over the screen when a puzzle is solved.
export default function SynthwaveScene() {
  const glitch = useSolveCount();
  return (
    <>
      <div className="pack-back sw-back">
        <div className="sw-sun" />
        <svg className="sw-peaks" viewBox="14 26 194 42" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
          {PEAKS.map(([x, y, w], i) => (
            <g key={x}>
              <path d={`M${x - w} 68L${x} ${y}L${x + w} 68Z`} fill="var(--bg)" />
              <path d={`M${x - w} 68L${x} ${y}V68Z`} fill={i === 4 ? '#3b2a8f' : i > 1 ? '#8a4fc0' : '#d55aa8'} opacity={0.32} />
              <path d={`M${x} ${y}L${x + w} 68H${x}Z`} fill={i === 4 ? '#170a2c' : i > 1 ? '#1d0c33' : '#2a1240'} opacity={0.32} />
            </g>
          ))}
        </svg>
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
