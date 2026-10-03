// packages/core/test/save.test.ts
import { expect, it } from 'vitest';
import { ACHIEVEMENTS_EPOCH } from '../src/achievements.ts';
import { emptySave, mergeSave, noEquipment, parseEquipment, parseSaveData, saveSolveEntries, type SaveData, type SolveRecord } from '../src/save.ts';

const at = (iso: string) => Date.parse(iso);
const rec = (solvedAt: string, seconds = 60, hints = 0, moves = 20): SolveRecord => ({ solvedAt, seconds, hints, moves });
const save = (patch: Partial<SaveData>): SaveData => ({ ...emptySave(), ...patch });

const A = save({
  solves: {
    'zip:daily:2026-10-01': rec('2026-10-01T08:00:00.000Z', 90),
    'zip:level:easy:1': rec('2026-10-01T09:00:00.000Z', 50, 1),
    'hustle:1': rec('2026-10-01T10:00:00.000Z'),
  },
  spent: [{ kind: 'item', item: 'badge-star', coins: 100, at: at('2026-10-01T11:00:00Z') }],
  doubled: ['zip:daily:2026-10-01'],
  equipped: { badges: ['badge-star'], flair: null, theme: null, nameplate: null, at: 5 },
});
const B = save({
  solves: {
    'zip:daily:2026-10-01': rec('2026-10-01T07:00:00.000Z', 120),
    'zip:level:easy:1': rec('2026-10-01T06:00:00.000Z', 70, 0),
    'hustle:2': rec('2026-10-01T10:05:00.000Z'),
  },
  spent: [
    { kind: 'item', item: 'badge-star', coins: 100, at: at('2026-10-01T10:30:00Z') },
    { kind: 'hint', puzzle: 'zip:level:easy:1', coins: 20, at: at('2026-10-01T06:00:00Z') },
  ],
  equipped: { badges: [], flair: null, theme: null, nameplate: 'plate-paper', at: 9 },
});

it('is commutative and idempotent', () => {
  const ab = mergeSave(A, B);
  expect(mergeSave(B, A)).toEqual(ab);
  expect(mergeSave(ab, ab)).toEqual(ab);
  expect(mergeSave(ab, A)).toEqual(ab);
  expect(mergeSave(emptySave(), ab)).toEqual(ab);
});

it('keeps the first run of a period puzzle whole', () => {
  expect(mergeSave(A, B).solves['zip:daily:2026-10-01']).toEqual(rec('2026-10-01T07:00:00.000Z', 120));
});

it('keeps the better run of a level, fewer hints first, with the earliest date', () => {
  // A is faster but took a hint; B took none.
  expect(mergeSave(A, B).solves['zip:level:easy:1']).toEqual(rec('2026-10-01T06:00:00.000Z', 70, 0));
  const faster = save({ solves: { 'zip:level:easy:1': rec('2026-10-02T06:00:00.000Z', 40, 0) } });
  expect(mergeSave(B, faster).solves['zip:level:easy:1']).toEqual(rec('2026-10-01T06:00:00.000Z', 40, 0));
});

it('prefers a Hustle solve that counts over one from before the epoch', () => {
  const before = new Date(ACHIEVEMENTS_EPOCH - 60_000).toISOString();
  const after = new Date(ACHIEVEMENTS_EPOCH + 60_000).toISOString();
  const old = save({ solves: { 'hustle:5': rec(before, 10) } });
  const fresh = save({ solves: { 'hustle:5': rec(after, 99) } });
  expect(mergeSave(old, fresh).solves['hustle:5']).toEqual(rec(after, 99));
});

it('counts an item purchase once, the earliest, and every hint purchase', () => {
  const spent = mergeSave(A, B).spent;
  expect(spent.filter((e) => e.kind === 'item')).toEqual([{ kind: 'item', item: 'badge-star', coins: 100, at: at('2026-10-01T10:30:00Z') }]);
  expect(spent.filter((e) => e.kind === 'hint')).toHaveLength(1);
  const twice = mergeSave(B, save({ spent: [{ kind: 'hint', puzzle: 'zip:level:easy:1', coins: 20, at: at('2026-10-01T06:05:00Z') }] }));
  expect(twice.spent.filter((e) => e.kind === 'hint')).toHaveLength(2);
});

it('keeps doubled ids only for solves that exist', () => {
  expect(mergeSave(A, B).doubled).toEqual(['zip:daily:2026-10-01']);
  expect(mergeSave(save({ doubled: ['zip:daily:2026-09-01'] }), B).doubled).toEqual([]);
});

it('takes the newer equipment, and a fixed one on a tie', () => {
  expect(mergeSave(A, B).equipped.nameplate).toBe('plate-paper');
  const x = save({ equipped: { ...noEquipment(7), flair: 'puzzler' } });
  const y = save({ equipped: { ...noEquipment(7), flair: 'hustler' } });
  expect(mergeSave(x, y).equipped).toEqual(mergeSave(y, x).equipped);
  expect(mergeSave(x, y).equipped.flair).toBe('puzzler');
});

it('drops everything older than a reset from the side that did not reset', () => {
  const R = at('2026-10-01T10:02:00Z');
  const resetter = save({ resetAt: R, solves: { 'zip:daily:2026-10-01': rec('2026-10-01T08:00:00.000Z') }, equipped: noEquipment(R) });
  const merged = mergeSave(resetter, B);
  expect(Object.keys(merged.solves).sort()).toEqual(['hustle:2', 'zip:daily:2026-10-01']);
  expect(merged.solves['zip:daily:2026-10-01']).toEqual(rec('2026-10-01T08:00:00.000Z'));
  expect(merged.spent).toEqual([{ kind: 'item', item: 'badge-star', coins: 100, at: at('2026-10-01T10:30:00Z') }]);
  expect(merged.equipped).toEqual(noEquipment(R));
  expect(merged.resetAt).toBe(R);
});

it("keeps a stale side's solves at or after the reset", () => {
  const R = at('2026-10-01T10:00:00Z');
  const merged = mergeSave(save({ resetAt: R }), save({ solves: { 'hustle:3': rec('2026-10-01T10:00:00.000Z') } }));
  expect(Object.keys(merged.solves)).toEqual(['hustle:3']);
});

it('reads legacy equipment', () => {
  expect(parseEquipment({ badge: 'badge-star' })).toEqual({ ...noEquipment(0), badges: ['badge-star'] });
  expect(parseEquipment({ badges: ['a', 'b'], flair: 'puzzler', theme: null, nameplate: 7 })).toEqual({ badges: ['a', 'b'], flair: 'puzzler', theme: null, nameplate: null, at: 0 });
  expect(parseEquipment(null)).toEqual(noEquipment(0));
});

it('drops bad entries one by one', () => {
  const parsed = parseSaveData({
    solves: { ok: rec('2026-10-01T08:00:00.000Z'), bad: 'x', date: rec('nope'), neg: rec('2026-10-01T08:00:00.000Z', -1), ['x'.repeat(65)]: rec('2026-10-01T08:00:00.000Z') },
    spent: [{ kind: 'item', item: 'a', coins: 1, at: 1 }, { kind: 'item', coins: 1, at: 1 }, 'junk'],
    doubled: ['ok', 3],
    equipped: 'junk',
    resetAt: 'later',
  });
  expect(parsed).toEqual(save({ solves: { ok: rec('2026-10-01T08:00:00.000Z') }, spent: [{ kind: 'item', item: 'a', coins: 1, at: 1 }], doubled: ['ok'] }));
});

it('refuses non-objects and oversized saves', () => {
  expect(parseSaveData(null)).toBeNull();
  expect(parseSaveData([])).toBeNull();
  const solves: Record<string, SolveRecord> = {};
  for (let i = 0; i <= 20_000; i++) solves[`zip:level:easy:${i}`] = rec('2026-10-01T08:00:00.000Z');
  expect(parseSaveData({ solves })).toBeNull();
});

it('turns solves into entries for the derived values', () => {
  expect(saveSolveEntries({ 'hustle:1': rec('2026-10-01T10:00:00.000Z', 5, 1, 9) })).toEqual([
    { id: 'hustle:1', solvedAt: at('2026-10-01T10:00:00.000Z'), seconds: 5, hints: 1, moves: 9 },
  ]);
});

it('stays commutative on ties', () => {
  const items = [
    save({ spent: [{ kind: 'item', item: 'a', coins: 100, at: 5 }] }),
    save({ spent: [{ kind: 'item', item: 'a', coins: 50, at: 5 }] }),
  ];
  expect(mergeSave(items[0]!, items[1]!)).toEqual(mergeSave(items[1]!, items[0]!));
  const periods = [
    save({ solves: { 'zip:daily:2026-10-01': rec('2026-10-01T08:00:00.000Z', 90) } }),
    save({ solves: { 'zip:daily:2026-10-01': rec('2026-10-01T08:00:00.000Z', 80) } }),
  ];
  expect(mergeSave(periods[0]!, periods[1]!)).toEqual(mergeSave(periods[1]!, periods[0]!));
  const spelled = [
    parseSaveData({ solves: { 'zip:daily:2026-10-01': rec('2026-10-01T08:00:00Z') } })!,
    parseSaveData({ solves: { 'zip:daily:2026-10-01': rec('2026-10-01T08:00:00.000Z') } })!,
  ];
  expect(mergeSave(spelled[0]!, spelled[1]!)).toEqual(mergeSave(spelled[1]!, spelled[0]!));
  const raw = { 'zip:level:easy:1': rec('2026-10-01T08:00:00Z') };
  const other = { 'zip:level:easy:1': rec('2026-10-01T08:00:00.000Z') };
  expect(mergeSave(save({ solves: raw }), save({ solves: other }))).toEqual(mergeSave(save({ solves: other }), save({ solves: raw })));
});

it('drops spend entries with a non-finite time', () => {
  const parsed = parseSaveData(JSON.parse('{"spent":[{"kind":"item","item":"a","coins":1,"at":1e400}]}'));
  expect(parsed?.spent).toEqual([]);
});
