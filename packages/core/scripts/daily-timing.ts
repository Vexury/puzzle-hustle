import { scheduledRef } from '../src/ref.ts';
import { periodDifficulty, periodKey } from '../src/schedule.ts';
import { PUZZLE_TYPES } from '../src/types.ts';

const key = periodKey('daily', new Date());
let total = 0;
for (const type of PUZZLE_TYPES) {
  const t0 = Date.now();
  const ref = scheduledRef(type, 'daily', key);
  const ms = Date.now() - t0;
  total += ms;
  console.log(`${type.padEnd(10)} ${periodDifficulty(type, 'daily').padEnd(7)} seed ${String(ref.seed).padEnd(11)} ${ms} ms`);
}
console.log(`\nSumme ${total} ms fuer ${PUZZLE_TYPES.length} Dailys (Schluessel ${key})`);
