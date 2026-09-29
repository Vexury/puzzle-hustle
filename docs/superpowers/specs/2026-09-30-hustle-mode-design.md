# Hustle: endloser Modus

Stand: 2026-09-30, Entwurf mit Moritz abgestimmt.

## Ziel

Vielspieler haben nach den neun Dailys etwas, das sich nach Fortschritt anfuehlt statt nach
"Random": ein endloser Aufstieg ueber alle Raetseltypen, der langsam schwerer wird. Die erreichte
Stufe ist das Hustle-Level des Spielers, ein sichtbarer Status unter Freunden in der Player Card.

Erfolg heisst: Spieler machen nach den Dailys weiter, und das Hustle-Level taugt zum Vergleichen.

Nicht im Umfang: eine eigene Hustle-Bestenliste, groessere Bretter jenseits von Genius,
Ueberspringen von Stufen.

## Entscheidungen (mit Moritz, 2026-09-30)

- Stufe N ist fuer alle Spieler dasselbe Raetsel. Grund: das Level ist fair vergleichbar, man kann
  ueber eine Stufe reden, und Kurve und Typmix lassen sich abstimmen.
- Kein Ueberspringen, Hints wie ueberall (freier Tages-Hint, dann Coins oder Video). Grund: jedes
  Level bleibt verdient, und mit genug Hints ist jedes Raetsel loesbar.
- Coins nur an Meilensteinen, nicht pro Raetsel. Grund: sonst entwertet endloses Spielen den Shop
  (Theme-Pakete sind auf rund 4000 Coins, vier bis fuenf Wochen Dailys, angelegt).
- Kurve langsam: Easy 1 bis 40, Medium 41 bis 120, Hard 121 bis 300, Genius ab 301. Genius ist das
  Plateau; groessere Bretter koennen nur sechs der zehn Typen und kommen, falls Grinder durch sind.
- Neue Badges und Flairs nur ueber Hustle, nicht kaufbar. Flair-Namen schlicht mit "Hustle".
- Tab-Ansicht wie Mockup B: grosses Level, Fortschrittsbalken zum naechsten Meilenstein, naechstes
  Raetsel, Reihe der kommenden Meilensteine.
- Player Card wie Mockup A: amberfarbener Chip "Lv 47" hinter Name und Badge.

## Folge und Schwierigkeit (packages/core, neu `hustle.ts`)

- `hustleRef(n: number): PuzzleRef` fuer n >= 1, rein, deterministisch, offline.
- Schwierigkeit nach Stufe: n <= 40 easy, <= 120 medium, <= 300 hard, sonst genius.
- Typ: Runden zu je zehn Stufen (1 bis 10, 11 bis 20, ...). Jede Runde nimmt alle zehn Typen aus
  `PUZZLE_TYPES` in einer gemischten Reihenfolge, gemischt mit einem Rng aus dem Rundenindex.
  Faellt der erste Typ einer Runde auf den letzten der vorigen, wird er mit dem zweiten getauscht.
  So kommt jeder Typ gleich oft vor und nie zweimal hintereinander.
- Seed: `hashString("hustle|" + n + "|" + attempt)`, erster Versuch, den der Adapter akzeptiert,
  wie `scheduledRef` fuer Perioden (dieselben Versuchsgrenzen, dieselbe Budgetregel).
- Zip hard und genius nehmen statt eines Seeds ein Brett aus dem Random-Vorrat im Board-Pack
  (`boards/zip.ts`, je 40): Index = Anzahl der Zip-Stufen dieser Schwierigkeit vor n, modulo 40.
  Live brauchen sie am Handy 10 bis 40 s. Nach rund 400 Stufen wiederholen sich die Zip-Bretter.
  Dafuer braucht `hustleRef` den Vorrat synchron: die Seeds des Vorrats wandern als kleine
  Konstante in den Core (`ZIP_POOL`), das Board-Skript schreibt sie mit.
- `PuzzleRef` bekommt `hustle?: number`. `refId` liefert `hustle:<n>`, `encodeRef` setzt `h=<n>`,
  `decodeRef` baut aus `h` den Ref ueber `hustleRef` (Seed und Typ im Link werden ignoriert, wie
  bei Perioden).

## Fortschritt und Level

- Eine geloeste Stufe landet wie jedes Raetsel in `ph:solves` unter `hustle:<n>`. Kein eigener
  Speicher; Backup und Wiederherstellung gelten damit automatisch.
- `hustleLevel(solves)`: die kleinste Stufe n >= 1, fuer die `hustle:n` fehlt. Wer Stufe 1 bis 46
  geloest hat, steht auf Level 47 und spielt als naechstes 47.
- Es zaehlen nur Loesungen ab `ACHIEVEMENTS_EPOCH`, wie bei Achievements und Coins. Zum
  Produktionsrelease beginnen Tester also wieder bei 1; das gehoert in die Release-Notes.
- Hustle-Loesungen zaehlen fuer die allgemeinen Achievements (etwa `solved-50`, `solved-1000`,
  Tempo und Tageszeit), nicht fuer Daily-Serien, Clean Sweep oder Perfect Days.
- Ein halb gespieltes Brett bleibt gespeichert wie bei Levels (`writeProgress`).
- Nur die jeweils naechste Stufe ist spielbar. Ein Link auf eine hoehere Stufe oeffnet die aktuelle.

## Belohnungen

Meilenstein ist jede Stufe n mit n % 10 === 0, belohnt beim Loesen von Stufe n.

- Coins an jedem Meilenstein: `min(100, 20 + 5 * n / 10)`, also 25 bei 10, 45 bei 50, 70 bei 100,
  100 ab 160. Ueber `coinsForSolve` fuer `hustle:<n>`, damit sie wie alle Coins aus den Loesungen
  abgeleitet bleiben. Hustle-Loesungen geben sonst keine Coins.
- Flairs (neue Art der Anforderung `{ hustle: n }` in `FlairRequirement`):

  | Stufe | id | Titel |
  |---|---|---|
  | 40 | `hustle-starter` | Hustle Starter |
  | 120 | `hustle-addict` | Hustle Addict |
  | 300 | `hustle-grinder` | Hustle Grinder |
  | 500 | `hustle-pro` | Hustle Pro |
  | 1000 | `hustle-legend` | Hustle Legend |

- Badges (Badge bekommt optional `requires: { hustle: n }` statt eines Preises, nicht kaufbar):

  | Stufe | id | Motiv |
  |---|---|---|
  | 50 | `hustle-mountain` | Berg |
  | 100 | `hustle-ladder` | Leiter |
  | 200 | `hustle-arrow` | Flammenpfeil |
  | 400 | `hustle-crown` | Krone |
  | 750 | `hustle-summit` | Gipfelfahne |

  Icons als SVG mit Bewegung wie die bestehenden 32 in `BadgeIcon.tsx`.
- Besitz: `owned()` nimmt die Hustle-Belohnungen aus `hustleLevel` dazu, wie heute die Flairs aus
  den Loesungen. Nichts davon landet in `ph:coins:spent`.
- Beim Erreichen oeffnet die vorhandene Unlock-Karte (`announceUnlock`) mit Coins, Badge oder Flair.
- Customize: Hustle-Badges und -Flairs stehen in ihren Abschnitten mit "Hustle 50" statt Preis bzw.
  Fortschritt; gesperrt zeigt ein Tipp, welche Stufe fehlt.

## Tab "Hustle" (apps/web, neu `pages/Hustle.tsx`)

- Tab zwischen Daily und Puzzles, Pfad `/hustle`, eigenes Icon. Die Leiste hat dann fuenf Tabs;
  die Breite auf 360 px ist zu pruefen.
- Aufbau wie Mockup B:
  - Karte mit "Your Hustle level", grosser Zahl, Chip "<Schwierigkeit> · <k> to <naechste>"
    (bei Genius nur "Genius"), Balken in zehn Segmenten bis zum naechsten Meilenstein mit dessen
    Symbol, darunter "<k> more to Lv <m> · <Belohnung>".
  - Karte "Next: <Typ>" mit Typ-Icon, "Level <n> · <Schwierigkeit>" und Knopf "Play".
  - "Next milestones": die naechsten fuenf Meilensteine als Knoten, Badges und Flairs hervorgehoben.
- Nach dem Loesen einer Hustle-Stufe zeigt die Ergebniskarte "Next ›" auf die naechste Stufe.
- Titelzeile im Raetsel: "<Typ> · Hustle <n>".

## Player Card und Server (apps/api)

- Migration `0005_hustle.sql`: `ALTER TABLE players ADD COLUMN hustle INTEGER NOT NULL DEFAULT 0;`
  (0 = nie gespielt, sonst hoechste geloeste Stufe).
- Route `PUT /me/hustle` mit `{ level }`: nimmt nur ganze Zahlen von 0 bis 100000 an und speichert
  `max(alt, neu)`, damit ein veraltetes Geraet den Wert nicht senkt. Gleiche Vertrauensstufe wie
  Badge und Flair: der Wert kommt vom Geraet.
- Bestenlisten liefern `hustle` pro Zeile mit (`board.ts`), `NameCell` zeigt ab 1 den Chip
  "Lv <hustle>" hinter Name und Badge; 0 zeigt nichts.
- Die App meldet das Level nach jeder geloesten Hustle-Stufe, wenn angemeldet, ueber die vorhandene
  Warteschlange (`queue.ts`), also auch offline gesammelt und spaeter gesendet.
- Profil zeigt das Hustle-Level bei den Statistiken.
- Datenschutz: das Level ist eine Spielstatistik wie die Zeiten; Datenschutzseite und
  Datensicherheit bei Play in einem Satz ergaenzen.

## Laden

- Hustle-Bretter entstehen im Board-Worker (`loadBoard`), Zip hard und genius kommen aus dem Pack.
- Waehrend Stufe n offen ist, baut der Worker Stufe n+1 vor und haelt sie im Speicher, damit
  "Next ›" sofort oeffnet.

## Tests

- Core: `hustleRef` deterministisch, Schwierigkeitsgrenzen bei 40/41, 120/121, 300/301, jede Runde
  enthaelt alle zehn Typen, nie zweimal derselbe Typ hintereinander ueber die ersten 1000 Stufen;
  Zip hard und genius zeigen auf Vorrats-Seeds.
- Core: `hustleLevel` mit Luecken, vor und nach der Epoche; Meilenstein-Coins und Belohnungen an
  den richtigen Stufen; `refId`/`encodeRef`/`decodeRef` fuer Hustle.
- Web: Tab zeigt Level, Balken und naechstes Raetsel aus gegebenen Loesungen; "Next ›" nach dem
  Loesen; Chip in `NameCell` nur ab 1.
- API: Migration, `PUT /me/hustle` (Grenzen, nur steigend), Bestenliste liefert `hustle`.
- Einmalig, nicht in CI: die ersten 1000 Stufen lassen sich alle erzeugen, mit Zeitmessung.

## Offene Punkte fuer den Plan

- Motive und Bewegung der fuenf Badges im Detail.
- Tab-Icon fuer Hustle.
