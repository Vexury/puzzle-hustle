import { readSetting, writeSetting } from './storage.ts';

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'https://api.puzzles.vexury.dev';

const SESSION_KEY = 'ph:session';

export interface Session {
  token: string;
  player: { id: string; name: string };
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

export function readSession(): Session | null {
  const raw = readSetting(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Session;
    return parsed?.token && parsed.player?.id ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSession(session: Session | null) {
  if (!session) {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* storage unavailable */
    }
    return;
  }
  writeSetting(SESSION_KEY, JSON.stringify(session));
}

export async function apiFetch<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const { auth, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (rest.body) headers.set('Content-Type', 'application/json');
  if (auth) {
    const session = readSession();
    if (!session) throw new ApiError('unauthorized', 401);
    headers.set('Authorization', `Bearer ${session.token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...rest, headers });
  } catch {
    throw new ApiError('offline', 0);
  }

  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    if (response.status === 401) writeSession(null);
    throw new ApiError(data.error ?? 'failed', response.status);
  }
  return data as T;
}
