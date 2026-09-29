import { generateMosaic, type MosaicSpec } from './mosaic/puzzle.ts';
import { generateNonogram, type NonogramSpec } from './nonogram/puzzle.ts';
import type { PuzzleRef } from './ref.ts';
import type { RegionsSpec } from './regions/puzzle.ts';
import { adapter, crownsAdapter, mosaicAdapter, nonogramAdapter, shapesAdapter, starsAdapter, zipAdapter } from './registry.ts';
import { generateShapes, type ShapesSpec } from './shapes/puzzle.ts';
import { generateSlabs, type SlabsSpec } from './slabs/puzzle.ts';
import { generateKiller, generateSudoku, type SudokuSpec } from './sudoku/puzzle.ts';
import { generateTracks, type TracksSpec } from './tracks/puzzle.ts';
import type { Difficulty, PuzzleTypeId } from './types.ts';
import { generateZip, type ZipSpec } from './zip/puzzle.ts';

export type PuzzleSpec = ShapesSpec | NonogramSpec | MosaicSpec | RegionsSpec | SudokuSpec | ZipSpec | TracksSpec | SlabsSpec;

export type BoardRef = Pick<PuzzleRef, 'type' | 'seed' | 'difficulty' | 'period'>;

// The board a ref stands for, built from its seed. The game, the generator worker and the board
// pack all go through here, so a stored board and a generated one can never disagree on options.
export function generateBoard(ref: BoardRef): PuzzleSpec {
  const { seed, difficulty, period } = ref;
  switch (ref.type) {
    case 'shapes':
      return generateShapes(seed, difficulty, shapesAdapter.options(period));
    case 'nonogram':
      return generateNonogram(seed, difficulty, nonogramAdapter.options(period));
    case 'mosaic':
      return generateMosaic(seed, difficulty, mosaicAdapter.options(period));
    case 'crowns':
      return crownsAdapter.spec(seed, difficulty, crownsAdapter.options(period));
    case 'stars':
      return starsAdapter.spec(seed, difficulty, starsAdapter.options(period));
    case 'sudoku':
      return generateSudoku(seed, difficulty);
    case 'killer':
      return generateKiller(seed, difficulty);
    case 'zip':
      return generateZip(seed, difficulty, zipAdapter.options(period));
    case 'tracks':
      return generateTracks(seed, difficulty);
    case 'slabs':
      return generateSlabs(seed, difficulty);
  }
}

// Stored boards: plain JSON with every typed array as {"$u8": "<base64>"} (or $i8, $u16, ...),
// so one codec serves all ten types and the decoded board equals the generated one field for
// field. Only boards without a period are stored; periods take options and are generated.
const ARRAYS = {
  u8: Uint8Array,
  i8: Int8Array,
  u16: Uint16Array,
  i16: Int16Array,
  u32: Uint32Array,
  i32: Int32Array,
  f64: Float64Array,
} as const;
type ArrayTag = keyof typeof ARRAYS;

function tagOf(view: ArrayBufferView): ArrayTag {
  for (const [tag, Ctor] of Object.entries(ARRAYS)) if (view instanceof Ctor) return tag as ArrayTag;
  throw new Error(`cannot store ${view.constructor.name}`);
}

function toBase64(view: ArrayBufferView): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(tag: ArrayTag, text: string): ArrayBufferView {
  const s = atob(text);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new ARRAYS[tag](bytes.buffer);
}

export type StoredBoard = Record<string, unknown>;

export function encodeBoard(spec: PuzzleSpec): StoredBoard {
  return JSON.parse(JSON.stringify(spec, (_key, value) => (ArrayBuffer.isView(value) ? { [`$${tagOf(value)}`]: toBase64(value) } : value)));
}

export function decodeBoard(stored: StoredBoard): PuzzleSpec {
  const revive = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(revive);
    if (value === null || typeof value !== 'object') return value;
    const entries = Object.entries(value);
    if (entries.length === 1 && entries[0]![0].startsWith('$') && entries[0]![0].slice(1) in ARRAYS) {
      return fromBase64(entries[0]![0].slice(1) as ArrayTag, entries[0]![1] as string);
    }
    return Object.fromEntries(entries.map(([k, v]) => [k, revive(v)]));
  };
  return revive(stored) as PuzzleSpec;
}

// One file per type under boards/, loaded only when a board of that type is opened.
export interface BoardPack {
  version: number;
  boards: Record<string, StoredBoard>;
  // Seeds that Random draws from instead of generating, for difficulties too slow to build live.
  pool?: Partial<Record<Difficulty, number[]>>;
}

export function boardKey(difficulty: Difficulty, seed: number): string {
  return `${difficulty}:${seed.toString(36)}`;
}

const PACK_LOADERS: Record<PuzzleTypeId, () => Promise<{ default: unknown }>> = {
  shapes: () => import('./boards/shapes.json', { with: { type: 'json' } }),
  nonogram: () => import('./boards/nonogram.json', { with: { type: 'json' } }),
  mosaic: () => import('./boards/mosaic.json', { with: { type: 'json' } }),
  crowns: () => import('./boards/crowns.json', { with: { type: 'json' } }),
  stars: () => import('./boards/stars.json', { with: { type: 'json' } }),
  sudoku: () => import('./boards/sudoku.json', { with: { type: 'json' } }),
  killer: () => import('./boards/killer.json', { with: { type: 'json' } }),
  zip: () => import('./boards/zip.json', { with: { type: 'json' } }),
  tracks: () => import('./boards/tracks.json', { with: { type: 'json' } }),
  slabs: () => import('./boards/slabs.json', { with: { type: 'json' } }),
};

const packs = new Map<PuzzleTypeId, Promise<BoardPack | null>>();

// The pack for a type, or null when it is missing or was built for another generator version:
// a stale board would silently differ from what the seed now means, so it is never used.
export function loadBoardPack(type: PuzzleTypeId): Promise<BoardPack | null> {
  let pack = packs.get(type);
  if (!pack) {
    pack = PACK_LOADERS[type]()
      .then((m) => m.default as BoardPack)
      .then((p) => (p.version === adapter(type).version ? p : null))
      .catch(() => null);
    packs.set(type, pack);
  }
  return pack;
}

// The stored board for a ref, or null when it has to be generated.
export async function storedBoard(ref: BoardRef): Promise<PuzzleSpec | null> {
  if (ref.period) return null;
  const pack = await loadBoardPack(ref.type);
  const stored = pack?.boards[boardKey(ref.difficulty, ref.seed)];
  return stored ? decodeBoard(stored) : null;
}
