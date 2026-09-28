import type { PuzzleTypeId } from '@puzzle-hustle/core';
import type { ReactNode } from 'react';
import type { DemoScript } from './DemoPlayer.tsx';
import { CROWNS_DEMO, STARS_DEMO, renderCrownsDemo, renderStarsDemo } from './regions.tsx';
import { KILLER_DEMO, SUDOKU_DEMO, renderKillerDemo, renderSudokuDemo } from './sudoku.tsx';
import { NONOGRAM_DEMO, renderNonogramDemo } from './nonogram.tsx';
import { MOSAIC_DEMO, renderMosaicDemo } from './mosaic.tsx';
import { ZIP_DEMO, renderZipDemo } from './zip.tsx';
import { TRACKS_DEMO, renderTracksDemo } from './tracks.tsx';
import { SHAPES_DEMO, renderShapesDemo } from './shapes.tsx';
import { SLABS_DEMO, renderSlabsDemo } from './slabs.tsx';

export interface Demo {
  script: DemoScript;
  render(state: number[], highlight: number[] | undefined): ReactNode;
}

export const DEMOS: Record<PuzzleTypeId, Demo> = {
  crowns: { script: CROWNS_DEMO, render: renderCrownsDemo },
  stars: { script: STARS_DEMO, render: renderStarsDemo },
  sudoku: { script: SUDOKU_DEMO, render: renderSudokuDemo },
  killer: { script: KILLER_DEMO, render: renderKillerDemo },
  nonogram: { script: NONOGRAM_DEMO, render: renderNonogramDemo },
  mosaic: { script: MOSAIC_DEMO, render: renderMosaicDemo },
  zip: { script: ZIP_DEMO, render: renderZipDemo },
  tracks: { script: TRACKS_DEMO, render: renderTracksDemo },
  shapes: { script: SHAPES_DEMO, render: renderShapesDemo },
  slabs: { script: SLABS_DEMO, render: renderSlabsDemo },
};
