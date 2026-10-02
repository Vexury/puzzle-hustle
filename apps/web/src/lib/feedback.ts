import * as sound from './sound.ts';

// After a move or a hint: conflict when a rule the board shows as broken was not broken before.
// broken(state) lists the board's rule units in a fixed order, so two snapshots compare index by
// index; it stays empty while mistakes are hidden. Undo, redo and reset only travel through
// states already heard, and a solve has its own chime.
export function playConflict<S>(cue: sound.Cue | undefined, broken: (s: S) => readonly boolean[], before: S, after: S, solved: boolean) {
  if (!cue || cue === 'undo' || cue === 'redo' || solved) return;
  const a = broken(before);
  if (broken(after).some((v, i) => v && !a[i])) sound.play('conflict');
}
