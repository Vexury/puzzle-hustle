import { click, drift, note, ride, rung, snap, type Out, type Overtone, type PackSounds } from '../../lib/sound.ts';

// Porcelain: thin-walled, so the partials sit far apart and ring briefly.
const CHINA: Overtone[] = [
  [1, 1, 1],
  [2.32, 0.5, 0.5],
  [4.25, 0.22, 0.3],
];
const tink = (a: Out, t: number, freq: number, gain = 1, len = 0.08, glide = 1) => note(a, t, freq * drift(), 0.08 * gain, len, CHINA, glide, 0.001);

// A cup set on its saucer: a soft knock under two near-unison rings that beat against each other.
const saucer = (a: Out, t: number, gain = 1) => {
  click(a, t, { band: 900, body: 200, gain: 0.7 * gain, len: 1.4, weight: 0.8 });
  tink(a, t + 0.005, 2100, 1.1 * gain, 0.25);
  tink(a, t + 0.012, 2160, 0.9 * gain, 0.25);
};

// A purr: a low rumble pulsing about 25 times a second.
const purr = (a: Out, t: number, len: number, gain = 1) => {
  const n = Math.floor(len * 25);
  for (let i = 0; i < n; i++) {
    const swell = Math.sin((Math.PI * i) / n);
    snap(a, t + i * 0.04, 320, 0.6 * gain * swell, 0.035);
  }
};

const sounds: PackSounds = {
  place: (a, t) => tink(a, t, 2800),
  cross: (a, t) => {
    click(a, t, { band: 800, body: 300, gain: 0.7, len: 1.3, weight: 1 });
    tink(a, t, 2000, 0.9);
  },
  clear: (a, t) => tink(a, t, 2500, 0.6, 0.08, 0.92),
  note: (a, t) => tink(a, t, 3600, 0.35, 0.05),
  step: (a, t, o) => tink(a, t, o.progress === undefined ? 3000 : rung(o.progress) * 3, 0.6, 0.06),
  retract: (a, t, o) => tink(a, t, o.progress === undefined ? 2600 : rung(o.progress) * 3, 0.5, 0.07, 0.94),
  pickup: (a, t) => tink(a, t, 2400, 0.6, 0.08, 1.04),
  drop: (a, t) => saucer(a, t),
  rotate: (a, t) => {
    tink(a, t, 2700, 0.6);
    tink(a, t + 0.035, 3100, 0.6);
  },
  undo: (a, t) => {
    tink(a, t, 3000, 0.5);
    tink(a, t + 0.05, 2600, 0.5);
  },
  redo: (a, t) => {
    tink(a, t, 2600, 0.5);
    tink(a, t + 0.05, 3000, 0.5);
  },
  // A spoon stirred once round the cup.
  hint: (a, t) => [3200, 3500, 3350, 3650].forEach((f, i) => tink(a, t + i * 0.07, f, 0.8, 0.12)),
  // Two cups touched together, then the cat settles in.
  solved: (a, t) => {
    tink(a, t, 2640, 3.2, 0.9);
    tink(a, t + 0.008, 2780, 2.6, 0.9);
    tink(a, t + 0.16, 2640, 2.4, 1.1);
    tink(a, t + 0.168, 2780, 2, 1.1);
    purr(a, t + 0.45, 1.1);
  },
  unlock: (a, t) => {
    tink(a, t, 2640, 2.8, 0.7);
    tink(a, t + 0.12, 3300, 2.8, 1);
  },
  train: (a, t, o) =>
    ride(a, t, o, {
      horn: (a, t) => {
        tink(a, t, 2640, 2.6, 0.5);
        tink(a, t + 0.18, 2640, 2.6, 0.8);
      },
    }),
  trail: (a, t) => [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24].forEach((s, i) => tink(a, t + i * 0.07, 1320 * 2 ** (s / 12), 1.2 + i * 0.1, 0.3)),
};

export default sounds;
