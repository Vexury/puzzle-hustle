// Builds stages 1..N (default 1000) and reports time per tier, the slowest stages and failures.
//   pnpm hustle-check [N]
import { generateBoard } from '../src/boards.ts';
import { hustleRef } from '../src/ref.ts';

const N = Number(process.argv[2] ?? 1000);
const slow: [number, number][] = [];
const byTier = new Map<string, number[]>();
for (let n = 1; n <= N; n++) {
  const ref = hustleRef(n);
  const t = performance.now();
  try {
    generateBoard(ref);
  } catch (e) {
    console.log(`stage ${n} (${ref.type} ${ref.difficulty}) failed: ${String(e)}`);
    process.exitCode = 1;
    continue;
  }
  const ms = performance.now() - t;
  byTier.set(ref.difficulty, [...(byTier.get(ref.difficulty) ?? []), ms]);
  slow.push([n, ms]);
}
for (const [tier, times] of byTier) {
  const sorted = [...times].sort((a, b) => a - b);
  console.log(`${tier}: ${times.length} stages, median ${sorted[sorted.length >> 1]!.toFixed(0)} ms, max ${sorted.at(-1)!.toFixed(0)} ms`);
}
if (slow.length) console.log('slowest', slow.sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, ms]) => `${n}:${(ms / 1000).toFixed(1)}s`).join(' '));
