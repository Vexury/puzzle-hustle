import { minimumSeconds, parsePuzzleId, periodEndsAt, periodKey } from '@puzzle-hustle/core';

export const GRACE_MS = 48 * 3600_000;
export const DAILY_LIMIT = 40;
export const MAX_BATCH = 20;

export interface ScoreEntry {
  puzzle: string;
  seconds: number;
  hints: number;
  moves: number;
  solvedAt: number;
}

export type SubmitStatus = 'stored' | 'duplicate' | 'rejected' | 'expired' | 'throttled';
export interface SubmitResult {
  puzzle: string;
  status: SubmitStatus;
}

function readEntry(raw: unknown): ScoreEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const numbers = ['seconds', 'hints', 'moves', 'solvedAt'] as const;
  if (typeof value.puzzle !== 'string') return null;
  for (const field of numbers) {
    if (typeof value[field] !== 'number' || !Number.isFinite(value[field]) || (value[field] as number) < 0) return null;
  }
  return {
    puzzle: value.puzzle,
    seconds: Math.round(value.seconds as number),
    hints: Math.round(value.hints as number),
    moves: Math.round(value.moves as number),
    solvedAt: Math.round(value.solvedAt as number),
  };
}

function judge(entry: ScoreEntry, now: number): SubmitStatus | null {
  const parsed = parsePuzzleId(entry.puzzle);
  if (!parsed) return 'rejected';
  const ends = periodEndsAt(parsed.period, parsed.key);
  if (!ends) return 'rejected';
  // A period that has not started yet cannot have been solved, whatever the client claims.
  // Every period key sorts lexicographically inside its own period, so a plain string
  // comparison against today's key is exact and needs no date arithmetic.
  if (parsed.key > periodKey(parsed.period, new Date(now))) return 'rejected';
  if (now > ends.getTime() + GRACE_MS) return 'expired';
  if (entry.moves < 1) return 'rejected';
  if (entry.seconds < minimumSeconds(parsed.type, parsed.period)) return 'rejected';
  if (entry.seconds > 24 * 3600) return 'rejected';
  return null;
}

export async function submitScores(
  db: D1Database,
  playerId: string,
  raw: unknown[],
  now = Date.now(),
): Promise<SubmitResult[]> {
  const recent = await db
    .prepare('SELECT COUNT(*) AS n FROM scores WHERE player_id = ? AND created_at > ?')
    .bind(playerId, now - 86400000)
    .first<{ n: number }>();
  let budget = DAILY_LIMIT - (recent?.n ?? 0);

  const results: SubmitResult[] = [];
  for (const item of raw) {
    const entry = readEntry(item);
    if (!entry) {
      results.push({ puzzle: typeof (item as { puzzle?: unknown })?.puzzle === 'string' ? String((item as { puzzle: string }).puzzle) : '', status: 'rejected' });
      continue;
    }
    // The first stored solve for a puzzle settles it: a later submission for the same
    // (player, puzzle) is a duplicate no matter what it claims, so this must be checked
    // before the entry is judged for plausibility. The insert's own failure below is the
    // fallback for the race between this check and that insert, not the primary mechanism.
    const already = await db
      .prepare('SELECT 1 AS ok FROM scores WHERE player_id = ? AND puzzle = ?')
      .bind(playerId, entry.puzzle)
      .first<{ ok: number }>();
    if (already) {
      results.push({ puzzle: entry.puzzle, status: 'duplicate' });
      continue;
    }
    const verdict = judge(entry, now);
    if (verdict) {
      results.push({ puzzle: entry.puzzle, status: verdict });
      continue;
    }
    if (budget <= 0) {
      results.push({ puzzle: entry.puzzle, status: 'throttled' });
      continue;
    }
    try {
      await db
        .prepare(
          'INSERT INTO scores (player_id, puzzle, seconds, hints, moves, solved_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(playerId, entry.puzzle, entry.seconds, entry.hints, entry.moves, entry.solvedAt, now)
        .run();
      budget--;
      results.push({ puzzle: entry.puzzle, status: 'stored' });
    } catch {
      // The primary key is (player_id, puzzle): a failure here means the first solve is
      // already stored, and the first solve is the one that counts.
      results.push({ puzzle: entry.puzzle, status: 'duplicate' });
    }
  }
  return results;
}
