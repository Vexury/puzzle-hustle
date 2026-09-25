# Achievements rework

Design, 2026-09-25. Replaces the catalog and the page from the 2026-09-22 design; the architecture underneath (derived from `ph:solves`, private, epoch) stays.

## Goal

Finalise the achievement catalog before it is registered in Play Games Services and Game Center, where ids become permanent. The current eighteen read like statistics, ignore the ten puzzle types, show no progress, and sit on a page that is a long plain text list. After the rework:

- A few achievements fall in the first days, several stay out of reach for months.
- Every puzzle type has its own two.
- Anything with a counter shows how far along the player is.
- The page is a badge cabinet with a "next goals" strip, not a list.
- Flairs reward the milestones.

## Non-goals

- **No native reporting yet.** Play Games Services and Game Center come as a separate project once this catalog is final. Nothing here depends on them; the catalog only respects their limits (40 achievements, one icon each).
- **No social achievements.** Groups and the leaderboard need an account and the server. Achievements stay private and derivable from `ph:solves` alone, and the app stays complete without a sign-in.
- **No new stored state.** Progress is computed the same way as unlocks. `ph:achievements` keeps holding only the announced ids.
- **No hidden achievements**, unchanged from 2026-09-22.
- **Not moving `ACHIEVEMENTS_EPOCH`.** That still happens at the production release. Because it re-locks everything anyway, renaming and dropping ids now costs testers nothing they would keep.

## Decisions

- **Forty, twenty general and two per type.** Enough for a curve from day one to a year, few enough to register and draw icons for on two stores.
- **Per type: one volume, one signature.** Volume is "100 solved" of that type. The signature is speed on that type's daily for the quick types (Zip, Shapes, Cats, Hearts, Tracks) and Genius without a hint for the heavy ones (Nonogram, Mosaic, Sudoku, Sumdoku, Slabs). Speed is measured on the daily, not on Hard, because the daily is the one puzzle everybody plays (fair, not farmable by rerolling a random) and the only one the leaderboard has times for; most dailies run on Medium or Easy, so Hard has no data.
- **Flairs for milestones only.** Ten achievements carry a flair; the rest give coins only. The type achievements carry none, because the 32 pack flairs already reward the types. The five existing achievement flairs keep their ids, titles and achievement ids; five new ones join them.
- **`pack-complete` and `perfect-50` go.** The pack flairs reward the first; a 365-day streak and 1000 solves cover the long end better than the second.
- **Progress comes from the same facts as unlocks.** `achievementProgress()` and `unlockedAchievements()` both read one `gather()` result, so the page can never show 30/30 on a locked badge.
- **Speed thresholds are calibrated, not guessed.** They come from real hint-free daily times on the leaderboard (see Speed thresholds).
- **Every solve mode counts** for the counters and the Genius signatures, as before: daily, weekly, monthly, level and random. Speed counts dailies only.
- **Achievement and flair titles never repeat.** No achievement shares a title with any flair, and a flaired achievement's flair has its own name, so the unlock card never shows the same word twice.

## The achievements

Ids use the internal type names (`crowns` is Cats, `stars` is Hearts, `killer` is Sumdoku). "Target" marks a counter achievement, which gets a progress ring and can appear under "Almost there".

### General

| Group | id | Title | Condition | Target | Flair |
|---|---|---|---|---|---|
| start | `first-solve` | Hello, Hustler | Any puzzle solved | | |
| start | `every-type` | Sampler | One solve of every type in `DAILY_TYPES` | `DAILY_TYPES.length` | Puzzler (`puzzler`) |
| start | `daily-no-hint` | No Help Needed | A daily solved with 0 hints | | |
| start | `first-weekly` | Weekender | A weekly solved | | |
| start | `first-monthly` | Month's Finest | A monthly solved | | |
| start | `first-genius` | Big Brain | Any puzzle on Genius solved | | |
| streak | `streak-3` | Warming Up | Best daily streak ≥ 3 | 3 | |
| streak | `streak-7` | Week Warrior | Best daily streak ≥ 7 | 7 | |
| streak | `streak-30` | Creature of Habit | Best daily streak ≥ 30 | 30 | Hustler (`hustler`) |
| streak | `streak-100` | Unstoppable | Best daily streak ≥ 100 | 100 | Relentless (`relentless`) |
| streak | `streak-365` | Year of Puzzles | Best daily streak ≥ 365 | 365 | Puzzle Legend (`puzzle-legend`) |
| perfect | `perfect-day` | Clean Sweep | Every daily type solved on one day | | |
| perfect | `perfect-10` | Spotless | 10 perfect days | 10 | Clean Sweeper (`sweeper`) |
| perfect | `perfect-day-no-hint` | Flawless | A perfect day with no hint on any of its dailies | | Immaculate (`immaculate`) |
| volume | `solved-50` | Getting Hooked | 50 solves | 50 | |
| volume | `solved-250` | Puzzle Addict | 250 solves | 250 | |
| volume | `solved-1000` | Thousand Club | 1000 solves | 1000 | Veteran (`veteran`) |
| volume | `weekly-10` | Weekly Regular | 10 distinct weeks with a solved weekly | 10 | Regular (`regular`) |
| oddity | `night-owl` | Night Owl | A daily solved between 00:00 and 04:00 local time | | Night Shift (`night-shift`) |
| oddity | `early-bird` | Early Bird | A daily solved between 04:00 and 06:00 local time | | Morning Person (`morning-person`) |

"Streak", "perfect day" and the local-time rule mean exactly what they mean today (`streaks.ts`, `gather()`).

### Per type

Group `type`, with `type` set on each entry.

| Type | Volume id / title (target 100) | Signature id / title | Signature condition |
|---|---|---|---|
| zip | `zip-100` Zip Fan | `zip-speed` Lightning | Zip daily, 0 hints, under `SPEED_TARGETS.zip` |
| shapes | `shapes-100` In Good Shape | `shapes-speed` Quick Fit | Shapes daily, same rule |
| crowns | `crowns-100` Cat Person | `crowns-speed` Fast Paws | Cats daily, same rule |
| stars | `stars-100` Big Heart | `stars-speed` Swift Heart | Hearts daily, same rule |
| tracks | `tracks-100` Railway Worker | `tracks-speed` Express | Tracks daily, same rule |
| nonogram | `nonogram-100` Pixel Pusher | `nonogram-genius` Picture Perfect | Genius, 0 hints |
| mosaic | `mosaic-100` Piece by Piece | `mosaic-genius` Fine Art | Genius, 0 hints |
| sudoku | `sudoku-100` Nine by Nine | `sudoku-genius` Pure Logic | Genius, 0 hints |
| killer | `killer-100` Sum of All | `killer-genius` Cold Calculation | Genius, 0 hints |
| slabs | `slabs-100` Rock Collector | `slabs-genius` Rock Solid | Genius, 0 hints |

Descriptions name the type by its display name from `PUZZLE_META` ("Solve 100 Zips.", "Solve the Zip daily in under 25 seconds without a hint.").

### Speed thresholds

`SPEED_TARGETS` in `achievements.ts`, seconds, strictly under. Calibrated on 2026-09-25 from the hint-free daily times in the leaderboard (D1 `scores`), set near the fastest quarter and rounded:

| Type | Samples | 25th percentile | Target |
|---|---|---|---|
| zip | 25 | 28 s | 25 s |
| shapes | 28 | 8 s | 10 s |
| crowns | 25 | 36 s | 30 s |
| stars | 23 | 36 s | 30 s |
| tracks | 7 | ~40 s | 45 s |

Tracks has only seven results; revisit it, and the rest, once there are a few hundred per type. Changing a threshold before the store registration is free; afterwards only the description changes, never the id.

## Core (`packages/core`)

- `AchievementGroup` becomes `'start' | 'streak' | 'perfect' | 'volume' | 'oddity' | 'type'`.
- `Achievement` gains `type?: PuzzleTypeId` and `target?: number`. The flair stays out of it; `cosmetics.ts` remains the one place that says which flair an achievement grants.
- `gather()` additionally collects: solves per type, distinct weekly keys, per type whether a Genius solve had 0 hints, and per type the best 0-hint daily time. The pack bookkeeping goes.
- One table maps each counter achievement to its current value from the facts. `achievementProgress(solves, epoch?)` returns `{ id, counter, current, target }` (`counter` names the counter it reads, e.g. `streak`, `solved`, `type:zip`) for every achievement with a target, `current` capped at `target`. `unlockedAchievements()` keeps its signature; for counter achievements it is `current >= target`.
- `cosmetics.ts`: the five existing achievement flairs keep their ids and titles and still point at the same achievement ids. Five new flairs are added with the ids in the table above. Flair ids and titles are forever, as the file already says.
- Coins: unchanged, `ACHIEVEMENT_COINS` (25) per achievement, 1000 over the whole catalog.

## Web (`apps/web`)

The Achievements page is rebuilt after layout C from the brainstorm:

1. **Head:** title, "14 of 40 earned", coin pill, a progress bar across the whole catalog.
2. **Almost there:** up to three unearned counter achievements with `current > 0`, highest `current / target` first, ties in catalog order. Only the lowest locked rung of a ladder qualifies (achievements that read the same counter, such as the five streaks or the three solve counts), so the strip never shows 3, 7 and 30 days side by side. Each as a small card: icon with progress ring, title, "175/250". Tapping opens the detail card. The strip is left out when nothing qualifies.
3. **Filter chips:** All, General, then the ten types in `PUZZLE_TYPES` order with their display names. Horizontally scrollable, All selected on open, not persisted.
4. **Cabinet:** a grid of round badges with the title below. Earned ones are filled in the accent colour; locked ones are muted, and counter ones show a progress ring in the accent colour.
5. **Detail card:** tapping any badge opens a card with the icon, title, description, progress ("12/30") when locked, "+25 coins", and the flair name if it grants one. It closes on tap outside, a close button, or the back key, like `UnlockModal`.

Icons:

- **Type achievements** use the type's existing `PuzzleIcon`, with a small corner mark for the signature: a stopwatch for speed, a crown for Genius.
- **General achievements** get simple line icons as inline SVG in a new `AchievementIcon` component, drawn in `currentColor` so they follow theme and accent. The 512px store icons are rendered from the same SVGs later.

The page follows `prefers-reduced-motion` like the rest of the app (no ring animation). Profile keeps "x of 40 earned"; `UnlockModal` and `syncAchievements` need no change beyond the new catalog.

## Testing

- `achievements.test.ts` moves to the new catalog: count 40, unique ids, every group and type covered.
- One test per condition, including the edges: exactly at the target unlocks, one below does not; speed exactly at the threshold does not count (strictly under); a hinted Genius solve does not unlock the Genius signature; a fast level or random solve does not unlock the speed signature, only a daily does.
- `achievementProgress` agrees with `unlockedAchievements` for every counter on a mixed history, and caps at the target.
- `cosmetics.test.ts`: every flair's achievement requirement names an existing id, and each flaired achievement in the table above has exactly one flair.
- Coins test adjusts to the new count.
- The page is checked in the browser at phone width in light and dark, with a fresh profile, a mid-progress profile and a full one. This also clears the open wiki item about never having looked at the page.

## Open after this

- Native reporting (Play Games Services, Game Center), including the 512px icons and the local-to-store id mapping.
- `ACHIEVEMENTS_EPOCH` to the release date, with the release notes.
