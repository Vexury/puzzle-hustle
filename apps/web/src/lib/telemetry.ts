import { Capacitor } from '@capacitor/core';
import { ageBucket, periodKey, type Platform, type TelemetryEvent, type TelemetryPayload } from '@puzzle-hustle/core';
import { apiFetch, ApiError } from './api.ts';
import { allSolves, readSetting, removeSetting, writeSetting } from './storage.ts';
import { BUILD } from './version.ts';

// Anonymous usage events for tuning the puzzles. Nothing sent tells two devices apart: see
// parseTelemetryEvent in core for the exact shape the server accepts.
export const TELEMETRY_KEY = 'ph:telemetry';
export const EVENTS_KEY = 'ph:events';
const INSTALLED_KEY = 'ph:installed';
const LAUNCH_KEY = 'ph:launched';
const MAX_QUEUE = 300;
const BATCH = 50;
const FLUSH_AT = 20;


export function telemetryEnabled(): boolean {
  return readSetting(TELEMETRY_KEY) !== '0';
}

export function setTelemetryEnabled(on: boolean) {
  writeSetting(TELEMETRY_KEY, on ? '1' : '0');
  if (!on) removeSetting(EVENTS_KEY);
}

function readEvents(): TelemetryEvent[] {
  try {
    const parsed: unknown = JSON.parse(readSetting(EVENTS_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as TelemetryEvent[]) : [];
  } catch {
    return [];
  }
}

function writeEvents(events: TelemetryEvent[]) {
  if (events.length === 0) removeSetting(EVENTS_KEY);
  else writeSetting(EVENTS_KEY, JSON.stringify(events.slice(-MAX_QUEUE)));
}

// Players from before telemetry get the day of their first solve, not the day they updated.
function installedDay(today: string): string {
  const stored = readSetting(INSTALLED_KEY);
  if (stored) return stored;
  const first = Object.values(allSolves())
    .map((r) => Date.parse(r.solvedAt))
    .filter(Number.isFinite)
    .reduce((a, b) => Math.min(a, b), Infinity);
  const day = Number.isFinite(first) ? periodKey('daily', new Date(first)) : today;
  writeSetting(INSTALLED_KEY, day);
  return day;
}

function daysBetween(from: string, to: string): number {
  return Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));
}

export function track(payload: TelemetryPayload) {
  if (!telemetryEnabled()) return;
  const day = periodKey('daily');
  const event = {
    ...payload,
    day,
    platform: Capacitor.getPlatform() as Platform,
    build: BUILD,
    age: ageBucket(daysBetween(installedDay(day), day)),
  } as TelemetryEvent;
  const events = [...readEvents(), event];
  writeEvents(events);
  if (events.length >= FLUSH_AT) void flushEvents();
}

let running: Promise<void> | null = null;
let nextAttempt = 0;
let backoff = 10_000;

async function run(keepalive: boolean): Promise<void> {
  if (!telemetryEnabled() || Date.now() < nextAttempt) return;
  let events = readEvents();
  while (events.length > 0) {
    const batch = events.slice(0, BATCH);
    try {
      await apiFetch('/events', { method: 'POST', body: JSON.stringify({ events: batch }), keepalive });
    } catch (err) {
      // A 400 will never pass; everything else (offline, throttled, server down) waits.
      if (!(err instanceof ApiError && err.status === 400)) {
        nextAttempt = Date.now() + backoff;
        backoff = Math.min(backoff * 2, 600_000);
        return;
      }
    }
    backoff = 10_000;
    // Events tracked while the request ran stay behind the ones just sent.
    events = readEvents().slice(batch.length);
    writeEvents(events);
  }
}

export function flushEvents(keepalive = false): Promise<void> {
  if (import.meta.env.DEV) return Promise.resolve();
  if (!running) running = run(keepalive).finally(() => (running = null));
  return running;
}

export function initTelemetry() {
  const today = periodKey('daily');
  if (readSetting(LAUNCH_KEY) !== today) {
    writeSetting(LAUNCH_KEY, today);
    track({ kind: 'launch' });
  }
  void flushEvents();
  window.addEventListener('online', () => {
    nextAttempt = 0;
    void flushEvents();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void flushEvents(true);
  });
}
