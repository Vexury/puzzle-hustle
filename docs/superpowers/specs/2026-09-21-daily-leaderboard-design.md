# Daily leaderboard

Design, 2026-09-21. First social feature in the app, and the first server component in a project whose selling point is offline play.

## Goal

Let a player compare a daily, weekly or monthly solve against people they know, without breaking anything the app does today. A signed-in player joins a group by code, and each period puzzle gets a list of that group's times. An anonymous percentile line carries the screen on days nobody in the group has played yet.

## Non-goals

- No public global top list. With deterministic seeds, a client-side timer and a public repo holding the solver, a global list invites a forged time on day one and cannot be defended. Group-scoped lists make cheating socially self-punishing instead.
- No account requirement. Without a sign-in the app is exactly what it is today.
- No replay verification in v1. The submitted `moves` count stays, a full move log does not.
- No leaderboard for level packs or random puzzles. Players sit at different points in a pack, so a list there rewards grinding, not solving.
- No chat, no friend requests, no profiles beyond a name.

## Decisions

- **Group lists, not a global list.** The current audience is one closed-test tester and a WhatsApp group. A global daily list with eight entries documents that nobody plays; the same eight people fill a group list completely.
- **Sign-in is optional and gates only the social part.** Google on Android and web, Apple with the iOS build. Playing without a sign-in stays unchanged, which keeps the offline promise intact and lets the still-open device sync (wiki, 2026-09-18) land on the same identity later instead of a second one.
- **The server stores provider, subject and name. Nothing else.** The e-mail address in the ID token is read for verification and discarded. This keeps the Play data safety declaration small and makes account deletion a three-table delete.
- **Ranking is hints ascending, then seconds ascending.** A hinted run appears but sits below every clean one. It does not exclude the players who carry the monetisation, and it keeps `unlimited_hints` from becoming a paid competitive advantage.
- **Period puzzles only** (`daily`, `weekly`, `monthly`), which is exactly the set that is seeded identically for everyone.
- **Cloudflare Workers plus D1**, not Supabase. The feature needs server-side rules either way (first submission wins, plausibility, rate limit), and those belong in readable TypeScript in this monorepo rather than in RLS policies plus plpgsql. The worker can import `packages/core`, so presets, period keys and difficulties come from the same source as the app. Secondary: no extra SDK in a 1.13 MB install, and free projects do not idle out.
- **Entry point is a card in the Daily tab**, not a fourth tab. The bottom bar stays at three, and the comparison sits next to the puzzles it belongs to.
- **Stored times are not reset** because of the timer change of 2026-09-21. The board only ever carries times submitted from its own launch onwards, and the 48 hour grace window excludes older puzzles anyway. Personal bests in the profile may mix both measuring rules; that is a display detail, not a fairness problem.

## Product flow

**Signed out.** The Profile tab gains a "Friends" card: one sentence on what it does and a Sign in button. The Daily tab's group card shows the same invitation instead of standings. Nothing else in the app changes, no badge, no asterisk on a puzzle.

**Signing in.** Google (web: Google Identity Services; Android: a Capacitor plugin over Credential Manager). The client sends only the ID token. The worker verifies it against Google's JWKS and the app's own client IDs, takes `sub`, creates the player on first sight and returns a session token. The local `ph:name` is offered as the initial name and validated server-side.

**Groups.** Creating one yields a six character code and a join link that goes out through the existing share path. Joining takes the code or the link. Limits: 50 members per group, 5 groups per player, so nobody turns a group into a public board. The creator can remove members; anyone can leave.

**The board.** For one puzzle of the current period it lists the group members who solved it, ranked by hints then seconds, own row highlighted. Below it the percentile line over all players, shown only once that puzzle has at least 20 submissions, so it never reads "faster than 100% of 2 players".

**After solving.** The result block gains a line such as `3rd of 6 in Family`, but only if the submission actually reached the server. Offline it is silently absent, and no puzzle ever waits on the network.

## Data model (D1, SQLite)

```sql
CREATE TABLE players (
  id          TEXT PRIMARY KEY,           -- uuid
  provider    TEXT NOT NULL,              -- google or apple
  subject     TEXT NOT NULL,              -- the provider's stable sub claim
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (provider, subject)
);

CREATE TABLE groups (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,       -- 6 chars, Crockford base32 without I L O U
  name        TEXT NOT NULL,
  owner_id    TEXT NOT NULL REFERENCES players(id),
  created_at  INTEGER NOT NULL
);

CREATE TABLE members (
  group_id    TEXT NOT NULL REFERENCES groups(id),
  player_id   TEXT NOT NULL REFERENCES players(id),
  joined_at   INTEGER NOT NULL,
  PRIMARY KEY (group_id, player_id)
);

CREATE TABLE scores (
  player_id   TEXT NOT NULL REFERENCES players(id),
  puzzle      TEXT NOT NULL,              -- sudoku:daily:2026-09-21
  seconds     INTEGER NOT NULL,
  hints       INTEGER NOT NULL,
  moves       INTEGER NOT NULL,
  solved_at   INTEGER NOT NULL,           -- client clock, informational
  created_at  INTEGER NOT NULL,           -- server clock, authoritative
  PRIMARY KEY (player_id, puzzle)
);
CREATE INDEX scores_by_puzzle ON scores (puzzle, hints, seconds);

CREATE TABLE reports (
  id          TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES players(id),
  target_id   TEXT NOT NULL REFERENCES players(id),
  reason      TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
```

The puzzle key is the identifier the app already uses for solves and progress, so nothing new has to be invented client-side. `scores_by_puzzle` serves both the group board and the percentile counts.

The database is created with a Western Europe location hint, so the rows stay in the EU.

## API

Base `https://puzzles-api.vexury.dev`. JSON in, JSON out. Every route except `POST /session` requires `Authorization: Bearer <session token>`.

| Route | Body | Returns |
|---|---|---|
| `POST /session` | `{provider, idToken}` | `{token, player: {id, name}}` |
| `POST /name` | `{name}` | `{name}` |
| `GET /groups` | | `{groups: [{id, code, name, members, owner}]}` |
| `POST /groups` | `{name}` | `{id, code, name}` |
| `POST /groups/join` | `{code}` | `{id, code, name}` |
| `POST /groups/leave` | `{id}` | `{}` |
| `POST /groups/remove` | `{id, playerId}` | `{}` (owner only) |
| `POST /scores` | `{entries: [{puzzle, seconds, hints, moves, solvedAt}]}` | `{results: [{puzzle, status}]}` |
| `GET /board?group=&puzzle=` | | `{entries: [{playerId, name, seconds, hints}], me, percentile}` |
| `POST /report` | `{playerId, reason}` | `{}` |
| `DELETE /account` | | `{}` |

The session token is a worker-signed JWT (HS256, 30 days, payload `{pid, iat, exp}`) with the secret held as a Worker secret. No session table: the next silent sign-in renews it.

`POST /scores` takes a batch because the offline queue can hold several entries. Each entry gets its own status (`stored`, `duplicate`, `rejected`, `expired`) so a single bad row never blocks the rest.

Deleting an account removes the player, their memberships and their scores. Groups they own pass to the longest-standing remaining member, or are deleted if empty.

## Server rules

All of these live in the worker, none in the client.

- **First submission per (player, puzzle) wins.** A second one returns `duplicate` and the client drops it from the queue. Same semantics as `recordSolve`, which already keeps only the first local solve.
- **The puzzle key is validated against the core**: the type exists, the period is `daily`, `weekly` or `monthly`, the key is well formed for that period, and the period is not in the future. Scoring closes 48 hours after the period ends; the puzzle stays playable locally, it just no longer counts.
- **Plausibility check.** A submission is refused when it claims no time, no moves, or more moves than a person can physically make in the time claimed. A rejected row returns `rejected` and is dropped.

  This started as a table of per-type second floors and was replaced on 2026-09-22, an hour after the board went live, because the first real data it met was a daily Shapes solved in 3 seconds with 8 moves and no hints — and it threw that result away. The floors were guesses about how fast a person can be, they stopped nothing a determined cheat could not bypass, and erring strict is the worse error here by this document's own reasoning. What remains is the one bound that needs no data: hands have a maximum speed.
- **Rate limit.** At most 40 stored scores per player per rolling 24 hours, counted from `scores.created_at`. The realistic maximum is eight dailies plus a weekly and a monthly. `POST /session` additionally sits behind Cloudflare's rate limiting binding, since it is the one unauthenticated route.
- **Name validation.** Trimmed, whitespace collapsed, 2 to 24 characters, letters, digits, spaces and `. _ -` only, no URL-like substrings, checked against a small German and English blocklist. Invalid names are refused with a reason, not silently altered.

Honest statement of reach: this stops casual nonsense, not somebody who takes the generator from the public repo and invents a time. Real verification would need a move log replayed against the core, and even that can be synthesised. In a list only friends can see, the cost of cheating falls on the cheater.

## Offline queue

On solving a period puzzle the app writes the local record as it does today and additionally appends to `ph:queue` in localStorage. The `ph:` prefix puts it into the existing Capacitor Preferences backup automatically.

The queue is flushed after a solve, on app start, on returning to the foreground and on the `online` event, with exponential backoff and no user-visible error. Entries answered with `duplicate`, `rejected` or `expired` are removed; network failures leave them in place. The queue is capped at 100 entries, oldest dropped first.

## Client changes

New: `lib/api.ts` (fetch wrapper, session token, typed errors), `lib/auth.ts` (web and native sign-in, session storage), `lib/queue.ts` (queue and flush), `pages/Friends.tsx` (groups and board).

Touched: `lib/storage.ts` and `lib/backup.ts` (new keys `ph:session`, `ph:queue`), `pages/Profile.tsx` (Friends card, sign in and out, delete account), `pages/Daily.tsx` (group card), `pages/Play.tsx` (enqueue on solve, placement line in the result block), `lib/router.ts` (`/friends`, `/join`, `/account`), `main.tsx` (flush on start).

New workspace package `apps/api`: `wrangler.toml`, `src/index.ts` with the routes split into `auth.ts`, `groups.ts`, `scores.ts`, `names.ts`, SQL migrations under `migrations/`, tests under `test/`. A separate GitHub Actions workflow deploys it; the existing web workflow stays untouched.

`packages/core` gains the plausibility helpers and a parser for puzzle keys, both DOM-free and unit-tested, used by worker and app alike.

## Compliance

- **Play data safety** gains name, game activity and an account ID: collected yes, shared no, since nothing leaves to a third party.
- **Content rating questionnaire** has to be answered again: users now interact and create content, namely their name. Brazil's ClassInd rating may move again; that follows from a truthful answer and cannot be optimised away.
- **App access** flips from No to Yes. The reasoning recorded on 2026-09-21 was that every function is reachable without signing in, and that stops being true. Reviewers get a note that any Google account works.
- **Account deletion** is mandatory in two places: inside the app and on the web without installing. The web route is `/account` in the web app itself, which signs in with Google and deletes, so both paths call `DELETE /account`.
- **UGC minimum**: server-side name validation, a report button on every board row, and the group owner can remove anyone.
- **Privacy policy** gains a section on Cloudflare as processor and Google as sign-in provider, with purpose, retention and deletion path.
- **OAuth clients**: one web client and one Android client. The Android client must carry the fingerprint of the Play App Signing certificate, not the upload key, plus a second entry for the debug key while developing. This is the same trap already recorded for Play Games Services: the wrong fingerprint gives a sign-in that works locally and fails silently in production.

## Milestones

1. `apps/api` with D1, migrations, `POST /session` including Google verification, tests. No UI.
2. Web sign-in over Google Identity Services, Friends card in Profile. Web first, because it is testable without a store release.
3. Groups: create, join by code and link, leave, remove.
4. Scores: queue, submission, board, percentile, Daily card, placement line.
5. Native Google sign-in and an Android build. Plugin candidate is `@capgo/capacitor-social-login`, same vendor as the billing plugin, because Google's old Sign-In is deprecated in favour of Credential Manager. Check `android/build.gradle` inside the npm tarball rather than the README, per the lesson from `@capgo/native-purchases`.
6. Compliance: deletion in app and web, reporting, privacy policy, the three Play declarations.
7. Apple sign-in together with the iOS build.

Milestones 1 to 4 ship to the web only and need no Play release at all. Milestone 5 onwards goes into the internal track first; the closed track stays quiet while the twelve testers' 14 day clock runs, per the split agreed on 2026-09-20.

## Testing

- Worker unit tests with `@cloudflare/vitest-pool-workers` against a real D1 binding in Miniflare: token verification with a stubbed JWKS, duplicate submission, expired period, plausibility rejection, rate limit, group limits, board ordering and percentile edges, cascade on deletion.
- Core tests for the key parser and the plausibility check.
- Client tests for the queue: enqueue on solve, flush order, removal on `duplicate`, retention on network failure, cap.
- Device pass on the Galaxy S23: sign-in, join by link, solve offline in flight mode, flush after reconnect, sign-out, deletion.

## Risks and open items

- A release carrying sign-in runs through a fresh Play review and touches declarations that were only just settled. Timing is deliberate: web first, internal track next.
- Google verification needs a Google Cloud project with two OAuth clients. If the Android fingerprint is wrong, the failure is silent and only visible in a signed build.
- D1's free tier is ample here, but the percentile query scans a puzzle's rows. With `scores_by_puzzle` in place it stays an index range; if it ever bites, cache the two counts per puzzle in KV with a short TTL.
- The plausibility check rejects only what is physically impossible, so a fast player is never refused. A fabricated time that respects human hand speed passes, which this document already accepts as unpreventable.
- Group codes are guessable in principle. Six Crockford characters give about a billion combinations against a handful of live groups, and joining reveals only names and times. Acceptable.
