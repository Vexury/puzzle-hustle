import { expect, it } from 'vitest';
import { ApiError } from '../src/lib/api.ts';
import { activeGroup, explain, normalizeCode } from '../src/pages/Friends.tsx';

it('tells group_full and group_limit apart even though the server answers both with 403', () => {
  const full = explain(new ApiError('group_full', 403));
  const limit = explain(new ApiError('group_limit', 403));
  expect(full).not.toBe(limit);
});

it('falls back to a generic message for an unmapped code or a non-ApiError', () => {
  expect(explain(new ApiError('group_collision', 500))).toBe('Something went wrong');
  expect(explain(new TypeError('boom'))).toBe('Something went wrong');
  expect(explain('nope')).toBe('Something went wrong');
});

it('explains a ban and a rate limit', () => {
  expect(explain(new ApiError('group_banned', 403))).not.toBe('Something went wrong');
  expect(explain(new ApiError('too_many_requests', 429))).not.toBe('Something went wrong');
});

it('reads O as 0 and I or L as 1 in a typed code', () => {
  expect(normalizeCode(' aoIblc ')).toBe('A01B1C');
  expect(normalizeCode('xyz')).toBe('XYZ');
});

it('falls back to the first group when the selected one is gone', () => {
  const a = { id: 'a', code: 'AAAAAA', name: 'A', members: 1, owner: true };
  const b = { id: 'b', code: 'BBBBBB', name: 'B', members: 2, owner: false };
  expect(activeGroup([a, b], 'b')).toBe(b);
  expect(activeGroup([a], 'b')).toBe(a);
  expect(activeGroup([a], null)).toBe(a);
  expect(activeGroup([], 'b')).toBeNull();
});
