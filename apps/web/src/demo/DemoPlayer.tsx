import { useEffect, useRef, useState, type ReactNode } from 'react';
import './demo.css';

// Targets are indices the render marks with data-demo (or data-i, which the boards already
// carry). A gesture writes `to` into its targets: a tap on release, a hold once the press has
// lasted, a swipe point by point as the finger passes. `set` replaces that with explicit
// [index, value] writes (per point for a swipe), for states that are not one value per target.
// `quick` shortens the moves for a run of plain taps; `ms` sets a swipe's time per segment, and
// `hold` holds its first point before the finger moves on.
type Writes = [number, number][];
export type DemoGesture =
  | { tap: number; to?: number; set?: Writes; quick?: boolean }
  | { hold: number; to?: number; set?: Writes }
  | { swipe: number[]; to?: number; set?: Writes[]; ms?: number; hold?: boolean };

function writesAt(g: DemoGesture, k = 0): Writes {
  if ('swipe' in g) return g.set ? (g.set[k] ?? []) : g.to === undefined ? [] : [[g.swipe[k]!, g.to]];
  const target = 'tap' in g ? g.tap : g.hold;
  return g.set ?? (g.to === undefined ? [] : [[target, g.to]]);
}

export interface DemoStep {
  say: string;
  hl?: number[];
  do?: DemoGesture[];
  wait?: number;
}

export interface DemoScript {
  start: number[];
  steps: DemoStep[];
}

interface Finger {
  x: number;
  y: number;
  ms: number;
  down: boolean;
  hold: boolean;
}

const MOVE_MS = 420;
const QUICK_MS = 240;
const SWIPE_MS = 200;
const HOLD_MS = 650;
const DWELL_MS = 1500;
const LOOP_MS = 2600;
const TICK_MS = 40;

// The board as it stands before step `upTo`, or after the last step without it.
export function finalState(script: DemoScript, upTo = script.steps.length): number[] {
  const state = [...script.start];
  for (const step of script.steps.slice(0, upTo)) {
    for (const g of step.do ?? []) {
      const points = 'swipe' in g ? g.swipe.length : 1;
      for (let k = 0; k < points; k++) for (const [i, v] of writesAt(g, k)) state[i] = v;
    }
  }
  return state;
}

function reducedMotion(): boolean {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

class Stop extends Error {}

export function DemoPlayer({ script, render }: { script: DemoScript; render(state: number[], highlight: number[] | undefined): ReactNode }) {
  const still = useRef(reducedMotion()).current;
  const [state, setState] = useState(() => (still ? finalState(script) : [...script.start]));
  const [step, setStep] = useState(0);
  const [finger, setFinger] = useState<Finger | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const jump = useRef<number | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (still) return;
    let alive = true;
    // Waits `ms` of unpaused time; a jump or unmount breaks out of the step being played.
    const sleep = async (ms: number) => {
      let left = ms;
      let last = performance.now();
      while (left > 0) {
        await new Promise((r) => setTimeout(r, Math.min(TICK_MS, left)));
        if (!alive || jump.current !== null) throw new Stop();
        const now = performance.now();
        if (!pausedRef.current) left -= now - last;
        last = now;
      }
    };
    let current = [...script.start];
    const write = (writes: Writes) => {
      if (!writes.length) return;
      current = [...current];
      for (const [i, v] of writes) current[i] = v;
      setState(current);
    };
    const at = (i: number) => {
      const root = stage.current;
      const cell = root?.querySelector<HTMLElement>(`[data-demo="${i}"]`) ?? root?.querySelector<HTMLElement>(`[data-i="${i}"]`);
      if (!root || !cell) return { x: 0, y: 0 };
      const a = root.getBoundingClientRect();
      const b = cell.getBoundingClientRect();
      return { x: b.left - a.left + b.width / 2, y: b.top - a.top + b.height / 2 };
    };
    const moveTo = async (i: number, ms: number, down = false) => {
      setFinger((f) => ({ ...at(i), ms: f ? ms : 0, down, hold: false }));
      await sleep(ms);
    };

    async function playFrom(from: number) {
      current = finalState(script, from);
      setState(current);
      for (let s = from; s < script.steps.length; s++) {
        const st = script.steps[s]!;
        setStep(s);
        await sleep(500);
        for (const g of st.do ?? []) {
          if ('swipe' in g) {
            await moveTo(g.swipe[0]!, MOVE_MS);
            setFinger((f) => f && { ...f, down: true, hold: Boolean(g.hold) });
            await sleep(g.hold ? HOLD_MS : 160);
            for (let k = 0; k < g.swipe.length; k++) {
              if (k > 0) await moveTo(g.swipe[k]!, g.ms ?? SWIPE_MS, true);
              write(writesAt(g, k));
            }
            await sleep(160);
            setFinger((f) => f && { ...f, down: false });
            await sleep(450);
          } else if ('tap' in g) {
            await moveTo(g.tap, g.quick ? QUICK_MS : MOVE_MS);
            setFinger((f) => f && { ...f, down: true });
            await sleep(140);
            write(writesAt(g));
            setFinger((f) => f && { ...f, down: false });
            await sleep(g.quick ? 120 : 450);
          } else {
            await moveTo(g.hold, MOVE_MS);
            setFinger((f) => f && { ...f, down: true, hold: true });
            await sleep(HOLD_MS);
            write(writesAt(g));
            await sleep(250);
            setFinger((f) => f && { ...f, down: false, hold: false });
            await sleep(450);
          }
        }
        await sleep(st.wait ?? DWELL_MS);
      }
      setFinger(null);
      await sleep(LOOP_MS);
    }

    async function run() {
      let from = 0;
      while (alive) {
        try {
          await playFrom(from);
          from = 0;
        } catch (e) {
          if (!(e instanceof Stop) || !alive) return;
          from = jump.current ?? 0;
          jump.current = null;
          setFinger(null);
        }
      }
    }
    void run();
    return () => {
      alive = false;
    };
  }, [script, still]);

  const togglePause = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  };

  const goTo = (s: number) => {
    jump.current = s;
    pausedRef.current = false;
    setPaused(false);
  };

  // Screen readers and reduced motion get the captions as a list; the animation adds nothing
  // for them.
  const captions = (
    <ol className={still ? 'demo-list' : 'sr-only'}>
      {script.steps.map((s) => (
        <li key={s.say}>{s.say}</li>
      ))}
    </ol>
  );

  if (still) {
    return (
      <div className="demo">
        <div className="demo-stage" aria-hidden="true">
          {render(state, undefined)}
        </div>
        {captions}
      </div>
    );
  }

  const current = script.steps[step]!;
  return (
    <div className="demo">
      <div className={paused ? 'demo-stage paused' : 'demo-stage'} ref={stage} onClick={togglePause} aria-hidden="true">
        {render(state, current.hl)}
        {finger && <span className={['demo-finger', finger.down && 'down', finger.hold && 'hold'].filter(Boolean).join(' ')} style={{ transform: `translate(${finger.x}px, ${finger.y}px)`, transitionDuration: `${finger.ms}ms` }} />}
        {paused && <span className="demo-paused" />}
      </div>
      <p className="demo-say" key={step} aria-hidden="true">
        {current.say}
      </p>
      <div className="demo-dots" aria-hidden="true">
        {script.steps.map((s, k) => (
          <button type="button" key={s.say} className={k === step ? 'on' : undefined} onClick={() => goTo(k)} tabIndex={-1} />
        ))}
      </div>
      {captions}
    </div>
  );
}
