import { expect, it } from 'vitest';
import { countTracksSolutions, isTracksSolved, isZipSolved, isZipUnique, solveTracks, tracksLineCounts } from '@puzzle-hustle/core';
import { finalState } from '../src/demo/DemoPlayer.tsx';
import { ZIP_DEMO, ZIP_DEMO_SPEC, zipDemoPath } from '../src/demo/zip.tsx';
import { TRACKS_DEMO, TRACKS_DEMO_SPEC } from '../src/demo/tracks.tsx';

it('plays the zip demo to its unique solution', () => {
  expect(isZipUnique(ZIP_DEMO_SPEC)).toBe(true);
  const path = zipDemoPath(finalState(ZIP_DEMO));
  expect(isZipSolved(ZIP_DEMO_SPEC, path)).toBe(true);
  expect(path).toEqual([...ZIP_DEMO_SPEC.solution]);
});

it('plays the tracks demo to its unique solution', () => {
  expect(countTracksSolutions(TRACKS_DEMO_SPEC)).toEqual({ count: 1, complete: true });
  expect(solveTracks(TRACKS_DEMO_SPEC, 1).solved).toBe(true);
  expect(isTracksSolved(TRACKS_DEMO_SPEC, finalState(TRACKS_DEMO))).toBe(true);
});

it('shows a red count in the tracks demo, then takes it back', () => {
  const over = (upTo: number) => {
    const counts = tracksLineCounts(TRACKS_DEMO_SPEC, finalState(TRACKS_DEMO, upTo));
    return counts.rows.some((v, r) => v > TRACKS_DEMO_SPEC.rowCounts[r]!) || counts.cols.some((v, c) => v > TRACKS_DEMO_SPEC.colCounts[c]!);
  };
  const mistake = TRACKS_DEMO.steps.findIndex((s) => s.say.includes('red'));
  expect(over(mistake)).toBe(false);
  expect(over(mistake + 1)).toBe(true);
  expect(over(mistake + 2)).toBe(false);
});
