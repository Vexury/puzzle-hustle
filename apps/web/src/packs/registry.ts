import type { ComponentType } from 'react';

// Packs with more than CSS. Each scene is its own chunk, loaded the first time its pack is worn
// or tried on.
export const PACK_SCENES: Partial<Record<string, () => Promise<{ default: ComponentType }>>> = {
  synthwave: () => import('./synthwave/scene.tsx'),
};
