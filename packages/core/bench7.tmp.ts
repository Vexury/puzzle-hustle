import { generateStars } from './src/regions/puzzle.ts';
const g = globalThis as any;
g.__snake = 0.5; g.__trace = true;
g.__calls = 0; g.__ms = 0; g.__steps = 0; g.__attempts = 0; g.__cap = 0;
try { generateStars(1, 'genius'); } catch (e) { console.log(String(e), 'attempts', g.__attempts, 'calls', g.__calls, 'ms', g.__ms); }
