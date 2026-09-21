import { validateName } from './names.ts';

export const MAX_MEMBERS = 50;
export const MAX_GROUPS = 5;

// Crockford base32 without I, L, O and U: no character pair a person can confuse when
// reading a code off a phone screen, and no accidental words.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export interface GroupRow {
  id: string;
  code: string;
  name: string;
  members: number;
  owner: boolean;
}

export function newGroupCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export async function listGroups(db: D1Database, playerId: string): Promise<GroupRow[]> {
  const { results } = await db
    .prepare(
      `SELECT g.id, g.code, g.name, g.owner_id AS ownerId,
              (SELECT COUNT(*) FROM members m2 WHERE m2.group_id = g.id) AS members
         FROM members m
         JOIN groups g ON g.id = m.group_id
        WHERE m.player_id = ?
        ORDER BY m.joined_at`,
    )
    .bind(playerId)
    .all<{ id: string; code: string; name: string; ownerId: string; members: number }>();
  return results.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    members: row.members,
    owner: row.ownerId === playerId,
  }));
}

export async function createGroup(
  db: D1Database,
  ownerId: string,
  rawName: string,
): Promise<{ ok: true; group: GroupRow } | { ok: false; reason: 'name' | 'limit' }> {
  const name = validateName(rawName);
  if (!name.ok) return { ok: false, reason: 'name' };

  const owned = await db
    .prepare('SELECT COUNT(*) AS n FROM members WHERE player_id = ?')
    .bind(ownerId)
    .first<{ n: number }>();
  if ((owned?.n ?? 0) >= MAX_GROUPS) return { ok: false, reason: 'limit' };

  const id = crypto.randomUUID();
  const now = Date.now();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newGroupCode();
    try {
      await db
        .prepare('INSERT INTO groups (id, code, name, owner_id, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(id, code, name.name, ownerId, now)
        .run();
      await db
        .prepare('INSERT INTO members (group_id, player_id, joined_at) VALUES (?, ?, ?)')
        .bind(id, ownerId, now)
        .run();
      return { ok: true, group: { id, code, name: name.name, members: 1, owner: true } };
    } catch {
      /* code collision, draw another */
    }
  }
  return { ok: false, reason: 'limit' };
}

export async function joinGroup(
  db: D1Database,
  playerId: string,
  rawCode: string,
): Promise<{ ok: true; group: GroupRow } | { ok: false; reason: 'unknown' | 'already' | 'full' | 'limit' }> {
  const code = rawCode.trim().toUpperCase();
  const group = await db
    .prepare('SELECT id, code, name, owner_id AS ownerId FROM groups WHERE code = ?')
    .bind(code)
    .first<{ id: string; code: string; name: string; ownerId: string }>();
  if (!group) return { ok: false, reason: 'unknown' };

  const already = await db
    .prepare('SELECT 1 AS ok FROM members WHERE group_id = ? AND player_id = ?')
    .bind(group.id, playerId)
    .first<{ ok: number }>();
  if (already) return { ok: false, reason: 'already' };

  const members = await db
    .prepare('SELECT COUNT(*) AS n FROM members WHERE group_id = ?')
    .bind(group.id)
    .first<{ n: number }>();
  if ((members?.n ?? 0) >= MAX_MEMBERS) return { ok: false, reason: 'full' };

  const mine = await db
    .prepare('SELECT COUNT(*) AS n FROM members WHERE player_id = ?')
    .bind(playerId)
    .first<{ n: number }>();
  if ((mine?.n ?? 0) >= MAX_GROUPS) return { ok: false, reason: 'limit' };

  try {
    await db
      .prepare('INSERT INTO members (group_id, player_id, joined_at) VALUES (?, ?, ?)')
      .bind(group.id, playerId, Date.now())
      .run();
  } catch {
    return { ok: false, reason: 'already' };
  }
  return {
    ok: true,
    group: { id: group.id, code: group.code, name: group.name, members: (members?.n ?? 0) + 1, owner: false },
  };
}

// Leaving is also how a group dies: the last member out deletes it, and an owner who leaves
// hands the group to whoever has been in it longest.
export async function leaveGroup(db: D1Database, playerId: string, groupId: string): Promise<void> {
  await db.prepare('DELETE FROM members WHERE group_id = ? AND player_id = ?').bind(groupId, playerId).run();
  // player_id is only a tiebreaker for two members who joined in the same millisecond, so the
  // pick is repeatable for the same data, not a claim that the id order means anything.
  const next = await db
    .prepare('SELECT player_id AS id FROM members WHERE group_id = ? ORDER BY joined_at, player_id LIMIT 1')
    .bind(groupId)
    .first<{ id: string }>();
  if (!next) {
    await db.prepare('DELETE FROM groups WHERE id = ?').bind(groupId).run();
    return;
  }
  await db.prepare('UPDATE groups SET owner_id = ? WHERE id = ? AND owner_id = ?').bind(next.id, groupId, playerId).run();
}

export async function removeMember(
  db: D1Database,
  ownerId: string,
  groupId: string,
  playerId: string,
): Promise<boolean> {
  const group = await db
    .prepare('SELECT owner_id AS ownerId FROM groups WHERE id = ?')
    .bind(groupId)
    .first<{ ownerId: string }>();
  if (!group || group.ownerId !== ownerId || playerId === ownerId) return false;
  await db.prepare('DELETE FROM members WHERE group_id = ? AND player_id = ?').bind(groupId, playerId).run();
  return true;
}
