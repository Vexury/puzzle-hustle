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
// Without worker support (tests, very old web views) they are built here as before.
let worker: Worker | null | undefined;
let nextId = 0;
const waiting = new Map<number, { resolve(spec: PuzzleSpec): void; reject(error: Error): void }>();

function generator(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./boardWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; spec?: PuzzleSpec; error?: string }>) => {
      const job = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      if (e.data.spec) job?.resolve(e.data.spec);
      else job?.reject(new Error(e.data.error ?? 'board failed'));
    };
  } catch {
    worker = null;
  }
  return worker;
}

export async function loadBoard(ref: BoardRef): Promise<PuzzleSpec> {
  const stored = await storedBoard(ref);
  if (stored) return stored;
  const w = generator();
  if (!w) return generateBoard(ref);
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    w.postMessage({ id, ref: { type: ref.type, seed: ref.seed, difficulty: ref.difficulty, period: ref.period } });
  });
}
