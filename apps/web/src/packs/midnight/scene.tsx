import { scatter, useSolveCount } from '../shared.ts';
import './scene.css';

const STARS = scatter(42, 11);
const SPARKLES = scatter(5, 23);

// A quiet sky: stars twinkling at their own pace, a few brighter sparkles and a crescent moon,
// and a shooting star across the screen when a puzzle is solved. Boards get star dust in their
// empty cells, and a solved Zip path turns into a constellation.
export default function MidnightScene() {
  const solves = useSolveCount();
  return (
    <>
      {/* A paint server for the boards' SVG, referenced from pack.css: star dust for empty cells. */}
      <svg className="pack-defs" aria-hidden="true">
        <defs>
          <pattern id="midnight-dust" width="1" height="1" patternContentUnits="objectBoundingBox">
            <rect width="1" height="1" style={{ fill: 'var(--board-cell)' }} />
            <circle cx="0.22" cy="0.3" r="0.028" fill="#dbe9ff" fillOpacity="0.3" />
            <circle cx="0.72" cy="0.2" r="0.02" fill="#dbe9ff" fillOpacity="0.25" />
            <circle cx="0.62" cy="0.76" r="0.024" fill="#dbe9ff" fillOpacity="0.28" />
          </pattern>
        </defs>
      </svg>
      <div className="pack-back">
        {STARS.map((s, i) => (
          <i
            key={i}
            className="mn-star"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: 1 + s.r * 2,
              height: 1 + s.r * 2,
              animationDuration: `${2.5 + s.r * 3}s`,
              animationDelay: `${-s.y / 20}s`,
            }}
          />
        ))}
        {SPARKLES.map((s, i) => (
          <svg
            key={i}
            className="mn-sparkle"
            viewBox="0 0 24 24"
            style={{ left: `${s.x}%`, top: `${s.y}%`, width: 8 + s.r * 8, animationDelay: `${-s.x / 15}s` }}
          >
            <path d="M12 0C13 9 15 11 24 12 15 13 13 15 12 24 11 15 9 13 0 12 9 11 11 9 12 0Z" />
          </svg>
        ))}
        <svg className="mn-moon" viewBox="0 0 24 24">
          <path d="M15 2.5a9.5 9.5 0 1 0 6.5 16.4A8 8 0 0 1 15 2.5Z" />
        </svg>
      </div>
      {solves > 0 && (
        <div className="pack-front">
          <div key={solves} className="mn-shooting" />
        </div>
      )}
    </>
  );
}
