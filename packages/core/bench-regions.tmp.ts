import { generateCrowns, generateStars, CROWNS_PRESETS, STARS_PRESETS } from './src/regions/puzzle.ts';
import { countRegionsSolutions, regionsDifficultyReport } from './src/regions/solver.ts';
for (const [name, gen] of [['crowns', generateCrowns], ['stars', generateStars]] as const) {
  for (const d of ['easy', 'medium', 'hard', 'genius'] as const) {
    const t0 = performance.now();
    let nodes = 0, logic = 0, score = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const spec = gen(seed, d);
      nodes += countRegionsSolutions(spec, 2).nodes;
      const rep = regionsDifficultyReport(spec);
      score += rep.score;
      if (rep.logicSolved) logic++;
    }
    const ms = performance.now() - t0;
    console.log(name, d, `${(ms / 30).toFixed(1)}ms/puzzle`, 'avgNodes', (nodes / 30).toFixed(0), 'logicSolved', logic, 'avgScore', (score / 30).toFixed(1));
  }
}
