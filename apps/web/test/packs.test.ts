import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { THEMES } from '@puzzle-hustle/core';
import { REGION_PALETTES, regionPaletteId } from '../src/lib/regionColors.ts';

// A string literal directly inside `new URL(...)` gets rewritten by Vite's static asset-URL
// transform into a dev-server URL (http://localhost:3000/...), which readFileSync can't open.
// Routing the path through a variable first keeps this a real file:// URL.
const packsDir = '../src/packs/';
const read = (path: string) => readFileSync(new URL(packsDir + path, import.meta.url), 'utf8');

function block(id: string): Record<string, string> {
  const m = read(`${id}/pack.css`).match(new RegExp(`\\[data-theme\\]\\[data-pack="${id}"\\]\\s*\\{([^}]*)\\}`));
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const [, name, value] of (m[1] ?? '').matchAll(/(--[\w-]+|color-scheme):\s*([^;]+);/g)) out[name!] = value!.trim();
  return out;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const REQUIRED = ['--bg', '--card-bg', '--text', '--text-muted', '--border', '--border-mid', '--board-cell', '--board-line', '--hover-bg', '--hover-text', '--accent', '--accent-text', '--accent-deep', '--on-accent', '--success', '--success-soft', '--danger', '--shadow', '--shadow-hover', '--radius', '--radius-sm', '--nono-c2', '--nono-c3', '--pack-pattern-image', '--pack-pattern-size', 'color-scheme'];

const DONE = THEMES.map((t) => t.id);

it.each(DONE)('%s is imported by packs/index.css', (id) => {
  expect(read('index.css')).toContain(`@import './${id}/pack.css';`);
});

it.each(DONE)('%s sets every pack token and the scheme of its mode', (id) => {
  const b = block(id);
  for (const name of REQUIRED) expect(b, name).toHaveProperty(name);
  expect(b['color-scheme']).toBe(THEMES.find((t) => t.id === id)!.mode);
});

it.each(DONE)('%s keeps text readable', (id) => {
  const b = block(id);
  expect(contrast(b['--text']!, b['--bg']!)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(b['--text']!, b['--card-bg']!)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(b['--text-muted']!, b['--card-bg']!)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(b['--accent-text']!, b['--bg']!)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(b['--on-accent']!, b['--accent']!)).toBeGreaterThanOrEqual(4.5);
});

it.each(DONE)('%s keeps text readable on every region colour', (id) => {
  const b = block(id);
  const colors = REGION_PALETTES[regionPaletteId(id, THEMES.find((t) => t.id === id)!.mode)];
  for (const color of colors) expect(contrast(b['--text']!, color), color).toBeGreaterThanOrEqual(4.5);
});

it.each([
  ['light', '#2d2d2d'],
  ['dark', '#e8e4de'],
] as const)('the %s region palette keeps the default text readable', (theme, text) => {
  for (const color of REGION_PALETTES[theme]) expect(contrast(text, color), color).toBeGreaterThanOrEqual(4.5);
});
