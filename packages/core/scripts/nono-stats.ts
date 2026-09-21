import { generateNonogram } from '../src/nonogram/puzzle.ts';
import { nonogramDifficultyReport } from '../src/nonogram/solver.ts';
import type { Difficulty } from '../src/types.ts';

const N = Number(process.argv[2] ?? 400);

const pct = (a: number[], p: number) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))]!;

function sample(label: string, difficulty: Difficulty, colorDelta: number, sizeDelta: number) {
  const scores: number[] = [];
  const rounds: number[] = [];
  const depths: number[] = [];
  for (let i = 0; i < N; i++) {
    const spec = generateNonogram(7_000_000 + i * 104_729, difficulty, { colorDelta, sizeDelta });
    const rep = nonogramDifficultyReport(spec);
    scores.push(rep.score);
    rounds.push(rep.rounds);
    depths.push(Math.max(...spec.rowClues.map((c) => c.length)));
  }
  const share = (min: number) => Math.round((scores.filter((s) => s >= min).length / N) * 100);
  console.log(
    [
      label.padEnd(16),
      `p10 ${pct(scores, 0.1)}`.padEnd(10),
      `p50 ${pct(scores, 0.5)}`.padEnd(10),
      `p90 ${pct(scores, 0.9)}`.padEnd(10),
      `max ${pct(scores, 0.999)}`.padEnd(10),
      `Runden p90 ${pct(rounds, 0.9)}`.padEnd(15),
      `Tiefe p90 ${pct(depths, 0.9)}/${pct(depths, 0.999)}`.padEnd(16),
      `>=60: ${share(60)}%  >=70: ${share(70)}%  >=75: ${share(75)}%`,
    ].join(' '),
  );
}

sample('10x10 1 Farbe', 'medium', 0, 0);
sample('10x10 2 Farben', 'hard', 0, 0);
sample('10x10 3 Farben', 'genius', 0, 0);
