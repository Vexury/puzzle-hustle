# Theme packs

One folder per pack, named after its id in `THEMES` (`packages/core/src/cosmetics.ts`). Game
components know nothing about packs; a pack reaches them only through the layers below.

| Layer | What | Where |
|---|---|---|
| Tokens | Colours, radii, shadows, pattern, fonts (`--font-display` for headings and card titles, set on `body`) | `<id>/pack.css`, block `[data-theme][data-pack="<id>"]` |
| Slots | Styling of the shared elements listed below, nothing else | `<id>/pack.css`, selectors under `[data-pack="<id>"]` |
| Scene | Decoration behind the app, moments in front of it | `<id>/scene.tsx`, registered in `registry.ts`, loaded on first use |

## Slots

Stable class names a pack may style. A component that carries one keeps it; a new component
that is one of these things adds it.

- `.board-frame`, `.board-frame.solved`: the frame around every puzzle board.
- `.coin-pill`: the coin balance in the page headers.
- `h1`, `h2`, `h3`, `.row-title`: through `--font-display`; `h1::after` for a trailing mark.
- Board cells: `.nono-cell`, `.mosaic-cell`, `.sudoku-cell` (background image; leave `.f1`-`.f3`
  and `.filled` alone), `.zip-cell`, `.tracks-cell` (SVG fill, through a pattern the scene defines).
- Drawn paths when solved: `.zip-board.solved .zip-path`, `.board-frame.solved .tracks-piece`.

## Marks

A pack may replace the X on empty-marked cells with its own glyph: one filled path in a 24 box
in `marks.ts`. Nonogram, Mosaic and Cats/Hearts get it as a CSS mask through `--mark-glyph`
(`theme.css`), Tracks asks `usePackMark()`. A new game with an X uses one of the two.

The list grows only when a pack needs a new place, and every addition goes here.

## Scenes

- Draw on `.pack-back` (behind all content) or `.pack-front` (above it, for moments that end on
  their own). Neither takes input.
- React to moments through `onAppEvent` (`lib/appEvents.ts`): `'solved'`.
- Nothing moves over a board while it is being played, and board numbers keep `--font-num`.
- Animate `transform` and `opacity` where possible. `prefers-reduced-motion` stops every
  animation on both planes and on the slots, and hides the front plane (`index.css`).

## Assets

Icons and figures are drawn for the app as inline SVG, or copied from libraries under MIT, ISC,
Apache 2.0, OFL or CC0 with the licence listed in `CREDITS.md`. No GIFs, no Lottie.

Fonts are the Latin subset of one weight, self-hosted in `public/fonts`, declared in the pack's
own `pack.css` so a browser only fetches them while that pack is on screen. Board numbers keep
`--font-num`.
