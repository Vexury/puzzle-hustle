import { expect, it } from 'vitest';
import { isMosaicSolved, isNonogramSolved, lineSatisfied, mosaicClues, mosaicSolveByLogic, solveByLines } from '@puzzle-hustle/core';
import { finalState } from '../src/demo/DemoPlayer.tsx';
import { NONOGRAM_DEMO, NONOGRAM_DEMO_SPEC as nono } from '../src/demo/nonogram.tsx';
import { MOSAIC_DEMO, MOSAIC_DEMO_SPEC as mosaic } from '../src/demo/mosaic.tsx';

it('plays the nonogram demo to its unique solution', () => {
  for (let i = 0; i < 5; i++) {
    expect(lineSatisfied(nono, nono.solution, 'row', i)).toBe(true);
    expect(lineSatisfied(nono, nono.solution, 'col', i)).toBe(true);
  }
  const logic = solveByLines(nono);
  expect(logic.solved).toBe(true);
  expect(isNonogramSolved(nono, logic.state)).toBe(true);
  expect(isNonogramSolved(nono, Uint8Array.from(finalState(NONOGRAM_DEMO)))).toBe(true);
});

it('plays the mosaic demo to its unique solution', () => {
  const all = mosaicClues(mosaic.solution, 5, 5);
  mosaic.clues.forEach((v, i) => v >= 0 && expect(v).toBe(all[i]));
  const logic = mosaicSolveByLogic(mosaic);
  expect(logic.solved).toBe(true);
  expect(isMosaicSolved(mosaic, logic.state)).toBe(true);
  expect(isMosaicSolved(mosaic, Uint8Array.from(finalState(MOSAIC_DEMO)))).toBe(true);
});
