import { expect, it } from 'vitest';
import { validateName } from '../src/names.ts';

it('accepts an ordinary name and trims it', () => {
  expect(validateName('  Moritz  ')).toEqual({ ok: true, name: 'Moritz' });
  expect(validateName('Anna   Lena')).toEqual({ ok: true, name: 'Anna Lena' });
  expect(validateName('zip_master-99')).toEqual({ ok: true, name: 'zip_master-99' });
  expect(validateName('Jörg')).toEqual({ ok: true, name: 'Jörg' });
});

it('refuses names that are too short or too long', () => {
  expect(validateName('a')).toEqual({ ok: false, reason: 'length' });
  expect(validateName('x'.repeat(15))).toEqual({ ok: false, reason: 'length' });
  expect(validateName('x'.repeat(14))).toEqual({ ok: true, name: 'x'.repeat(14) });
  expect(validateName('x'.repeat(24), 24)).toEqual({ ok: true, name: 'x'.repeat(24) });
});

it('refuses links and control characters', () => {
  expect(validateName('http://x.example', 24)).toEqual({ ok: false, reason: 'characters' });
  expect(validateName('www.example.com', 24)).toEqual({ ok: false, reason: 'characters' });
  expect(validateName('bad\nname')).toEqual({ ok: false, reason: 'characters' });
  expect(validateName('emoji 🎉')).toEqual({ ok: false, reason: 'characters' });
});

it('refuses a blocked word regardless of case and spacing', () => {
  expect(validateName('ADMIN')).toEqual({ ok: false, reason: 'blocked' });
  expect(validateName('a d m i n')).toEqual({ ok: false, reason: 'blocked' });
});
