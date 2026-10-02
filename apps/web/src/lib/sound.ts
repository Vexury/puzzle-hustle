import { readSetting } from './storage.ts';

export const SOUND_KEY = 'ph:sound';

type Overtone = [ratio: number, amp: number, decay: number];

// Wood-block partials for taps, near-harmonic ones for the chimes. Everything is synthesised,
// so there are no audio files to ship and nothing to load before the first sound.
const WOOD: Overtone[] = [
  [1, 1, 1],
  [2.76, 0.22, 0.45],
  [5.4, 0.06, 0.2],
];
const BELL: Overtone[] = [
  [1, 1, 1],
  [2, 0.16, 0.6],
  [3, 0.04, 0.35],
];

const MASTER = 0.4;
const IDLE_MS = 4000;

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let idle: ReturnType<typeof setTimeout> | undefined;

const enabled = () => readSetting(SOUND_KEY) !== '0';

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (!enabled()) return null;
  if (!ctx) {
    const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      return null;
    }
    out = ctx.createGain();
    out.gain.value = MASTER;
    out.connect(ctx.destination);
  }
  if (ctx.state !== 'running') void ctx.resume().catch(() => {});
  // A running context keeps the audio thread awake; let it sleep between bursts of play.
  clearTimeout(idle);
  idle = setTimeout(() => void ctx?.suspend().catch(() => {}), IDLE_MS);
  return { ctx, out: out! };
}

function note(a: { ctx: AudioContext; out: GainNode }, at: number, freq: number, gain: number, decay: number, partials: Overtone[], drop = 1) {
  for (const [ratio, amp, d] of partials) {
    const osc = a.ctx.createOscillator();
    const env = a.ctx.createGain();
    const f = freq * ratio;
    const end = at + decay * d;
    osc.frequency.setValueAtTime(f * drop, at);
    if (drop !== 1) osc.frequency.exponentialRampToValueAtTime(f, at + 0.025);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain * amp, at + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(env).connect(a.out);
    osc.start(at);
    osc.stop(end + 0.02);
  }
}

// A few cents of drift per tap keeps a long run of moves from sounding like a metronome.
const drift = () => 2 ** ((Math.random() - 0.5) * 0.05);

export function tap() {
  const a = audio();
  if (a) note(a, a.ctx.currentTime, 700 * drift(), 0.5, 0.08, WOOD, 1.08);
}

export function press() {
  const a = audio();
  if (a) note(a, a.ctx.currentTime, 470 * drift(), 0.6, 0.13, WOOD, 1.12);
}

export function solved() {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime;
  [784, 988, 1175].forEach((f, i) => note(a, t + i * 0.075, f, 0.42, 0.45, BELL));
  note(a, t + 0.225, 1568, 0.45, 1.2, BELL);
}

export function unlock() {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime;
  note(a, t, 1568, 0.28, 0.6, BELL);
  note(a, t + 0.09, 2349, 0.28, 0.9, BELL);
}
