import { useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Places in the page flow where a scene may put decoration that takes its own room instead of
// floating over the app, so it can never cover a control. The app marks each place with an empty
// <PackAnchor>; a scene renders into it with <InAnchor>, which draws nothing while the place is
// not on screen. 'page-end' closes every page, below its last content.
export type AnchorName = 'page-end';

const anchors = new Map<AnchorName, HTMLElement>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

function setAnchor(name: AnchorName, el: HTMLElement | null, prev?: HTMLElement) {
  if (el) anchors.set(name, el);
  else if (anchors.get(name) === prev) anchors.delete(name);
  else return;
  for (const listener of listeners) listener();
}

export function PackAnchor({ name }: { name: AnchorName }) {
  return (
    <div
      className="pack-anchor"
      data-anchor={name}
      aria-hidden="true"
      ref={(el) => {
        setAnchor(name, el);
        return () => setAnchor(name, null, el ?? undefined);
      }}
    />
  );
}

export function InAnchor({ name, children }: { name: AnchorName; children: ReactNode }) {
  const el = useSyncExternalStore(subscribe, () => anchors.get(name) ?? null);
  return el ? createPortal(children, el) : null;
}
