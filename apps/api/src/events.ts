import { parseTelemetryEvent, periodKey, type TelemetryEvent } from '@puzzle-hustle/core';

export const MAX_EVENTS = 50;
// Rows older than this are deleted by the scheduled cleanup.
export const KEEP_DAYS = 400;
// A queue that sat offline for weeks still counts; anything older is a broken clock.
const MAX_AGE_DAYS = 60;

function dayOffset(day: string, today: string): number {
  return (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000;
}

// Invalid events are dropped one by one; the rest of the batch still counts.
export async function storeEvents(db: D1Database, input: unknown[], now: Date = new Date()): Promise<number> {
  const today = periodKey('daily', now);
  const valid = input
    .map(parseTelemetryEvent)
    .filter((e): e is TelemetryEvent => e !== null)
    .filter((e) => {
      const offset = dayOffset(e.day, today);
      return offset >= -1 && offset <= MAX_AGE_DAYS;
    });
  if (valid.length === 0) return 0;
  const insert = db.prepare(
    'INSERT INTO events (day, kind, platform, build, age, type, difficulty, mode, level, outcome, seconds, moves, hints, resumed, first, step) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  await db.batch(
    valid.map((e) => {
      const a = e.kind === 'attempt' ? e : null;
      return insert.bind(
        e.day,
        e.kind,
        e.platform,
        e.build,
        e.age,
        a?.type ?? null,
        a?.difficulty ?? null,
        a?.mode ?? null,
        a?.level ?? null,
        e.kind === 'launch' ? null : e.outcome,
        a?.seconds ?? null,
        a?.moves ?? null,
        a?.hints ?? null,
        a ? Number(a.resumed) : null,
        a ? Number(a.first) : null,
        e.kind === 'intro' ? e.step : null,
      );
    }),
  );
  return valid.length;
}

export async function pruneEvents(db: D1Database, now: Date = new Date()): Promise<void> {
  const cutoff = periodKey('daily', new Date(now.getTime() - KEEP_DAYS * 86_400_000));
  await db.prepare('DELETE FROM events WHERE day < ?').bind(cutoff).run();
}
