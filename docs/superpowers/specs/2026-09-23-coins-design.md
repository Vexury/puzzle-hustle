# Coins

Design, 2026-09-23. A soft currency earned by solving, spent on hints and on cosmetics that show in the Social tab.

## Goal

Give solving, and dailies above all, a reward that accumulates, and give the Social tab a way for players to mark themselves. Coins buy hints as an extra path next to the rewarded video, and buy badges and flairs that appear next to the name in group standings.

## Non-goals

- **No coins for real money.** No coin packs, no new store products. Cosmetics stay unbuyable with money, even indirectly, which keeps Play declarations and age ratings where they are.
- **No server-side balance.** The worker never knows how many coins anyone has or what they own.
- **No free text.** Badges and flairs come from a fixed catalogue in code, so there is nothing to moderate.
- **No change to ranking.** A hint bought with coins is a hint like any other: it increments `hints` on the solve and ranks the run below every hint-free one.
- **No replacement of the existing hint model.** The free first hint, the rewarded video and `unlimited_hints` stay exactly as they are.

## Decisions

- **Earnings are derived, not stored.** Like achievements, coins earned are a pure function of `ph:solves`, the unlocked achievements and the epoch, computed in `packages/core/src/coins.ts`. If solve sync lands later, earned coins come back with it for free.
- **Only spending is written down.** `ph:coins:spent` is an append-only log of `{ kind: 'hint', puzzle, at }` and `{ kind: 'item', item, at }`. Balance is earned minus spent; ownership is the set of items in the log.
- **Same epoch as achievements.** `ACHIEVEMENTS_EPOCH` gates coins too: a solve before it earns nothing, and a spend entry before it is ignored. When the epoch moves to the production release, testers start at zero on both at once.
- **Balance never shows below zero.** Rules only ever get added between epochs, but a changed `DAILY_TYPES` can retroactively remove a clean-sweep bonus. Display and spending use `max(0, earned - spent)`; owned items stay owned.
- **Ownership is not verified by the server.** It cannot be proved from a local log, and a forged badge buys no rank. The worker checks only that an id exists in the catalogue.
- **Items are never renamed or removed**, only added. An id a client does not know is hidden, not an error, so older clients keep working next to newer ones.
- **Badges are own SVG icons, not emoji.** Emoji differ between Android, iOS and Windows, so one badge would look three different ways in the same group. Icons are single-colour in `currentColor` and follow theme and accent.
- **Coin balance is not on Daily or Puzzles.** The start screen stays a puzzle screen. The balance shows in Social, the shop and the profile.

## Earning

All amounts are constants in `coins.ts`. Day boundaries use the Berlin period keys, like everything else.

| Source | Coins | Hint-free bonus |
|---|---|---|
| Daily | 10 | +5 |
| Clean sweep (every current daily type solved that day) | +20 | |
| Weekly | 30 | +10 |
| Monthly | 75 | +25 |
| Level, per solve entry | Easy 2, Medium 3, Hard 5, Genius 8 | |
| Random | 1, at most 10 per day | |
| Achievement unlocked | 25 | |

- A replayed level or period puzzle overwrites or keeps its single entry in `ph:solves`, so it earns nothing a second time.
- The random cap exists because random is endless; without it, random would be a coin farm.
- A typical daily day comes to roughly 80 to 110 coins.

API in core, DOM-free:

```ts
coinsEarned(solves: SolveEntry[], epoch: number): number
coinsForSolve(entry: SolveEntry, solves: SolveEntry[], epoch: number): CoinAward[]  // for the "+15 coins" line
coinBalance(earned: number, spent: SpendEntry[], epoch: number): number
ownedItems(spent: SpendEntry[], epoch: number): Set<string>
```

## Spending

**Hint: 20 coins.** Only where a video would be asked for today: native, without `unlimited_hints`, from the second hint on a puzzle. On the web and with the purchase, coins never appear in the hint flow.

**Catalogue** in `packages/core/src/cosmetics.ts`, shared with the worker:

| Badges | Price | | Flairs | Price |
|---|---|---|---|---|
| `bolt` | 100 | | `puzzler` "Puzzler" | 150 |
| `leaf` | 100 | | `night-shift` "Night Shift" | 200 |
| `cat` | 150 | | `morning-person` "Morning Person" | 200 |
| `moon` | 150 | | `zip-addict` "Zip Addict" | 250 |
| `sun` | 150 | | `grid-whisperer` "Grid Whisperer" | 300 |
| `ghost` | 200 | | `sudoku-sage` "Sudoku Sage" | 300 |
| `rocket` | 250 | | `sweeper` "Clean Sweeper" | 400 |
| `diamond` | 300 | | `hustler` "Hustler" | 500 |

No crown and no flame badge: the crown marks place 1 on the podium and the flame is the streak colour.

Equipped choice lives in `ph:cosmetics` as `{ badge: string | null, flair: string | null }`. At most one of each.

## Worker

- Migration `0002_cosmetics.sql`: `ALTER TABLE players ADD COLUMN badge TEXT` and `ADD COLUMN flair TEXT`.
- `POST /cosmetics` with `{ badge, flair }`, next to `POST /name`. Each value is `null` or a catalogue id of the right kind, else 400.
- `GET /board` returns `badge` and `flair` per row.
- `DELETE /account` needs nothing extra, the columns sit on the player row.

## Client

- `apps/web/src/lib/coins.ts` wraps the core functions over storage: balance, owned, `spend()`, and `equip()`, which writes `ph:cosmetics` and calls `/cosmetics` when signed in. After each successful login the current choice is posted again; an offline failure is left for the next login, no queue.
- **Hint provider:** `currentHintProvider` gains the coin path. With enough coins the existing opt-in card offers "Use 20 coins" (filled) and "Watch video"; with too few it offers the video and a quiet line "20 coins needed, you have 12". The coin path needs neither network nor ad SDK. The existing fallback (hint without an ad when none can be served) stays.
- **After solving:** under the big time, a line such as "+15 coins" or "+10 coins · +5 no hints", counting up once, shown still under `prefers-reduced-motion`. No line when the solve earned nothing. Clean-sweep coins show on the daily bar, achievement coins in the unlock banner.
- **Balance:** a coin pill (icon plus number in Inconsolata) at the top right of Social and the shop. A fifth tile "Coins" under the profile's 2x2 grid.
- **Shop at `/shop`:** reached via a "Customize" button in the Account card on Social. Top: a preview of the player's own standings row with current badge and flair. Below: badges as a tile grid, flairs as a list, each showing price, "Owned" or "Equipped". Tapping an unowned item buys it with the inline confirm in the button (the reset button's pattern, no dialog); tapping an owned one equips it, tapping the equipped one unequips it. Signed out, one line says cosmetics show in groups once signed in.
- **Standings row:** badge icon after the name, flair as a small second line in muted colour. Medal and accent frame unchanged.
- **Reset progress** clears `ph:coins:spent` and `ph:cosmetics` along with the solves. The native Preferences backup covers both through the `ph:` prefix.

## Store and privacy

Badge and flair are preset values, not user-generated content. The open Play data-safety item for the leaderboard gains "profile customisation" under app activity, collected, not shared. The privacy page mentions both fields where it lists the player name.

## Tests

- Core: every row of the earning table, hint-free bonus, epoch cut for solves and for spends, random cap per Berlin day, replay earns nothing, clean sweep against the current `DAILY_TYPES`, balance floor at zero, ownership from the log, catalogue ids unique across kinds.
- API: `/cosmetics` accepts valid ids and null, rejects unknown ids and wrong kinds, board returns the fields, account deletion removes them.
- Web: hint provider picks free, coins, video, unlimited and web correctly; spending a hint appends to the log and lowers the balance; buying twice is impossible.
