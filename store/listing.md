# Play Store listing

Draft for the Google Play listing and the Play Console forms. Default language English (US);
a German translation can be added later.

## Title (max 30)

Puzzle Hustle

## Short description (max 80)

`store/paste/short-description.txt`, ready to paste as is.

## Full description (max 4000)

`store/paste/full-description.txt`, ready to paste as is. Paragraphs are unwrapped on purpose:
Play keeps every line break literally, so a file wrapped for reading would show breaks mid
sentence.

Never claim the app is ad free in here. The moment AdMob ships, Play puts a "Contains ads" label
next to the listing and the two would contradict each other. The same goes for "no tracking",
since ads process the advertising ID. What stays true for good: no account, no sign-up, puzzles
generated on the device.

## Graphics

| Asset | Requirement | Status |
| --- | --- | --- |
| App icon | 512x512, 32-bit PNG | `store/icon-512.png` |
| Feature graphic | 1024x500, PNG or JPG | `store/feature-graphic.png` |
| Phone screenshots | at least 2, 320-3840 px, long side at most twice the short side | `store/screenshots/phone/`, 6 shots, 1080x2160 |
| Tablet screenshots | optional, helps placement on large screens | `store/screenshots/tablet/`, 4 shots, 1600x2560 |

Themes alternate across the set rather than being shown as a split image, so every shot is a real
screen and Play sees no composite. Phone shots are 1080x2160 on purpose: Play rejects a screenshot
whose long side is more than twice its short side, and a real 20:9 phone capture (1080x2340) misses
that by a hair.

Screenshots are taken from the live web build at puzzles.vexury.dev through Chrome with remote
debugging, at the device sizes above and with `prefers-color-scheme` forced per shot. The web build
and the app share the same UI code, and a puzzle screen can be addressed directly, for example
`/play?t=killer&d=medium&s=<seed>&p=daily&k=<date>`, which beats tapping through the app.

Both images are generated: `node scripts/android-icons.mjs` from `apps/web` renders the launcher
icons, `node scripts/store-assets.mjs` the listing icon plus the PWA icons in `public/`, and
`PH_FONT=<path> node scripts/feature-graphic.mjs` the feature graphic. `PH_FONT` points at a Nunito
TTF, which is not in the repo; take `ofl/nunito/Nunito[wght].ttf` from the google/fonts repository.

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
