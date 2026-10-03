// packages/core/src/save.ts
import { ACHIEVEMENTS_EPOCH, type SolveEntry } from './achievements.ts';
import type { SpendEntry } from './coins.ts';
import { parseSolveId } from './solveId.ts';

export interface SolveRecord {
  solvedAt: string;
  seconds: number;
  hints: number;
  moves: number;
}

// The stored form of ph:cosmetics. `at` orders two devices' choices; 0 means "chosen before sync
// existed", -1 "never chosen", so a device that never chose anything cannot unequip a real loadout.
export interface SavedEquipment {
  badges: string[];
  flair: string | null;
  theme: string | null;
  nameplate: string | null;
  at: number;
}

// Everything the profile is derived from. Boards in progress and settings stay per device.
export interface SaveData {
  solves: Record<string, SolveRecord>;
  spent: SpendEntry[];
  doubled: string[];
  equipped: SavedEquipment;
  resetAt: number;
}

export const SAVE_LIMITS = { solves: 20_000, spent: 5_000, doubled: 20_000, idLength: 64 } as const;

export function noEquipment(at = -1): SavedEquipment {
  return { badges: [], flair: null, theme: null, nameplate: null, at };
}

export function emptySave(): SaveData {
  return { solves: {}, spent: [], doubled: [], equipped: noEquipment(), resetAt: 0 };
}

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= SAVE_LIMITS.idLength;
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function isSpendEntry(value: unknown): value is SpendEntry {
  if (!isObject(value)) return false;
  if (!Number.isInteger(value.coins) || (value.coins as number) < 0 || typeof value.at !== 'number' || !Number.isFinite(value.at)) return false;
  if (value.kind === 'hint') return typeof value.puzzle === 'string';
  if (value.kind === 'item') return typeof value.item === 'string';
  return false;
}

function parseSolve(value: unknown): SolveRecord | null {
  if (!isObject(value) || typeof value.solvedAt !== 'string' || !Number.isFinite(Date.parse(value.solvedAt))) return null;
  if (!isCount(value.seconds) || !isCount(value.hints) || !isCount(value.moves)) return null;
  return { solvedAt: new Date(value.solvedAt).toISOString(), seconds: value.seconds, hints: value.hints, moves: value.moves };
}

// Reads ph:cosmetics as stored today, with or without `at`, and the older lone `badge`.
export function parseEquipment(value: unknown): SavedEquipment {
  if (!isObject(value)) return noEquipment();
  const listed: unknown[] = Array.isArray(value.badges) ? value.badges : [value.badge];
  const one = (v: unknown) => (isId(v) ? v : null);
  return {
    badges: [...new Set(listed.filter(isId))],
    flair: one(value.flair),
    theme: one(value.theme),
    nameplate: one(value.nameplate),
    at: isCount(value.at) || value.at === -1 ? value.at : 0,
  };
}

const fits = (solves: object, spent: unknown[], doubled: unknown[]) =>
  Object.keys(solves).length <= SAVE_LIMITS.solves && spent.length <= SAVE_LIMITS.spent && doubled.length <= SAVE_LIMITS.doubled;

export function withinSaveLimits(save: SaveData): boolean {
  return fits(save.solves, save.spent, save.doubled);
}

// `trusted` skips the size limits, for a save this side wrote itself (the server's stored row):
// refusing it would read as empty and the next write would overwrite it.
export function parseSaveData(value: unknown, options: { trusted?: boolean } = {}): SaveData | null {
  if (!isObject(value)) return null;
  const rawSolves = isObject(value.solves) ? value.solves : {};
  const rawSpent = Array.isArray(value.spent) ? value.spent : [];
  const rawDoubled = Array.isArray(value.doubled) ? value.doubled : [];
  if (!options.trusted && !fits(rawSolves, rawSpent, rawDoubled)) return null;
  const solves: Record<string, SolveRecord> = {};
  for (const [id, raw] of Object.entries(rawSolves)) {
    const record = isId(id) ? parseSolve(raw) : null;
    if (record) solves[id] = record;
  }
  return {
    solves,
    spent: rawSpent.filter(isSpendEntry),
    doubled: [...new Set(rawDoubled.filter(isId))],
    equipped: parseEquipment(value.equipped),
    resetAt: isCount(value.resetAt) ? value.resetAt : 0,
  };
}

// Breaks every tie the same way whichever side came first, so the merge stays commutative.
function pick<T>(a: T, b: T, order: number): T {
  if (order !== 0) return order < 0 ? a : b;
  return JSON.stringify(a) <= JSON.stringify(b) ? a : b;
}

const time = (r: SolveRecord) => Date.parse(r.solvedAt);
const earlier = (a: SolveRecord, b: SolveRecord) => time(a) < time(b) || (time(a) === time(b) && a.solvedAt <= b.solvedAt);
const counts = (id: string, r: SolveRecord) => !(id.startsWith('hustle:') && time(r) < ACHIEVEMENTS_EPOCH);

// Periods keep their first run, which is the one on the leaderboard. Everything else keeps the
// better run (fewer hints first, so a hinted replay never takes back a hint-free achievement)
// under the earliest date, unless one side does not count, which then simply loses.
function mergeSolve(id: string, a: SolveRecord, b: SolveRecord): SolveRecord {
  if (parseSolveId(id)?.mode === 'period') return pick(a, b, time(a) - time(b));
  const countA = counts(id, a);
  const countB = counts(id, b);
  if (countA !== countB) return countA ? a : b;
  const best = pick(a, b, a.hints - b.hints || a.seconds - b.seconds || a.moves - b.moves);
  return { ...best, solvedAt: earlier(a, b) ? a.solvedAt : b.solvedAt };
}

function since(save: SaveData, from: number): SaveData {
  return {
    solves: Object.fromEntries(Object.entries(save.solves).filter(([, r]) => time(r) >= from)),
    spent: save.spent.filter((e) => e.at >= from),
    doubled: save.doubled,
    equipped: save.equipped.at >= from ? save.equipped : noEquipment(),
    resetAt: save.resetAt,
  };
}

const spendKey = (e: SpendEntry) => (e.kind === 'item' ? `item:${e.item}` : `hint:${e.puzzle}@${e.at}`);

const slots = (e: SavedEquipment) => e.badges.length + [e.flair, e.theme, e.nameplate].filter((v) => v !== null).length;

// Newer wins; on a tie the fuller loadout, then the lexicographically larger JSON.
function newerEquipment(a: SavedEquipment, b: SavedEquipment): SavedEquipment {
  if (a.at !== b.at) return a.at > b.at ? a : b;
  if (slots(a) !== slots(b)) return slots(a) > slots(b) ? a : b;
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

export function mergeSave(a: SaveData, b: SaveData): SaveData {
  const resetAt = Math.max(a.resetAt, b.resetAt);
  const left = a.resetAt < resetAt ? since(a, resetAt) : a;
  const right = b.resetAt < resetAt ? since(b, resetAt) : b;

  const solves: Record<string, SolveRecord> = { ...left.solves };
  for (const [id, record] of Object.entries(right.solves)) solves[id] = solves[id] ? mergeSolve(id, solves[id], record) : record;

  const spentByKey = new Map<string, SpendEntry>();
  for (const entry of [...left.spent, ...right.spent]) {
    const key = spendKey(entry);
    const known = spentByKey.get(key);
    spentByKey.set(key, known ? pick(known, entry, known.at - entry.at) : entry);
  }
  const spent = [...spentByKey.values()].sort((x, y) => x.at - y.at || (JSON.stringify(x) < JSON.stringify(y) ? -1 : 1));

  const doubled = [...new Set([...left.doubled, ...right.doubled])].filter((id) => solves[id]).sort();
  const equipped = newerEquipment(left.equipped, right.equipped);
  return { solves: sortKeys(solves), spent, doubled, equipped, resetAt };
}

function sortKeys(solves: Record<string, SolveRecord>): Record<string, SolveRecord> {
  return Object.fromEntries(Object.entries(solves).sort(([x], [y]) => (x < y ? -1 : 1)));
}

export function saveSolveEntries(solves: Record<string, SolveRecord>): SolveEntry[] {
  return Object.entries(solves).map(([id, r]) => ({ id, solvedAt: time(r), seconds: r.seconds, hints: r.hints, moves: r.moves }));
}
