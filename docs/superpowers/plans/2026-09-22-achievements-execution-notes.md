# Achievements: execution notes

The SDD ledger from building this feature, kept because its rulings explain choices the code
cannot. Plan: `2026-09-22-achievements.md`. Spec: `../specs/2026-09-22-achievements-design.md`.

---


Spec: docs/superpowers/specs/2026-09-22-achievements-design.md (read, binding)
Branch: feat/achievements, forked from main at 66311bc.

## Pre-flight scan

| Pair / task | Produce vs consume | Finding |
|---|---|---|
| 1 -> 3 | 1 produces parseSolveId/ParsedSolveId; 3 consumes parseSolveId | agrees |
| 2 -> 3 | 2 produces dailyStreaks(ids: Iterable<string>, now?); 3 consumes dailyStreaks | agrees |
| 3 -> 4 | 3 produces ACHIEVEMENTS, unlockedAchievements, SolveEntry; 4 consumes all three | agrees |
| 3 -> 5 | 3 produces Achievement, AchievementGroup; 5 consumes both | agrees |
| 4 -> 5 | 4 produces currentUnlocked(): Set<string>; 5 consumes it | agrees |
| 1, 2, 3 share packages/core/src/index.ts | each appends one export line | sequential, no conflict |
| 2 shares apps/web/src/lib/stats.ts with nothing | wrapper keeps Daily.tsx/Profile.tsx untouched | agrees |
| Task 1 self-consistency | consumes isDifficulty/isPeriod/isPuzzleTypeId/DIFFICULTIES (types.ts), periodDifficulty (schedule.ts), parsePuzzleId (puzzleId.ts) | all verified present |
| Task 2 self-consistency | consumes PUZZLE_TYPES (types.ts), periodKey (schedule.ts) | verified present |
| Task 3 self-consistency | consumes levelList (levels.ts), DIFFICULTIES | verified present |
| Task 4 self-consistency | SolveRecord.solvedAt is an ISO string, SolveEntry.solvedAt a number | storedSolves does Date.parse and skips unparseable; agrees |
| Task 5 self-consistency | route /achievements, page is a list; no test beyond 3 and 4 | agrees; browser check only, as the plan states |

Scan found two defects, both fixed in the plan before execution (commit 66311bc):
- Task 2 imported periodKey from both types.ts and schedule.ts. It lives in schedule.ts.
- Task 4's syncAchievements returned before writing when there was nothing to announce, so a
  re-locked achievement kept its id in ph:achievements forever and could never be celebrated
  a second time. The spec requires it. Now written unconditionally, with a test.

## Rulings

Ruling: Task 4's storedSolves() reads localStorage directly; it will instead read storage.ts's
in-memory cache through a new two-line `allSolves()` export — why: recordSolve writes the cache
first and localStorage in a try/catch, so a quota failure would leave the achievement path
reading a solve history that is missing the solve just made; also avoids re-parsing the whole
history on every solve — cost if wrong: one extra export in storage.ts.

## Task 1
Implementer DONE, commit 4280754 (parseSolveId in core). Review dispatched.
Task 1: complete. Review: spec PASS, quality APPROVED. Suite 225 green, typecheck clean.
Baseline was 221, not 220 (the plan's Global Constraints say 220; harmless, reviewer verified).
Parked (not this plan's scope, no code change made):
- parsePuzzleId/periodDifficulty accept a period id for a type that has no period options, e.g.
  zip:daily:..., contradicting schedule.ts's own comment. Pre-existing.
- the random branch does not validate the seed36 segment. Intentional, untested.

## Tree move (between Task 2 and its review)
A second session was working in the SAME checkout on the level packs, and my
`git checkout -b feat/achievements` had moved the tree under it. Agreed with that session,
then: committed my work, put C:\dev\puzzle-hustle back on main with its 12 uncommitted
level-pack files intact, and moved this branch to the worktree
C:\dev\puzzle-hustle\.worktrees\achievements. All later work happens there. The SDD workspace
was moved across too (it is git-ignored, so it did not follow the branch).
Verified in isolation: 230 tests green (core 146, web 29, api 55), pnpm -r typecheck clean.
The registry.ts typecheck error Task 2 reported was the other session's work in progress.
Ruling: pack-complete keeps deriving its count from levelList(type, difficulty).length, never
a literal — why: the other session is raising every pack from 20 to 50 levels and bumping
SHAPES_VERSION 2 -> 3 — cost if wrong: a test that goes red the moment their work merges.

## Task 2
Implementer DONE, commit 6e66d05 (dailyStreaks moved to packages/core/src/streaks.ts, web
keeps a wrapper). Daily.tsx and Profile.tsx untouched. Review dispatched.
Noted, no action: the attribution line names the real model per commit (Haiku 4.5 on Task 1,
Sonnet 5 on Task 2). global.md asks for the real model, so this is the honest reading; left
alone rather than churning commits.
Checked against the other session's renumbering (levels now come out of a selection rule, so
old level numbers point at different puzzles): no achievement stores a level number. Only
pack-complete looks at levels, and it compares a count of distinct ids against
levelList(...).length, both sides coming from the pack itself. Safe.
Task 2: complete. Review: spec PASS, quality APPROVED. Reviewer diffed the moved function
against 4280754:apps/web/src/lib/stats.ts line by line and found only the two intended changes;
re-derived all 5 tests by hand. 230 green, typecheck clean.

## Task 3
Dispatched from 7f62348. The seventeen definitions, the epoch, unlockedAchievements.
Task 3 implementer DONE, commit 9ca09c2 (17 definitions, epoch, unlockedAchievements).
Review (opus): spec PASS, quality CHANGES REQUESTED. All seventeen conditions verified against
the spec table one at a time and correct; pack-complete uses levelList(...).length, no literal;
17 unique ids, ids and CONDITIONS keys identical sets; group counts 4/4/4/3/2 match.
Findings are all about test strength, plus one about purity. Fix round 1 dispatched to the
same implementer: zone-dependent timezone test, perfect-day not pinned to one day,
daily-no-hint not pinned to dailies, untested night-window boundaries, four achievements with
no negative case, no whole-set assertion anywhere, purity resting on an untested inequality in
streaks.ts, typo-able CONDITIONS key, untested epoch boundary.
Ruling: the exported signature stays unlockedAchievements(solves, epoch?) as the spec fixes it;
purity gets a vi.setSystemTime test instead of a widened API — why: the spec defines the
interface and Task 4 consumes it — cost if wrong: purity guarded by a test rather than by
construction.
Ruling: the epoch boundary stays `solvedAt >= epoch`, i.e. a solve exactly at the epoch counts
— why: the spec words it twice as "at or after"; my brief's "at or before" was the stricter
misreading and the code followed the spec — cost if wrong: one achievement earnable a
millisecond earlier than intended.
Ruling: the timezone mutation result is why fix round 1 requires seeing each new test fail
before it is committed — why: the test did bite on this machine and not under TZ=UTC, so
"I ran it and it passed" proved nothing — cost if wrong: another green test that guards nothing.
Other session's level packs are green and committed on main: 8390d15 (capacity script),
41a6072 (the packs). 50 levels per difficulty in all 32 packs, SHAPES_VERSION 3, Shapes easy at
four fragments, every level renumbered. registry.ts gained an optional family(seed, difficulty)
on PuzzleAdapter and a reuse() memo; this branch does not touch registry.ts, so the merge
should be clean.
Ruling: do not merge main into this branch until Tasks 4 and 5 are reviewed and done — why:
merging mid-plan puts a second moving part into every remaining review, and nothing in Tasks 4
or 5 depends on the packs — cost if wrong: one merge at the end instead of two smaller ones.
Not pushed, and not ours to push: it deploys the Pages build the testers play on. Moritz's call.
Task 3: complete. Fix round 1 = f1090b9 (test-only, src/ verified untouched). Re-review: all
findings addressed. The timezone fix proven by mutation under three zones (machine, UTC,
America/New_York) — all three red. 249 green, typecheck clean.
Correction to the implementer's wording, recorded so it does not mislead later: the
"every id is reachable" test asserts `unlocked(history).has(id)` per id plus that the fixture
keys equal the id set. It does NOT assert one id only per fixture, which could not be true
anyway (streak-30 necessarily earns streak-3). Over-unlocking is covered by the whole-set tests
from finding 6, not by this one.

## Task 4
Dispatched from f1090b9. The announcement path in the web app.
Task 4 implementer DONE, commit 793b138. Both brief corrections applied (allSolves() from the
storage cache; the announced list written unconditionally). Mutations run and reverted for the
never-throws guarantee and the pruning case, both confirmed red.
Pattern worth remembering: this is the second time in this project that plan code failed its
own accompanying test (leaderboard scores.ts, now pendingAnnouncements filtering through
ACHIEVEMENTS while its test uses synthetic ids 'a'/'b'). Writing the test and the code in the
same sitting is not enough; the plan's code is never run before a task picks it up.
Task 4 review: spec PASS, quality APPROVED with two real test gaps, both proven by mutation.
- No test distinguishes reading storage.ts's cache from reading localStorage: the reviewer
  bypassed allSolves() and all 7 tests still passed, because every test seeds localStorage and
  then calls rehydrate(). Correction (a) is therefore untested.
- Test 6 is a green test that guards nothing: its `toasts` array is never populated because
  toast is not mocked, so expect(toasts).toEqual([]) is trivially true. Inherited from my brief.
Confirmed good: never-throws is complete and Play.tsx:287 runs after recordSolve (277) and
setResult (276); ph:achievements is covered by the native backup via isBackedUp; main.tsx:21
calls it on start; allSolves() matches how useSolves already exposes the cache.
Ruling: fix round 1 on Task 4 also pins toast order — why: order comes out in catalog order only
because core's unlockedAchievements iterates ACHIEVEMENTS and Set preserves insertion order,
which is undocumented and a future core refactor would reorder the toasts silently — cost if
wrong: one extra test, or an explicit sort in pendingAnnouncements if the implementer prefers.
Task 4: complete. Fix round 1 = 0486e5e. Re-review verified all three tests by its own mutations
(cache bypass, unconditional toast, reversed comparator) — all red, all reverted. 258 green.
Honest limitation recorded: the order test verifies the sort's correctness, not its necessity —
deleting the sort leaves it green, because core already yields catalog order today. Finding 3 is
answered by the implementation (explicit CATALOG_ORDER re-sort in syncAchievements), not the test.
CATALOG_ORDER comparator uses `?? 0`, so the NaN-from-undefined trap is not there.
pendingAnnouncements stayed pure and catalog-agnostic; its synthetic-id test still passes.

## Task 5
Dispatched from 0486e5e. The achievements page, route, Profile card and styles.
Task 5: complete. Commit 6d27746. Review: spec PASS, quality APPROVED. Render test proven by
mutation (empty unlocked set, dropped group — both red). currentUnlocked() is called in the
render body, not an effect, which is why renderToStaticMarkup sees the right state. All four
CSS tokens verified present in both themes; no hardcoded colours. Profile.tsx is a pure
addition. 259 green, typecheck clean, web build succeeds.
Outstanding and nobody's fault: nothing in this branch has been seen in a browser. Toast on
solve, no re-toast on reload, both themes, phone width, no horizontal scroll — all for Moritz.

## Final whole-branch review
Dispatched over 66311bc..6d27746 (the fork point) on the most capable model.
Final review (opus): sound and faithful to the spec, three real-device defects, plus spec-level
findings nobody had questioned. 259 green, typecheck clean, build OK. Adjudication:
FIXING (one wave, dispatched):
1. streaks.ts keyOfDayIndex throws RangeError on a NaN day index. A malformed daily id
   (shapes:daily:zzz, or a truncated key from a mangled share link, which decodeRef accepts and
   Play.tsx records before the scheduled-ref gate) white-screens both Achievements and Profile,
   which call currentUnlocked() unguarded in their render body, and kills achievements silently
   forever because syncAchievements swallows it. Pre-existing throw, new consumers.
2. ph:achievements written on every launch closes the native-backup door permanently:
   restoreBackup bails if any backed-up ph: key exists, and this is the first thing to plant one
   on a clean install. Now written only when the list actually changes; the epoch prune is a
   change, so the unconditional-write ruling and its test still hold.
3. resetProgress does not clear ph:achievements, so the first re-earned achievement after a
   reset gets no toast.
4. The epoch was UTC midnight while the puzzle day is Europe/Berlin, so on epoch day the first
   two Berlin hours had a post-epoch key and a pre-epoch instant: gone from the achievement
   streak, still counted on the Profile. Moved to Berlin midnight.
5. early-bird was `hour < 6` and night-owl `hour < 4`, so solving at 02:00 told the player they
   were up early and night-owl could never fire alone. Now 04:00-06:00.
6. dayIndex duplication between core and stats.ts removed.
NOT FIXING, documented in the spec instead:
Ruling: night-owl/early-bird keep reading the hour at evaluation time, not at solve time — why:
the solve stores only a UTC instant, and carrying the offset means a new stored shape, which the
spec rules out; the cost is a traveller losing and re-earning a curiosity achievement — cost if
wrong: one achievement flickers per trip abroad.
FOLLOW-UP, not now: Math.max(best, run) in streaks.ts is redundant (run can only count a run
best already counts); test fixtures use zip:weekly ids the app cannot produce; the Profile will
read "1000 solved" above "0 of 17 earned" after the epoch moves, which needs a word on the page.
Fix wave: f972424. Re-review verified all seven independently, including running the crash cases
itself, re-deriving the positional-compare argument (nextAnnounced is a subsequence of the
previous list plus appended ids, so positional equality cannot mask a content difference), and
repeating the three-zone mutation after the early-bird change. 264 green, typecheck clean,
build OK.

## Integration
Moritz gave the go to merge to main locally and push before leaving. Merging main (41a6072,
the other session's level packs, already on both remotes) into the branch first.
