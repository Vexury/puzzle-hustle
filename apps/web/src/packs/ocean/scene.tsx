import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { InAnchor } from '../anchors.tsx';
import { boardRect, scatter, useBelowPageEnd, useSolved } from '../shared.ts';
import './scene.css';

const BUBBLES = scatter(22, 31);
const BURST = scatter(22, 47);
const SHELL = 'M12 21 3 9a10 10 0 0 1 18 0Z';
const SHELL_RIBS = 'M12 21 7 6M12 21V4M12 21l5-15M12 21 3.5 9M12 21l8.5-12';

// A starfish: five arms that taper to round tips, joined by soft concave curves.
const polar = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
};
const STARFISH = (() => {
  const arm = (k: number) => -90 + k * 72;
  let d = `M${polar(9.9, arm(0) - 8.7)}`;
  for (let k = 0; k < 5; k++) {
    d += `A1.5 1.5 0 0 1 ${polar(9.9, arm(k) + 8.7)}`;
    d += `Q${polar(1.6, arm(k) + 36)} ${polar(9.9, arm(k + 1) - 8.7)}`;
  }
  return `${d}Z`;
})();
const STARFISH_DOTS = [0, 1, 2, 3, 4].flatMap((k) => [polar(4.4, -90 + k * 72), polar(7.2, -90 + k * 72)]);

interface Moment {
  n: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

// Sandy seabed at the end of every page: seaweed swaying behind the sand, a shell, a starfish and
// a few pebbles in front of it. The sand spans the page, the life on it stays centred.
function Seabed() {
  return (
    <div className="oc-bed">
      <svg className="oc-life" viewBox="0 0 300 96" aria-hidden="true">
        <path className="oc-weed" d="M40 92C30 70 50 60 38 40 30 26 44 18 40 8" stroke="#3a9a6a" strokeWidth="6" />
        <path className="oc-weed oc-weed-b" d="M56 92C62 76 48 66 58 50 64 40 54 32 58 24" stroke="#56b37f" strokeWidth="5" />
        <path className="oc-weed oc-weed-c" d="M24 92C18 80 30 72 24 60" stroke="#56b37f" strokeWidth="4" />
        <path className="oc-weed oc-weed-b" d="M262 92C254 74 270 64 260 46 254 34 266 28 262 20" stroke="#3a9a6a" strokeWidth="6" />
        <path className="oc-weed" d="M278 92C284 80 274 70 280 58" stroke="#56b37f" strokeWidth="4" />
      </svg>
      <svg className="oc-sand" viewBox="0 0 300 96" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 78C50 68 90 84 150 76 210 68 250 84 300 74V96H0Z" fill="#ecd7ae" />
        <path d="M0 84C60 78 110 90 170 84 220 80 260 90 300 84V96H0Z" fill="#dfc393" />
      </svg>
      <svg className="oc-life" viewBox="0 0 300 96" aria-hidden="true">
        <g transform="translate(128 60)">
          <path d={SHELL} fill="#f6c9a8" />
          <path d={SHELL_RIBS} stroke="#d98d63" strokeWidth="1.2" fill="none" />
        </g>
        <g transform="translate(206 74) rotate(-14) scale(1.05)">
          <path d={STARFISH} fill="#f0875c" stroke="#cf5f36" strokeWidth="0.8" strokeLinejoin="round" />
          <circle r="2" fill="#f7a57f" />
          {STARFISH_DOTS.map((p, i) => {
            const [cx, cy] = p.split(' ');
            return <circle key={i} cx={cx} cy={cy} r={i % 2 ? 0.65 : 0.85} fill="#ffd3b8" />;
          })}
        </g>
        <g fill="#c9ab78">
          <ellipse cx="98" cy="86" rx="4" ry="2.4" />
          <ellipse cx="106" cy="88" rx="2.4" ry="1.6" />
          <ellipse cx="232" cy="84" rx="3" ry="2" />
        </g>
      </svg>
    </div>
  );
}

// The sand below the seabed row, down to the bottom of the screen.
function SandFloor() {
  const floor = useRef<HTMLDivElement>(null);
  useBelowPageEnd(floor);
  return <div ref={floor} className="oc-floor" />;
}

// A lagoon seen from below: light rings drift over the water and bubbles rise behind everything,
// and every page ends on the seabed. A solved board gets a wave running across it and a burst of
// bubbles rising off it.
export default function OceanScene() {
  const [moment, setMoment] = useState<Moment | null>(null);
  useSolved(() => {
    const r = boardRect();
    if (!r) return;
    setMoment((m) => ({ n: (m?.n ?? 0) + 1, left: r.left, top: r.top, width: r.width, height: r.height }));
  });
  useEffect(() => {
    if (!moment) return;
    const timer = setTimeout(() => setMoment(null), 2800);
    return () => clearTimeout(timer);
  }, [moment]);

  return (
    <>
      {/* Paint server for pack.css: the coin in the coin pill as a pearl. */}
      <svg className="pack-defs" aria-hidden="true">
        <defs>
          <radialGradient id="ocean-pearl" cx="0.35" cy="0.3" r="0.75">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.45" stopColor="#e3eef2" />
            <stop offset="1" stopColor="#b9ccd6" />
          </radialGradient>
        </defs>
      </svg>
      <div className="pack-back">
        <div className="oc-water" />
        <div className="oc-caustic" />
        {BUBBLES.map((b, i) => (
          <i
            key={i}
            className="oc-bubble"
            style={{
              left: `${b.x}%`,
              width: 7 + b.r * 11,
              height: 7 + b.r * 11,
              animationDuration: `${9 + b.r * 7}s`,
              animationDelay: `${-b.y * 0.16}s`,
              '--dx': `${(b.x % 36) - 18}px`,
            } as CSSProperties}
          />
        ))}
        <SandFloor />
      </div>
      <InAnchor name="page-end">
        <Seabed />
      </InAnchor>
      {moment && (
        <div className="pack-front" key={moment.n}>
          <div className="oc-splash" style={{ left: moment.left, top: moment.top, width: moment.width, height: moment.height }}>
            <svg className="oc-wave" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 100V20C20 0 30 0 45 18 55 30 70 30 80 14 88 2 96 4 100 10V100Z" fill="rgba(82, 198, 211, 0.55)" />
              <path d="M0 20C20 0 30 0 45 18 55 30 70 30 80 14 88 2 96 4 100 10" stroke="#fff" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
          {BURST.map((b, i) => (
            <i
              key={i}
              className="oc-rise"
              style={{
                left: moment.left + (b.x / 100) * moment.width,
                top: moment.top + (0.4 + (b.y / 100) * 0.6) * moment.height,
                width: 5 + b.r * 9,
                height: 5 + b.r * 9,
                animationDuration: `${1.4 + b.r * 0.8}s`,
                animationDelay: `${0.5 + (b.y / 100) * 0.4}s`,
                '--dx': `${(b.x % 40) - 20}px`,
                '--dy': `${-160 - b.r * 140}px`,
              } as CSSProperties}
            />
          ))}
        </div>
      )}
    </>
  );
}
