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
  // Who earned it, stamped at enqueue time from the session then signed in. Undefined means it
  // was solved with nobody signed in, which submits under whoever signs in first — the ordinary
  // path. A shared device (this app's actual use case, not a hypothetical one) can have a
  // different player signed in by the time the network comes back, and that player's scores
  // must never be credited with somebody else's solve.
  playerId?: string;
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
  const playerId = readSession()?.player.id;
  const queue = readQueue();
  // Scoped to (puzzle, owner): the same daily solved separately by two players who share this
  // device are two legitimate entries, not a duplicate of each other.
  if (queue.some((entry) => entry.puzzle === puzzle && entry.playerId === playerId)) return;
  queue.push({
    puzzle,
    seconds: record.seconds,
    hints: record.hints,
    moves: record.moves,
    solvedAt: Date.parse(record.solvedAt) || Date.now(),
    ...(playerId !== undefined ? { playerId } : {}),
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
  const session = readSession();
  if (!session) return;
  if (Date.now() < nextAttempt) return;
  // An entry with no owner is the ordinary case (solved before anyone signed in) and always
  // submits under whoever is signed in now. An entry stamped for a different player is left
  // exactly where it is — filtered out before batching, not after, so it never occupies a batch
  // slot or counts toward the stuck-loop check below, and is never at risk of being dropped by
  // it. It stays in the queue, in place, for whenever its own player signs back in.
  const isMine = (entry: QueuedScore) => entry.playerId === undefined || entry.playerId === session.player.id;
  let mine = readQueue().filter(isMine);
  while (mine.length > 0) {
    const batch = mine.slice(0, BATCH);
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
    // Re-read the full queue, not just `mine` — another player's entries may sit anywhere in it
    // and must be written back exactly as they were, in their original place, untouched by
    // anything decided here.
    const before = readQueue();
    const beforeMine = before.filter(isMine);
    const after = before.filter((entry) => !(isMine(entry) && answered.has(entry.puzzle)));
    writeQueue(after);
    mine = after.filter(isMine);
    // The daily limit is spent. Trying again in this session would only burn requests.
    if (results.some((r) => r.status === 'throttled')) {
      failed();
      return;
    }
    // Nothing in this batch could be applied — a result we cannot match to anything we sent.
    // Retrying the same batch immediately would spin forever on that one entry; back off
    // instead so newer entries queued behind it still get their turn on the next trigger.
    if (mine.length === beforeMine.length) {
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
