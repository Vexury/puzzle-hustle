// A family key names the vocabulary of a puzzle: which building blocks it uses and how
// many of each, with no regard for where they sit. Two puzzles sharing one are different
// puzzles that feel like the same exercise, which is what the level packs must not place
// side by side. Each type builds its own key from the helper below.
export function countHistogram(values: Iterable<number>): string {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([value, n]) => `${value}x${n}`)
    .join('.');
}
