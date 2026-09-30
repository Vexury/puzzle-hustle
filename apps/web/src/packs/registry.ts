import type { ComponentType } from 'react';

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
