# Hustle: Achievements und exklusive Themes

Stand: 2026-09-30, mit Moritz abgestimmt. Vorschau der Pakete als Artefakt
(https://claude.ai/artifact/7rFErwkazME69GY8gNWsJe), abgenommen.

## Ziel

Hustle haengt bisher nur an Coins, fuenf Badges und fuenf Flairs. Es soll im Rest der App sichtbar
werden (Achievements) und eine Belohnung haben, auf die Vielspieler lange hinarbeiten: drei
Theme-Pakete, die es nur ueber Hustle gibt.

Nicht im Umfang: Aenderungen an Kurve, Coins, bestehenden Badges und Flairs.

## Entscheidungen (mit Moritz, 2026-09-30)

- Drei Hustle-Themes: Ocean bei Level 333, Inferno bei 666, Casino (in der Diskussion "Jackpot")
  bei 777. Grund: tief in Genius als langes Ziel, und dreimal dieselbe Ziffer passt zu jedem
  Paket. Casino stand zuerst bei 999 und wurde am 2026-10-01 auf 777 gezogen (die Zahl des
  Automaten).
- Nie kaufbar, Preis 0, `requires: { hustle: n }` wie die Hustle-Badges. Solange `THEMES_FREE`
  gilt, sind sie wie alle Themes frei, damit Tester sie sehen.
- Neue Achievement-Gruppe `hustle`, eigener Filter-Chip. Leiter 10, 40, 120, 333, 666, 777 (die
  Sprossen 333/666/777 fallen mit den Themes zusammen; 300 entfaellt, weil es neben 333 stuende),
  dazu Clean Round (eine Zehnerrunde ohne Hint), Marathon (30 Hustle-Stufen an einem Berliner Tag),
  Genius Grind (50 Hustle-Stufen auf Genius ohne Hint, Schwierigkeit nach dem Typ-Ausgleich).
  Katalog damit 49 statt 40.
- Theme-Freischaltung kommt ueber die Unlock-Karte des Achievements derselben Stufe: dessen Zeile
  traegt "◆ Theme <Name> · Tap to wear", wie heute ein Flair.

## Pakete

Je Paket die ueblichen Ebenen (siehe `apps/web/src/packs/README.md`), so wie in der Vorschau:

- Ocean, hell, Baloo 2: Lichtkringel und Blasen, Seitenende Sandgrund mit Seegras, Muschel,
  Seestern; Taurahmen mit Schaumkante und zwei Muscheln; Blase statt X; beim Loesen Welle ueber
  das Brett und Blasen; Stempel Rettungsring "Solved!".
- Inferno, dunkel, Grenze Gotisch: Funken und Glut von unten, Seitenende Obsidian mit Lavarissen;
  glimmender Rand; Flamme statt X; beim Loesen Flammen aus der Brettkante; Stempel wird
  weissgluehend eingebrannt und kuehlt ab.
- Casino, dunkel, Limelight: Filz mit Rautenmuster und Glanzpunkten, Seitenende Spielautomat;
  Goldrahmen mit Lauflichtern, gefuellte Zellen als rote Kartenruecken; Karo statt X; Coins als
  Jetons; beim Loesen Muenzregen; Stempel drei Walzen auf 7 7 7, dann "JACKPOT".

## Umsetzung

- core: `ThemeCosmetic.requires?: { hustle }`, `HUSTLE_THEMES` in `cosmetics.ts`,
  `earnedHustleThemes` in `hustleProgress.ts`; die lueckenlose Stufe als `hustleRun` in `hustle.ts`,
  damit `achievements.ts` sie ohne Kreisimport nutzen kann. Achievements in `achievements.ts`.
- web: `owned()` nimmt verdiente Themes auf, `buyItem` lehnt sie ab. Shop zeigt sie gesperrt mit
  "Lv 333", Anprobe erlaubt, Leiste unten "Reach Hustle level 333". Hustle-Seite fuehrt sie unter
  den Belohnungen. Unlock-Karte haengt das Theme an die Achievement-Zeile, ein Tipp legt es an.
- Tests in core fuer die neuen Achievements, den Theme-Besitz und den Katalog.
