// Deliberately small and boring. It exists to keep a display name from carrying a link, a
// line break or an obvious slur into somebody else's group list, not to police taste.
const BLOCKED = ['admin', 'moderator', 'support', 'fuck', 'shit', 'bitch', 'nazi', 'hitler', 'fotze', 'hure', 'wichser'];

const ALLOWED = /^[\p{L}\p{N} ._-]+$/u;
const LINKISH = /:\/\/|www\.|\.(com|net|org|de|io|dev|xyz)\b/i;

export type NameResult = { ok: true; name: string } | { ok: false; reason: 'length' | 'characters' | 'blocked' };

export function validateName(raw: string): NameResult {
  // Only literal spaces are collapsed here; any other whitespace (newline, tab, ...) is left
  // in place so it falls through to the ALLOWED check below and is rejected as a control
  // character rather than silently turned into a space.
  const name = raw.trim().replace(/ +/g, ' ');
  if (name.length < 2 || name.length > 24) return { ok: false, reason: 'length' };
  if (!ALLOWED.test(name) || LINKISH.test(name)) return { ok: false, reason: 'characters' };
  const flat = name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  if (BLOCKED.some((word) => flat.includes(word))) return { ok: false, reason: 'blocked' };
  return { ok: true, name };
}

export function generatedName(): string {
  return `Player ${String(Math.floor(1000 + Math.random() * 9000))}`;
}
