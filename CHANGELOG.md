# Changelog

What changed and why, newest first. Written for three readers: whoever writes the release
notes, whoever answers Google's question about what the closed test led to, and whoever
wonders in six months why something is the way it is.

## Unreleased, on top of version 1 (1.0)

Version 1 is what the closed test has been playing since 2026-09-20. Everything below is
newer than that build.

### Puzzles

**Nonogram difficulty is now set by logic, not by board size.** Measuring first paid off:
medium and hard were statistically the same puzzle, both sitting at a median score of 54,
because the generator returned the first grid its line solver could crack and only the board
size told the levels apart. Meanwhile the spread inside one configuration ran from 44 to 94,
so the whole range was already there, unused. Each level now asks for a share of it and the
generator keeps drawing until the puzzle falls inside a window. Medians are now 53, 67 and 80.

**Genius nonograms are 10x10 instead of 15x15.** At 15x15 with clue gutters seven numbers
deep, the playable grid was a third of a phone screen. At 10x10 with three colours and the
new difficulty window, genius asks the same of a player as the old 15x15 did, on a board that
fits. `scripts/nono-stats.ts` prints the distribution the thresholds came from.

**The daily difficulty is set per puzzle type.** Stars, Sudoku and Killer Sudoku take
noticeably longer than the rest at medium, so their daily is easy. Weekly and monthly are
unchanged.

**Every daily is now generated for its own type.** The eight cards were made from a single
ref with the type swapped out afterwards, so all of them shared one seed and, more to the
point, only one of the eight ever went through its own acceptance check. For shapes that
check is what guarantees a unique solution.

**Puzzle types are ordered from quickest to slowest:** Shapes, Zip, Nonogram, Mosaic, Crowns,
Stars, Sudoku, Killer Sudoku.

**Endless random puzzles unlock once a difficulty is finished.** Offered next to the numbered
levels, they looked like level progress was being dropped: a random puzzle carries a seed
based id, so progress on one is saved but can never be reached again.

### Board and layout

**Boards are sized from the space they actually have.** The fit was estimated with a formula
that did not match the one the stylesheet uses, landing 8 to 13 pixels short, which was
enough to push both 10x10 nonograms into a scroll they did not need. Measured on a 360 pixel
phone, every 10x10 now fits with nothing cut off.

**Zoom is something you reach for, not something you trip over.** Two fingers never hold
exactly the same distance while they move, so every attempt to pan also nudged the zoom.
Zooming now needs a 15% change in distance before it engages. Zooming out below the size at
which the board fills the width is gone, and zoom exists at all only where the board
overflows. The page itself no longer scales either.

**Shapes: the strongest colour now belongs to the atoms that are right.** The ranking was
upside down, with a misplaced atom drawn at full strength while a correct one pulsed down to
62%. The board now brightens as the solve comes together. Overlapping shape edges no longer
stack into a darker line, and the crosses inside wrong areas stay readable in the light theme.

**One X for every board that marks cells as empty.** Mosaic drew the clearest one, Nonogram
and Crowns had drifted to smaller ones with their own opacities.

**The back arrow is drawn rather than borrowed from a quotation mark**, so it is the size it
looks like and sits in the middle of its button. The theme toggle reached the level picker,
the one screen of four that was missing it.

**The streak tile in the profile reads "day streak" again.** The rule in brackets, "3+
dailies", explained itself to nobody standing in a grid of four numbers, and the daily
progress bar already says how many are missing.

**Two more things move: the tabs and the theme.** Switching tabs slides the page in from the
side the tab sits on, with the 0.26 s ease-out the difficulty switcher already used, so the bar
reads as one row rather than three separate screens. Light and dark no longer snap: the new
theme grows out of the button that was pressed, a circle opening over a snapshot of the old
screen through the View Transitions API. Where that API is missing, and whenever the system
asks for less motion, both stay instant.

**The crown in the Crowns icon shrank to the size of its neighbours.** It covered all nine
cells of the little grid drawn behind it and carried about twice the ink of any other type
icon in the list. It now sits centred at roughly the size of the star in the Stars icon.

**The tick on a solved daily is drawn, not set in type.** It was the Nunito glyph, which sat
just under 3% of the badge diameter too high and stayed thinner than the circle around it.
It is now a stroked path, centred on its own ink to the pixel and noticeably heavier.

**Six accent colours, chosen under Profile.** The app had one orange, taken from vexury.dev,
and it was the colour of every button, every active tab and every lit atom. Amber stays the
default and is unchanged; Lagoon, Cobalt, Iris, Rose and Slate repaint the same tokens. Green
and red are deliberately missing, because solved boards and the reset button own them and a
green accent would make a solved level look like an open one. The pick lives in `ph:accent`,
rides along in the native backup, survives a progress reset and is applied in the inline
script before the first frame, so nothing flashes orange on the way in. The Appearance card
sits above By puzzle now, so the choice is visible without scrolling past the statistics.

### Reliability

**The clock stops behind the notification shade.** It was meant to stop whenever the app left
the screen, but it only heard about that through `visibilitychange` and Capacitor's
`appStateChange`, and both of those fire when Android stops the activity. The notification
shade, the quick settings and other system overlays do not stop it: the activity keeps running
and the page stays visible, so the clock counted on behind them. Measured on a Galaxy S23,
thirteen seconds behind the shade cost thirteen seconds, while home, recents and switching apps
paused correctly. Window focus is the one signal those cases do change, so `MainActivity` hands
it to the page and the puzzle listens for it as well.

**The status bar plugin is our own now.** The Play Console flagged the app for
`Window.getStatusBarColor` and `setStatusBarColor`, which Android 15 dropped for edge-to-edge
apps. Both came from `@capacitor/status-bar`, of which the app used exactly one thing: the
colour of the status bar icons, which the plugin already sets through the modern
`WindowInsetsControllerCompat`. The dead branches shipped in the APK regardless, so that one
call is now twenty lines of our own plugin and the dependency is gone. iOS has no counterpart
yet, and the call is limited to Android until it does.

**A failing puzzle no longer takes the app with it.** The generators throw when a seed will
not resolve and they run during render, which left a white page with no way back. Dailies are
the same for everyone, so such a seed would hit every player that day at once.

### Money

**Hints are gated behind a rewarded video or the one time purchase.** One hint per puzzle
stays free. Google requires rewarded ads to run only after an affirmative opt in, so a sheet
asks first and the ad starts on "Watch video". When no ad can be delivered at all the hint is
granted anyway: the network failed, not the player, and there was no ad to earn from either.

**Ad consent is asked at the first video, not at first launch**, so a new player meets a
puzzle rather than a legal notice, and only sees the sheet if they actually want an ad.

**Unlimited Hints** is a one time purchase at 2.99 EUR including tax, bought and restored
through Google Play, which stays the source of truth and is asked on every start.

### Store

**A hand written German store listing.** Play machine translates any language without its
own text, and the German result renamed Crowns, Stars and Shapes and inverted the sentence
about fairness.

---

## Version 1 (1.0), released to closed testing 2026-09-20

First build in the Play Console. Eight puzzle types, daily, weekly and monthly puzzles, level
packs, light and dark theme, progress kept on the device.
