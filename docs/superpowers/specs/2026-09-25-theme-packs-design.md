# Theme packs

Design, 2026-09-25. Full colour themes, bought with coins, that restyle the whole app rather than only the accent.

## Goal

Give coins a larger goal than the 100 to 300 coin badges, and let players make the app look like theirs. A pack changes surfaces, text, board, lines, accent, shadows and radii, in places the font and a background pattern, so it reads as a different look and not as a recolour.

## Non-goals

- **No seasonal packs yet.** Halloween, winter and the rule for time-limited sales come later.
- **No light and dark variant per pack.** Each pack has one fixed mode.
- **No accent on top of a pack.** A pack brings its own accent; the six accents stay a property of the default look.
- **No server involvement.** Nobody else sees a pack, so the worker never learns about it.
- **No component rewrites.** Packs work through tokens only.

## Decisions

- **Today's look becomes the default theme "Vexury"**, free and always owned, with light/dark and the six accents exactly as now.
- **Each pack is a fixed package with one mode** (decision Moritz, option A). While a pack is active the sun/moon toggle and the accent picker are hidden. Reason: half the design work per pack, and every pack looks the way it was drawn. Midnight, Terminal and Synthwave have no sensible light version anyway.
- **Bought only, priced by effort and effect** (decision Moritz): Paper 400, Sakura 400, Midnight 500, Cat Café 600, Terminal 900, Synthwave 1200. Together 4000 coins, four to five weeks of dailies.
- **Try before buying** (decision Moritz): tapping a pack in the shop lays it over the whole app until the player buys or backs out.
- **Buying is one tap, no armed "Buy?" step.** The try-on is the deliberate step before it.
- **`--success` stays clearly green and `--danger` clearly red in every pack**, and no accent sits near either, for the same reason green and red are not accents today.
- **Light/dark preference and accent survive a pack.** Switching back to Vexury restores them.

## Rendering

- A pack sets `data-pack="<id>"` on `<html>` and forces its mode through the existing `data-theme`. All `[data-theme="dark"]` rules keep working, and the status bar icons follow through the existing `StatusBarStylePlugin` call in `apply()`.
- New file `apps/web/src/packs.css` with one `[data-pack="<id>"]` block per pack. Each sets the surface, text, border, board, piece, shadow, radius and accent tokens (`--bg`, `--card-bg`, `--text`, `--text-muted`, `--border`, `--border-mid`, `--board-cell`, `--board-line`, `--piece-line`, `--hover-bg`, `--shadow`, `--radius`, `--accent`, `--accent-text`, `--accent-deep`, `--on-accent`, `--accent-soft`, `--success`, `--danger`), where needed `--font-text`/`--font-num`, plus Nonogram colours 2 and 3 and an optional background pattern as a CSS gradient. No image files.
- Hard-coded colours that bypass tokens today are moved onto tokens first. That is the only refactoring.
- Pack selectors must win over `[data-accent]` and `[data-theme]` rules of equal specificity; `packs.css` loads after `theme.css`, and rules that combine theme and accent get a `:not([data-pack])` guard where they would otherwise win.

## Packs

Starting values, tuned on the device. Text on surface at least 4.5:1, checked by script.

| Pack | Mode | Price | Surfaces | Accent | Extra |
|---|---|---|---|---|---|
| paper | light | 400 | cream `#f6f1e4`, cards `#fbf8f0` | ink blue `#2f5aa8` | light blue exercise-book lines on the board, fine paper grain |
| sakura | light | 400 | pale pink `#fbf0f2`, cards white | cherry pink `#e0567f` | larger radii, soft shadows |
| midnight | dark | 500 | black `#000`, cards `#0d0d0f` | cool white-blue `#9ecbff` | very quiet lines, no shadows |
| cat-cafe | light | 600 | latte `#efe4d6`, cards `#f8f1e8` | caramel `#c07a3a` | dark brown text, warm board cells |
| terminal | dark | 900 | green-black `#0a0c0a` | amber phosphor `#ffb000` | Inconsolata everywhere, soft glow on accent and frame, square radii |
| synthwave | dark | 1200 | deep violet `#1a0f2e`, cards `#24163d` | magenta `#ff4fd8`, cyan `#3ff0ff` second | neon glow on frame and placed pieces, horizon gradient behind |

## Catalogue and state

- `packages/core/src/cosmetics.ts` gets `{ id, kind: 'theme', title, price, mode: 'light' | 'dark' }`. Buying and ownership use the existing spend log `ph:coins:spent`; the choice lives in `ph:cosmetics` next to badge and flair, so the backup carries it without changes.
- `Equipped` gains `theme: string | null`, validated like the others (known id, right kind, owned). `null` is Vexury.
- `pushCosmetics` sends only `badge` and `flair`. The worker's `POST /cosmetics` never sees a theme.
- `lib/theme.ts` reads the equipped pack in `apply()`: with a pack it sets `data-pack` and the pack's mode, without one it clears `data-pack` and resolves light/dark as now. `apply()` re-runs when the equipped pack changes.
- Epoch reset: owned packs lapse like badges, the equipped pack fails validation, and the app falls back to Vexury.

## Shop

- New section **Themes** at the top of `/shop`, above Badges. First card Vexury (free, owned), then the six packs.
- Each card shows a 3×3 mini board rendered inside an element carrying that pack's `data-pack`, so it uses the same CSS as the real app, plus name and price, "Owned" or "Equipped".
- **Try-on**: tapping a pack not owned sets `data-pack` on `<html>` without saving. A fixed bar at the bottom offers "Buy for N" (disabled with "Need N more" when short) and "Back". The try-on also ends on leaving the shop, on `appBlur`/`pagehide`, and on the back button through the existing back guard.
- Tapping an owned pack equips it at once with the existing circle reveal from the tapped card. Tapping Vexury returns to the default look.

## Profile and headers

- While a pack is active the appearance card shows "Theme: <title>" with a "Change" link to the shop; the System/Light/Dark choice and the accent swatches are hidden.
- The sun/moon toggle in the page headers is hidden while a pack is active.

## Testing

- Core unit tests: catalogue entries valid, buying a theme spends its price, ownership, equip validation, fallback to Vexury after the epoch, `pushCosmetics` payload without `theme`.
- Web tests for `apply()`: pack sets `data-pack` and its mode, clearing it restores the stored preference and accent.
- A screenshot script that sends each pack at 360 px through all ten puzzle types, Daily, Profile and Shop; reviewed together.
- On the S23 through the web preview (`vite preview` plus `adb reverse`), keeping the Play install: try-on, buy, back button during try-on, status bar icons in light and dark packs.

## Delivery

Three commits, each working on its own:

1. Groundwork: `kind: 'theme'`, `Equipped.theme`, `apply()` with packs, profile and header changes, hard-coded colours onto tokens, and Paper as the first pack.
2. Shop section with cards and try-on.
3. The other five packs.
