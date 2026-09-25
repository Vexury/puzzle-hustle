import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, readSession, writeSession } from '../src/lib/api.ts';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('stores and reads a session', () => {
  expect(readSession()).toBeNull();
  writeSession({ token: 't', player: { id: 'p', name: 'Moritz' } });
  expect(readSession()?.player.name).toBe('Moritz');
  writeSession(null);
  expect(readSession()).toBeNull();
});

it('sends the bearer token when asked to', async () => {
  writeSession({ token: 't', player: { id: 'p', name: 'Moritz' } });
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{"ok":true}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);

  await apiFetch('/groups', { auth: true });
  const headers = new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers);
  expect(headers.get('Authorization')).toBe('Bearer t');
});

it('turns an error answer into an ApiError with its code', async () => {
  vi.stubGlobal('fetch', async () => new Response('{"error":"group_unknown"}', { status: 404 }));
  await expect(apiFetch('/groups/join')).rejects.toMatchObject({ code: 'group_unknown', status: 404 });
});

it('turns a network failure into an offline error', async () => {
  vi.stubGlobal('fetch', async () => {
    throw new TypeError('Failed to fetch');
  });
  await expect(apiFetch('/health')).rejects.toBeInstanceOf(ApiError);
  await expect(apiFetch('/health')).rejects.toMatchObject({ code: 'offline' });
});

it('drops the session on a 401 so the app stops pretending to be signed in', async () => {
  writeSession({ token: 't', player: { id: 'p', name: 'Moritz' } });
  vi.stubGlobal('fetch', async () => new Response('{"error":"unauthorized"}', { status: 401 }));
  await expect(apiFetch('/groups', { auth: true })).rejects.toMatchObject({ code: 'unauthorized' });
  expect(readSession()).toBeNull();
});

it('turns an unparseable 200 body into a bad_response error', async () => {
  vi.stubGlobal('fetch', async () => new Response('not json', { status: 200 }));
  await expect(apiFetch('/health')).rejects.toMatchObject({ code: 'bad_response', status: 200 });
});

it('still resolves a 200 whose body is a legitimately empty object', async () => {
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 200 }));
  await expect(apiFetch('/health')).resolves.toEqual({});
});

it('gives up on a stalled request with an offline error', async () => {
  vi.useFakeTimers();
  try {
    vi.stubGlobal('fetch', (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    );
    const pending = apiFetch('/scores', { method: 'POST', body: '{}' });
    const settled = expect(pending).rejects.toMatchObject({ code: 'offline', status: 0 });
    await vi.advanceTimersByTimeAsync(15_000);
    await settled;
  } finally {
    vi.useRealTimers();
  }
});
