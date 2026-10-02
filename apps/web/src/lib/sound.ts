import { readSetting } from './storage.ts';

export const SOUND_KEY = 'ph:sound';

type Overtone = [ratio: number, amp: number, decay: number];

// Near-harmonic partials for the chimes. Everything is synthesised, so there are no audio files
// to ship and nothing to load before the first sound.
const BELL: Overtone[] = [
  [1, 1, 1],
  [2, 0.16, 0.6],
  [3, 0.04, 0.35],
];

const PURE: Overtone[] = [[1, 1, 1]];

const MASTER = 0.4;
const IDLE_MS = 4000;

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let idle: ReturnType<typeof setTimeout> | undefined;

const enabled = () => readSetting(SOUND_KEY) !== '0';

type Out = { ctx: AudioContext; out: GainNode };

function audio(): Out | null {
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

function note(a: Out, at: number, freq: number, gain: number, decay: number, partials: Overtone[], glide = 1, attack = 0.003) {
  for (const [ratio, amp, d] of partials) {
    const osc = a.ctx.createOscillator();
    const env = a.ctx.createGain();
    const f = freq * ratio;
    const end = at + decay * d;
    osc.frequency.setValueAtTime(f, at);
    if (glide !== 1) osc.frequency.exponentialRampToValueAtTime(f * glide, end);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain * amp, at + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(env).connect(a.out);
    osc.start(at);
    osc.stop(end + 0.02);
  }
}

let noise: AudioBuffer | null = null;

// Low-passed noise burst: the soft transient of a fingertip, without a pitched body.
function snap(a: Out, at: number, freq: number, gain: number, decay: number) {
  if (!noise) {
    noise = a.ctx.createBuffer(1, Math.ceil(a.ctx.sampleRate * 0.05), a.ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = a.ctx.createBufferSource();
  const band = a.ctx.createBiquadFilter();
  const env = a.ctx.createGain();
  src.buffer = noise;
  band.type = 'lowpass';
  band.frequency.value = freq;
  band.Q.value = 0.7;
  env.gain.setValueAtTime(gain, at);
  env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  src.connect(band).connect(env).connect(a.out);
  src.start(at);
  src.stop(at + decay + 0.01);
}

// A few cents of drift per sound keeps a long run of moves from sounding like a metronome.
const drift = () => 2 ** ((Math.random() - 0.5) * 0.05);

type Click = { band: number; body: number; gain?: number; len?: number; weight?: number; glide?: number };

// The one building block for every move sound, voiced like a fingertip tap: a muffled noise snap
// over a low sine thump. band sets the brightness, body the pitch, weight how much the thump is heard.
function click(a: Out, at: number, { band, body, gain = 1, len = 1, weight = 1, glide = 1 }: Click) {
  const d = drift();
  snap(a, at, band * d, 1.08 * gain, 0.027 * len);
  note(a, at, body * d, 0.44 * gain * weight, 0.045 * len, PURE, glide, 0.006);
}

// Major pentatonic over two octaves from about C4, so any run of steps stays consonant.
const LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24].map((s) => 264 * 2 ** (s / 12));
const rung = (progress: number) => LADDER[Math.round(Math.min(1, Math.max(0, progress)) * (LADDER.length - 1))]!;

export type CueOpts = {
  // 0..1 along a path (Zip). Steps and retracts climb or fall the ladder with it; without it they stay flat.
  progress?: number;
};

type Voice = (a: Out, at: number, o: CueOpts) => void;

// Sounds name what happened in the game, not which input caused it: an X set by right-click and by
// long-press is the same cue. A theme can later swap single entries.
const CUES = {
  place: (a, t) => click(a, t, { band: 1140, body: 600 }),
  cross: (a, t) => click(a, t, { band: 720, body: 330, gain: 1.17, len: 1.67, weight: 1.3 }),
  clear: (a, t) => click(a, t, { band: 900, body: 480, gain: 0.7, len: 1.4, glide: 0.8 }),
  note: (a, t) => click(a, t, { band: 1800, body: 900, gain: 0.4, len: 0.7 }),
  step: (a, t, o) => click(a, t, { band: 1500, body: o.progress === undefined ? 396 : rung(o.progress), gain: 0.6, len: 0.9, weight: 2.2 }),
  retract: (a, t, o) => click(a, t, { band: 1200, body: o.progress === undefined ? 330 : rung(o.progress), gain: 0.5, len: 1.2, weight: 1.8, glide: 0.92 }),
  pickup: (a, t) => click(a, t, { band: 960, body: 450, gain: 0.6, len: 1.2, glide: 1.06 }),
  drop: (a, t) => click(a, t, { band: 540, body: 210, gain: 1.2, len: 2, weight: 1.5 }),
  rotate: (a, t) => {
    click(a, t, { band: 1260, body: 540, gain: 0.6, len: 0.8 });
    click(a, t + 0.035, { band: 1260, body: 660, gain: 0.6, len: 0.8 });
  },
  blocked: (a, t) => click(a, t, { band: 270, body: 54, gain: 0.9, len: 3, weight: 2 }),
  undo: (a, t) => click(a, t, { band: 900, body: 420, gain: 0.5, len: 1.4, glide: 0.85 }),
  redo: (a, t) => click(a, t, { band: 900, body: 420, gain: 0.5, len: 1.4, glide: 1.15 }),
  conflict: (a, t) => note(a, t, 349, 0.3, 0.22, BELL, 0.9),
  hint: (a, t) => [2093, 2637, 3136].forEach((f, i) => note(a, t + i * 0.04, f, 0.12, 0.4, BELL)),
  solved: (a, t) => {
    [784, 988, 1175].forEach((f, i) => note(a, t + i * 0.075, f, 0.42, 0.45, BELL));
    note(a, t + 0.225, 1568, 0.45, 1.2, BELL);
  },
  unlock: (a, t) => {
    note(a, t, 1568, 0.28, 0.6, BELL);
    note(a, t + 0.09, 2349, 0.28, 0.9, BELL);
  },
} satisfies Record<string, Voice>;

export type Cue = keyof typeof CUES;
export const CUE_NAMES = Object.keys(CUES) as Cue[];

// A fast drag can cross several cells per frame; more than one of the same cue per 30 ms only rattles.
const MIN_GAP_MS = 30;
const last = new Map<Cue, number>();

export function play(cue: Cue, opts: CueOpts = {}) {
  const now = performance.now();
  if (now - (last.get(cue) ?? -Infinity) < MIN_GAP_MS) return;
  const a = audio();
  if (!a) return;
  last.set(cue, now);
  CUES[cue](a, a.ctx.currentTime, opts);
}
