import { ACHIEVEMENTS_EPOCH, type SolveEntry } from './achievements.ts';
import { COSMETICS, type BadgeCosmetic } from './cosmetics.ts';

// Hustle progress is derived from the solves, like coins and flairs: `hustle:n` ids solved at or
// after the epoch. The Hustle level is the highest stage of the unbroken run from 1 (a gap stops
// the count there); the stage to play next is one above it.
export function hustleSolved(solves: readonly SolveEntry[], epoch: number = ACHIEVEMENTS_EPOCH): number {
  const done = new Set<number>();
  for (const entry of solves) {
    if (entry.solvedAt < epoch) continue;
    const m = /^hustle:(\d+)$/.exec(entry.id);
    if (m) done.add(Number(m[1]));
  }
  let n = 0;
  while (done.has(n + 1)) n++;
  return n;
}

export function hustleNext(solves: readonly SolveEntry[], epoch: number = ACHIEVEMENTS_EPOCH): number {
  return hustleSolved(solves, epoch) + 1;
}

export function earnedHustleBadges(solves: readonly SolveEntry[], epoch: number = ACHIEVEMENTS_EPOCH): Set<string> {
  const solved = hustleSolved(solves, epoch);
  const out = new Set<string>();
  for (const c of COSMETICS) {
    if (c.kind !== 'badge') continue;
    const req = (c as BadgeCosmetic).requires;
    if (req && solved >= req.hustle) out.add(c.id);
  }
  return out;
}
