import { expect, it } from 'vitest';
import { ApiError } from '../src/lib/api.ts';
import { explain } from '../src/pages/Friends.tsx';

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
