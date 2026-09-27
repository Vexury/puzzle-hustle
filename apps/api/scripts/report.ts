// Usage report from the anonymous events in production D1, printed as Markdown.
//
// Usage (from apps/api, CLOUDFLARE_API_TOKEN set):
//   node scripts/report.ts [days=28] [--local]

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { report, type AttemptRow, type IntroRow, type LaunchRow } from './analysis.ts';

const apiRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const days = Number(args.find((a) => /^\d+$/.test(a)) ?? 28);
const where = args.includes('--local') ? '--local' : '--remote';

function wranglerBin(): string {
  const pkgUrl = fileURLToPath(import.meta.resolve('wrangler/package.json'));
  const pkg = JSON.parse(readFileSync(pkgUrl, 'utf8')) as { bin: { wrangler: string } };
  return path.join(path.dirname(pkgUrl), pkg.bin.wrangler);
}

function query<T>(sql: string): T[] {
  const out = execFileSync('node', [wranglerBin(), 'd1', 'execute', 'puzzle-hustle', where, '--json', '--command', sql], {
    cwd: apiRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
  });
  return (JSON.parse(out.toString()) as Array<{ results: T[] }>)[0]?.results ?? [];
}

const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
// The day before the window as well, so the first day's next-day retention has its base.
const sinceLaunch = new Date(Date.now() - (days + 1) * 86_400_000).toISOString().slice(0, 10);

const attempts = query<AttemptRow>(
  `SELECT day, platform, build, age, type, difficulty, mode, level, outcome, seconds, moves, hints, resumed, first FROM events WHERE kind = 'attempt' AND day >= '${since}'`,
);
const launches = query<LaunchRow>(
  `SELECT day, age, COUNT(*) AS n FROM events WHERE kind = 'launch' AND day >= '${sinceLaunch}' GROUP BY day, age`,
);
const intro = query<IntroRow>(
  `SELECT outcome, step, COUNT(*) AS n FROM events WHERE kind = 'intro' AND day >= '${since}' GROUP BY outcome, step`,
);

console.log(report(days, attempts, launches, intro));
