import { useEffect, useMemo, useRef, useState } from 'react';
import {
  TRACK_E,
  TRACK_N,
  TRACK_S,
  TRACK_W,
  TRACKS_STATE_E,
  TRACKS_STATE_S,
  TRACKS_STATE_T,
  TRACKS_STATE_X,
  isTracksSolved,
  tracksLineCounts,
  tracksMask,
  tracksWithoutMarks,
  type TracksSpec,
  type TracksState,
} from '@puzzle-hustle/core';
import { HintMark } from '../components/HintMark.tsx';
import * as sound from '../lib/sound.ts';
import { markVariant, usePackMark } from '../packs/marks.ts';
import './tracks.css';

export interface TracksBoardProps extends Omit<React.SVGProps<SVGSVGElement>, 'className' | 'viewBox'> {
  spec: TracksSpec;
  state: TracksState;
  mistakes: boolean;
  flash?: number | null;
  highlight?: readonly number[] | undefined;
  // A train runs the finished line from A to B: set only for a solve that just happened.
  celebrate?: boolean;
}

// Room around the grid: A's stub on the left, the column numbers on top, the row numbers on the
// right, B's stub below. In cell units, matching the viewBox.
export const PAD_L = 0.6;
export const PAD_T = 1;
export const PAD_R = 1;
export const PAD_B = 0.6;
// Same X as the other puzzles: two bars of --mark-length (76% of the cell) crossed at the centre.
const X_HALF = 0.76 / 2 / Math.SQRT2;

function edgePoint(c: number, r: number, dir: number): [number, number] {
  if (dir === TRACK_N) return [c + 0.5, r];
  if (dir === TRACK_E) return [c + 1, r + 0.5];
  if (dir === TRACK_S) return [c + 0.5, r + 1];
  return [c, r + 0.5];
}

// Half the distance between the two rails, and half a sleeper's length.
const GAUGE = 0.17;
const SLEEPER = 0.25;
// The A and B stubs keep the board's rhythm: sleepers 1/6 and 1/2 of a cell past the rim.
const STUB_SLEEPERS_A = [1 / 6 / PAD_L, 1 / 2 / PAD_L];
const STUB_SLEEPERS_B = [1 / 6 / PAD_B, 1 / 2 / PAD_B];

interface Track {
  rails: string;
  sleepers: string;
}

// Two rails from (x1, y1) to (x2, y2) with sleepers at the given fractions of the way.
function straightTrack(x1: number, y1: number, x2: number, y2: number, at: number[]): Track {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const nx = (-(y2 - y1) / len) * GAUGE;
  const ny = ((x2 - x1) / len) * GAUGE;
  const rails = `M${x1 + nx} ${y1 + ny}L${x2 + nx} ${y2 + ny}M${x1 - nx} ${y1 - ny}L${x2 - nx} ${y2 - ny}`;
  const k = SLEEPER / GAUGE;
  const sleepers = at
    .map((t) => {
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      return `M${x + nx * k} ${y + ny * k}L${x - nx * k} ${y - ny * k}`;
    })
    .join('');
  return { rails, sleepers };
}

// Straight pieces run edge to edge, curves are a quarter circle around the corner the two edges
// share, a dangling end runs from the centre to its edge. Sleepers every third of a cell.
function pieceTrack(c: number, r: number, mask: number): Track {
  const dirs = [TRACK_N, TRACK_E, TRACK_S, TRACK_W].filter((d) => mask & d);
  const cx = c + 0.5;
  const cy = r + 0.5;
  if (dirs.length === 1) {
    const [x, y] = edgePoint(c, r, dirs[0]!);
    return straightTrack(cx, cy, x, y, [0, 2 / 3]);
  }
  const [x1, y1] = edgePoint(c, r, dirs[0]!);
  const [x2, y2] = edgePoint(c, r, dirs[1]!);
  if ((mask & (TRACK_N | TRACK_S)) === (TRACK_N | TRACK_S) || (mask & (TRACK_E | TRACK_W)) === (TRACK_E | TRACK_W)) {
    return straightTrack(x1, y1, x2, y2, [1 / 6, 1 / 2, 5 / 6]);
  }
  const ox = mask & TRACK_E ? c + 1 : c;
  const oy = mask & TRACK_N ? r : r + 1;
  const a0 = Math.atan2(y1 - oy, x1 - ox);
  let sweep = Math.atan2(y2 - oy, x2 - ox) - a0;
  if (sweep > Math.PI) sweep -= 2 * Math.PI;
  if (sweep < -Math.PI) sweep += 2 * Math.PI;
  const flag = sweep > 0 ? 1 : 0;
  const at = (rad: number, a: number) => `${ox + rad * Math.cos(a)} ${oy + rad * Math.sin(a)}`;
  const rails = [0.5 - GAUGE, 0.5 + GAUGE].map((rad) => `M${at(rad, a0)}A${rad} ${rad} 0 0 ${flag} ${at(rad, a0 + sweep)}`).join('');
  const sleepers = [1 / 6, 1 / 2, 5 / 6].map((t) => `M${at(0.5 - SLEEPER, a0 + sweep * t)}L${at(0.5 + SLEEPER, a0 + sweep * t)}`).join('');
  return { rails, sleepers };
}

// The solved line as one path along the middle of the track: in from off the board past A,
// cell by cell (straight edge to edge, or the quarter circle round the shared corner that the
// pieces draw), out past B. Its length sets the train's speed.
const LEAD = 1.4;
function trainRoute(spec: TracksSpec): { d: string; length: number } {
  const { cols, rows } = spec.config;
  const cells = [...spec.path];
  const toward = (a: number, b: number) => (b === a - cols ? TRACK_N : b === a + 1 ? TRACK_E : b === a + cols ? TRACK_S : TRACK_W);
  let d = `L0 ${spec.entryRow + 0.5}`;
  let length = PAD_L + LEAD;
  cells.forEach((cell, i) => {
    const c = cell % cols;
    const r = Math.floor(cell / cols);
    const inDir = i === 0 ? TRACK_W : toward(cell, cells[i - 1]!);
    const outDir = i === cells.length - 1 ? TRACK_S : toward(cell, cells[i + 1]!);
    const mask = inDir | outDir;
    const [x2, y2] = edgePoint(c, r, outDir);
    if (mask === (TRACK_N | TRACK_S) || mask === (TRACK_E | TRACK_W)) {
      d += `L${x2} ${y2}`;
      length += 1;
      return;
    }
    const [x1, y1] = edgePoint(c, r, inDir);
    const ox = mask & TRACK_E ? c + 1 : c;
    const oy = mask & TRACK_N ? r : r + 1;
    let sweep = Math.atan2(y2 - oy, x2 - ox) - Math.atan2(y1 - oy, x1 - ox);
    if (sweep > Math.PI) sweep -= 2 * Math.PI;
    if (sweep < -Math.PI) sweep += 2 * Math.PI;
    d += `A0.5 0.5 0 0 ${sweep > 0 ? 1 : 0} ${x2} ${y2}`;
    length += Math.PI / 4;
  });
  d += `L${spec.exitCol + 0.5} ${rows + PAD_B + LEAD}`;
  return { d, length: length + PAD_B + LEAD };
}

// Cars seen from above, drawn around the origin facing +x; animateMotion turns them along the line.
const CARS = 3;
const CAR_GAP = 0.52;
function TracksTrain({ spec }: { spec: TracksSpec }) {
  const motions = useRef<(SVGElement | null)[]>([]);
  const { d, length } = useMemo(() => trainRoute(spec), [spec]);
  // At least five cells a second, and never longer than about six seconds on the big boards.
  const speed = Math.max(5, length / 6);
  const startX = -PAD_L - LEAD;
  const y = spec.entryRow + 0.5;
  // Started by hand: an animation added after the SVG loaded would otherwise count its begin
  // from the document's start and be over already. Chrome ignores a begin in the same frame the
  // element arrived in, so it waits a frame, and the cars stay hidden until then instead of
  // showing at (0, 0).
  const [running, setRunning] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      for (const m of motions.current) (m as SVGAnimationElement | null)?.beginElement?.();
      setRunning(true);
      sound.play('train', { duration: (length + (CARS - 1) * CAR_GAP) / speed });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <g className="tracks-train" aria-hidden="true" visibility={running ? 'visible' : 'hidden'}>
      {Array.from({ length: CARS }, (_, k) => {
        // Each car starts further back on the same line and takes longer by exactly that much,
        // so all run at one speed and keep their spacing.
        const back = k * CAR_GAP;
        return (
          <g key={k} className={k === 0 ? 'tracks-loco' : 'tracks-wagon'}>
            {k === 0 ? (
              <>
                <rect x={-0.24} y={-0.15} width={0.46} height={0.3} rx={0.07} />
                <rect className="tracks-cab" x={-0.24} y={-0.15} width={0.17} height={0.3} rx={0.05} />
                <circle className="tracks-chimney" cx={0.1} cy={0} r={0.06} />
              </>
            ) : (
              <rect x={-0.2} y={-0.14} width={0.4} height={0.28} rx={0.05} />
            )}
            <animateMotion
              ref={(el) => {
                motions.current[k] = el;
              }}
              begin="indefinite"
              dur={`${(length + back) / speed}s`}
              fill="freeze"
              rotate="auto"
              path={`M${startX - back} ${y}${d}`}
            />
          </g>
        );
      })}
    </g>
  );
}

function TrackShape({ track, className }: { track: Track; className: string }) {
  return (
    <g className={className}>
      <path className="tracks-sleepers" d={track.sleepers} />
      <path className="tracks-rails" d={track.rails} />
    </g>
  );
}

export function TracksBoard({ spec, state: played, mistakes, flash = null, highlight, celebrate = false, ...rest }: TracksBoardProps) {
  const { cols, rows } = spec.config;
  const solved = isTracksSolved(spec, played);
  const state = solved ? tracksWithoutMarks(played) : played;
  const packMark = usePackMark();

  // A cell is drawn in the given style when every direction of its track comes from a given
  // piece or the A/B stub; touched by any player-laid edge (its own E/S bit, or the neighbour's
  // matching S/E bit), it draws as a normal, player-laid piece instead.
  function hasPlayerEdge(i: number, c: number, r: number): boolean {
    if (state[i]! & (TRACKS_STATE_E | TRACKS_STATE_S)) return true;
    if (c > 0 && state[i - 1]! & TRACKS_STATE_E) return true;
    if (r > 0 && state[i - cols]! & TRACKS_STATE_S) return true;
    return false;
  }

  const counts = tracksLineCounts(spec, state);
  const cells: React.ReactNode[] = [];
  const pieces: React.ReactNode[] = [];
  const marks: React.ReactNode[] = [];
  const hl: React.ReactNode[] = [];
  for (let i = 0; i < cols * rows; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    cells.push(<rect key={i} className="tracks-cell" x={c} y={r} width={1} height={1} data-i={i} />);
    if (highlight?.includes(i)) hl.push(<rect key={`h${i}`} className="tracks-hl" x={c + 0.06} y={r + 0.06} width={0.88} height={0.88} rx={0.08} />);
    const m = tracksMask(spec, state, i);
    // A cell shows a piece only once its direction is known: given, drawn into by the player, or
    // closed by two given neighbours. A lone given edge (or A/B) stops at the cell's edge instead
    // of leaving a half piece that says "track here" without saying which way.
    const player = hasPlayerEdge(i, c, r);
    if (m && (player || spec.given[i] || (m & (m - 1)) !== 0)) {
      pieces.push(<TrackShape key={`p${i}`} className={player ? 'tracks-piece' : 'tracks-piece given'} track={pieceTrack(c, r, m)} />);
    }
    if (state[i]! & TRACKS_STATE_X) {
      marks.push(
        <g key={`x${i}`} className="tracks-cross">
          {packMark ? (
            <path d={markVariant(packMark, i)} transform={`translate(${c + 0.12} ${r + 0.12}) scale(${0.76 / 24})`} />
          ) : (
            <>
              <line x1={c + 0.5 - X_HALF} y1={r + 0.5 - X_HALF} x2={c + 0.5 + X_HALF} y2={r + 0.5 + X_HALF} />
              <line x1={c + 0.5 + X_HALF} y1={r + 0.5 - X_HALF} x2={c + 0.5 - X_HALF} y2={r + 0.5 + X_HALF} />
            </>
          )}
        </g>,
      );
    } else if (state[i]! & TRACKS_STATE_T) {
      const railTop = r + 0.32;
      const railBottom = r + 0.68;
      marks.push(
        <g key={`t${i}`} className="tracks-mark">
          <line x1={c + 0.13} y1={railTop} x2={c + 0.87} y2={railTop} />
          <line x1={c + 0.13} y1={railBottom} x2={c + 0.87} y2={railBottom} />
          <line x1={c + 0.26} y1={railTop - 0.08} x2={c + 0.26} y2={railBottom + 0.08} />
          <line x1={c + 0.5} y1={railTop - 0.08} x2={c + 0.5} y2={railBottom + 0.08} />
          <line x1={c + 0.74} y1={railTop - 0.08} x2={c + 0.74} y2={railBottom + 0.08} />
        </g>,
      );
    }
  }
  const lineClass = (have: number, want: number) => (have === want ? 'tracks-count done' : mistakes && have > want ? 'tracks-count over' : 'tracks-count');
  const entryY = spec.entryRow + 0.5;
  const exitX = spec.exitCol + 0.5;

  return (
    <div className={solved ? 'tracks-board board-frame solved' : 'tracks-board board-frame'}>
      <svg className="tracks-svg" viewBox={`${-PAD_L} ${-PAD_T} ${cols + PAD_L + PAD_R} ${rows + PAD_T + PAD_B}`} {...rest}>
        <g className="tracks-cells">{cells}</g>
        {hl}
        {flash !== null && <HintMark x={flash % cols} y={Math.floor(flash / cols)} />}
        <g className="tracks-marks">{marks}</g>
        <TrackShape className="tracks-piece given" track={straightTrack(0, entryY, -PAD_L, entryY, STUB_SLEEPERS_A)} />
        <TrackShape className="tracks-piece given" track={straightTrack(exitX, rows, exitX, rows + PAD_B, STUB_SLEEPERS_B)} />
        <g className="tracks-pieces">{pieces}</g>
        {solved && celebrate && <TracksTrain spec={spec} />}
        <text className="tracks-end" x={-PAD_L / 2} y={entryY - 0.5} dy="0.33em">
          A
        </text>
        <text className="tracks-end" x={exitX + 0.5} y={rows + PAD_B / 2} dy="0.33em">
          B
        </text>
        {[...spec.colCounts].map((want, c) => (
          <text key={`c${c}`} className={lineClass(counts.cols[c]!, want)} x={c + 0.5} y={-0.5} dy="0.33em">
            {want}
          </text>
        ))}
        {[...spec.rowCounts].map((want, r) => (
          <text key={`r${r}`} className={lineClass(counts.rows[r]!, want)} x={cols + 0.5} y={r + 0.5} dy="0.33em">
            {want}
          </text>
        ))}
      </svg>
    </div>
  );
}
