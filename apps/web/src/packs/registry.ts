import type { ComponentType } from 'react';
import type { PackSounds } from '../lib/sound.ts';

// Packs with more than CSS. Each scene is its own chunk, loaded the first time its pack is worn
// or tried on.
export const PACK_SCENES: Partial<Record<string, () => Promise<{ default: ComponentType }>>> = {
  paper: () => import('./paper/scene.tsx'),
  sakura: () => import('./sakura/scene.tsx'),
  midnight: () => import('./midnight/scene.tsx'),
  'cat-cafe': () => import('./cat-cafe/scene.tsx'),
  terminal: () => import('./terminal/scene.tsx'),
  synthwave: () => import('./synthwave/scene.tsx'),
  ocean: () => import('./ocean/scene.tsx'),
  inferno: () => import('./inferno/scene.tsx'),
  casino: () => import('./casino/scene.tsx'),
};

// Packs that swap some of the sounds, one chunk each like the scenes (packs/README.md, Sounds).
export const PACK_SOUNDS: Partial<Record<string, () => Promise<{ default: PackSounds }>>> = {
  paper: () => import('./paper/sound.ts'),
  sakura: () => import('./sakura/sound.ts'),
  midnight: () => import('./midnight/sound.ts'),
  'cat-cafe': () => import('./cat-cafe/sound.ts'),
  terminal: () => import('./terminal/sound.ts'),
  synthwave: () => import('./synthwave/sound.ts'),
  ocean: () => import('./ocean/sound.ts'),
  inferno: () => import('./inferno/sound.ts'),
  casino: () => import('./casino/sound.ts'),
};
