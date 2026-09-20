# Play Store listing

Draft for the Google Play listing and the Play Console forms. Default language English (US);
a German translation can be added later.

## Title (max 30)

Puzzle Hustle

## Short description (max 80)

Eight logic puzzles, new every day. Every one solvable by logic, never by luck.

## Full description (max 4000)

Eight logic puzzles. One fresh set every day, the same for everyone playing.

Every puzzle here is run through a solver before it ships. It has exactly one solution, and you can
always reason your way to it. No guessing, no backing out of a dead end you could not have seen
coming. Nonograms resolve row by row and column by column. Killer cages fall to sums and the rule
of 45. When you are stuck, the puzzle is still fair, you just have not found the next step yet.

THE DAILY SET
One puzzle of each type, seeded from the date, so your Tuesday is everyone's Tuesday. A harder
Weekly and a bigger Monthly sit on top. Three solved dailies keep your streak alive.

THE PUZZLES
- Shapes: slide overlapping pieces until the lit pattern matches the target
- Nonogram: paint the picture from the numbers, black and white or in colour
- Mosaic: every number counts the filled cells around it
- Crowns: one crown per row, column and region, never touching
- Stars: the same idea, two stars per line
- Sudoku: the classic
- Killer Sudoku: sudoku with cages that add up
- Zip: one path through every cell, reaching the numbers in order

FREE PLAY
Twenty levels per type and difficulty, fifty for Shapes, ordered from gentle to genius. After that,
endless random puzzles in four difficulties.

Pencil marks, undo, reset, and a hint when you want one. Your streak and your progress are kept,
and a half-finished board is waiting exactly where you left it. Light and dark theme. The puzzles
are generated on your device, so the train, the plane and the basement all work fine.

No account. No sign-up. Open it and solve.

Paste the paragraphs unwrapped: the line breaks above are for reading the file, Play would keep
them literally. Never claim the app is ad free here; the moment AdMob ships, Play puts a
"Contains ads" label next to the listing and the two would contradict each other.

## Graphics

| Asset | Requirement | Status |
| --- | --- | --- |
| App icon | 512x512, 32-bit PNG | `store/icon-512.png` |
| Feature graphic | 1024x500, PNG or JPG | `store/feature-graphic.png` |
| Phone screenshots | at least 2, 16:9 or 9:16, 320-3840 px | `store/screenshots/`, 1080x2340, dark theme |
| Tablet screenshots | optional, but improves reach | open |

The screenshots are a first set taken on a Galaxy S23: the daily list, four boards and the puzzle
index, all on empty boards. They should be retaken once the app has some progress to show, so the
daily screen does not read "0/8 solved".

Both images are generated: `node scripts/android-icons.mjs` from `apps/web` renders the launcher
icons, `node scripts/store-assets.mjs` the listing icon, and `PH_FONT=<path> node
scripts/feature-graphic.mjs` the feature graphic. `PH_FONT` points at a Nunito TTF, which is not
in the repo; take `ofl/nunito/Nunito[wght].ttf` from the google/fonts repository.

## Play Console answers

**App or game:** Game, category Puzzle.

**Contains ads:** No. Rewarded ads are planned for a later release; the declaration has to be
updated in the same release that ships them.

**In-app purchases:** No. The one-time "Unlimited Hints" purchase is planned for later.

**Target audience:** 13 and over. The content suits every age, but declaring under-13 pulls the
app into the Families policy with extra requirements on ads, content and data handling.

**App access:** All functionality is available without an account or login.

**Data safety:** No data collected, no data shared. Progress, settings and unfinished boards are
stored on the device only (WebView local storage plus Android SharedPreferences as a backup).
There is no backend and no analytics. Sharing a result opens the Android share sheet, so the
player decides what leaves the device and where it goes.

**Content rating (IARC):** No violence, no sexuality, no profanity, no gambling, no drugs, no
user-to-user communication, no location sharing, no digital purchases. Expected outcome: PEGI 3 /
ESRB Everyone.

**Government app:** No. **Financial features:** none. **Health apps:** no.

**Privacy policy:** https://vexury.dev/puzzle-hustle-privacy/ (source in the vexury.github.io repo
at `src/puzzle-hustle-privacy.md`). Required as a public URL even though nothing is collected.

## Release order

The 14-day tester clock is the critical path, so the first upload comes before the app is
finished. Everything after step 4 can run while the clock is ticking.

1. Create the app in the Play Console: Puzzle Hustle, default language English (US), type Game,
   category Puzzle, free. Accept Play App Signing when prompted; the key in
   `Z:/Documents/Arbeit/Moritz/Vexury/keys/` is then the upload key, which Google can reset.
2. Fill the store listing from this file and upload `store/icon-512.png`,
   `store/feature-graphic.png` and `store/screenshots/`.
3. Work through App content: privacy policy URL, ads (no), app access (no login), content rating
   questionnaire, target audience 13+, data safety (nothing collected, nothing shared),
   government apps (no), financial features (none), health (no).
4. Create the closed testing track, upload `app-release.aab`, add at least 12 testers by email or
   through a Google Group, and send them the opt-in link. The clock starts once they are opted in
   and only counts continuous days, so a tester who opts out resets their own contribution.
5. While the 14 days run: build in AdMob with UMP consent and Play Billing, ship them as updates
   to the same track, then switch the ads and in-app purchase declarations, extend the privacy
   policy and update data safety.
6. After 14 days with 12 continuous testers, apply for production access. Google reviews it, which
   is a separate wait.
