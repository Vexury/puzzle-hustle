import { emptySave, mergeSave, noEquipment, parseEquipment, parseSaveData, type SaveData } from '@puzzle-hustle/core';
import { syncAchievements } from './achievements.ts';
import { apiFetch, readSession } from './api.ts';
import { coinsChanged, pushCosmetics, readDoubled, readSpent } from './coins.ts';
import { syncFlairs } from './flairs.ts';
import { syncHustleRewards } from './hustle.ts';
import { allSolves, clearUnsynced, onSyncedWrite, readSetting, removeSetting, replaceSolves, writeSetting } from './storage.ts';
import { resetProgressAndAppearance } from './theme.ts';

const RESET_KEY = 'ph:sync:resetAt';
const PLAYER_KEY = 'ph:sync:player';
const DEBOUNCE_MS = 5000;
// Browsers refuse keepalive bodies over 64 KB; such a sync goes as a plain request instead.
const KEEPALIVE_LIMIT = 60_000;

let running: Promise<void> | null = null;
let again = false;
let applying = false;
let dirty = false;
let timer: number | undefined;

export function readLocalSave(): SaveData | null {
  let equipped: unknown = null;
  try {
    equipped = JSON.parse(readSetting('ph:cosmetics') ?? 'null');
  } catch {
    /* unreadable equipment counts as none */
  }
  return parseSaveData({
    solves: allSolves(),
    spent: readSpent(),
    doubled: [...readDoubled()],
    equipped: parseEquipment(equipped),
    resetAt: Number(readSetting(RESET_KEY)) || 0,
  });
}

function applySave(save: SaveData, before: SaveData) {
  applying = true;
  try {
    replaceSolves(save.solves);
    writeSetting('ph:coins:spent', JSON.stringify(save.spent));
    writeSetting('ph:coins:doubled', JSON.stringify(save.doubled));
    writeSetting('ph:cosmetics', JSON.stringify(save.equipped));
    writeSetting(RESET_KEY, String(save.resetAt));
    if (save.resetAt > before.resetAt) clearUnsynced(save.solves);
    coinsChanged();
  } finally {
    applying = false;
  }
}

async function run(keepalive: boolean): Promise<void> {
  const session = readSession();
  if (!session) return;
  const local = readLocalSave();
  if (!local) return;
  dirty = false;
  const owner = readSetting(PLAYER_KEY);
  // Progress of another account must not flow into this one; the device takes this account's.
  const replace = owner !== null && owner !== session.player.id;
  const body = JSON.stringify(replace ? emptySave() : local);
  let answer: SaveData | null;
  try {
    answer = parseSaveData(await apiFetch<unknown>('/sync', { method: 'POST', body, auth: true, keepalive: keepalive && body.length < KEEPALIVE_LIMIT }));
  } catch {
    return;
  }
  if (!answer || readSession()?.player.id !== session.player.id) return;
  // Own unlocks first, with their cards; what the other device brought in stays quiet below.
  syncAchievements();
  syncFlairs();
  syncHustleRewards();
  const current = readLocalSave() ?? local;
  const next = replace ? answer : mergeSave(answer, current);
  if (JSON.stringify(next) !== JSON.stringify(answer)) again = true;
  applySave(next, current);
  writeSetting(PLAYER_KEY, session.player.id);
  syncAchievements(true);
  syncFlairs(true);
  syncHustleRewards(true);
  if (replace || owner === null || JSON.stringify(next.equipped) !== JSON.stringify(current.equipped)) void pushCosmetics();
}

export function syncNow(options: { keepalive?: boolean } = {}): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = run(options.keepalive ?? false).finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return running;
}

// Signed in, the reset reaches every device of the account; signed out it stays on this one.
export function resetAccount(): void {
  resetProgressAndAppearance();
  if (!readSession()) return;
  const now = Date.now();
  writeSetting(RESET_KEY, String(now));
  writeSetting('ph:cosmetics', JSON.stringify(noEquipment(now)));
  void syncNow();
}

// After deleting the account: the progress stays here and merges into whichever account comes next.
export function forgetSyncedPlayer(): void {
  removeSetting(PLAYER_KEY);
}

function scheduleSync() {
  if (applying || !readSession()) return;
  dirty = true;
  if (timer !== undefined) clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = undefined;
    void syncNow();
  }, DEBOUNCE_MS);
}

export function initSync(): void {
  onSyncedWrite(scheduleSync);
  void syncNow();
  window.addEventListener('online', () => void syncNow());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      void syncNow();
      return;
    }
    if (!dirty) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    void syncNow({ keepalive: true });
  });
}
