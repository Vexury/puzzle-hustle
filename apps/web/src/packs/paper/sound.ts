import { BASE, drift, ride, snap, type Out, type PackSounds } from '../../lib/sound.ts';

// Two seconds of noise per context; each stroke reads it from a random point.
const noises = new WeakMap<AudioContext, AudioBuffer>();
function noise(ctx: AudioContext) {
  let buf = noises.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noises.set(ctx, buf);
  }
  return buf;
}

// A pencil line: one soft, breathy band of noise that swells as the lead bites and fades as it
// lifts, wavering a little with the grain of the paper. rise tilts the band over the stroke.
function stroke(a: Out, t: number, len: number, gain = 1, pitch = 1, rise = 1) {
  const src = a.ctx.createBufferSource();
  const low = a.ctx.createBiquadFilter();
  const high = a.ctx.createBiquadFilter();
  const env = a.ctx.createGain();
  const p = pitch * drift();
  src.buffer = noise(a.ctx);
  low.type = 'highpass';
  low.frequency.setValueAtTime(1100 * p, t);
  low.frequency.exponentialRampToValueAtTime(1100 * p * rise, t + len);
  high.type = 'lowpass';
  high.frequency.setValueAtTime(4200 * p, t);
  high.frequency.exponentialRampToValueAtTime(4200 * p * rise, t + len);
  low.Q.value = high.Q.value = 0.5;
  const peak = 0.38 * gain;
  env.gain.setValueAtTime(0, t);
  for (let at = 0.025; at < len - 0.03; at += 0.025) {
    const swell = Math.min(1, at / (len * 0.3), (len - at) / (len * 0.4));
    env.gain.linearRampToValueAtTime(peak * swell * (0.7 + Math.random() * 0.3), t + at);
  }
  env.gain.linearRampToValueAtTime(0, t + len);
  src.connect(low).connect(high).connect(env).connect(a.out);
  src.start(t, Math.random());
  src.stop(t + len + 0.01);
}

// The lead touching down: a soft, dull tick.
const dot = (a: Out, t: number, gain = 1) => snap(a, t, 1800 * drift(), 0.7 * gain, 0.012, 'bandpass');

// Rubber on paper: the same breath, lower and rubbed back and forth.
const erase = (a: Out, t: number, gain = 1) => {
  stroke(a, t, 0.09, 0.9 * gain, 0.45);
  stroke(a, t + 0.1, 0.09, 0.8 * gain, 0.42);
};

const sounds: PackSounds = {
  place: (a, t) => {
    dot(a, t, 0.6);
    stroke(a, t, 0.12, 0.8);
  },
  // An X is two strokes.
  cross: (a, t) => {
    stroke(a, t, 0.13, 0.9);
    stroke(a, t + 0.17, 0.13, 0.9, 1.1);
  },
  clear: (a, t) => erase(a, t, 0.8),
  note: (a, t) => stroke(a, t, 0.06, 0.4, 1.3),
  step: (a, t, o) => stroke(a, t, 0.1, 0.6, o.progress === undefined ? 1 : 0.8 + o.progress * 0.6),
  retract: (a, t) => erase(a, t, 0.5),
  pickup: (a, t) => stroke(a, t, 0.08, 0.4, 1.2, 1.2),
  // Pressed down hard, then dragged a little.
  drop: (a, t) => {
    dot(a, t, 1.2);
    stroke(a, t, 0.15, 0.9, 0.85);
  },
  rotate: (a, t) => {
    stroke(a, t, 0.07, 0.5);
    stroke(a, t + 0.09, 0.07, 0.5, 1.15);
  },
  undo: (a, t) => erase(a, t, 0.6),
  redo: (a, t) => stroke(a, t, 0.12, 0.6, 1, 1.15),
  // Tapping the pencil while thinking.
  hint: (a, t) => [0, 0.13, 0.26].forEach((dt) => dot(a, t + dt, 0.8)),
  // A tick in the margin, then the chime.
  solved: (a, t) => {
    stroke(a, t, 0.12, 1, 0.9, 0.9);
    stroke(a, t + 0.14, 0.35, 1, 1, 1.3);
    BASE.solved(a, t + 0.55, {});
  },
  // Underlined twice.
  unlock: (a, t) => {
    stroke(a, t, 0.3, 0.9);
    stroke(a, t + 0.36, 0.3, 0.9, 1.08);
    BASE.unlock(a, t + 0.75, {});
  },
  // The train sketched in: hatching in time with the wheels.
  train: (a, t, o) =>
    ride(a, t, o, {
      chug: (a, t, accent, level) => stroke(a, t, accent ? 0.11 : 0.08, (accent ? 0.8 : 0.55) * level, accent ? 1 : 1.15),
    }),
  // Zip: the whole path drawn in one line, rising as it goes.
  trail: (a, t) => stroke(a, t, 0.9, 0.9, 0.8, 1.5),
};

export default sounds;
