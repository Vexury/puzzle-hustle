export interface BoardEntry {
  playerId: string;
  name: string;
  badge: string | null;
  flair: string | null;
  seconds: number;
  hints: number;
}

export interface Board {
  entries: BoardEntry[];
  me: number | null;
  percentile: { total: number; faster: number } | null;
}

export async function readBoard(
  db: D1Database,
  playerId: string,
  groupId: string,
  puzzle: string,
): Promise<Board | null> {
  const member = await db
    .prepare('SELECT 1 AS ok FROM members WHERE group_id = ? AND player_id = ?')
    .bind(groupId, playerId)
    .first<{ ok: number }>();
  if (!member) return null;

  const { results } = await db
    .prepare(
      `SELECT s.player_id AS playerId, p.name, p.badge, p.flair, s.seconds, s.hints
         FROM scores s
         JOIN members m ON m.player_id = s.player_id AND m.group_id = ?
         JOIN players p ON p.id = s.player_id
        WHERE s.puzzle = ?
        ORDER BY s.hints, s.seconds, s.created_at, s.player_id`,
    )
    .bind(groupId, puzzle)
    .all<BoardEntry>();

  const index = results.findIndex((row) => row.playerId === playerId);
  const mine = results[index];
  let percentile: Board['percentile'] = null;
  if (mine) {
    const counts = await db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN hints < ?1 OR (hints = ?1 AND seconds < ?2) THEN 1 ELSE 0 END) AS faster
           FROM scores WHERE puzzle = ?3`,
      )
      .bind(mine.hints, mine.seconds, puzzle)
      .first<{ total: number; faster: number }>();
    if (counts) percentile = { total: counts.total, faster: counts.faster ?? 0 };
  }

  return { entries: results, me: index >= 0 ? index + 1 : null, percentile };
}
