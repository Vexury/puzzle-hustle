import { useSyncExternalStore } from 'react';

export interface Route {
  path: string;
  params: URLSearchParams;
}

export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export function href(path: string): string {
  return `${BASE}${path}`;
}

const listeners = new Set<() => void>();
let snapshot: Route = read();

function read(): Route {
  const path = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) || '/' : location.pathname;
  return { path, params: new URLSearchParams(location.search) };
}

function emit() {
  snapshot = read();
  for (const l of listeners) l();
}

window.addEventListener('popstate', emit);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => snapshot);
}

// A pushed entry remembers the URL it was pushed from, so leaveTo can tell whether the screen
// below is the one it wants to go to.
export function navigate(to: string, replace = false) {
  if (replace) history.replaceState(history.state, '', to);
  else history.pushState({ from: location.pathname + location.search }, '', to);
  emit();
  window.scrollTo({ top: 0 });
}

// Steps back when the screen below is the target, otherwise replaces this one. A push would
// leave this screen under the target, so the next back press would return into it.
export function leaveTo(to: string) {
  if ((history.state as { from?: string } | null)?.from === to) history.back();
  else navigate(to, true);
}

function linkTarget(event: React.MouseEvent<HTMLAnchorElement>): string | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const target = event.currentTarget.getAttribute('href');
  if (!target || !target.startsWith('/')) return null;
  event.preventDefault();
  return target;
}

export function onLinkClick(event: React.MouseEvent<HTMLAnchorElement>, replace = false) {
  const target = linkTarget(event);
  if (target) navigate(target, replace);
}

export function onBackLinkClick(event: React.MouseEvent<HTMLAnchorElement>) {
  const target = linkTarget(event);
  if (target) leaveTo(target);
}
