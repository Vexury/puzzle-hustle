import { BASE, click, note, ride, rung, type Out, type Overtone, type PackSounds, type Voice } from '../../lib/sound.ts';

// One hall per bus, built on first use: a decaying noise impulse, a little longer on the right.
const halls = new WeakMap<GainNode, ConvolverNode>();
function hall(a: Out, mix: number): Out {
  let conv = halls.get(a.out);
  if (!conv) {
    conv = a.ctx.createConvolver();
    const len = Math.ceil(a.ctx.sampleRate * 2.4);
    const buf = a.ctx.createBuffer(2, len, a.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** (ch ? 2.6 : 3);
    }
    conv.buffer = buf;
    conv.connect(a.out);
    halls.set(a.out, conv);
  }
  const input = a.ctx.createGain();
  const send = a.ctx.createGain();
  send.gain.value = mix;
  input.connect(a.out);
  input.connect(send).connect(conv);
  return { ctx: a.ctx, out: input };
}

// A celesta: a pure tone with a glassy fourth harmonic that fades first.
const CELESTA: Overtone[] = [
  [1, 1, 1],
  [4, 0.18, 0.25],
];

type Dark = { band: number; body: number; gain?: number; len?: number; weight?: number; glide?: number };
// The base move, an octave's worth duller and in a small room.
const dark = (o: Dark): Voice => (a, t) => click(hall(a, 0.12), t, { ...o, band: o.band * 0.65, body: o.body * 0.85 });

const sounds: PackSounds = {
  place: dark({ band: 1140, body: 600 }),
  cross: dark({ band: 720, body: 330, gain: 1.17, len: 1.67, weight: 1.3 }),
  clear: dark({ band: 900, body: 480, gain: 0.7, len: 1.4, glide: 0.8 }),
  note: dark({ band: 1800, body: 900, gain: 0.4, len: 0.7 }),
  step: (a, t, o) => click(hall(a, 0.12), t, { band: 1000, body: (o.progress === undefined ? 396 : rung(o.progress)) * 0.85, gain: 0.6, len: 0.9, weight: 2.2 }),
  retract: (a, t, o) => click(hall(a, 0.12), t, { band: 800, body: (o.progress === undefined ? 330 : rung(o.progress)) * 0.85, gain: 0.5, len: 1.2, weight: 1.8, glide: 0.92 }),
  pickup: dark({ band: 960, body: 450, gain: 0.6, len: 1.2, glide: 1.06 }),
  drop: dark({ band: 540, body: 210, gain: 1.2, len: 2, weight: 1.5 }),
  rotate: (a, t) => {
    dark({ band: 1260, body: 540, gain: 0.6, len: 0.8 })(a, t, {});
    dark({ band: 1260, body: 660, gain: 0.6, len: 0.8 })(a, t + 0.035, {});
  },
  undo: dark({ band: 900, body: 420, gain: 0.5, len: 1.4, glide: 0.85 }),
  redo: dark({ band: 900, body: 420, gain: 0.5, len: 1.4, glide: 1.15 }),
  hint: (a, t) => [1760, 2217, 2637].forEach((f, i) => note(hall(a, 0.5), t + i * 0.05, f, 0.1, 0.6, CELESTA)),
  // A suspended chord on the celesta, left to ring out in the hall.
  solved: (a, t) => {
    const h = hall(a, 0.55);
    [659, 880, 988].forEach((f, i) => note(h, t + i * 0.09, f, 0.32, 0.8, CELESTA));
    note(h, t + 0.27, 1319, 0.34, 1.8, CELESTA);
  },
  unlock: (a, t) => {
    const h = hall(a, 0.55);
    note(h, t, 1319, 0.24, 0.8, CELESTA);
    note(h, t + 0.1, 1976, 0.24, 1.4, CELESTA);
  },
  train: (a, t, o) => ride(hall(a, 0.3), t, o),
  trail: (a, t) => BASE.trail(hall(a, 0.45), t, {}),
};

export default sounds;
