import { emptySave, HUSTLE_MAX_STAGE, hustleSolved, mergeSave, parseSaveData, saveSolveEntries, type SaveData } from '@puzzle-hustle/core';

export const MAX_SAVE_CHARS = 1_000_000;

// Read, merge, write only if nobody wrote in between. A second device that got there first just
// means one more merge, which costs nothing because the merge does not care about order.
export async function syncSave(db: D1Database, playerId: string, incoming: SaveData): Promise<SaveData | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const row = await db.prepare('SELECT data, updated_at AS updatedAt FROM saves WHERE player_id = ?')
      .bind(playerId)
      .first<{ data: string; updatedAt: number }>();
    const stored = row ? (parseSaveData(JSON.parse(row.data)) ?? emptySave()) : emptySave();
    const merged = mergeSave(stored, incoming);
    const data = JSON.stringify(merged);
    const now = Math.max(Date.now(), (row?.updatedAt ?? 0) + 1);
    const write = row
      ? db.prepare('UPDATE saves SET data = ?, updated_at = ? WHERE player_id = ? AND updated_at = ?').bind(data, now, playerId, row.updatedAt)
      : db.prepare('INSERT INTO saves (player_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(player_id) DO NOTHING').bind(playerId, data, now);
    const result = await write.run();
    if (result.meta.changes !== 1) continue;
    // Exact, not MAX like POST /hustle: the save is the whole truth, so a reset lowers the chip.
    const level = Math.min(HUSTLE_MAX_STAGE, hustleSolved(saveSolveEntries(merged.solves)));
    await db.prepare('UPDATE players SET hustle = ? WHERE id = ?').bind(level, playerId).run();
    return merged;
  }
  return null;
}
