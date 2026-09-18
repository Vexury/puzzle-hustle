import { generateCrowns, generateStars } from './src/regions/puzzle.ts';
import { countRegionsSolutions } from './src/regions/solver.ts';
const g = globalThis as any;
g.__capture = true;
for (const snake of [0, 0.5, 0.8, 0.95]) {
  g.__snake = snake;
  for (const [name, gen, d] of [['crowns', generateCrowns, 'genius'], ['stars', generateStars, 'genius']] as const) {
    const counts: number[] = [];
    let ms = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const spec = gen(seed, d);
      const t = performance.now();
      counts.push(countRegionsSolutions(spec, 5000).solutions);
      ms += performance.now() - t;
    }
    console.log('snake', snake, name, d, 'initial counts', counts.join(','), `${(ms / 6).toFixed(0)}ms/count`);
  }
}
