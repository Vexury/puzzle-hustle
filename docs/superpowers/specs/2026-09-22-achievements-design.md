# Achievements

Design, 2026-09-22. A private collection of things to have done, computed from the solve history the app already keeps.

## Goal

Give a player something to reach for beyond the next puzzle, without adding a second kind of progress to maintain. Seventeen achievements across five groups, visible on their own page, announced when earned.

## Non-goals

- **Not Play Games Services, not yet.** PGS would give the welcome banner, the gamer level and presence in Google's Play Games app, but it is Android-only, needs its own Play Console setup, a Capacitor plugin and a 512px icon per achievement, and iOS would need the same work again in Game Center. This design puts the definitions and the unlock logic in `packages/core` precisely so that PGS and Game Center can later become places the same unlock is *reported to*, rather than a second source of truth.
- **No server state.** Achievements are private, are never shown to other players, and do not require an account. The app is complete without a sign-in, and locking collectibles behind one would contradict that.
- **No new tracking.** Every achievement is derivable from `ph:solves` alone. Anything needing playtime, session counts or abandonment would introduce a new stored shape to maintain and migrate.
- **No hidden achievements.** Every one shows its text whether earned or not, so the page reads as something to aim at. Hidden ones may come later; the shape below leaves room for a flag.
- **Nothing retroactive.** See the epoch, below.

## Decisions

- **Derived, not stored.** The unlocked set is a pure function of the solve history and the epoch, recomputed on demand. The only thing written down is which achievements have already been announced, so the toast does not repeat.
- **An epoch, and nothing before it counts.** The test phase is not meant to carry over into the release: a player who solved everything during testing should start the official release at zero like everyone else. `ACHIEVEMENTS_EPOCH` is a fixed instant in `packages/core`; a solve with an earlier `solvedAt` counts for nothing.
- **The epoch ships first to the test track.** It is set to the day the feature reaches testers, so they earn real achievements and genuinely exercise the code, and it moves to the production release date when that happens. Testers lose their test-phase achievements at that point, which is the intended behaviour rather than a side effect. The alternative — shipping achievements only at production — means nobody exercises them first, and this project has already paid once for shipping code that had never run: a plausibility floor that looked correct across 220 tests and threw away a real result the first time a person solved a puzzle.
- **Streak logic moves into core.** `dailyStreaks` currently lives in `apps/web/src/lib/stats.ts` but is pure and depends only on core exports. Achievements need it; duplicating it would eventually give two different answers to "how long is my streak", one on the profile and one on the achievements page.

## The achievements

Each is derivable from the solve history alone. `solvedAt` is the client's clock at the moment of solving, already recorded per solve.

**Ankommen**

| id | Title | Condition |
|---|---|---|
| `every-type` | One of each | At least one solved puzzle of every one of the eight types, in any mode |
| `first-weekly` | Weekly done | One weekly solved |
| `first-monthly` | Monthly done | One monthly solved |
| `first-genius` | Genius | One puzzle of difficulty `genius` solved |

**Gewohnheit**

| id | Title | Condition |
|---|---|---|
| `streak-3` | Three in a row | A daily streak of 3, counted the way the profile counts it: a day counts from `STREAK_MIN` solved dailies |
| `streak-7` | A week in a row | Streak of 7 |
| `streak-30` | A month in a row | Streak of 30 |
| `perfect-week` | Perfect week | Seven consecutive perfect days |

**Können**

| id | Title | Condition |
|---|---|---|
| `daily-no-hint` | Unaided | One daily solved with zero hints |
| `perfect-day` | Perfect day | All eight dailies of one day |
| `pack-complete` | Pack cleared | Every level of one type at one difficulty |
| `perfect-day-no-hint` | Perfect and unaided | All eight dailies of one day, none with a hint |

**Menge**

| id | Title | Condition |
|---|---|---|
| `solved-50` | Fifty | 50 solved puzzles |
| `solved-250` | Two hundred and fifty | 250 solved |
| `solved-1000` | A thousand | 1000 solved |

**Kurioses**

| id | Title | Condition |
|---|---|---|
| `night-owl` | Night owl | A daily solved between 00:00 and 04:00 |
| `early-bird` | Early bird | A daily solved before 06:00 |

The last two use the **device's local time**, deliberately unlike period keys, which are Europe/Berlin for everyone so that the same puzzle falls on the same day worldwide. Solving at one in the morning is about the player's night, not Berlin's.

## Architecture

**`packages/core/src/achievements.ts`** holds the definitions and the evaluation. Pure, DOM-free, no storage, no clock of its own beyond what it is handed.

```ts
export interface SolveEntry {
  id: string;        // refId: type:period:key | type:level:difficulty:n | type:difficulty:seed36
  solvedAt: number;  // ms since epoch
  seconds: number;
  hints: number;
  moves: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  group: 'arrival' | 'habit' | 'skill' | 'volume' | 'oddity';
}

export const ACHIEVEMENTS: readonly Achievement[];
export const ACHIEVEMENTS_EPOCH: number;

export function unlockedAchievements(solves: SolveEntry[], epoch?: number): Set<string>;
```

`unlockedAchievements` filters to solves at or after the epoch, then evaluates every definition against that history. Same input, same output, always.

**A solve id classifier** joins `parsePuzzleId` in core. That one deliberately returns null for anything that is not a period puzzle; achievements also need to recognise level solves (for `pack-complete`) and the difficulty of any solve (for `first-genius`). The new helper returns the type, the mode, and the difficulty for all three id shapes.

**`dailyStreaks` moves** from `apps/web/src/lib/stats.ts` into core alongside it, with `LAUNCH_DAY` and `STREAK_MIN`. `stats.ts` imports it from there afterwards, so the profile and the achievements page cannot disagree.

**Storage** is one key, `ph:achievements`, holding the ids already announced. It sits under the `ph:` prefix, so it travels with the native Capacitor Preferences backup like every other progress key.

**Evaluation runs twice:** on app start, and immediately after a solve, at the same point in `onSolved` where the leaderboard queue is fed. Newly unlocked is the evaluated set minus the announced set; those are announced and added. An id in the announced set that is no longer unlocked — which happens when the epoch moves forward — is removed, so it can be earned and celebrated again.

Nothing in this path may throw into the solve path, for the same reason the score queue may not: a player must never lose their finished-puzzle screen over a collectible.

## Presentation

A short toast per newly unlocked achievement, through the existing `toast`. Several at once are announced one after another rather than merged, since earning two at once is a moment worth having twice.

A page listing all seventeen, grouped, each with title, description and whether it is earned. Reached from a card in the Profile tab, following the pattern the Friends card already uses. Locked ones show their text.

## Testing

The evaluation is a pure function over a list, which makes per-achievement tests cheap and worth writing for all of them: a handcrafted history in, an expected set out. Beyond one test per achievement:

- a solve before the epoch counts for nothing, and the same solve after it counts
- moving the epoch forward re-locks an achievement and clears it from the announced set, so it can be earned again
- the streak achievements agree with what the profile shows for the same history, which is the property the move into core exists to guarantee
- `night-owl` and `early-bird` are evaluated in device-local time, not Europe/Berlin

## Risks and open items

- `solvedAt` is the client's clock. A device with a wrong clock can place an old solve after the epoch or a new one before it. Acceptable: this is a private collection, not a leaderboard, and the leaderboard already ignores client timestamps for every decision.
- The epoch moves once, at the production release, and testers lose what they earned during the test phase. Intended, and worth saying out loud in the release notes rather than letting it look like a bug.
- `pack-complete` depends on how many levels a pack has, which differs by type (Shapes has 50, the rest 20) and can change when a generator version is bumped. The condition is "every level of one type at one difficulty" as the level pack currently defines it, so a later pack extension re-locks it. That is the honest reading of "cleared".
- Seventeen, not the sixteen mentioned in conversation; the groups as listed add up to seventeen.
- `night-owl` and `early-bird` are meant to read the hour at the moment the player solved the puzzle. The stored solve only keeps a UTC instant, no offset, so the code instead reads `new Date(solvedAt).getHours()` at evaluation time, in whatever zone the device happens to be in *then*. Visible consequence: a player who earns Night owl at home and then flies abroad can lose it on next sync (the same instant now reads as a different local hour), and can re-earn it on the way back. Closing this properly means storing the solve-time UTC offset alongside each solve, which is a new stored shape and out of scope here; left open.
