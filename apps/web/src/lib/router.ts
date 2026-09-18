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

export function navigate(to: string, replace = false) {
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  emit();
  window.scrollTo({ top: 0 });
}

export function onLinkClick(event: React.MouseEvent<HTMLAnchorElement>) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = event.currentTarget.getAttribute('href');
  if (!target || !target.startsWith('/')) return;
  event.preventDefault();
  navigate(target);
}
