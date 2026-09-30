// Pure evaluation of the usage events, kept apart from report.ts so it can be tested without D1.

export interface AttemptRow {
  day: string;
  platform: string;
  build: string;
  age: number;
  type: string;
  difficulty: string;
  mode: string;
  level: number | null;
  outcome: 'solved' | 'left';
  seconds: number;
  moves: number;
  hints: number;
  resumed: number;
  first: number;
}

export interface LaunchRow {
  day: string;
  age: number;
  n: number;
}

export interface IntroRow {
  outcome: 'done' | 'skipped';
  step: number;
  n: number;
}

// A daily should take a typical player this long; DAILY_DIFFICULTY is tuned towards it.
export const DAILY_TARGET_SECONDS = { min: 60, max: 240 };
// Below this many rows a number is shown but not flagged.
export const MIN_SAMPLE = 10;

export function quantile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

const pct = (part: number, whole: number) => (whole === 0 ? '–' : `${Math.round((100 * part) / whole)} %`);
const time = (s: number | null) => (s === null ? '–' : s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`);

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    out.set(k, [...(out.get(k) ?? []), row]);
  }
  return out;
}

function table(head: string[], rows: string[][]): string {
  return [`| ${head.join(' | ')} |`, `|${head.map(() => ' --- ').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

export function dailySection(attempts: readonly AttemptRow[]): string {
  const rows = [...groupBy(attempts.filter((a) => a.mode === 'daily'), (a) => a.type)].sort(([a], [b]) => a.localeCompare(b));
  if (rows.length === 0) return 'Keine Daily-Versuche im Zeitraum.';
  const flags: string[] = [];
  const body = rows.map(([type, list]) => {
    const solved = list.filter((a) => a.outcome === 'solved');
    const clean = solved.filter((a) => a.hints === 0).map((a) => a.seconds);
    const median = quantile(clean, 0.5);
    if (clean.length >= MIN_SAMPLE && median !== null) {
      if (median > DAILY_TARGET_SECONDS.max) flags.push(`${type}: Median ${time(median)} ueber ${time(DAILY_TARGET_SECONDS.max)}, Daily-Stufe senken?`);
      if (median < DAILY_TARGET_SECONDS.min) flags.push(`${type}: Median ${time(median)} unter ${time(DAILY_TARGET_SECONDS.min)}, Daily-Stufe anheben?`);
    }
    return [
      type,
      String(list.length),
      pct(solved.length, list.length),
      time(median),
      time(quantile(clean, 0.75)),
      pct(solved.filter((a) => a.hints > 0).length, solved.length),
      time(quantile(list.filter((a) => a.outcome === 'left').map((a) => a.seconds), 0.5)),
    ];
  });
  return [
    table(['Typ', 'Versuche', 'geloest', 'Median ohne Hint', 'P75 ohne Hint', 'mit Hint', 'Median bis Abbruch'], body),
    ...(flags.length ? ['', ...flags.map((f) => `- ${f}`)] : []),
  ].join('\n');
}

// A player's first visit to a type: where do new players give up?
export function firstContactSection(attempts: readonly AttemptRow[]): string {
  const rows = [...groupBy(attempts.filter((a) => a.first === 1), (a) => a.type)].sort(([a], [b]) => a.localeCompare(b));
  if (rows.length === 0) return 'Keine Erstkontakte im Zeitraum.';
  return table(
    ['Typ', 'Erstkontakte', 'geloest', 'Median bis Abbruch'],
    rows.map(([type, list]) => [
      type,
      String(list.length),
      pct(list.filter((a) => a.outcome === 'solved').length, list.length),
      time(quantile(list.filter((a) => a.outcome === 'left').map((a) => a.seconds), 0.5)),
    ]),
  );
}

// Levels that are left more often than solved stand out in an otherwise smooth pack.
export function stickyLevelsSection(attempts: readonly AttemptRow[], limit = 10): string {
  const levels = groupBy(attempts.filter((a) => a.mode === 'level' && a.level !== null), (a) => `${a.type} ${a.difficulty} #${a.level}`);
  const rows = [...levels]
    .map(([name, list]) => ({ name, n: list.length, left: list.filter((a) => a.outcome === 'left').length }))
    .filter((r) => r.n >= 3 && r.left > 0)
    .sort((a, b) => b.left / b.n - a.left / a.n || b.n - a.n)
    .slice(0, limit);
  if (rows.length === 0) return 'Kein Level mit mindestens 3 Versuchen und Abbruechen.';
  return table(['Level', 'Versuche', 'abgebrochen'], rows.map((r) => [r.name, String(r.n), pct(r.left, r.n)]));
}

// Next-day retention: devices on their second day over devices on their first, one day earlier.
export function retentionSection(launches: readonly LaunchRow[]): string {
  const count = (day: string, age: number) => launches.filter((l) => l.day === day && l.age === age).reduce((n, l) => n + l.n, 0);
  const prev = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const days = [...new Set(launches.map((l) => l.day))].sort();
  let fresh = 0;
  let back = 0;
  for (const day of days) {
    const f = count(prev(day), 0);
    if (f === 0) continue;
    fresh += f;
    back += count(day, 1);
  }
  const active = groupBy([...launches], (l) => l.day);
  const perDay = days.slice(-7).map((d) => `${d.slice(5)}: ${(active.get(d) ?? []).reduce((n, l) => n + l.n, 0)}`);
  return [
    `- Aktive Geraete je Tag (letzte 7): ${perDay.join(', ') || '–'}`,
    `- Neue Geraete im Zeitraum: ${days.reduce((n, d) => n + count(d, 0), 0)}`,
    `- Am Folgetag zurueck: ${pct(back, fresh)} (${back} von ${fresh})`,
  ].join('\n');
}

export function introSection(intro: readonly IntroRow[]): string {
  const done = intro.filter((i) => i.outcome === 'done').reduce((n, i) => n + i.n, 0);
  const skipped = intro.filter((i) => i.outcome === 'skipped');
  const total = done + skipped.reduce((n, i) => n + i.n, 0);
  if (total === 0) return 'Kein Erststart im Zeitraum.';
  const at = skipped.map((i) => `Karte ${i.step + 1}: ${i.n}`).join(', ');
  return `- Durchgeklickt: ${pct(done, total)} von ${total}\n- Uebersprungen bei ${at || '–'}`;
}

const MODE_ORDER = ['daily', 'weekly', 'monthly', 'level', 'hustle', 'random'];
const DIFFICULTY_ORDER = ['easy', 'medium', 'hard', 'genius'];
const order = (list: string[], v: string) => (list.includes(v) ? list.indexOf(v) : list.length);

// Play times of every mode, type and difficulty: the measure the difficulty settings are tuned by,
// since generator scores only compare boards of one type.
export function timesSection(attempts: readonly AttemptRow[]): string {
  const groups = [...groupBy(attempts, (a) => `${a.mode}|${a.type}|${a.difficulty}`)].sort(([a], [b]) => {
    const [ma, ta, da] = a.split('|') as [string, string, string];
    const [mb, tb, db] = b.split('|') as [string, string, string];
    return order(MODE_ORDER, ma) - order(MODE_ORDER, mb) || ta.localeCompare(tb) || order(DIFFICULTY_ORDER, da) - order(DIFFICULTY_ORDER, db);
  });
  if (groups.length === 0) return 'Keine Versuche im Zeitraum.';
  return table(
    ['Modus', 'Typ', 'Stufe', 'Versuche', 'geloest', 'Median ohne Hint', 'P75 ohne Hint', 'mit Hint'],
    groups.map(([k, list]) => {
      const [mode, type, difficulty] = k.split('|') as [string, string, string];
      const solved = list.filter((a) => a.outcome === 'solved');
      const clean = solved.filter((a) => a.hints === 0).map((a) => a.seconds);
      return [mode, type, difficulty, String(list.length), pct(solved.length, list.length), time(quantile(clean, 0.5)), time(quantile(clean, 0.75)), pct(solved.filter((a) => a.hints > 0).length, solved.length)];
    }),
  );
}

// How a type's generator score relates to real time: solves without a hint, split into thirds by
// the score of their board (`scoreOf` rebuilds it; null where the board cannot be known, as for
// random). Rising medians from the low to the high third mean the score can steer that type.
export function scoreSection(attempts: readonly AttemptRow[], scoreOf: (a: AttemptRow) => number | null): string {
  const byType = groupBy(
    attempts.filter((a) => a.outcome === 'solved' && a.hints === 0),
    (a) => a.type,
  );
  const rows: string[][] = [];
  for (const [type, list] of [...byType].sort(([a], [b]) => a.localeCompare(b))) {
    const scored = list.map((a) => ({ score: scoreOf(a), seconds: a.seconds })).filter((x): x is { score: number; seconds: number } => x.score !== null);
    if (scored.length < 3) continue;
    scored.sort((a, b) => a.score - b.score);
    const third = Math.ceil(scored.length / 3);
    const parts = [scored.slice(0, third), scored.slice(third, 2 * third), scored.slice(2 * third)];
    rows.push([
      type,
      String(scored.length),
      ...parts.map((p) => (p.length ? `${time(quantile(p.map((x) => x.seconds), 0.5))} (${Math.round(p[0]!.score)}–${Math.round(p[p.length - 1]!.score)})` : '–')),
    ]);
  }
  if (rows.length === 0) return 'Zu wenige Loesungen mit bekanntem Brett.';
  return [
    table(['Typ', 'Loesungen', 'Median, leichtes Drittel (Score)', 'mittleres Drittel', 'schweres Drittel'], rows),
    '',
    '- Score nach dem aktuellen Generator; Versuche aus Builds vor einer Generator-Aenderung koennen zu einem anderen Brett gehoeren.',
  ].join('\n');
}

export function report(
  days: number,
  attempts: readonly AttemptRow[],
  launches: readonly LaunchRow[],
  intro: readonly IntroRow[],
  scoreOf: (a: AttemptRow) => number | null = () => null,
): string {
  return [
    `# Puzzle Hustle, Nutzung der letzten ${days} Tage`,
    '',
    '## Geraete',
    retentionSection(launches),
    '',
    '## Dailys je Typ',
    dailySection(attempts),
    '',
    '## Spielzeiten je Modus, Typ und Stufe',
    timesSection(attempts),
    '',
    '## Score gegen Spielzeit je Typ',
    scoreSection(attempts, scoreOf),
    '',
    '## Erstkontakt je Typ',
    firstContactSection(attempts),
    '',
    '## Auffaellige Level',
    stickyLevelsSection(attempts),
    '',
    '## Erststart',
    introSection(intro),
    '',
  ].join('\n');
}
