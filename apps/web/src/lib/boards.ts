import { generateBoard, loadBoardPack, randomRef, storedBoard, type BoardRef, type Difficulty, type PuzzleRef, type PuzzleSpec, type PuzzleTypeId } from '@puzzle-hustle/core';

// Random for a difficulty with a pool draws a stored board: randomRef checks each seed by building
// it, which for Zip Hard and Genius froze the app before the puzzle even opened.
export async function randomBoardRef(type: PuzzleTypeId, difficulty: Difficulty): Promise<PuzzleRef> {
  const pool = (await loadBoardPack(type))?.pool?.[difficulty];
  if (pool?.length) return { type, difficulty, seed: pool[Math.floor(Math.random() * pool.length)]! };
  return randomRef(type, difficulty);
}

// Some generators need seconds on a phone (Zip Genius took minutes), and on the main thread that
// froze the whole app with no sign of life. Boards not in the pack are built in this worker.
// Without worker support (tests, very old web views), or once the worker has failed, they are
// built here as before, so a board always arrives.
interface Job {
  ref: BoardRef;
  resolve(spec: PuzzleSpec): void;
  reject(error: unknown): void;
}

let worker: Worker | null | undefined;
let nextId = 0;
const waiting = new Map<number, Job>();

function buildHere(job: Job) {
  try {
    job.resolve(generateBoard(job.ref));
  } catch (error) {
    job.reject(error);
  }
}

function generator(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./boardWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; spec?: PuzzleSpec; error?: string }>) => {
      const job = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      if (!job) return;
      if (e.data.spec) job.resolve(e.data.spec);
      else job.reject(new Error(e.data.error ?? 'board failed'));
    };
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      const jobs = [...waiting.values()];
      waiting.clear();
      jobs.forEach(buildHere);
    };
  } catch {
    worker = null;
  }
  return worker;
}

async function buildBoard(ref: BoardRef): Promise<PuzzleSpec> {
  const stored = await storedBoard(ref);
  if (stored) return stored;
  // Only the fields the generator reads: the rest of a PuzzleRef does not survive postMessage usefully.
  const board: BoardRef = { type: ref.type, seed: ref.seed, difficulty: ref.difficulty, ...(ref.period ? { period: ref.period } : {}), ...(ref.hustle ? { hustle: ref.hustle } : {}) };
  const w = generator();
  if (!w) return generateBoard(board);
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { ref: board, resolve, reject });
    w.postMessage({ id, ref: board });
  });
}

// A Hustle stage built ahead while the one before is played, so "Next ›" opens at once. Only
// the latest one is kept.
let ahead: { id: string; spec: Promise<PuzzleSpec> } | null = null;
const idOf = (ref: BoardRef) => `${ref.type}|${ref.difficulty}|${ref.seed}|${ref.period ?? ''}|${ref.hustle ?? ''}`;

export function prefetchBoard(ref: BoardRef): void {
  const id = idOf(ref);
  if (ahead?.id === id) return;
  const spec = buildBoard(ref);
  spec.catch(() => {});
  ahead = { id, spec };
}

export function loadBoard(ref: BoardRef): Promise<PuzzleSpec> {
  if (ahead?.id === idOf(ref)) {
    const { spec } = ahead;
    ahead = null;
    return spec;
  }
  return buildBoard(ref);
}
