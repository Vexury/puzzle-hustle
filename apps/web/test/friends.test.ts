import { expect, it } from 'vitest';
import { ApiError } from '../src/lib/api.ts';
import { explain } from '../src/pages/Friends.tsx';

it('maps each group refusal code to a message a player can act on', () => {
  expect(explain(new ApiError('group_unknown', 404))).toBe('No group with that code');
  expect(explain(new ApiError('group_already', 409))).toBe('You are already in that group');
  expect(explain(new ApiError('group_full', 403))).toBe('That group is full');
  expect(explain(new ApiError('group_limit', 403))).toBe('You are in five groups already');
  expect(explain(new ApiError('group_name', 400))).toBe('Pick a different name');
  expect(explain(new ApiError('offline', 0))).toBe('No connection');
});

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
