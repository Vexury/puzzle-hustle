import { generateStars } from './src/regions/puzzle.ts';
import { countRegionsSolutions } from './src/regions/solver.ts';
const g = globalThis as any;
g.__snake = 0.5;
g.__calls = 0; g.__ms = 0; g.__steps = 0; g.__attempts = 0; g.__cap = 0;
const origEnum = await import('./src/regions/solver.ts');
// time single count calls on the first layout by hijacking: generate with tiny step budget
let n = 0;
const t0 = performance.now();
const iv = setInterval(() => {}, 1000);
try {
  const spec = generateStars(1, 'genius');
  console.log('generated', performance.now() - t0, 'calls', g.__calls, 'steps', g.__steps, 'attempts', g.__attempts, 'capped', g.__cap, 'solverMs', g.__ms);
  const t1 = performance.now();
  console.log(countRegionsSolutions(spec, 2), performance.now() - t1);
} finally { clearInterval(iv); }
