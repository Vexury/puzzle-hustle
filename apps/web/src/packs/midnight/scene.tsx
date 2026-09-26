import { scatter, useSolveCount } from '../shared.ts';
import './scene.css';

const STARS = scatter(42, 11);
const SPARKLES = scatter(5, 23);

// A quiet sky: stars twinkling at their own pace, a few brighter sparkles and a crescent moon,
// and a shooting star across the screen when a puzzle is solved.
export default function MidnightScene() {
  const solves = useSolveCount();
  return (
    <>
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
