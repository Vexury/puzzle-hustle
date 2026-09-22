export interface Candidate {
  seed: number;
  score: number;
  family: string;
}

// Picks the levels that ship, in the order they ship. Two rules fight each other here:
// the pack must climb in difficulty, and consecutive levels must not feel like the same
// puzzle twice. Difficulty wins, so candidates are only ever taken in ascending score
// order; within that freedom the walk prefers one whose family differs from its
// predecessor and whose family is not already overrepresented. Levels sharing a family
// cannot be avoided where the generator has fewer families than the pack has slots
// (Shapes easy has 37 for 50 levels), so the rules relax rather than leave a slot empty.
export function selectLevels(sorted: readonly Candidate[], count: number): Candidate[] {
  if (sorted.length < count) throw new Error(`need ${count} candidates, got ${sorted.length}`);
  const families = new Set(sorted.map((c) => c.family));
  const cap = Math.max(2, Math.ceil(count / Math.max(1, families.size)));
  const used = new Map<string, number>();
  const step = sorted.length / count;
  const window = Math.max(1, Math.round(step));
  const picked: Candidate[] = [];
  let after = -1;

  for (let i = 0; i < count; i++) {
    // Never reach so far ahead that the slots behind this one can no longer be filled.
    const last = sorted.length - (count - i);
    const ideal = Math.min(Math.floor(i * step), last);
    const previous = picked.at(-1)?.family;

    const take = (accept: (c: Candidate) => boolean): number => {
      for (let j = Math.max(ideal, after + 1); j <= Math.min(last, ideal + window); j++) {
        if (accept(sorted[j]!)) return j;
      }
      for (let j = ideal - 1; j > after && j >= ideal - window; j--) {
        if (accept(sorted[j]!)) return j;
      }
      return -1;
    };

    let at = take((c) => c.family !== previous && (used.get(c.family) ?? 0) < cap);
    if (at < 0) at = take((c) => c.family !== previous);
    if (at < 0) at = take(() => true);
    if (at < 0) at = after + 1;

    const chosen = sorted[at]!;
    picked.push(chosen);
    used.set(chosen.family, (used.get(chosen.family) ?? 0) + 1);
    after = at;
  }
  return picked;
}

export function adjacentTwins(picked: readonly Candidate[]): number {
  let twins = 0;
  for (let i = 1; i < picked.length; i++) if (picked[i]!.family === picked[i - 1]!.family) twins++;
  return twins;
}
