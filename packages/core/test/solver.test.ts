import { describe, expect, it } from 'vitest';
import { generateShapes } from '../src/shapes/puzzle.ts';
import { canonicalKey, countSolutions, difficultyReport, isUnique } from '../src/shapes/solver.ts';

describe('solver', () => {
  it('finds the generator solution', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const spec = generateShapes(seed, 'medium');
      const r = countSolutions(spec, 1);
      expect(r.solutions).toBe(1);
    }
  });

  it('detects non-unique puzzles', () => {
    const spec = generateShapes(1, 'easy');
    const ambiguous = {
      ...spec,
      pieces: [
        { id: 0, kind: 'sq1' as const },
        { id: 1, kind: 'sq1' as const },
      ],
      target: new Uint8Array(spec.config.size * spec.config.size * 4),
      solution: [{ r: 0, c: 0 }, { r: 0, c: 0 }],
    };
    expect(isUnique(ambiguous)).toBe(false);
    expect(countSolutions(ambiguous, 100).solutions).toBe(spec.config.size ** 2);
    expect(isUnique(spec)).toBe(true);
  });

  it('handles genius boards within budget', () => {
    const t0 = performance.now();
    let checked = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const spec = generateShapes(seed, 'genius');
      const r = countSolutions(spec, 2, 2_000_000);
      expect(r.solutions).toBeGreaterThanOrEqual(r.exhausted ? 0 : 1);
      checked++;
    }
    const ms = performance.now() - t0;
    expect(checked).toBe(10);
    expect(ms).toBeLessThan(20_000);
  });

  it('difficulty report is monotone-ish across presets', () => {
    const avg = (d: 'easy' | 'medium' | 'hard') => {
      let sum = 0;
      for (let seed = 1; seed <= 15; seed++) sum += difficultyReport(generateShapes(seed, d), 500_000).score;
      return sum / 15;
    };
    expect(avg('easy')).toBeLessThan(avg('medium'));
    expect(avg('medium')).toBeLessThan(avg('hard'));
  });

  it('canonical key is invariant under rotation of the whole puzzle', () => {
    const spec = generateShapes(11, 'medium');
    const n = spec.config.size;
    const rotated = structuredClone(spec);
    rotated.target = new Uint8Array(spec.target.length);
    for (let a = 0; a < spec.target.length; a++) {
      if (!spec.target[a]) continue;
      const cell = Math.floor(a / 4);
      const r = Math.floor(cell / n);
      const c = cell % n;
      const d = a % 4;
      const nr = c;
      const nc = n - 1 - r;
      const nd = (d + 1) % 4;
      rotated.target[(nr * n + nc) * 4 + nd] = 1;
    }
    const rotKinds = { 'tri-nw': 'tri-ne', 'tri-ne': 'tri-se', 'tri-se': 'tri-sw', 'tri-sw': 'tri-nw', 'tri2-nw': 'tri2-ne', 'tri2-ne': 'tri2-se', 'tri2-se': 'tri2-sw', 'tri2-sw': 'tri2-nw' } as const;
    rotated.pieces = spec.pieces.map((p) => ({ ...p, kind: (rotKinds as Record<string, string>)[p.kind] as typeof p.kind ?? p.kind }));
    expect(canonicalKey(rotated)).toBe(canonicalKey(spec));
    expect(canonicalKey(generateShapes(12, 'medium'))).not.toBe(canonicalKey(spec));
  });

  it('canonical key is invariant under translation of the target', () => {
    const spec = generateShapes(11, 'easy');
    const shifted = structuredClone(spec);
    shifted.target = new Uint8Array(spec.target.length);
    const rowAtoms = spec.config.size * 4;
    for (let a = 0; a < spec.target.length; a++) if (spec.target[a]) shifted.target[a + rowAtoms] = 1;
    expect(canonicalKey(shifted)).toBe(canonicalKey(spec));
  });
});
