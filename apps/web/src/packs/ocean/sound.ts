import { BASE, click, drift, note, PURE, ride, rung, snap, type Out, type PackSounds } from '../../lib/sound.ts';

// A bubble: a sine that leaps up in pitch as it closes, the way a bubble rings as it surfaces.
const bubble = (a: Out, t: number, freq: number, gain = 1, rise = 2.2, len = 0.06) => note(a, t, freq * drift(), 0.3 * gain, len, PURE, rise, 0.004);

// Surf: two seconds of noise, cached per context, swelling and drawing back under a low-pass.
const surfs = new WeakMap<AudioContext, AudioBuffer>();
function surf(a: Out, t: number, len: number, gain: number) {
  let buf = surfs.get(a.ctx);
  if (!buf) {
    buf = a.ctx.createBuffer(1, a.ctx.sampleRate * 2, a.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    surfs.set(a.ctx, buf);
  }
  const src = a.ctx.createBufferSource();
  const filter = a.ctx.createBiquadFilter();
  const env = a.ctx.createGain();
  src.buffer = buf;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(500, t);
  filter.frequency.linearRampToValueAtTime(1600, t + len * 0.4);
  filter.frequency.linearRampToValueAtTime(400, t + len);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(gain, t + len * 0.4);
  env.gain.linearRampToValueAtTime(0, t + len);
  src.connect(filter).connect(env).connect(a.out);
  src.start(t);
  src.stop(t + len);
}

// A foghorn far off: a low saw, filtered almost to a hum.
function foghorn(a: Out, t: number, len: number) {
  const osc = a.ctx.createOscillator();
  const filter = a.ctx.createBiquadFilter();
  const env = a.ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.value = 98;
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.16, t + 0.12);
  env.gain.setValueAtTime(0.16, t + len - 0.2);
  env.gain.linearRampToValueAtTime(0, t + len);
  osc.connect(filter).connect(env).connect(a.out);
  osc.start(t);
  osc.stop(t + len + 0.02);
}

const sounds: PackSounds = {
  place: (a, t) => bubble(a, t, 520),
  cross: (a, t) => {
    click(a, t, { band: 600, body: 260, gain: 0.7, len: 1.4, weight: 1 });
    bubble(a, t, 320, 1.1, 2, 0.08);
  },
  clear: (a, t) => bubble(a, t, 700, 0.6, 0.6),
  note: (a, t) => bubble(a, t, 1200, 0.35, 1.8, 0.04),
  step: (a, t, o) => bubble(a, t, o.progress === undefined ? 600 : rung(o.progress) * 1.5, 0.6, 1.8, 0.05),
  retract: (a, t, o) => bubble(a, t, o.progress === undefined ? 520 : rung(o.progress) * 1.5, 0.5, 0.7, 0.05),
  pickup: (a, t) => bubble(a, t, 600, 0.6, 2.6),
  // Set into the water: a muffled splash and a big slow bubble.
  drop: (a, t) => {
    snap(a, t, 1100 * drift(), 0.9, 0.05);
    bubble(a, t + 0.01, 240, 1.2, 1.8, 0.1);
  },
  rotate: (a, t) => {
    bubble(a, t, 560, 0.6);
    bubble(a, t + 0.035, 700, 0.6);
  },
  undo: (a, t) => bubble(a, t, 640, 0.55, 0.7, 0.07),
  redo: (a, t) => bubble(a, t, 480, 0.55, 2.4, 0.07),
  hint: (a, t) => [800, 1000, 1300].forEach((f, i) => bubble(a, t + i * 0.05, f, 0.5, 2.2, 0.06)),
  solved: (a, t) => {
    surf(a, t, 1.8, 0.22);
    BASE.solved(a, t + 0.05, {});
  },
  unlock: (a, t) => {
    for (let i = 0; i < 6; i++) bubble(a, t + i * 0.05, 500 + i * 160, 0.5, 2.2, 0.06);
    BASE.unlock(a, t + 0.2, {});
  },
  train: (a, t, o) => ride(a, t, o, { horn: (a, t) => foghorn(a, t, 0.9) }),
  trail: (a, t) => {
    for (let i = 0; i < 11; i++) bubble(a, t + i * 0.07, rung(i / 10) * 1.5, 0.5 + i * 0.03, 2, 0.07);
  },
};

export default sounds;
