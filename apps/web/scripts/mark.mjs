export const BG = '#1c1b19';
export const FG = '#FFA833';

// The logo: an upright jigsaw piece whose sockets top and bottom leave an H. Drawn in a
// 120 x 160 box.
export const H_PATH =
  'M10 0H47V18A24 24 0 1 0 73 18V0H110A10 10 0 0 1 120 10V150A10 10 0 0 1 110 160H73V142A24 24 0 1 0 47 142V160H10A10 10 0 0 1 0 150V10A10 10 0 0 1 10 0Z';

// Placed in a 64 box and bounded by 15..49 vertically. Those bounds are load bearing:
// android-icons.mjs scales this by 1.72 into the 108 adaptive canvas, and anything taller
// would push the corners past the round launcher mask. The piece is symmetric, so geometric
// and optical centre coincide.
export function motif(fg = FG) {
  return `
  <g transform="translate(19.25,15) scale(0.2125)">
    <path d="${H_PATH}" fill="${fg}"/>
  </g>`;
}

export function icon({ rounded = false, bg = BG, fg = FG } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64"${rounded ? ' rx="14"' : ''} fill="${bg}"/>${motif(fg)}
</svg>`;
}
