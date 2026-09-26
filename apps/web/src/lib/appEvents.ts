// Moments the app announces for anything that wants to react without being wired into the
// page that caused them. Today only theme pack scenes listen.
export type AppEvent = 'solved';

const listeners = new Set<(event: AppEvent) => void>();

export function emitAppEvent(event: AppEvent) {
  for (const l of listeners) l(event);
}

export function onAppEvent(listener: (event: AppEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
