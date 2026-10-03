import { BELL, click, drift, note, PURE, ride, rung, snap, type Out, type PackSounds } from '../../lib/sound.ts';

// Embers: a few dull pops scattered over a moment, low in the spectrum like coals settling.
const embers = (a: Out, t: number, count: number, gain = 1, spread = 0.06) => {
  for (let i = 0; i < count; i++) snap(a, t + Math.random() * spread, 900 + Math.random() * 1400, (0.25 + Math.random() * 0.35) * gain, 0.01, 'bandpass');
};

type Dark = { band: number; body: number; gain?: number; len?: number; weight?: number; glide?: number };
// The base move pushed down: darker, deeper, a little heavier, with a coal shifting under it.
const sear = (a: Out, t: number, o: Dark, sparks = 1) => {
  click(a, t, { ...o, band: o.band * 0.5, body: o.body * 0.6, weight: (o.weight ?? 1) * 1.3 });
  embers(a, t + 0.012, sparks, 0.5, 0.05);
};

// A deep blow that sinks as it fades, under a rumble.
const boom = (a: Out, t: number, gain = 1) => {
  note(a, t, 49, 0.6 * gain, 1.4, PURE, 0.55, 0.01);
  for (let i = 0; i < 22; i++) snap(a, t + i * 0.045, 160, 0.6 * gain * (1 - i / 22), 0.045);
};

// Something stirring below: two low saws a semitone apart, beating against each other,
// filtered to a growl and swelling up and away.
function growl(a: Out, t: number, len: number, gain = 1) {
  const filter = a.ctx.createBiquadFilter();
  const env = a.ctx.createGain();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(180, t);
  filter.frequency.linearRampToValueAtTime(420, t + len * 0.4);
  filter.frequency.linearRampToValueAtTime(150, t + len);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.2 * gain, t + len * 0.35);
  env.gain.linearRampToValueAtTime(0, t + len);
  filter.connect(env).connect(a.out);
  for (const f of [55, 58.3]) {
    const osc = a.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = f;
    osc.connect(filter);
    osc.start(t);
    osc.stop(t + len + 0.02);
  }
}

// A cracked bell: the note with a second strike a few cents off, so it wavers.
const toll = (a: Out, t: number, freq: number, gain: number, decay: number) => {
  note(a, t, freq, gain, decay, BELL);
  note(a, t, freq * 1.012, gain * 0.6, decay * 0.8, BELL);
};

const sounds: PackSounds = {
  place: (a, t) => sear(a, t, { band: 1140, body: 600 }),
  cross: (a, t) => sear(a, t, { band: 720, body: 330, gain: 1.17, len: 1.67, weight: 1.3 }, 2),
  clear: (a, t) => sear(a, t, { band: 900, body: 480, gain: 0.7, len: 1.4, glide: 0.8 }, 0),
  note: (a, t) => sear(a, t, { band: 1800, body: 900, gain: 0.4, len: 0.7 }, 0),
  step: (a, t, o) => sear(a, t, { band: 1500, body: o.progress === undefined ? 396 : rung(o.progress), gain: 0.6, len: 0.9, weight: 2.2 }, 0),
  retract: (a, t, o) => sear(a, t, { band: 1200, body: o.progress === undefined ? 330 : rung(o.progress), gain: 0.5, len: 1.2, weight: 1.8, glide: 0.92 }, 0),
  pickup: (a, t) => sear(a, t, { band: 960, body: 450, gain: 0.6, len: 1.2, glide: 1.06 }, 0),
  drop: (a, t) => {
    sear(a, t, { band: 540, body: 210, gain: 1.2, len: 2, weight: 1.5 }, 0);
    embers(a, t + 0.01, 5, 0.8, 0.14);
  },
  rotate: (a, t) => {
    sear(a, t, { band: 1260, body: 540, gain: 0.6, len: 0.8 }, 0);
    sear(a, t + 0.035, { band: 1260, body: 660, gain: 0.6, len: 0.8 }, 0);
  },
  undo: (a, t) => sear(a, t, { band: 900, body: 420, gain: 0.5, len: 1.4, glide: 0.85 }, 0),
  redo: (a, t) => sear(a, t, { band: 900, body: 420, gain: 0.5, len: 1.4, glide: 1.15 }, 0),
  // A low tritone, the interval of the devil.
  hint: (a, t) => {
    toll(a, t, 311, 0.14, 0.7);
    toll(a, t + 0.08, 440, 0.12, 0.9);
  },
  // A blow from below, a diminished chord tolled on a cracked bell, and something growling.
  solved: (a, t) => {
    boom(a, t);
    growl(a, t + 0.05, 1.8);
    [196, 233, 277, 330].forEach((f, i) => toll(a, t + 0.06 + i * 0.09, f, 0.34, 0.8));
    toll(a, t + 0.42, 392, 0.36, 1.6);
    embers(a, t + 0.2, 10, 0.7, 1.2);
  },
  unlock: (a, t) => {
    boom(a, t, 0.6);
    toll(a, t + 0.04, 392, 0.28, 0.7);
    toll(a, t + 0.14, 554, 0.28, 1.1);
  },
  train: (a, t, o) =>
    ride(a, t, o, {
      chug: (a, t, accent, level) => click(a, t, { band: accent ? 800 : 550, body: accent ? 80 : 65, gain: 0.6 * level, len: 1.8, weight: 1 }),
      horn: (a, t) => {
        boom(a, t, 0.6);
        growl(a, t, 1.2, 0.8);
      },
    }),
  // Zip: the ladder an octave down, tolled, with the coals stirring.
  trail: (a, t) => {
    for (let i = 0; i < 11; i++) toll(a, t + i * 0.07, rung(i / 10) / 2 * drift(), 0.09 + i * 0.006, 0.4);
    embers(a, t, 8, 0.6, 0.8);
  },
};

export default sounds;
