import { readSetting, writeSetting } from './storage.ts';

export const SOUND_KEY = 'ph:sound';

// Moves click with nearly every touch, feedback chimes now and then; each has its own level so
// the clicks can go quiet without losing the solve.
export type Bus = 'moves' | 'feedback';
const VOLUME_KEYS: Record<Bus, string> = { moves: 'ph:volMoves', feedback: 'ph:volFeedback' };
const FEEDBACK: ReadonlySet<Cue> = new Set<Cue>(['conflict', 'hint', 'solved', 'unlock', 'train', 'trail']);

export function volume(bus: Bus): number {
  const v = Number(readSetting(VOLUME_KEYS[bus]) ?? 100);
  return Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : 100;
}

// Squared so the slider feels even to the ear instead of crowding all the change near zero.
const level = (bus: Bus) => (volume(bus) / 100) ** 2;

export function setVolume(bus: Bus, v: number) {
  writeSetting(VOLUME_KEYS[bus], String(v));
  if (buses) buses[bus].gain.value = level(bus);
}

export type Overtone = [ratio: number, amp: number, decay: number];

// Near-harmonic partials for the chimes. Everything is synthesised, so there are no audio files
// to ship and nothing to load before the first sound.
export const BELL: Overtone[] = [
  [1, 1, 1],
  [2, 0.16, 0.6],
  [3, 0.04, 0.35],
];

export const PURE: Overtone[] = [[1, 1, 1]];

const MASTER = 0.4;
const IDLE_MS = 4000;

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let buses: Record<Bus, GainNode> | null = null;
let idle: ReturnType<typeof setTimeout> | undefined;
let awake = 0;

const enabled = () => readSetting(SOUND_KEY) !== '0';

export type Out = { ctx: AudioContext; out: GainNode };

// hold keeps the context awake through a long sound, which would otherwise be cut off when it sleeps.
function audio(hold = 0): Out | null {
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
    const bus = (b: Bus) => {
      const g = ctx!.createGain();
      g.gain.value = level(b);
      g.connect(out!);
      return g;
    };
    buses = { moves: bus('moves'), feedback: bus('feedback') };
  }
  if (ctx.state !== 'running') void ctx.resume().catch(() => {});
  // A running context keeps the audio thread awake; let it sleep between bursts of play.
  // A short cue during a long one must not cut the long one off, so the later end wins.
  awake = Math.max(awake, performance.now() + IDLE_MS + hold);
  clearTimeout(idle);
  idle = setTimeout(() => void ctx?.suspend().catch(() => {}), awake - performance.now());
  return { ctx, out: out! };
}

export function note(a: Out, at: number, freq: number, gain: number, decay: number, partials: Overtone[], glide = 1, attack = 0.003, wave: OscillatorType = 'sine') {
  for (const [ratio, amp, d] of partials) {
    const osc = a.ctx.createOscillator();
    osc.type = wave;
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

// Low-passed noise burst: the soft transient of a fingertip, without a pitched body. At most
// 50 ms long, the length of the buffer.
export function snap(a: Out, at: number, freq: number, gain: number, decay: number, filter: BiquadFilterType = 'lowpass') {
  if (!noise) {
    noise = a.ctx.createBuffer(1, Math.ceil(a.ctx.sampleRate * 0.05), a.ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = a.ctx.createBufferSource();
  const band = a.ctx.createBiquadFilter();
  const env = a.ctx.createGain();
  src.buffer = noise;
  band.type = filter;
  band.frequency.value = freq;
  band.Q.value = 0.7;
  env.gain.setValueAtTime(gain, at);
  env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  src.connect(band).connect(env).connect(a.out);
  src.start(at);
  src.stop(at + decay + 0.01);
}

// A few cents of drift per sound keeps a long run of moves from sounding like a metronome.
export const drift = () => 2 ** ((Math.random() - 0.5) * 0.05);

type Click = { band: number; body: number; gain?: number; len?: number; weight?: number; glide?: number };

// The one building block for every move sound, voiced like a fingertip tap: a muffled noise snap
// over a low sine thump. band sets the brightness, body the pitch, weight how much the thump is heard.
export function click(a: Out, at: number, { band, body, gain = 1, len = 1, weight = 1, glide = 1 }: Click) {
  const d = drift();
  snap(a, at, band * d, 1.08 * gain, 0.027 * len);
  note(a, at, body * d, 0.44 * gain * weight, 0.045 * len, PURE, glide, 0.006);
}

// Major pentatonic over two octaves from about C4, so any run of steps stays consonant.
export const LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24].map((s) => 264 * 2 ** (s / 12));
export const rung = (progress: number) => LADDER[Math.round(Math.min(1, Math.max(0, progress)) * (LADDER.length - 1))]!;

export type CueOpts = {
  // 0..1 along a path (Zip). Steps and retracts climb or fall the ladder with it; without it they stay flat.
  progress?: number;
  // Seconds the moment on screen lasts (the Tracks train), so the sound ends with it.
  duration?: number;
};

export type Voice = (a: Out, at: number, o: CueOpts) => void;

// A steam whistle: a few detuned sines that bend up into pitch and wobble a little.
function whistle(a: Out, at: number, len: number) {
  for (const ratio of [1, 1.19, 1.5]) {
    const osc = a.ctx.createOscillator();
    const lfo = a.ctx.createOscillator();
    const depth = a.ctx.createGain();
    const env = a.ctx.createGain();
    const f = 740 * ratio;
    osc.frequency.setValueAtTime(f * 0.94, at);
    osc.frequency.exponentialRampToValueAtTime(f, at + 0.06);
    lfo.frequency.value = 5.5;
    depth.gain.value = f * 0.008;
    lfo.connect(depth).connect(osc.frequency);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.07, at + 0.04);
    env.gain.setValueAtTime(0.07, at + len - 0.06);
    env.gain.linearRampToValueAtTime(0, at + len);
    osc.connect(env).connect(a.out);
    for (const o of [osc, lfo]) {
      o.start(at);
      o.stop(at + len + 0.02);
    }
  }
}

export type Ride = {
  // One beat of the wheels; accent is the first of each pair, level 0..1 follows the ride.
  chug?: (a: Out, at: number, accent: boolean, level: number) => void;
  // The signal as the train sets off.
  horn?: (a: Out, at: number) => void;
};

// The Tracks train: wheels in pairs at the pace of the cars, swelling as they roll in and dying
// away as they leave, with a signal once the solved chime has rung. Packs swap the chug and horn.
export function ride(a: Out, at: number, { duration = 4 }: CueOpts, { chug, horn }: Ride = {}) {
  const beat = 0.15;
  const beats = Math.floor(duration / beat);
  const play = chug ?? ((a, t, accent, level) => click(a, t, { band: accent ? 1700 : 1100, body: accent ? 120 : 95, gain: 0.55 * level, len: 1.6, weight: 0.8 }));
  for (let i = 0; i < beats; i++) {
    const t = i * beat;
    const level = Math.min(1, t / (duration * 0.25), (duration - t) / (duration * 0.35));
    play(a, at + t, i % 2 === 0, Math.max(0.05, level));
  }
  (horn ?? ((a, t) => {
    whistle(a, t, 0.22);
    whistle(a, t + 0.32, 0.45);
  }))(a, at + 0.55);
}

// Sounds name what happened in the game, not which input caused it: an X set by right-click and by
// long-press is the same cue. A pack swaps single entries (packs/<id>/sound.ts).
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
  train: (a, t, o) => ride(a, t, o),
  // Zip: the solved path runs up the same ladder its steps climbed, in the 0.9 s the line glows.
  trail: (a, t) => LADDER.forEach((f, i) => note(a, t + i * 0.07, f * drift(), 0.1 + i * 0.008, 0.28, BELL)),
} satisfies Record<string, Voice>;

export type Cue = keyof typeof CUES;
export const CUE_NAMES = Object.keys(CUES) as Cue[];

// The base sounds, for a pack that layers onto one instead of replacing it.
export const BASE: Readonly<Record<Cue, Voice>> = CUES;

export type PackSounds = Partial<Record<Cue, Voice>>;

// The worn pack's replacements, loaded with the pack (packs/registry.ts). Until they arrive, and
// for every cue a pack leaves alone, the base sound plays.
let packSounds: PackSounds = {};
let packId: string | null = null;

export function setPackSounds(id: string | null, load?: () => Promise<{ default: PackSounds }>) {
  packId = id;
  packSounds = {};
  if (!load) return;
  void load().then(
    (m) => {
      if (packId === id) packSounds = m.default;
    },
    () => {},
  );
}

// A fast drag can cross several cells per frame; more than one of the same cue per 30 ms only rattles.
const MIN_GAP_MS = 30;
const last = new Map<Cue, number>();

export function play(cue: Cue, opts: CueOpts = {}) {
  const now = performance.now();
  if (now - (last.get(cue) ?? -Infinity) < MIN_GAP_MS) return;
  const bus: Bus = FEEDBACK.has(cue) ? 'feedback' : 'moves';
  if (volume(bus) === 0) return;
  const a = audio((opts.duration ?? 0) * 1000);
  if (!a) return;
  last.set(cue, now);
  (packSounds[cue] ?? CUES[cue])({ ctx: a.ctx, out: buses![bus] }, a.ctx.currentTime, opts);
}
