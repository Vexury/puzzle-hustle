import { useRef, useState, type CSSProperties } from 'react';
import { InAnchor } from '../anchors.tsx';
import { boardRect, scatter, useBelowPageEnd, useSolved } from '../shared.ts';
import './scene.css';

const EMBERS = scatter(22, 31);
const SPARKS = scatter(26, 47);
const TONGUES = 9;
const TONGUE = 'M12 0C14 12 22 20 22 34a10 10 0 0 1-20 0C2 24 8 20 10 12c1 6 3 8 4 10 1-8-2-14-2-22Z';

type Burst = { n: number; x: number; y: number; w: number; h: number };

const RIDGE = 'M0 60 L22 48 L40 55 L66 34 L92 44 L120 22 L150 30 L172 18 L200 36 L228 28 L252 46 L276 40 L300 54';

// An obsidian ridge closing every page, edge to edge, lava pulsing in its cracks. Rock and cracks
// stretch together, so the cracks stay on the ridge at any width; the strokes keep their width.
function Obsidian() {
  return (
    <div className="inf-bed">
      <svg className="inf-ridge" viewBox="0 0 300 86" preserveAspectRatio="none" aria-hidden="true">
        <path d={`${RIDGE} L300 86 L0 86Z`} fill="#0b0605" />
        <path d={RIDGE} fill="none" stroke="#3d211b" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <g className="inf-lava" fill="none" stroke="#ff5a1f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {['M120 24 L126 44 L118 58 L128 76', 'M126 44 L142 52', 'M200 38 L196 56 L206 70', 'M66 36 L72 54 L64 70', 'M252 48 L258 64'].map((d) => (
            <path key={d} d={d} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
        <g className="inf-lava inf-lava-late" fill="#ffb13b">
          <circle cx="128" cy="76" r="2.5" />
          <circle cx="206" cy="70" r="2" />
          <circle cx="64" cy="70" r="2" />
        </g>
      </svg>
    </div>
  );
}

// Rock below the ridge, down to the bottom of the screen, veined with lava.
function RockFloor() {
  const floor = useRef<HTMLDivElement>(null);
  useBelowPageEnd(floor);
  return <div ref={floor} className="inf-floor" />;
}

// Embers rise from a glow along the bottom edge behind everything, and an obsidian rock with
// glowing cracks closes every page. A solved board bursts into flame: tongues of fire leap up
// from its lower edge, with a short flash of heat and a shower of sparks.
export default function InfernoScene() {
  const [burst, setBurst] = useState<Burst | null>(null);
  useSolved(() => {
    const r = boardRect();
    const box = r
      ? { x: r.left, y: r.top, w: r.width, h: r.height }
      : { x: innerWidth * 0.1, y: innerHeight * 0.2, w: innerWidth * 0.8, h: innerHeight * 0.5 };
    setBurst((b) => ({ n: (b?.n ?? 0) + 1, ...box }));
  });
  const tongueW = burst ? (burst.w / TONGUES) * 1.35 : 0;
  return (
    <>
      <svg className="pack-defs" aria-hidden="true">
        <defs>
          <linearGradient id="inferno-tongue" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#ff5a1f" />
            <stop offset="0.6" stopColor="#ffb13b" />
            <stop offset="1" stopColor="#fff4c2" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      <div className="pack-back">
        <RockFloor />
        <div className="inf-glow" />
        {EMBERS.map((e, i) => (
          <i
            key={i}
            className="inf-ember"
            style={{
              left: `${e.x}%`,
              width: 2 + e.r * 2.5,
              height: 2 + e.r * 2.5,
              animationDuration: `${6 + e.y * 0.06}s`,
              animationDelay: `${-e.y * 0.12}s`,
              '--dx': `${(e.r - 0.5) * 80}px`,
            } as CSSProperties}
          />
        ))}
      </div>
      <InAnchor name="page-end">
        <Obsidian />
      </InAnchor>
      {burst && (
        <div key={burst.n} className="pack-front">
          <div
            className="inf-flash"
            style={{ background: `radial-gradient(circle at ${burst.x + burst.w / 2}px ${burst.y + burst.h * 0.45}px, rgba(255, 177, 59, 0.45), transparent ${Math.max(burst.w, 200) * 0.75}px)` }}
          />
          {Array.from({ length: TONGUES }, (_, i) => (
            <svg
              key={i}
              className="inf-tongue"
              viewBox="0 0 24 48"
              preserveAspectRatio="none"
              style={{
                left: burst.x + (burst.w / TONGUES) * (i + 0.5) - tongueW / 2,
                top: burst.y + burst.h - tongueW * 2,
                width: tongueW,
                height: tongueW * 2,
                animationDelay: `${(i % 3) * 90}ms`,
              }}
            >
              <path d={TONGUE} fill="url(#inferno-tongue)" />
            </svg>
          ))}
          {SPARKS.map((s, i) => (
            <i
              key={i}
              className="inf-spark"
              style={{
                left: burst.x + s.x * burst.w * 0.01,
                top: burst.y + burst.h - 10,
                width: 2 + s.r * 3,
                height: 2 + s.r * 3,
                animationDuration: `${0.9 + s.y * 0.006}s`,
                '--dx': `${(s.y - 50) * 1}px`,
                '--dy': `${-(120 + s.r * 200)}px`,
              } as CSSProperties}
            />
          ))}
        </div>
      )}
    </>
  );
}
