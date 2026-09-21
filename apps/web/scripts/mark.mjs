export const BG = '#1c1b19';
export const FG = '#FFA833';

// The Shapes motif, same one the in-app puzzle icon draws: a diamond and a square meeting at
// a corner with the shared area cut away, which is the rule the puzzle is built on.
//
// Drawn in a 64 box and bounded by 14..50 on both axes. Those bounds are load bearing:
// android-icons.mjs scales this by 1.72 into the 108 adaptive canvas, and anything wider
// would leave the safe zone and get clipped by round and squircle launchers.
//
// The shift is half the measured offset between the ink centroid and the canvas centre. The
// square outweighs the diamond and sits lower right, so the correction goes up and left. Half,
// because a full correction overshoots: the eye does not weigh a shape purely by its area.
export function motif(fg = FG, bg = BG) {
  return `
  <g transform="translate(-1.4,-1.4)">
    <polygon points="14,26 26,14 38,26 26,38" fill="${fg}"/>
    <rect x="26" y="26" width="24" height="24" fill="${fg}"/>
    <polygon points="26,26 38,26 26,38" fill="${bg}"/>
  </g>`;
}

export function icon({ rounded = false, bg = BG, fg = FG } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64"${rounded ? ' rx="14"' : ''} fill="${bg}"/>${motif(fg, bg)}
</svg>`;
}
