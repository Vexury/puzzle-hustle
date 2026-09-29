import { LOGO_PATH } from '../src/lib/logo.ts';

export const BG = '#1c1b19';
export const FG = '#FFA833';

// Placed in a 64 box and bounded by 15..49 vertically, about 53 % of the tile. android-icons.mjs
// scales the same motif on its own into the 108 adaptive canvas. The piece is symmetric, so
// geometric and optical centre coincide.
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
