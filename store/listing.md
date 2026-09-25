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
since ads process the advertising ID. Nor "no account": sign-in is optional, but it exists. What
stays true for good: every puzzle playable without an account, puzzles generated on the device.

## Languages

Default language is English (US). Play machine translates the listing into every language that has
no entry of its own, and there is no switch to turn that off; the only lever is supplying real text.
Checked on the live German page on 2026-09-20, the machine translation renamed the puzzle types to
Kronen, Sterne and Formen, which the English-only app never shows, and inverted the fairness
sentence so that the player, rather than the next step, sits there waiting to be spotted.

German is therefore written by hand: `store/paste/short-description-de.txt` and
`store/paste/full-description-de.txt`, submitted 2026-09-20. Rules for any further language:

- Keep the ten puzzle names, the four difficulties and Daily/Weekly/Monthly in English. They are
  what `PUZZLE_META` shows in the app, so translating them promises words the app never uses.
- Say that the app itself is English, for as long as that is true.
- Adding a language needs no extra graphics. Under Store-Einträge, "Übersetzungen verwalten" adds
  the locale, and de-DE inherited icon, feature graphic and screenshots from en-US.

## Graphics

| Asset | Requirement | Status |
| --- | --- | --- |
| App icon | 512x512, 32-bit PNG | `store/icon-512.png` |
| Feature graphic | 1024x500, PNG or JPG | `store/feature-graphic.png` |
| Phone screenshots | at least 2, 320-3840 px, long side at most twice the short side | `store/screenshots/phone/`, 6 shots, 1080x1920 |
| 7-inch tablet screenshots | own slot in the console | `store/screenshots/tablet7/`, 4 shots, 1200x1920 |
| 10-inch tablet screenshots | own slot in the console | `store/screenshots/tablet10/`, 4 shots, 1600x2560 |

Themes alternate across the set rather than being shown as a split image, so every shot is a real
screen and Play sees no composite. Phone shots are 1080x1920: Play rejects a screenshot whose long
side is more than twice its short side, which a real 20:9 capture (1080x2340) misses by a hair, and
2160 left a third of the frame empty under the shorter boards.

`node scripts/screenshots.mjs <base-url> <out-dir> phone` from `apps/web` takes the set through
Chrome's remote debugging port, forcing `prefers-color-scheme` per shot. Point it at a local
`vite preview` rather than the live site, or the images will show whatever was deployed last.

It first seeds localStorage from `packages/core/scripts/screenshot-seed.ts`, which invents a week
of solves, part finished boards and level progress. Without it every screen reads "0 solved", and a
store listing that shows an untouched account sells nothing. Two rules that cost a reshoot each
when broken: a type that carries a half finished board must not also have a solve record for the
same day, because the record wins and puts a Solved banner over an untouched board; and the seed
must not write `theme`, since it then overrides the emulated colour scheme.

Both images are generated: `node scripts/android-icons.mjs` from `apps/web` renders the launcher
icons, `node scripts/store-assets.mjs` the listing icon plus the PWA icons in `public/`, and
`PH_FONT=<path> node scripts/feature-graphic.mjs` the feature graphic. `PH_FONT` points at a Nunito
TTF, which is not in the repo; take `ofl/nunito/Nunito[wght].ttf` from the google/fonts repository.

## Play Console answers

State of the app on 2026-09-25. Anything marked TODO verify was not checked against the console
or against Google's current form wording.

**App or game:** Game, category Puzzle.

**Contains ads:** Yes. AdMob rewarded videos in the native builds, only after the player taps
"Watch video" for a hint. The web build has none.

**Advertising ID:** Yes, single purpose "Advertising or marketing". The Google Mobile Ads SDK merges
`com.google.android.gms.permission.AD_ID` into the manifest.

**In-app purchases:** Yes. One non-consumable, "Unlimited Hints" (`unlimited_hints`), through Play
Billing. Coins are earned by solving and are never sold.

**Target audience:** 13 and over. The content suits every age, but declaring under-13 pulls the
app into the Families policy with extra requirements on ads, content and data handling.

**App access:** Some functionality is restricted. Every puzzle works without an account; the
Social tab (groups and standings) needs sign-in. Reviewer note: "Sign-in is optional and only
unlocks the Social tab. Open Profile, tap Sign in and use any Google account; no account from us
is needed. Then open Social, create a group and solve a Daily to see the standings." TODO verify
that Play accepts "any Google account" instead of supplied test credentials.

**Data safety:** Data is collected, none is shared. Encrypted in transit: yes (HTTPS only). Users
can request deletion: yes. Collection of the account data is optional (only when signed in).

| Play data type | What it is | Purpose |
| --- | --- | --- |
| Personal info: Name | Display name, chosen or generated ("Player 1234") | App functionality |
| Personal info: User IDs | Google or Apple subject ID and the internal player ID | App functionality, account management |
| App activity: Other actions | Daily, Weekly and Monthly times with hints, moves and solve time; group memberships | App functionality |
| App activity: Other user-generated content | Group names; equipped badge and flair ids from a fixed list; reports on names | App functionality |
| Device or other IDs | Advertising ID, processed by the AdMob SDK | Advertising or marketing |

Not collected: email address (the server reads only `sub` from the Google token), purchase history
(Play Billing handles it, the server keeps no record), location, contacts, analytics, crash logs.
The IP address reaches Cloudflare and the `/session` rate limiter, but is not stored. TODO verify:
whether AdMob's own disclosure adds further types (app interactions, diagnostics) that Google
expects the app to declare, and whether the 2026-09-21 answer "advertising ID collected, not
shared" still matches Google's guidance for AdMob.

Progress, settings, coins, achievements and unfinished boards stay on the device (WebView local
storage plus a Preferences backup copy) and are not collected.

**Account deletion:** In the app: Profile, Delete account, confirm. The Worker (`DELETE /account`)
removes the player row, all scores, every report by or about the player and all memberships; owned
groups pass to the longest member or are deleted when empty. Play also requires a web URL. There is
no dedicated deletion page; https://vexury.dev/puzzle-hustle-privacy/ explains deletion in the web
app (Google accounts, puzzles.vexury.dev, Profile) and by email. TODO verify that Play accepts the
privacy page as the deletion URL, otherwise add a dedicated page.

**User-generated content:** Display names and group names. Both pass `validateName` in the Worker:
2 to 24 characters, letters, digits, space, `.`, `_`, `-`, no links, a short blocklist. Names are
only visible to members of a shared group. Every standings row has a report flag (`POST /report`,
stored in `reports`); reports are reviewed by hand, there is no automatic ban. Group owners can
remove members, everyone can leave a group. There is no per-player block feature. TODO verify how
Play's UGC questions treat reporting without blocking.

**Content rating (IARC):** No violence, no sexuality, no profanity, no gambling, no drugs, no
location sharing. Digital purchases: yes. Users interact: yes (display names and group names seen
by other group members, no chat). Outcome after the purchase answer on 2026-09-21: PEGI 3, USK 0,
ESRB Everyone, Brazil 14 (ClassInd rates in-game purchases stricter). TODO verify the outcome after
re-answering for user interaction.

**Government app:** No. **Financial features:** none. **Health apps:** no.

**Privacy policy:** https://vexury.dev/puzzle-hustle-privacy/ (source in the vexury.github.io repo
at `src/puzzle-hustle-privacy.md`).

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
