import { nextPeriodStart, periodDifficulty } from './schedule.ts';
import { isPeriod, isPuzzleTypeId, type Difficulty, type Period, type PuzzleTypeId } from './types.ts';

export interface ParsedPuzzleId {
  type: PuzzleTypeId;
  period: Period;
  key: string;
  difficulty: Difficulty;
}

// A date inside the period the key names, at noon UTC so no time zone can push it into a
// neighbouring day. Returns null for a key that does not describe a real period.
function dateInPeriod(period: Period, key: string): Date | null {
  if (period === 'daily') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const probe = new Date(Date.UTC(y, mo - 1, d, 12));
    if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
    return probe;
  }
  if (period === 'weekly') {
    const m = /^(\d{4})-W(\d{2})$/.exec(key);
    if (!m) return null;
    const [y, w] = [Number(m[1]), Number(m[2])];
    if (w < 1 || w > 53) return null;
    // ISO 8601: week 1 is the week holding 4 January. Walk back to that week's Monday.
    const jan4 = new Date(Date.UTC(y, 0, 4, 12));
    const monday = jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86400000;
    const probe = new Date(monday + (w - 1) * 7 * 86400000);
    if (probe.getUTCFullYear() > y + 1) return null;
    return probe;
  }
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return new Date(Date.UTC(Number(m[1]), mo - 1, 15, 12));
}

export function parsePuzzleId(id: string): ParsedPuzzleId | null {
  const parts = id.split(':');
  if (parts.length !== 3) return null;
  const [type, period, key] = parts;
  if (!isPuzzleTypeId(type) || !isPeriod(period) || !key) return null;
  if (!dateInPeriod(period, key)) return null;
  return { type, period, key, difficulty: periodDifficulty(type, period) };
}

export function periodEndsAt(period: Period, key: string): Date | null {
  const inside = dateInPeriod(period, key);
  return inside ? nextPeriodStart(period, inside) : null;
}
