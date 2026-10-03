import { BASE, ride, rung, type Cue, type Out, type PackSounds, type Voice } from '../../lib/sound.ts';

// One tape echo per bus: a dotted delay that comes back darker each time round.
const echoes = new WeakMap<GainNode, DelayNode>();
function echo(a: Out, mix: number): Out {
  let delay = echoes.get(a.out);
  if (!delay) {
    delay = a.ctx.createDelay(1);
    delay.delayTime.value = 0.18;
    const loop = a.ctx.createGain();
    const tone = a.ctx.createBiquadFilter();
    loop.gain.value = 0.32;
    tone.type = 'lowpass';
    tone.frequency.value = 2400;
    delay.connect(tone).connect(loop).connect(delay);
    tone.connect(a.out);
    echoes.set(a.out, delay);
  }
  const input = a.ctx.createGain();
  const send = a.ctx.createGain();
  send.gain.value = mix;
  input.connect(a.out);
  input.connect(send).connect(delay);
  return { ctx: a.ctx, out: input };
}

// Two detuned saws through a low-pass that opens over the note: the classic poly-synth sweep.
function saw(a: Out, t: number, freq: number, gain: number, len: number, open = [600, 3200]) {
  const filter = a.ctx.createBiquadFilter();
  const env = a.ctx.createGain();
  filter.type = 'lowpass';
  filter.Q.value = 4;
  filter.frequency.setValueAtTime(open[0]!, t);
  filter.frequency.exponentialRampToValueAtTime(open[1]!, t + len * 0.6);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(gain, t + 0.02);
  env.gain.exponentialRampToValueAtTime(0.0001, t + len);
  filter.connect(env).connect(a.out);
  for (const cents of [-8, 8]) {
    const osc = a.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value = cents;
    osc.connect(filter);
    osc.start(t);
    osc.stop(t + len + 0.02);
  }
}

// Moves keep the base click and gain a faint echo behind it.
const echoed = (cue: Cue, mix = 0.18): Voice => (a, t, o) => BASE[cue](echo(a, mix), t, o);

const sounds: PackSounds = {
  place: echoed('place'),
  cross: echoed('cross'),
  clear: echoed('clear'),
  note: echoed('note'),
  step: echoed('step', 0.12),
  retract: echoed('retract', 0.12),
  pickup: echoed('pickup'),
  drop: echoed('drop'),
  rotate: echoed('rotate'),
  undo: echoed('undo'),
  redo: echoed('redo'),
  hint: (a, t) => [880, 1109, 1319].forEach((f, i) => saw(echo(a, 0.35), t + i * 0.06, f, 0.045, 0.18, [1500, 5000])),
  // A minor add-nine chord swelling open, then an echoing top note.
  solved: (a, t) => {
    const e = echo(a, 0.4);
    [220, 262, 330, 494].forEach((f) => saw(e, t, f, 0.05, 1.5, [400, 4200]));
    saw(e, t + 0.3, 988, 0.05, 0.5, [2000, 6000]);
  },
  unlock: (a, t) => {
    const e = echo(a, 0.4);
    saw(e, t, 659, 0.06, 0.3, [800, 5000]);
    saw(e, t + 0.12, 988, 0.06, 0.6, [800, 5000]);
  },
  train: (a, t, o) =>
    ride(a, t, o, {
      horn: (a, t) => [440, 523, 659, 880].forEach((f, i) => saw(echo(a, 0.4), t + i * 0.09, f, 0.05, 0.2, [900, 4000])),
    }),
  trail: (a, t) => {
    const e = echo(a, 0.3);
    for (let i = 0; i < 11; i++) saw(e, t + i * 0.07, rung(i / 10), 0.035, 0.16, [1200, 4500]);
  },
};

export default sounds;
