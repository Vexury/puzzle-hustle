import { Rng } from './src/rng.ts';
import { enumerateRegionsSolutions } from './src/regions/solver.ts';
import type { RegionsSpec } from './src/regions/puzzle.ts';
// stripe layout 12x12 two stars: rows as regions -> many solutions, measure speed of capped enumeration
const n = 12;
const regions = new Uint8Array(n * n);
for (let i = 0; i < n * n; i++) regions[i] = Math.floor(i / n);
const spec: RegionsSpec = { version: 1, seed: 0, difficulty: 'genius', config: { size: n, stars: 2 }, regions, solution: new Uint8Array(n * n) };
for (const limit of [1, 48, 1000]) {
  const t = performance.now();
  const r = enumerateRegionsSolutions(spec, limit, () => {});
  console.log('stripes limit', limit, r, `${(performance.now() - t).toFixed(1)}ms`);
}
