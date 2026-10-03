import { BELL, drift, note, ride, snap, type Out, type Overtone, type PackSounds } from '../../lib/sound.ts';

// Clay chip on felt: a bright clack with a short, slightly inharmonic ring.
const CHIP: Overtone[] = [
  [1, 1, 1],
  [2.4, 0.5, 0.6],
];
const chip = (a: Out, t: number, gain = 1, pitch = 1) => {
  const d = drift();
  snap(a, t, 3200 * pitch * d, 0.9 * gain, 0.02, 'bandpass');
  note(a, t, 2900 * pitch * d, 0.06 * gain, 0.05, CHIP);
};

// A coin: metal partials far from harmonic, so it rings instead of singing.
const COIN: Overtone[] = [
  [1, 1, 1],
  [2.76, 0.4, 0.5],
  [5.4, 0.15, 0.3],
];
const coin = (a: Out, t: number, freq: number, gain: number) => note(a, t, freq, gain, 0.45, COIN);

const sounds: PackSounds = {
  place: (a, t) => chip(a, t),
  // A card flicked down: a high swish over a soft chip.
  cross: (a, t) => {
    snap(a, t, 4500 * drift(), 0.8, 0.035, 'highpass');
    chip(a, t + 0.012, 0.5, 0.8);
  },
  clear: (a, t) => chip(a, t, 0.6, 0.85),
  note: (a, t) => chip(a, t, 0.35, 1.2),
  step: (a, t) => chip(a, t, 0.6),
  retract: (a, t) => chip(a, t, 0.5, 0.9),
  pickup: (a, t) => chip(a, t, 0.6, 1.1),
  // Chips dropped on a stack.
  drop: (a, t) => [0, 0.03, 0.055].forEach((dt, i) => chip(a, t + dt, 1.1 - i * 0.3, 0.9)),
  rotate: (a, t) => {
    chip(a, t, 0.6);
    chip(a, t + 0.04, 0.6, 1.08);
  },
  undo: (a, t) => {
    chip(a, t, 0.5, 1.05);
    chip(a, t + 0.05, 0.5, 0.9);
  },
  redo: (a, t) => {
    chip(a, t, 0.5, 0.9);
    chip(a, t + 0.05, 0.5, 1.05);
  },
  hint: (a, t) => coin(a, t, 2637, 0.12),
  // The pay-out: two bells, then a run of coins that thins out as the tray fills.
  solved: (a, t) => {
    note(a, t, 1568, 0.3, 0.5, BELL);
    note(a, t + 0.12, 1568, 0.3, 0.8, BELL);
    for (let i = 0; i < 16; i++) coin(a, t + 0.25 + i * 0.055 * (1 + i / 20), 2200 + Math.random() * 1200, 0.09 - i * 0.004);
  },
  unlock: (a, t) => [1568, 2093, 2637].forEach((f, i) => note(a, t + i * 0.1, f, 0.25, 0.7, BELL)),
  train: (a, t, o) =>
    ride(a, t, o, {
      horn: (a, t) => {
        note(a, t, 1568, 0.22, 0.5, BELL);
        note(a, t + 0.15, 1568, 0.22, 0.8, BELL);
      },
    }),
  trail: (a, t) => {
    for (let i = 0; i < 11; i++) coin(a, t + i * 0.07, 1800 + i * 160, 0.05 + i * 0.003);
  },
};

export default sounds;
