import * as sound from './sound.ts';

// What a board shows as satisfied or broken, unit by unit in a fixed order, so two snapshots
// compare index by index. broken stays empty while mistakes are hidden.
export interface Units {
  done: readonly boolean[];
  broken: readonly boolean[];
}

const newly = (before: readonly boolean[], after: readonly boolean[]) => after.some((v, i) => v && !before[i]);

// After a move or a hint: a rule that just broke outranks a unit that just came true. Undo, redo
// and reset only travel through states already heard, and a solve has its own chime.
export function playFeedback<S>(cue: sound.Cue | undefined, units: (s: S) => Units, before: S, after: S, solved: boolean) {
  if (!cue || cue === 'undo' || cue === 'redo' || solved) return;
  const a = units(before);
  const b = units(after);
  if (newly(a.broken, b.broken)) sound.play('conflict');
  else if (newly(a.done, b.done)) sound.play('checkpoint');
}
