import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../src/types.ts';
import { SHAPES, SHAPE_KINDS, atomIndex } from '../src/tablet/shapes.ts';
import { coverage, fitsBoard, generateTablet, hint, isSolved, litMask, progress, type TabletState } from '../src/tablet/puzzle.ts';

describe('shapes', () => {
  it('atoms stay within the declared bounding box and are unique', () => {
    for (const kind of SHAPE_KINDS) {
      const s = SHAPES[kind];
      const seen = new Set<string>();
      for (const [dr, dc, dir] of s.atoms) {
        expect(dr).toBeGreaterThanOrEqual(0);
        expect(dc).toBeGreaterThanOrEqual(0);
        expect(dr).toBeLessThan(s.height);
        expect(dc).toBeLessThan(s.width);
        const key = `${dr},${dc},${dir}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it('areas match geometry (4 atoms per cell)', () => {
    expect(SHAPES.sq1.atoms.length).toBe(4);
    expect(SHAPES.sq2.atoms.length).toBe(16);
    expect(SHAPES['tri-nw'].atoms.length).toBe(2);
    expect(SHAPES['tri2-se'].atoms.length).toBe(8);
    expect(SHAPES.dia1.atoms.length).toBe(8);
    expect(SHAPES.dia2.atoms.length).toBe(32);
  });

  it('two identical squares cancel completely', () => {
    const pieces = [
      { id: 0, kind: 'sq1' as const },
      { id: 1, kind: 'sq1' as const },
    ];
    const lit = litMask(coverage(2, pieces, [{ r: 0, c: 0 }, { r: 0, c: 0 }]));
    expect([...lit].every((v) => v === 0)).toBe(true);
  });

  it('diamond over square leaves the four corner triangles', () => {
    const pieces = [
      { id: 0, kind: 'sq2' as const },
      { id: 1, kind: 'dia1' as const },
    ];
    const lit = litMask(coverage(2, pieces, [{ r: 0, c: 0 }, { r: 0, c: 0 }]));
    expect([...lit].filter((v) => v === 1).length).toBe(8);
    expect(lit[atomIndex(2, 0, 0, 0)]).toBe(1);
    expect(lit[atomIndex(2, 0, 0, 1)]).toBe(0);
  });
});

describe('generateTablet', () => {
  it('is deterministic per seed', () => {
    const a = generateTablet(42, 'medium');
    const b = generateTablet(42, 'medium');
    expect(a.pieces).toEqual(b.pieces);
    expect(a.solution).toEqual(b.solution);
    expect([...a.target]).toEqual([...b.target]);
  });

  it('produces solvable puzzles for every difficulty and many seeds', () => {
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 200; seed++) {
        const spec = generateTablet(seed, difficulty);
        expect(spec.pieces.length).toBe(spec.config.pieceCount);
        spec.pieces.forEach((p, i) => expect(fitsBoard(spec.config.size, p.kind, spec.solution[i]!)).toBe(true));
        expect(isSolved(spec, spec.solution)).toBe(true);
        expect(isSolved(spec, spec.pieces.map(() => null))).toBe(false);
      }
    }
  });

  it('honours the monthly size bump', () => {
    const spec = generateTablet(7, 'genius', { sizeDelta: 2, pieceDelta: 3 });
    expect(spec.config.size).toBe(8);
    expect(spec.pieces.length).toBe(11);
    expect(isSolved(spec, spec.solution)).toBe(true);
  });
});

describe('hint', () => {
  it('walks an empty state to the solution', () => {
    const spec = generateTablet(99, 'hard');
    const state: TabletState = spec.pieces.map(() => null);
    for (let i = 0; i < spec.pieces.length; i++) {
      const h = hint(spec, state);
      expect(h).not.toBeNull();
      state[h!.pieceId] = h!.placement;
    }
    expect(isSolved(spec, state)).toBe(true);
    expect(hint(spec, state)).toBeNull();
  });

  it('prefers moving a misplaced piece over placing a new one', () => {
    const spec = generateTablet(5, 'medium');
    const state: TabletState = spec.pieces.map(() => null);
    const wrong = { r: spec.solution[0]!.r === 0 ? 1 : 0, c: 0 };
    state[0] = fitsBoard(spec.config.size, spec.pieces[0]!.kind, wrong) ? wrong : null;
    const h = hint(spec, state);
    expect(h).not.toBeNull();
    if (state[0]) expect(h!.pieceId).toBe(0);
  });

  it('reports progress as matched target atoms', () => {
    const spec = generateTablet(3, 'easy');
    const empty = progress(spec, spec.pieces.map(() => null));
    expect(empty.matching).toBe(0);
    const done = progress(spec, spec.solution);
    expect(done.matching).toBe(done.total);
  });
});
