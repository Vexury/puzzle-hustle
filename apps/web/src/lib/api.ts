import { readSetting, removeSetting, writeSetting } from './storage.ts';

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || 'https://puzzles-api.vexury.dev';

const SESSION_KEY = 'ph:session';
// A stalled request (captive portal, half-open connection after resume) would otherwise never
// settle and hold the score queue's single flush for the rest of the session.
const TIMEOUT_MS = 15_000;

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

// The single place a session write is announced. Every writeSession call site used to also
// have to remember an explicit emit() right after it, and one — the 401 handler below — never
// did, so a token going invalid never told the UI. Folding the notification into the write
// itself means there is no separate step left to forget.
const listeners = new Set<() => void>();

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function writeSession(session: Session | null) {
  if (!session) {
    removeSetting(SESSION_KEY);
  } else {
    writeSetting(SESSION_KEY, JSON.stringify(session));
  }
  for (const l of listeners) l();
}

export async function apiFetch<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const { auth, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (rest.body) headers.set('Content-Type', 'application/json');
  const sent = auth ? readSession()?.token : undefined;
  if (auth) {
    if (!sent) throw new ApiError('unauthorized', 401);
    headers.set('Authorization', `Bearer ${sent}`);
  }

  // A plain controller rather than AbortSignal.timeout/any, which older iOS WebViews lack.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  rest.signal?.addEventListener('abort', () => controller.abort());
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...rest, headers, signal: controller.signal });
  } catch {
    clearTimeout(timer);
    throw new ApiError('offline', 0);
  }

  let data: { error?: string } = {};
  let parsed = true;
  try {
    data = (await response.json()) as { error?: string };
  } catch {
    parsed = false;
  }
  clearTimeout(timer);

  if (!response.ok) {
    if (response.status === 401) writeSession(null);
    throw new ApiError(data.error ?? 'failed', response.status);
  }
  if (!parsed) throw new ApiError('bad_response', response.status);
  // The server swaps an ageing token for a fresh one on the way back. Only take it while the
  // session that sent the request is still the current one; a sign-out or account switch in
  // the meantime must not be undone by a late response.
  const renewed = response.headers.get('X-Session-Token');
  const current = readSession();
  if (renewed && current && current.token === sent) writeSession({ ...current, token: renewed });
  return data as T;
}
