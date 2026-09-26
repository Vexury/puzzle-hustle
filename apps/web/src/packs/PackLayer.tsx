import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { usePack } from '../lib/theme.ts';
import { useMarkGlyphOnRoot } from './marks.ts';
import { PACK_SCENES } from './registry.ts';

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
  const Scene = pack ? sceneFor(pack.id) : null;
  if (!Scene) return null;
  return (
    <Suspense fallback={null}>
      <Scene key={pack!.id} />
    </Suspense>
  );
}
