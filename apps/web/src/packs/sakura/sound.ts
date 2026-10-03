import { drift, note, rung, snap, type Out, type Overtone, type PackSounds } from '../../lib/sound.ts';

// A wood block: a short knock with one inharmonic partial, the pitch of a struck piece of wood.
const WOOD: Overtone[] = [
  [1, 1, 1],
  [2.7, 0.35, 0.4],
];
const wood = (a: Out, t: number, freq: number, gain = 1, glide = 1) => {
  const d = drift();
  snap(a, t, 2200 * d, 0.5 * gain, 0.012, 'bandpass');
  note(a, t, freq * d, 0.32 * gain, 0.06, WOOD, glide, 0.002);
};

// A koto string: a bright pick over a harmonic body that dies away, the pitch sagging a hair.
const STRING: Overtone[] = [
  [1, 1, 1],
  [2, 0.5, 0.5],
  [3, 0.28, 0.32],
  [4, 0.12, 0.2],
];
const koto = (a: Out, t: number, freq: number, gain: number, len = 0.9) => {
  snap(a, t, 4000, 1.25 * gain, 0.01, 'highpass');
  note(a, t, freq, gain, len, STRING, 0.997, 0.002, 'triangle');
};

// Hirajoshi from A: the scale the koto is usually tuned to.
const HIRAJOSHI = [440, 494, 523, 659, 698, 880, 988, 1047, 1319, 1397, 1760];

const sounds: PackSounds = {
  place: (a, t) => wood(a, t, 1000),
  cross: (a, t) => wood(a, t, 700, 1.25),
  clear: (a, t) => wood(a, t, 850, 0.7, 0.85),
  note: (a, t) => wood(a, t, 1600, 0.4),
  step: (a, t, o) => wood(a, t, o.progress === undefined ? 1100 : rung(o.progress) * 2, 0.6),
  retract: (a, t, o) => wood(a, t, o.progress === undefined ? 900 : rung(o.progress) * 2, 0.5, 0.92),
  pickup: (a, t) => wood(a, t, 900, 0.6, 1.08),
  drop: (a, t) => wood(a, t, 480, 1.3),
  rotate: (a, t) => {
    wood(a, t, 950, 0.6);
    wood(a, t + 0.035, 1150, 0.6);
  },
  undo: (a, t) => {
    wood(a, t, 1050, 0.5);
    wood(a, t + 0.05, 880, 0.5);
  },
  redo: (a, t) => {
    wood(a, t, 880, 0.5);
    wood(a, t + 0.05, 1050, 0.5);
  },
  // Wind chimes: three high bells in no particular order.
  hint: (a, t) => [1760, 2093, 2637].sort(() => Math.random() - 0.5).forEach((f, i) => note(a, t + i * 0.06, f, 0.1, 0.6, STRING)),
  solved: (a, t) => {
    [440, 523, 659, 698].forEach((f, i) => koto(a, t + i * 0.08, f, 0.2));
    koto(a, t + 0.32, 880, 0.24, 1.6);
  },
  unlock: (a, t) => {
    koto(a, t, 1319, 0.18);
    koto(a, t + 0.1, 1760, 0.18, 1.2);
  },
  trail: (a, t) => HIRAJOSHI.forEach((f, i) => koto(a, t + i * 0.07, f, 0.07 + i * 0.006, 0.5)),
};

export default sounds;
