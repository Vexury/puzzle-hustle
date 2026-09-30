import { InAnchor } from '../anchors.tsx';
import { scatter, useSolveCount } from '../shared.ts';
import './scene.css';

const GLINT = 'M12 0C13 9 15 11 24 12 15 13 13 15 12 24 11 15 9 13 0 12 9 11 11 9 12 0Z';
const GLINTS = scatter(9, 31);
const COINS = scatter(34, 47);

// A small slot machine between two chip stacks, with its bulbs chasing and its lever pulled on
// every solve.
function SlotMachine({ pulls }: { pulls: number }) {
  return (
    <svg className="cs-slot" viewBox="0 0 300 96" aria-hidden="true">
      <rect x="70" y="6" width="150" height="86" rx="12" fill="#b8872a" />
      <rect x="74" y="10" width="142" height="78" rx="9" fill="#f2c14e" />
      {Array.from({ length: 9 }, (_, i) => (
        <g key={i}>
          <circle cx={86 + i * 15} cy="19" r="3.4" fill="#8a6420" />
          <circle className={i % 2 ? 'cs-bulb cs-bulb-late' : 'cs-bulb'} cx={86 + i * 15} cy="19" r="3.4" />
        </g>
      ))}
      <rect x="84" y="30" width="122" height="46" rx="6" fill="#7a5410" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={89 + i * 39} y="34" width="34" height="38" rx="4" fill="#fbf5e2" />
      ))}
      <g className="cs-reel-text" textAnchor="middle">
        <text x="106" y="63" fontSize="24" fill="#d6453d">7</text>
        <text x="145" y="62" fontSize="22" fill="#1c1c1c">♦</text>
        <text x="184" y="63" fontSize="24" fill="#d6453d">7</text>
      </g>
      <g key={pulls} className={pulls ? 'cs-lever cs-pull' : 'cs-lever'}>
        <path d="M220 44h10V20" stroke="#b8872a" strokeWidth="5" fill="none" strokeLinecap="round" />
        <circle cx="230" cy="16" r="7" fill="#d6453d" />
      </g>
      <g fill="#d6453d" stroke="#f7f0dc" strokeWidth="2" strokeDasharray="4 3">
        <ellipse cx="34" cy="84" rx="18" ry="6" />
        <ellipse cx="34" cy="77" rx="18" ry="6" />
        <ellipse cx="34" cy="70" rx="18" ry="6" />
      </g>
      <g fill="#1c1c1c" stroke="#f2c14e" strokeWidth="2" strokeDasharray="4 3">
        <ellipse cx="264" cy="84" rx="18" ry="6" />
        <ellipse cx="264" cy="77" rx="18" ry="6" />
      </g>
    </svg>
  );
}

// Green felt under a soft spotlight with gold glints coming and going, a slot machine closing
// every page, and a shower of coins over the screen when the stamp's reels stop on a solve.
export default function CasinoScene() {
  const solves = useSolveCount();
  return (
    <>
      <div className="pack-back">
        <div className="cs-light" />
        {GLINTS.map((g, i) => (
          <svg
            key={i}
            className="cs-glint"
            viewBox="0 0 24 24"
            style={{
              left: `${4 + g.x * 0.88}%`,
              top: `${4 + g.y * 0.86}%`,
              width: 8 + g.r * 6,
              animationDuration: `${4 + g.r * 4}s`,
              animationDelay: `${-g.x / 12}s`,
            }}
          >
            <path d={GLINT} />
          </svg>
        ))}
      </div>
      <InAnchor name="page-end">
        <div className="cs-row">
          <SlotMachine pulls={solves} />
        </div>
      </InAnchor>
      {solves > 0 && (
        <div className="pack-front" key={solves}>
          {COINS.map((c, i) => (
            <i
              key={i}
              className={i % 5 === 4 ? 'cs-coin cs-chip' : 'cs-coin'}
              style={{
                left: `${c.x * 0.94}%`,
                animationDuration: `${1.3 + c.r}s`,
                animationDelay: `${1.2 + c.y * 0.008}s`,
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
