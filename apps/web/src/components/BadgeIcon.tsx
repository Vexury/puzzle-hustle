import type { CSSProperties, ReactNode } from 'react';

const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

const stroke = { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;

function snowflake(): string {
  const f = (n: number) => n.toFixed(2);
  let d = '';
  for (let k = 0; k < 6; k++) {
    const a = ((k * 60 - 90) * Math.PI) / 180;
    const [ux, uy, px, py] = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a)];
    const at = (r: number, s: number) => `${f(12 + ux * r + px * s)} ${f(12 + uy * r + py * s)}`;
    d += `M12 12L${at(10, 0)}M${at(8.5, -2.6)}L${at(6, 0)}L${at(8.5, 2.6)}`;
  }
  return d;
}

// Own shapes rather than emoji, which differ between Android, iOS and Windows and would show
// one badge three ways in the same group. Single colour, so they follow theme and accent.
// Overlapping parts sit in separate elements: in one nonzero path, subpaths of opposite winding
// cancel and leave a hole where they overlap.
const SHAPES: Record<string, ReactNode> = {
  bolt: <path d="M13 2 4 14h7l-1 8 10-13h-7z" />,
  leaf: <path d="M4 20C4 10 10 4 20 4c0 10-6 16-16 16Z" />,
  cat: <path d="M4 4l5 5h6l5-5v12a8 6 0 0 1-16 0Z" />,
  moon: <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 7 7 0 0 0 20 14.5Z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4.5" />
      <path
        d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </>
  ),
  ghost: <path d="M5 21V11a7 7 0 0 1 14 0v10l-2.5-2-2.5 2-2-2-2 2-2.5-2Z" />,
  rocket: (
    <>
      <path fillRule="evenodd" d={`M12 2c3.5 2.5 5 6.5 5 11v3.5H7V13c0-4.5 1.5-8.5 5-11Z${circle(12, 9, 1.8)}`} />
      <path d="M7 11.5 3.5 15v5L7 17.5ZM17 11.5 20.5 15v5L17 17.5ZM9.5 17.5h5L13.5 21h-3Z" />
    </>
  ),
  diamond: <path d="M6 3h12l4 6-10 12L2 9Z" />,
  puzzle: <path d="M3 8h5.5a3 3 0 1 1 4 0H17v3.5a3 3 0 1 1 0 4V21H3Z" />,
  dice: (
    <path
      fillRule="evenodd"
      d={`M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z${circle(8, 8, 1.7)}${circle(16, 8, 1.7)}${circle(12, 12, 1.7)}${circle(8, 16, 1.7)}${circle(16, 16, 1.7)}`}
    />
  ),
  key: (
    <>
      <path fillRule="evenodd" d={`${circle(7, 12, 5)}${circle(7, 12, 2)}`} />
      <path d="M11 10.5h11v3h-1.5v3.5h-2.5v-3.5h-1v2.5h-2.5v-2.5H11Z" />
    </>
  ),
  hourglass: <path d="M5 2h14v2h-1c0 4-4 6-4 8s4 4 4 8h1v2H5v-2h1c0-4 4-6 4-8S6 8 6 4H5Z" />,
  bulb: (
    <>
      <path d="M8 14.7A7 7 0 1 1 16 14.7V17H8Z" />
      <path d="M8.5 18h7v1.5a2.5 2.5 0 0 1-2.5 2.5h-2a2.5 2.5 0 0 1-2.5-2.5Z" />
    </>
  ),
  compass: (
    <>
      <path fillRule="evenodd" d={`${circle(12, 12, 10)}${circle(12, 12, 7.8)}`} />
      <path d="M16.8 7.2 13.5 13.5 7.2 16.8 10.5 10.5Z" />
    </>
  ),
  mushroom: (
    <>
      <path fillRule="evenodd" d={`M2 12a10 9 0 0 1 20 0Z${circle(8, 8, 1.6)}${circle(15, 7, 2)}`} />
      <path d="M9 13h6v6a3 3 0 0 1-6 0Z" />
    </>
  ),
  cactus: <path d="M10 22V4a2 2 0 0 1 4 0v18ZM10 14H7a3 3 0 0 1-3-3V8a1.5 1.5 0 0 1 3 0v3h3ZM14 11h3V6a1.5 1.5 0 0 1 3 0v5a3 3 0 0 1-3 3h-3Z" />,
  snowflake: <path d={snowflake()} {...stroke} strokeWidth={1.8} />,
  wave: <path d="M2 9c2.5-2.5 5-2.5 7 0s5 2.5 7 0 4.5-2.5 6 0M2 16c2.5-2.5 5-2.5 7 0s5 2.5 7 0 4.5-2.5 6 0" {...stroke} strokeWidth={2.4} />,
  clover: (
    <>
      {[0, 90, 180, 270].map((r) => (
        <g key={r} transform={`rotate(${r} 12 12)`}>
          <circle cx="9.8" cy="5.4" r="2.7" />
          <circle cx="14.2" cy="5.4" r="2.7" />
          <path d="M7.2 6.3 12 12.5 16.8 6.3 12 4.5Z" />
        </g>
      ))}
    </>
  ),
  bean: (
    <path
      transform="rotate(35 12 12)"
      fillRule="evenodd"
      d="M5.5 12a6.5 9 0 1 0 13 0a6.5 9 0 1 0-13 0ZM11.3 3.8C8.8 8.2 13.8 15.8 11.3 20.2h1.4C15.2 15.8 10.2 8.2 12.7 3.8Z"
    />
  ),
  fox: <path fillRule="evenodd" d={`M2 3l6 5h8l6-5-2 8 3 2-11 9L1 13l3-2Z${circle(8.5, 12, 1.2)}${circle(15.5, 12, 1.2)}`} />,
  owl: (
    <path
      fillRule="evenodd"
      d={`M5 3l3 3h8l3-3v11a7 7 0 0 1-14 0Z${circle(9, 10.5, 2.8)}${circle(15, 10.5, 2.8)}${circle(9, 10.5, 1.1)}${circle(15, 10.5, 1.1)}M12 13.5l-1.2 1.8h2.4Z`}
    />
  ),
  fish: <path fillRule="evenodd" d={`M1.5 12c3-4.5 7-6.5 11-6.5 3.5 0 6 2 7.5 4.5L23 7v10l-3-3c-1.5 2.5-4 4.5-7.5 4.5-4 0-8-2-11-6.5Z${circle(6, 11, 1.4)}`} />,
  bird: <path fillRule="evenodd" d={`M1.5 13.5 7 15c1-5 4-8 8-8 2 0 3.5 1 4 2.5l3.5 1.5-3.5 1C19 18 14 21 9 21c-3 0-5-2-5.5-4.5Z${circle(15.5, 10, 1.1)}M8 16c2-3 5-4.5 8.5-3.5-1 3.5-4.5 5.5-8.5 3.5Z`} />,
  frog: (
    <>
      <path d="M3.5 10c0-2 2-4 8.5-4s8.5 2 8.5 4c1.5 2 1.5 6-.5 8-2 2-5 3-8 3s-6-1-8-3c-2-2-2-6-.5-8Z" />
      <path fillRule="evenodd" d={`${circle(7, 6, 3.5)}${circle(7, 5.3, 1.3)}${circle(17, 6, 3.5)}${circle(17, 5.3, 1.3)}`} />
    </>
  ),
  umbrella: (
    <>
      <path d="M2 12a10 9 0 0 1 20 0q-1.67-1.5-3.33 0-1.67-1.5-3.34 0-1.66-1.5-3.33 0-1.67-1.5-3.33 0-1.67-1.5-3.34 0-1.66-1.5-3.33 0Z" />
      <path d="M12 11v8a2 2 0 0 1-4 0M12 3V1.8" {...stroke} />
    </>
  ),
  coffee: (
    <>
      <path d="M4 8h13v6a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6ZM17 9.5h1.5a3 3 0 0 1 0 6H17v-2h1.5a1 1 0 0 0 0-2H17Z" />
      <path d="M8 2.5c-1 1 1 2 0 3.5M12.5 2.5c-1 1 1 2 0 3.5" {...stroke} strokeWidth={1.6} />
    </>
  ),
  headphones: (
    <>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" {...stroke} strokeWidth={2.4} />
      <path d="M3 14h4v7H5a2 2 0 0 1-2-2ZM21 14h-4v7h2a2 2 0 0 0 2-2Z" />
    </>
  ),
  anchor: <path d={`M12 7v14M8 10h8M4 13a8 8 0 0 0 16 0${circle(12, 4.5, 2.3)}`} {...stroke} />,
  note: (
    <>
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
      <path d="M7.5 18V6.5H9V18ZM18.5 16V4H20v12ZM7.5 5 20 2.5v3L7.5 8Z" />
    </>
  ),
  planet: (
    <>
      <circle cx="12" cy="12" r="6" />
      <ellipse cx="12" cy="12" rx="10.5" ry="3.5" transform="rotate(-20 12 12)" {...stroke} strokeWidth={1.8} />
    </>
  ),
  'hustle-mountain': <path d="M2 20 9 7l3.5 5.5L15 9l7 11Z" />,
  'hustle-ladder': <path fillRule="evenodd" d="M6 2h2.5v3h7V2H18v20h-2.5v-3h-7v3H6Zm2.5 5.5v3h7v-3Zm0 5.5v3.5h7V13Z" />,
  'hustle-arrow': <path d="M12 2 19 10h-4.5v6.5c0 3-1.2 5.5-2.5 5.5s-2.5-2.5-2.5-5.5V10H5Z" />,
  'hustle-crown': <path d="M3 18 2 7l5.5 4.5L12 4l4.5 7.5L22 7l-1 11Zm0 2h18v2H3Z" />,
  'hustle-summit': (
    <>
      <path d="M2 21 10 8l4 6 2-3 6 10Z" />
      <path d="M10 8V2l5 2-5 2" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" fill="none" />
    </>
  ),
  paw: (
    <>
      <path d="M12 12c-3 0-6.5 3.5-6.5 6.3 0 1.8 1.4 2.7 3 2.7 1.3 0 2.2-.8 3.5-.8s2.2.8 3.5.8c1.6 0 3-.9 3-2.7 0-2.8-3.5-6.3-6.5-6.3Z" />
      <ellipse cx="4.8" cy="10.2" rx="2" ry="2.6" transform="rotate(-25 4.8 10.2)" />
      <ellipse cx="9.2" cy="5.6" rx="2.1" ry="2.8" transform="rotate(-8 9.2 5.6)" />
      <ellipse cx="14.8" cy="5.6" rx="2.1" ry="2.8" transform="rotate(8 14.8 5.6)" />
      <ellipse cx="19.2" cy="10.2" rx="2" ry="2.6" transform="rotate(25 19.2 10.2)" />
    </>
  ),
};

// The one short motion each badge makes when tapped in the shop.
const MOTIONS: Record<string, 'flicker' | 'wiggle' | 'hop' | 'spin'> = {
  bolt: 'flicker',
  leaf: 'wiggle', cat: 'wiggle', moon: 'wiggle', clover: 'wiggle', umbrella: 'wiggle', anchor: 'wiggle', note: 'wiggle',
  bean: 'wiggle', fox: 'wiggle', owl: 'wiggle', paw: 'wiggle', cactus: 'wiggle',
  ghost: 'hop', rocket: 'hop', frog: 'hop', bird: 'hop', fish: 'hop', dice: 'hop', mushroom: 'hop', coffee: 'hop',
  'hustle-mountain': 'hop', 'hustle-ladder': 'hop', 'hustle-arrow': 'flicker', 'hustle-crown': 'wiggle', 'hustle-summit': 'wiggle',
  sun: 'spin', compass: 'spin', snowflake: 'spin', planet: 'spin',
};

export function badgeMotion(id: string): string {
  return MOTIONS[id] ?? 'pulse';
}

// Every badge shines once every seven seconds. `wave` delays it by position, so the shine runs
// across the shop grid and down the board in order instead of flashing at random.
export function BadgeIcon({ id, className = 'badge-icon', wave = 0 }: { id: string; className?: string; wave?: number }) {
  const shape = SHAPES[id];
  if (!shape) return null;
  const svg = (cls: string) => (
    <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {shape}
    </svg>
  );
  return (
    <span className="badge-fx" style={{ '--wave': `${wave}s` } as CSSProperties}>
      {svg(className)}
      {svg(`${className} badge-shine`)}
    </span>
  );
}
