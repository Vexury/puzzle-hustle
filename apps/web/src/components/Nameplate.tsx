import type { ReactNode } from 'react';
import { findCosmetic, type NameplateCosmetic } from '@puzzle-hustle/core';
import { LOGO_PATH } from '../lib/logo.ts';
import './nameplates.css';

// Every plate draws its art at a fixed 68 px height against the right edge, so the same plate
// reads the same in a standings row, the shop and the profile banner; wider plates show more of
// it on the left, taller ones more of the plate's own background.

const f = (n: number) => +n.toFixed(2);
const circle = (x: number, y: number, r: number) => `M${f(x - r)} ${y}a${r} ${r} 0 1 0 ${f(2 * r)} 0a${r} ${r} 0 1 0 ${f(-2 * r)} 0Z`;
const MOON = 'M20 14.5A8.5 8.5 0 1 1 9.5 4 7 7 0 0 0 20 14.5Z';

// `view` is the drawing's own size when it is scaled, as the pixel art is at two screen pixels each.
function Art({ width, view, className = '', children }: { width: number; view?: [number, number]; className?: string; children: ReactNode }) {
  const [vw, vh] = view ?? [width, 68];
  return (
    <svg className={`np-art ${className}`} viewBox={`0 0 ${vw} ${vh}`} style={{ width }} aria-hidden="true">
      {children}
    </svg>
  );
}

const STARS_A = [[300, 14, 1.4], [340, 24, 1.1], [380, 10, 1.2], [452, 56, 1.3], [318, 50, 1], [262, 22, 1]].map(([x, y, r]) => circle(x!, y!, r!)).join('');
const STARS_B = [[362, 52, 1], [396, 36, 1.5], [452, 9, 1], [286, 36, 1], [236, 50, 1.2]].map(([x, y, r]) => circle(x!, y!, r!)).join('');

const MOSAIC = (() => {
  const out = ['', '', '', '', ''];
  for (let i = 0; i < 8; i++) {
    const x = 262 + 26 * i;
    const tris = [
      `M${x} 34L${x + 13} 0L${x + 26} 34Z`,
      `M${x + 13} 0L${x + 39} 0L${x + 26} 34Z`,
      `M${x} 34L${x + 26} 34L${x + 13} 68Z`,
      `M${x + 13} 68L${x + 26} 34L${x + 39} 68Z`,
    ];
    tris.forEach((t, k) => {
      if (i < 2 && (k + i) % 2 === 0) return;
      out[(i * 7 + k * 3) % 5] += t;
    });
  }
  return out;
})();
const MOSAIC_FILLS = ['#1fb39f', '#2fd0b8', '#7ee6d6', '#0f6e63', '#169c8a'];

// Same geometry as TracksBoard: 22 px cells, rails at 0.5 +- GAUGE, three sleepers a cell, curves
// as quarter circles round the shared corner. The route is the centreline the train rides.
const TRACKS = (() => {
  const S = 22, Y0 = 1, GAUGE = 0.17, SLEEPER = 0.25, LEAD = 40;
  const N = 1, E = 2, SO = 4, W = 8;
  const cells: Array<[number, number]> = [[0, 2], [1, 2], [2, 2], [2, 1], [2, 0], [3, 0], [4, 0], [4, 1], [4, 2], [5, 2], [6, 2], [6, 1], [7, 1], [8, 1], [9, 1]];
  const px = (x: number, y: number) => `${f(x * S)} ${f(y * S + Y0)}`;
  const toward = (a: [number, number], b: [number, number]) => (b[0] < a[0] ? W : b[0] > a[0] ? E : b[1] < a[1] ? N : SO);
  const edge = (c: number, r: number, d: number): [number, number] => (d === N ? [c + 0.5, r] : d === E ? [c + 1, r + 0.5] : d === SO ? [c + 0.5, r + 1] : [c, r + 0.5]);
  const thirds = [1 / 6, 1 / 2, 5 / 6];
  let rails = '', sleepers = '', route = `M${-LEAD} ${f(2.5 * S + Y0)}L0 ${f(2.5 * S + Y0)}`, length = LEAD;
  cells.forEach((cell, i) => {
    const [c, r] = cell;
    const inDir = i === 0 ? W : toward(cell, cells[i - 1]!);
    const outDir = i === cells.length - 1 ? E : toward(cell, cells[i + 1]!);
    const mask = inDir | outDir;
    const [x2, y2] = edge(c, r, outDir);
    if (mask === (E | W) || mask === (N | SO)) {
      const across = mask === (E | W);
      for (const o of [-GAUGE, GAUGE]) rails += across ? `M${px(c, r + 0.5 + o)}L${px(c + 1, r + 0.5 + o)}` : `M${px(c + 0.5 + o, r)}L${px(c + 0.5 + o, r + 1)}`;
      for (const t of thirds) sleepers += across ? `M${px(c + t, r + 0.5 - SLEEPER)}L${px(c + t, r + 0.5 + SLEEPER)}` : `M${px(c + 0.5 - SLEEPER, r + t)}L${px(c + 0.5 + SLEEPER, r + t)}`;
      route += `L${px(x2, y2)}`;
      length += S;
      return;
    }
    const [x1, y1] = edge(c, r, inDir);
    const ox = mask & E ? c + 1 : c;
    const oy = mask & N ? r : r + 1;
    const a1 = Math.atan2(y1 - oy, x1 - ox);
    let sweep = Math.atan2(y2 - oy, x2 - ox) - a1;
    if (sweep > Math.PI) sweep -= 2 * Math.PI;
    if (sweep < -Math.PI) sweep += 2 * Math.PI;
    const flag = sweep > 0 ? 1 : 0;
    const at = (rad: number, a: number) => px(ox + rad * Math.cos(a), oy + rad * Math.sin(a));
    for (const rad of [0.5 - GAUGE, 0.5 + GAUGE]) rails += `M${at(rad, a1)}A${f(rad * S)} ${f(rad * S)} 0 0 ${flag} ${at(rad, a1 + sweep)}`;
    for (const t of thirds) sleepers += `M${at(0.5 - SLEEPER, a1 + sweep * t)}L${at(0.5 + SLEEPER, a1 + sweep * t)}`;
    route += `A${S / 2} ${S / 2} 0 0 ${flag} ${px(x2, y2)}`;
    length += (Math.PI / 4) * S;
  });
  route += `L${10 * S + LEAD} ${f(1.5 * S + Y0)}`;
  length += LEAD;
  // The ride takes the first half of the 7 s loop (see .np-car); each wagon trails by 16 px.
  const lag = (k: number) => `${f(((k * 16) / length) * 3.5)}s`;
  return { rails, sleepers, route: `path('${route}')`, lags: [lag(0), lag(1), lag(2)] };
})();

// Guilloche: sine lines under a slow cosine envelope, each a little out of phase with the last.
function threads(phase: number, count: number): string {
  let d = '';
  for (let k = 0; k < count; k++) {
    const p = phase + k * 0.55;
    for (let x = 0; x <= 460; x += 4) d += `${x === 0 ? 'M' : 'L'}${x} ${f(34 + 24 * Math.sin(x / 19 + p) * Math.cos(x / 61 - p * 0.5))}`;
  }
  return d;
}
const THREADS = [threads(0, 3), threads(1.65, 3), threads(3.3, 3)];

// Pixel art in the Cat Café style (near-black outline, flat fills), one path per colour key.
function pixels(art: string[], ox: number, oy: number, out: Record<string, string> = {}): Record<string, string> {
  art.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== ' ') out[ch] = `${out[ch] ?? ''}M${ox + x} ${oy + y}h1v1h-1Z`;
    }),
  );
  return out;
}
// The cup and steam match packs/cat-cafe/Pixels.tsx.
const CUP = pixels(['  11111111    ', ' 1kkckkckk1   ', ' 1wwwwwwws1111', ' 1wwwwwwws1  1', ' 1wwwwwwws1  1', ' 1wwwwwwws1111', '  1wwwwws1    ', '111111111111  ', '1dddddddddd1  ', ' 1111111111   '], 10, 20);
const CUP_FILLS: Record<string, string> = { '1': '#120e14', k: '#c48c58', c: '#6b3f22', w: '#f8f2ea', s: '#d6c8ba', d: '#e9ded0' };
const STEAM = [' m ', 'm  ', ' m ', '  m', ' m '];
const STEAM_A = pixels(STEAM, 13, 14).m!;
const STEAM_B = pixels(STEAM, 17, 14).m!;
const CAT = pixels(
  [
    '  1    1            ',
    ' 1o1  1o1           ',
    ' 1oo11oo1111111     ',
    '1oooooooooooooo11   ',
    '1o11oo11oodooodoo1  ',
    '1ooopooooooodoooodo1',
    '1wwooooooooooooooo1 ',
    ' 1wwooooooooooooo1  ',
    '  1111111111111111  ',
  ],
  30,
  21,
);
const CAT_FILLS: Record<string, string> = { '1': '#120e14', o: '#e09a52', d: '#b8692e', w: '#f8f2ea', p: '#e88a8a' };
// Paw prints over the whole plate from a fixed seed, so every player sees the same pattern; kept
// off the cup and the cat (109..123 and 129..149 in plate pixels) and off each other.
const PAWS = (() => {
  const paw = [' 1 1 ', '1   1', ' 111 ', ' 111 '];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const placed: Array<[number, number]> = [];
  const free = (x: number, y: number) =>
    !(y > 12 && ((x > 104 && x < 125) || (x > 125 && x < 151))) && placed.every(([px, py]) => Math.abs(px - x) > 7 || Math.abs(py - y) > 6);
  for (let tries = 0; placed.length < 22 && tries < 600; tries++) {
    const x = Math.floor(rnd() * 203);
    const y = Math.floor(rnd() * 30);
    if (free(x, y)) placed.push([x, y]);
  }
  const out: Record<string, string> = {};
  for (const [x, y] of placed) pixels(paw, x, y, out);
  return out['1']!;
})();

function LogoPiece({ x, y, rotate, scale, faint }: { x: number; y: number; rotate: number; scale: number; faint?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`} opacity={faint ? 0.8 : 1}>
      <path d={LOGO_PATH} transform="translate(-4 -4)" fill="#fff1b8" opacity={0.35} />
      <path d={LOGO_PATH} transform="translate(4 4)" fill="#000" opacity={0.55} />
      <path d={LOGO_PATH} fill="url(#np-gold-fill)" />
    </g>
  );
}

const DIGITS: Array<[number, number, string, number?]> = [
  [1, 2, '4', 0.3], [2, 1, '6', 0.4], [3, 0, '8', 0.5], [4, 3, '2', 0.6], [5, 1, '5', 0.7], [6, 2, '1', 0.8], [6, 3, '9', 0.8],
  [7, 0, '3'], [7, 3, '6'], [9, 0, '2'], [9, 2, '7'], [10, 1, '4'], [10, 3, '5'], [11, 0, '1'], [11, 2, '8'],
];

function PlateArt({ id }: { id: string }): ReactNode {
  switch (id) {
    case 'plate-paper':
      return (
        <Art width={204} className="np-digits">
          {DIGITS.map(([c, r, d, o]) => (
            <text key={`${c}-${r}`} x={8.5 + 17 * c} y={8.5 + 17 * r} opacity={o}>
              {d}
            </text>
          ))}
          <text x={144.5} y={25.5} className="np-digit-hot">
            9
          </text>
        </Art>
      );
    case 'plate-zip':
      return (
        <Art width={440}>
          <path className="np-draw" d="M300 48H336V20H376V48H416V20H448" fill="none" stroke="#4f9cf7" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
          <circle cx={300} cy={48} r={10} fill="#2f74d0" />
          <circle cx={448} cy={20} r={10} fill="#2f74d0" />
          <text x={300} y={52} className="np-zip-num">1</text>
          <text x={448} y={24} className="np-zip-num">2</text>
        </Art>
      );
    case 'plate-pixel':
      return (
        <Art width={204}>
          <path d="M127.5 8.5h17v8.5h-17ZM153 8.5h17v8.5h-17ZM119 17h59.5v17h-59.5ZM127.5 34h42.5v8.5h-42.5ZM136 42.5h25.5v8.5h-25.5ZM144.5 51h8.5v8.5h-8.5Z" fill="#8a66f5" />
          <path d="M76.5 17h8.5v8.5h-8.5ZM93.5 42.5h8.5v8.5h-8.5ZM51 34h8.5v8.5h-8.5ZM102 0h8.5v8.5h-8.5ZM195.5 59.5h8.5v8.5h-8.5ZM187 8.5h8.5v8.5h-8.5ZM34 51h8.5v8.5h-8.5ZM85 59.5h8.5v8.5h-8.5ZM195.5 25.5h8.5v8.5h-8.5Z" fill="#b9a3ff" />
        </Art>
      );
    case 'plate-sakura':
      return (
        <>
          {[60, 70, 79, 88, 96].map((left, i) => (
            <span key={left} className="np-petal" style={{ left: `${left}%`, animationDelay: `${-[1, 3.2, 5, 2.1, 4.1][i]!}s` }} />
          ))}
        </>
      );
    case 'plate-cat-nap':
      return (
        <>
          <Art width={418} view={[209, 34]} className="np-pixels">
            <path d={PAWS} fill="#dccab4" />
          </Art>
          <Art width={220} view={[110, 34]} className="np-pixels">
            <path d="M8 30h76v2H8Z" fill="#8a5a34" />
            <path d="M8 32h76v1H8Z" fill="#5e3a1f" />
            <path className="np-steam" d={STEAM_A} fill="#fffaf4" />
            <path className="np-steam np-late" d={STEAM_B} fill="#fffaf4" />
            {Object.entries(CUP).map(([k, d]) => (
              <path key={k} d={d} fill={CUP_FILLS[k]} />
            ))}
            <g className="np-breathe">
              {Object.entries(CAT).map(([k, d]) => (
                <path key={k} d={d} fill={CAT_FILLS[k]} />
              ))}
            </g>
            <text className="np-zz" x={36} y={17}>z</text>
            <text className="np-zz np-late" x={36} y={17}>z</text>
          </Art>
        </>
      );
    case 'plate-midnight':
      return (
        <Art width={440}>
          <path className="np-twinkle" d={STARS_A} fill="#fff" />
          <path className="np-twinkle np-late" d={STARS_B} fill="#fff" />
          <path d={MOON} transform="translate(345 12) scale(1.8)" fill="#ffe7a3" />
        </Art>
      );
    case 'plate-terminal':
      return (
        <Art width={440} className="np-term">
          <text x={250} y={28} opacity={0.22}>
            &gt; solve --genius
          </text>
          <text x={250} y={46} opacity={0.14}>
            ok  0 hints  00:52
          </text>
          <rect className="np-cursor" x={378} y={18} width={7} height={13} fill="#7dff9a" opacity={0.5} />
        </Art>
      );
    case 'plate-tracks':
      return (
        <>
          <Art width={220} className="np-fade">
            <path d={TRACKS.sleepers} fill="none" stroke="#3f6b47" strokeWidth={1.7} opacity={0.45} />
            <path d={TRACKS.rails} fill="none" stroke="#3f6b47" strokeWidth={1.5} />
          </Art>
          <div className="np-train np-fade">
            {['np-wagon', 'np-wagon', 'np-loco'].map((car, i) => (
              <span key={i} className={`np-car ${car}`} style={{ offsetPath: TRACKS.route, animationDelay: TRACKS.lags[2 - i] }} />
            ))}
          </div>
        </>
      );
    case 'plate-mosaic':
      return (
        <Art width={440}>
          {MOSAIC.map((d, i) => (
            <path key={i} d={d} fill={MOSAIC_FILLS[i]} />
          ))}
        </Art>
      );
    case 'plate-weaver':
      return (
        <Art width={418} className="np-fade-wide">
          <g className="np-drift">
            <path d={THREADS[0]} fill="none" stroke="#2f8f8a" strokeWidth={1.1} opacity={0.75} />
            <path d={THREADS[2]} fill="none" stroke="#d9a531" strokeWidth={1.1} opacity={0.8} />
          </g>
          <g className="np-drift np-reverse">
            <path d={THREADS[1]} fill="none" stroke="#e2674f" strokeWidth={1.1} opacity={0.75} />
          </g>
        </Art>
      );
    case 'plate-synthwave':
      return (
        <Art width={200}>
          <defs>
            <linearGradient id="np-sun-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffc93d" />
              <stop offset="0.55" stopColor="#ff8a3d" />
              <stop offset="1" stopColor="#ff3d6e" />
            </linearGradient>
            <clipPath id="np-sun-bands">
              {[[0, 36], [38.5, 4], [45, 3.2], [50.5, 2.6], [55.4, 2], [59.6, 1.6], [63.2, 1.3]].map(([y, h]) => (
                <rect key={y} x={70} y={y} width={80} height={h} />
              ))}
            </clipPath>
          </defs>
          <circle cx={110} cy={38} r={30} fill="url(#np-sun-fill)" clipPath="url(#np-sun-bands)" />
          <path d="M184 8l1.2 3.3 3.3 1.2-3.3 1.2-1.2 3.3-1.2-3.3-3.3-1.2 3.3-1.2Z" fill="#c9a6ff" opacity={0.8} />
          <path d="M14 68 54 30V68Z" fill="#d55aa8" />
          <path d="M54 30 94 68H54Z" fill="#2a1240" />
          <path d="M128 68 168 28V68Z" fill="#d55aa8" />
          <path d="M168 28 208 68H168Z" fill="#2a1240" />
          <path d="M38 68 64 46V68Z" fill="#8a4fc0" />
          <path d="M64 46 90 68H64Z" fill="#1d0c33" />
          <path d="M132 68 158 47V68Z" fill="#8a4fc0" />
          <path d="M158 47 184 68H158Z" fill="#1d0c33" />
          <path d="M72 68 110 34V68Z" fill="#3b2a8f" />
          <path d="M110 34 148 68H110Z" fill="#170a2c" />
        </Art>
      );
    case 'plate-gold':
      return (
        <>
          <span className="np-foil" />
          <Art width={260}>
            <defs>
              <linearGradient id="np-gold-fill" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#fff1b8" />
                <stop offset="0.5" stopColor="#e2a93c" />
                <stop offset="1" stopColor="#8f5f17" />
              </linearGradient>
            </defs>
            <LogoPiece x={34} y={12} rotate={-12} scale={0.28} faint />
            <LogoPiece x={100} y={10} rotate={0} scale={0.3} />
            <LogoPiece x={164} y={26} rotate={10} scale={0.26} faint />
          </Art>
        </>
      );
    default:
      return null;
  }
}

export function findNameplate(id: string | null | undefined): NameplateCosmetic | undefined {
  const item = findCosmetic(id);
  return item?.kind === 'nameplate' ? item : undefined;
}

// The classes a plate's host element needs; empty for no plate or an id from a newer client.
export function plateClass(id: string | null | undefined): string {
  const plate = findNameplate(id);
  return plate ? ` np np-${plate.id.slice('plate-'.length)}${plate.dark ? ' np-dark' : ''}` : '';
}

// Goes first inside the host element; the host carries plateClass().
export function NameplateArt({ id }: { id: string | null | undefined }) {
  const plate = findNameplate(id);
  return plate ? <PlateArt id={plate.id} /> : null;
}
