import { verifySession } from './token.ts';
import type { Env } from './http.ts';

export interface Player {
  id: string;
  name: string;
}

export async function upsertPlayer(db: D1Database, provider: string, subject: string, name: string): Promise<Player> {
  const inserted = await db
    .prepare(
      `INSERT INTO players (id, provider, subject, name, created_at)
            VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (provider, subject) DO NOTHING
         RETURNING id, name`,
    )
    .bind(crypto.randomUUID(), provider, subject, name, Date.now())
    .first<Player>();
  if (inserted) return inserted;

  // The row was already there, either from an earlier sign-in or from a request that
  // raced this one. Either way the first name wins, which is what the caller expects.
  const existing = await db
    .prepare('SELECT id, name FROM players WHERE provider = ? AND subject = ?')
    .bind(provider, subject)
    .first<Player>();
  if (!existing) throw new Error('player upsert failed');
  return existing;
}

export async function requirePlayer(request: Request, env: Env): Promise<string | null> {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const playerId = await verifySession(header.slice(7), env.SESSION_SECRET);
  if (!playerId) return null;
  const row = await env.DB.prepare('SELECT id FROM players WHERE id = ?').bind(playerId).first<{ id: string }>();
  return row ? playerId : null;
}
