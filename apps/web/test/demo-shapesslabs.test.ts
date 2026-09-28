import { expect, it } from 'vitest';
import { countSlabsSolutions, isSlabsSolved, isSolved, isUnique, slabsRegionStatus, solveSlabs } from '@puzzle-hustle/core';
import { finalState } from '../src/demo/DemoPlayer.tsx';
import { SHAPES_DEMO, SHAPES_DEMO_SPEC, shapesDemoState } from '../src/demo/shapes.tsx';
import { SLABS_DEMO, SLABS_DEMO_SPEC } from '../src/demo/slabs.tsx';

it('plays the shapes demo to its unique solution', () => {
  expect(isUnique(SHAPES_DEMO_SPEC)).toBe(true);
  expect(isSolved(SHAPES_DEMO_SPEC, SHAPES_DEMO_SPEC.solution)).toBe(true);
  expect(isSolved(SHAPES_DEMO_SPEC, shapesDemoState(finalState(SHAPES_DEMO)))).toBe(true);
});

it('plays the slabs demo to its unique solution', () => {
  expect(countSlabsSolutions(SLABS_DEMO_SPEC, 2)).toEqual({ count: 1, complete: true });
  expect(solveSlabs(SLABS_DEMO_SPEC, 1).solved).toBe(true);
  const wrong = SLABS_DEMO.steps.findIndex((s) => s.say.includes('turns red'));
  expect(slabsRegionStatus(SLABS_DEMO_SPEC, finalState(SLABS_DEMO, wrong + 1))).toContain('broken');
  expect(isSlabsSolved(SLABS_DEMO_SPEC, finalState(SLABS_DEMO))).toBe(true);
});
