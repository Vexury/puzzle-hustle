import { generateCrowns, generateStars } from './src/regions/puzzle.ts';
import { countRegionsSolutions } from './src/regions/solver.ts';
const g = globalThis as any;
g.__calls = 0; g.__nodes = 0; g.__ms = 0;
for (const [name, gen, d] of [['crowns', generateCrowns, 'genius'], ['stars', generateStars, 'hard'], ['stars', generateStars, 'genius']] as const) {
  for (let seed = 1; seed <= 3; seed++) {
    g.__calls = 0; g.__nodes = 0; g.__ms = 0; g.__steps = 0; g.__attempts = 0; g.__cap = 0;
    const t0 = performance.now();
    const spec = gen(seed, d);
    const ms = performance.now() - t0;
    const t1 = performance.now();
    const c = countRegionsSolutions(spec, 2);
    console.log(name, d, seed, `${ms.toFixed(0)}ms`, 'calls', g.__calls, 'solverMs', g.__ms.toFixed(0), 'steps', g.__steps, 'attempts', g.__attempts, 'capped', g.__cap, 'finalNodes', c.nodes, `${(performance.now() - t1).toFixed(1)}ms/count`);
  }
}
