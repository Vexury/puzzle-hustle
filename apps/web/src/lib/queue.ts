import { parsePuzzleId } from '@puzzle-hustle/core';
import { apiFetch, readSession } from './api.ts';
import { readSetting, writeSetting } from './storage.ts';

const KEY = 'ph:queue';
export const MAX_QUEUE = 100;
const BATCH = 20;

export interface QueuedScore {
  puzzle: string;
  seconds: number;
  hints: number;
  moves: number;
  solvedAt: number;
}

export function readQueue(): QueuedScore[] {
  try {
    const raw = readSetting(KEY);
    const parsed = raw ? (JSON.parse(raw) as QueuedScore[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(entries: QueuedScore[]) {
  writeSetting(KEY, JSON.stringify(entries.slice(-MAX_QUEUE)));
}

export function enqueue(
  puzzle: string,
  record: { seconds: number; hints: number; moves: number; solvedAt: string },
): void {
  if (!parsePuzzleId(puzzle)) return;
  const queue = readQueue();
  if (queue.some((entry) => entry.puzzle === puzzle)) return;
  queue.push({
    puzzle,
    seconds: record.seconds,
    hints: record.hints,
    moves: record.moves,
    solvedAt: Date.parse(record.solvedAt) || Date.now(),
  });
  writeQueue(queue);
}

let running: Promise<void> | null = null;

// Backoff lives in memory only. A fresh start is always allowed one attempt, which is what
// somebody who just turned the plane mode off expects.
const MIN_BACKOFF = 5_000;
const MAX_BACKOFF = 300_000;
let backoff = MIN_BACKOFF;
let nextAttempt = 0;

function failed() {
  nextAttempt = Date.now() + backoff;
  backoff = Math.min(backoff * 2, MAX_BACKOFF);
}

function succeeded() {
  backoff = MIN_BACKOFF;
  nextAttempt = 0;
}

export function resetBackoff() {
  succeeded();
}

async function run(): Promise<void> {
  if (!readSession()) return;
  if (Date.now() < nextAttempt) return;
  let queue = readQueue();
  while (queue.length > 0) {
    const batch = queue.slice(0, BATCH);
    // The server answers one result per entry it was sent, in order, echoing the puzzle we
    // sent it. Restricting matches to puzzles actually in this batch means a result naming a
    // puzzle we never sent (the server falls back to an empty string for a malformed entry —
    // never one of ours, since enqueue only accepts real period ids) can never be mistaken for
    // an answer to something else in the queue.
    const batchPuzzles = new Set(batch.map((entry) => entry.puzzle));
    let results: Array<{ puzzle: string; status: string }>;
    try {
      const answer = await apiFetch<{ results: Array<{ puzzle: string; status: string }> }>('/scores', {
        method: 'POST',
        body: JSON.stringify({ entries: batch }),
        auth: true,
      });
      // apiFetch only guarantees parseable JSON, not this shape. A malformed body must be
      // handled exactly like any other failed request, not crash flush() reading .filter below.
      if (!Array.isArray(answer.results)) throw new Error('malformed /scores response');
      results = answer.results;
      succeeded();
    } catch {
      // Offline, throttled by the browser, or signed out: every entry stays where it is and
      // the next trigger tries again, later each time. Never surfaced to the player.
      failed();
      return;
    }
    const answered = new Set(
      results.filter((r) => r.status !== 'throttled' && batchPuzzles.has(r.puzzle)).map((r) => r.puzzle),
    );
    const before = readQueue();
    queue = before.filter((entry) => !answered.has(entry.puzzle));
    writeQueue(queue);
    // The daily limit is spent. Trying again in this session would only burn requests.
    if (results.some((r) => r.status === 'throttled')) {
      failed();
      return;
    }
    // Nothing in this batch could be applied — a result we cannot match to anything we sent.
    // Retrying the same batch immediately would spin forever on that one entry; back off
    // instead so newer entries queued behind it still get their turn on the next trigger.
    if (queue.length === before.length) {
      failed();
      return;
    }
  }
}

export function flush(): Promise<void> {
  if (!running) running = run().finally(() => (running = null));
  return running;
}

export function initQueue(): void {
  void flush();
  window.addEventListener('online', () => void flush());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void flush();
  });
}
