import { drift, note, PURE, ride, rung, snap, type Out, type PackSounds } from '../../lib/sound.ts';

// A key going down: a short bright tick with no body.
const key = (a: Out, t: number, gain = 1) => snap(a, t, 3800 * drift(), 0.7 * gain, 0.012, 'highpass');

// A square-wave beep, kept quiet because a square carries far more energy than a sine.
const beep = (a: Out, t: number, freq: number, gain: number, len: number, glide = 1) => note(a, t, freq * drift(), gain, len, PURE, glide, 0.002, 'square');

const sounds: PackSounds = {
  place: (a, t) => {
    key(a, t);
    beep(a, t, 880, 0.05, 0.05);
  },
  cross: (a, t) => {
    key(a, t, 1.2);
    beep(a, t, 440, 0.06, 0.07);
  },
  clear: (a, t) => {
    key(a, t, 0.7);
    beep(a, t, 660, 0.04, 0.07, 0.75);
  },
  note: (a, t) => beep(a, t, 1320, 0.025, 0.03),
  step: (a, t, o) => {
    key(a, t, 0.6);
    beep(a, t, o.progress === undefined ? 990 : rung(o.progress) * 2, 0.035, 0.04);
  },
  retract: (a, t, o) => beep(a, t, o.progress === undefined ? 830 : rung(o.progress) * 2, 0.03, 0.05, 0.9),
  pickup: (a, t) => beep(a, t, 520, 0.04, 0.06, 1.2),
  drop: (a, t) => {
    key(a, t, 1.3);
    beep(a, t, 260, 0.07, 0.08);
  },
  rotate: (a, t) => {
    beep(a, t, 660, 0.035, 0.03);
    beep(a, t + 0.035, 880, 0.035, 0.03);
  },
  undo: (a, t) => {
    beep(a, t, 880, 0.035, 0.04);
    beep(a, t + 0.045, 660, 0.035, 0.05);
  },
  redo: (a, t) => {
    beep(a, t, 660, 0.035, 0.04);
    beep(a, t + 0.045, 880, 0.035, 0.05);
  },
  hint: (a, t) => [1760, 2093, 2637].forEach((f, i) => beep(a, t + i * 0.05, f, 0.025, 0.06)),
  // An 8-bit fanfare: C major up the octave, the top note held.
  solved: (a, t) => {
    [523, 659, 784].forEach((f, i) => beep(a, t + i * 0.07, f, 0.08, 0.1));
    beep(a, t + 0.21, 1047, 0.08, 0.6);
  },
  unlock: (a, t) => {
    beep(a, t, 1568, 0.06, 0.12);
    beep(a, t + 0.1, 2093, 0.06, 0.4);
  },
  train: (a, t, o) =>
    ride(a, t, o, {
      chug: (a, t, accent, level) => {
        key(a, t, (accent ? 1 : 0.6) * level);
        beep(a, t, accent ? 110 : 98, 0.05 * level, 0.04);
      },
      horn: (a, t) => {
        beep(a, t, 988, 0.05, 0.12);
        beep(a, t + 0.2, 988, 0.05, 0.25);
      },
    }),
  trail: (a, t) => [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760, 2093].forEach((f, i) => beep(a, t + i * 0.07, f, 0.03 + i * 0.002, 0.08)),
};

export default sounds;
