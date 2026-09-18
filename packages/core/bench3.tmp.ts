import { generateCrowns, generateStars } from './src/regions/puzzle.ts';
const g = globalThis as any;
g.__calls = 0; g.__nodes = 0; g.__ms = 0; g.__steps = 0; g.__attempts = 0; g.__cap = 0;
for (const snake of [0, 0.5, 0.8, 0.95]) {
  g.__snake = snake;
  for (const [name, gen, d] of [['crowns', generateCrowns, 'genius'], ['stars', generateStars, 'genius']] as const) {
    const t0 = performance.now();
    let steps = 0; let fails = 0; let max = 0;
    for (let seed = 1; seed <= 8; seed++) {
      g.__steps = 0;
      const t = performance.now();
      try { gen(seed, d); } catch { fails++; }
      max = Math.max(max, performance.now() - t);
      steps += g.__steps;
    }
    console.log('snake', snake, name, d, `${((performance.now() - t0) / 8).toFixed(0)}ms avg`, `${max.toFixed(0)}ms max`, 'steps', steps / 8, 'fails', fails);
  }
}
