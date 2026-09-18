import { countRegionsSolutions } from './src/regions/solver.ts';
import type { RegionsSpec } from './src/regions/puzzle.ts';
function stripes(n: number, k: number): RegionsSpec {
  const regions = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) regions[i] = Math.floor(i / n);
  return { version: 1, seed: 0, difficulty: 'easy', config: { size: n, stars: k }, regions, solution: new Uint8Array(n * n) };
}
for (const n of [4, 5, 6]) console.log(n, countRegionsSolutions(stripes(n, 1), 100000));
console.log('8x8 k2', countRegionsSolutions(stripes(8, 2), 100000));
