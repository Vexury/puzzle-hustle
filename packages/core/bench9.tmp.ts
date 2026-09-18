import { generateCrowns, generateStars } from './src/regions/puzzle.ts';
import { countRegionsSolutions } from './src/regions/solver.ts';
const g = globalThis as any;
for (const snake of [0.7, 0.85, 0.95]) {
  g.__snake = snake;
  g.__capture = true;
  for (const [name, gen, d] of [['crowns', generateCrowns, 'genius'], ['stars', generateStars, 'genius']] as const) {
    const counts: number[] = [];
    let sizes = '';
    for (let seed = 1; seed <= 6; seed++) {
      const spec = gen(seed, d);
      counts.push(countRegionsSolutions(spec, 5000).solutions);
      if (seed === 1) {
        const n = spec.config.size; const sz = new Array(n).fill(0);
        spec.regions.forEach((r) => sz[r]++);
        sizes = sz.sort((a, b) => a - b).join('/');
      }
    }
    console.log('snake', snake, name, d, 'initial', counts.join(','), 'sizes', sizes);
  }
  g.__capture = false;
  for (const [name, gen] of [['crowns', generateCrowns], ['stars', generateStars]] as const) {
    for (const d of ['easy', 'medium', 'hard', 'genius'] as const) {
      const t0 = performance.now(); let max = 0; let fails = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const t = performance.now();
        try { gen(seed, d); } catch { fails++; }
        max = Math.max(max, performance.now() - t);
      }
      console.log('snake', snake, name, d, `${((performance.now() - t0) / 10).toFixed(0)}ms avg`, `${max.toFixed(0)}ms max`, 'fails', fails);
    }
  }
}
