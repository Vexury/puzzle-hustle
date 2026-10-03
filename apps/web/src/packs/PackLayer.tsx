import { lazy, Suspense, useEffect, type ComponentType, type LazyExoticComponent } from 'react';
import * as sound from '../lib/sound.ts';
import { usePack } from '../lib/theme.ts';
import { useMarkGlyphOnRoot } from './marks.ts';
import { PACK_SCENES, PACK_SOUNDS } from './registry.ts';

const loaded = new Map<string, LazyExoticComponent<ComponentType>>();

function sceneFor(id: string): LazyExoticComponent<ComponentType> | null {
  const load = PACK_SCENES[id];
  if (!load) return null;
  let scene = loaded.get(id);
  if (!scene) {
    scene = lazy(load);
    loaded.set(id, scene);
  }
  return scene;
}

export function PackLayer() {
  const pack = usePack();
  useMarkGlyphOnRoot();
  const id = pack?.id ?? null;
  useEffect(() => sound.setPackSounds(id, id ? PACK_SOUNDS[id] : undefined), [id]);
  const Scene = pack ? sceneFor(pack.id) : null;
  if (!Scene) return null;
  return (
    <Suspense fallback={null}>
      <Scene key={pack!.id} />
    </Suspense>
  );
}
