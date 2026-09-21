import { verifySession } from './token.ts';
import type { Env } from './http.ts';

export interface Player {
  id: string;
  name: string;
}

export async function upsertPlayer(db: D1Database, provider: string, subject: string, name: string): Promise<Player> {
  const existing = await db
    .prepare('SELECT id, name FROM players WHERE provider = ? AND subject = ?')
    .bind(provider, subject)
    .first<Player>();
  if (existing) return existing;

  const id = crypto.randomUUID();
  try {
    await db
      .prepare('INSERT INTO players (id, provider, subject, name, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, provider, subject, name, Date.now())
      .run();
    return { id, name };
  } catch {
    // Someone else created this player between our select and our insert. The unique
    // constraint did its job; read back what they wrote.
    const raced = await db
      .prepare('SELECT id, name FROM players WHERE provider = ? AND subject = ?')
      .bind(provider, subject)
      .first<Player>();
    if (raced) return raced;
    throw new Error('player insert failed');
  }
}

export async function requirePlayer(request: Request, env: Env): Promise<string | null> {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const playerId = await verifySession(header.slice(7), env.SESSION_SECRET);
  if (!playerId) return null;
  const row = await env.DB.prepare('SELECT id FROM players WHERE id = ?').bind(playerId).first<{ id: string }>();
  return row ? playerId : null;
}
