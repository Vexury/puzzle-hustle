import { expect, it } from 'vitest';
import { isRegionsSolved, isRegionsUnique, regionsSolveByLogic, type RegionsSpec } from '@puzzle-hustle/core';
import { finalState, type DemoScript } from '../src/demo/DemoPlayer.tsx';
import { CROWNS_DEMO, CROWNS_DEMO_SPEC, STARS_DEMO, STARS_DEMO_SPEC } from '../src/demo/regions.tsx';

it.each<[string, RegionsSpec, DemoScript]>([
  ['cats', CROWNS_DEMO_SPEC, CROWNS_DEMO],
  ['hearts', STARS_DEMO_SPEC, STARS_DEMO],
])('plays the %s demo to its unique solution', (_, spec, script) => {
  expect(isRegionsUnique(spec)).toBe(true);
  expect(regionsSolveByLogic(spec).solved).toBe(true);
  expect(isRegionsSolved(spec, Uint8Array.from(finalState(script)))).toBe(true);
});
