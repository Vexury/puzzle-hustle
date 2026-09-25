import { validateName } from './names.ts';

export const MAX_MEMBERS = 50;
export const MAX_GROUPS = 5;

// Crockford base32 without I, L, O and U: no character pair a person can confuse when
// reading a code off a phone screen, and no accidental words.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// Crockford's decoding rules: a typed O means 0, an I or L means 1.
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');
}

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
): Promise<{ ok: true; group: GroupRow } | { ok: false; reason: 'name' | 'limit' | 'collision' }> {
  const name = validateName(rawName);
  if (!name.ok) return { ok: false, reason: 'name' };

  const owned = await db
    .prepare('SELECT COUNT(*) AS n FROM members WHERE player_id = ?')
    .bind(ownerId)
    .first<{ n: number }>();
  if ((owned?.n ?? 0) >= MAX_GROUPS) return { ok: false, reason: 'limit' };

  const now = Date.now();
  for (let attempt = 0; attempt < 5; attempt++) {
    // Fresh id and code every attempt: a retry is a genuinely new insert, never a collision
    // against a row a previous attempt in this same call already left behind.
    const id = crypto.randomUUID();
    const code = newGroupCode();
    try {
      await db.batch([
        db
          .prepare('INSERT INTO groups (id, code, name, owner_id, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(id, code, name.name, ownerId, now),
        db.prepare('INSERT INTO members (group_id, player_id, joined_at) VALUES (?, ?, ?)').bind(id, ownerId, now),
      ]);
      return { ok: true, group: { id, code, name: name.name, members: 1, owner: true } };
    } catch {
      // Batched as one transaction, so a failure here — most likely the code's UNIQUE
      // constraint — leaves neither insert behind. Draw fresh values and try again.
    }
  }
  return { ok: false, reason: 'collision' };
}

export async function joinGroup(
  db: D1Database,
  playerId: string,
  rawCode: string,
): Promise<
  { ok: true; group: GroupRow } | { ok: false; reason: 'unknown' | 'already' | 'full' | 'limit' | 'banned' }
> {
  const code = normalizeCode(rawCode);

  // Checked before the code is looked up, so a player at the cap cannot learn which codes
  // exist. Only a group they are already in gets the more precise answer.
  const mine = await db
    .prepare('SELECT COUNT(*) AS n FROM members WHERE player_id = ?')
    .bind(playerId)
    .first<{ n: number }>();
  if ((mine?.n ?? 0) >= MAX_GROUPS) {
    const own = await db
      .prepare('SELECT 1 AS ok FROM members m JOIN groups g ON g.id = m.group_id WHERE g.code = ? AND m.player_id = ?')
      .bind(code, playerId)
      .first<{ ok: number }>();
    return { ok: false, reason: own ? 'already' : 'limit' };
  }

  const group = await db
    .prepare('SELECT id, code, name, owner_id AS ownerId FROM groups WHERE code = ?')
    .bind(code)
    .first<{ id: string; code: string; name: string; ownerId: string }>();
  if (!group) return { ok: false, reason: 'unknown' };

  const banned = await db
    .prepare('SELECT 1 AS ok FROM group_bans WHERE group_id = ? AND player_id = ?')
    .bind(group.id, playerId)
    .first<{ ok: number }>();
  if (banned) return { ok: false, reason: 'banned' };

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
  const deleted = await db.prepare('DELETE FROM members WHERE group_id = ? AND player_id = ?').bind(groupId, playerId).run();
  // Not a real exploit today (the caller only ever passes its own group ids), but nothing
  // stops that from changing, and there is no reason to hand ownership on or delete a group
  // over a membership that was never there.
  if (deleted.meta.changes === 0) return;
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
  // Removal is for keeping someone out, so it also bans them from rejoining with the same code.
  // The ban is taken from the members row, so only a real member is banned; one transaction.
  await db.batch([
    db
      .prepare(
        'INSERT OR IGNORE INTO group_bans (group_id, player_id, created_at) SELECT group_id, player_id, ? FROM members WHERE group_id = ? AND player_id = ?',
      )
      .bind(Date.now(), groupId, playerId),
    db.prepare('DELETE FROM members WHERE group_id = ? AND player_id = ?').bind(groupId, playerId),
  ]);
  return true;
}
