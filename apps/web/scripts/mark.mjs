import { LOGO_PATH } from '../src/lib/logo.ts';

export const BG = '#1c1b19';
export const FG = '#FFA833';

// Placed in a 64 box and bounded by 15..49 vertically. Those bounds are load bearing:
// android-icons.mjs scales this by 1.72 into the 108 adaptive canvas, and anything taller
// would push the corners past the round launcher mask. The piece is symmetric, so geometric
// and optical centre coincide.
export function motif(fg = FG) {
  return `
  <g transform="translate(19.25,15) scale(0.2125)">
    <path d="${LOGO_PATH}" fill="${fg}"/>
  </g>`;
}

export function icon({ rounded = false, bg = BG, fg = FG } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64"${rounded ? ' rx="14"' : ''} fill="${bg}"/>${motif(fg)}
</svg>`;
}
