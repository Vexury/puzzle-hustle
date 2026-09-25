# Tester-Feedback

Quelle ist die WhatsApp-Gruppe "Puzzle Hustle" (seit 18.09.2026) und die Einzelchats mit den Testern.
Neue Punkte kommen unter "Offen", erledigte wandern mit Datum nach "Erledigt". Ein Punkt gehoert
in denselben Commit wie sein Fix.

Stand: 2026-09-25

## Offen

- [ ] **Jonas** Zwei Sprachnachrichten vom 22.09. (11:53 und 15:15) sind noch nicht ausgewertet.
- [ ] **Robert** Streak auf ein Raetsel pro Tag statt drei. Offen bis es Nutzungsdaten gibt, wie
  lange Spieler fuer die Dailys brauchen (Robert: 3 bis 5 min fuer alle drei).
- [ ] **Robert** Daraus folgend: Usage-Daten in der App erheben, sonst bleibt die Streak-Laenge
  Bauchgefuehl.
- [ ] **Michi** Anzeigename direkt beim Erststart setzen. Die drei Intro-Karten gibt es seit dem
  21.09., ein Namensfeld hat `apps/web/src/components/Intro.tsx` nicht.
- [ ] **Michi** Gefuehrtes Tutorial oder Video je Raetseltyp. Die acht Textanleitungen hinter dem
  Fragezeichen reichen ihm nicht.
- [ ] **Michi** Teilen als Grafik statt Textlink (Anzeigename, Zeit, kleines Brett).
- [ ] **Michi** Anreiz, jeden Typ ein paar Mal zu spielen, bevor die App auf die Dailys schiebt.
- [ ] **iOS-Tester, Dani** Manchmal ist alles um die obere Safe Area nach unten verschoben und der
  untere Bereich eines Raetsels nimmt keine Eingaben an; langes Druecken markiert Texte wie die
  Schwierigkeit oder "How to play". Fix seit 25.09. (`contentInset: 'never'`, `user-select: none`),
  am iPhone mit dem naechsten TestFlight-Build pruefen.
- [ ] **Frieder** Rueckmeldung zur Shapes-Startanordnung auf Genius steht noch aus. Easy bis Hard
  hat er am 20.09. als "perfekt" gegengetestet.

## Erledigt

- [x] 2026-09-25 **Dani, Vlad** Im Dialog "One more hint?" passten die drei Buttons bei genug Coins
  nicht auf schmale Bildschirme und zogen die Karte ueber den Rand. Sie stehen jetzt untereinander.
- [x] 2026-09-25 **Dani** Fehlendes Wort in einem Satz (Screenshot vom 21.09., 15:59) ist behoben.

- [x] 2026-09-23 **Jonas** Mosaik-Frage vom 20.09.: kein Fehler im Zaehler. Eine Zahl gilt erst als
  erfuellt, wenn jedes Feld ihres Blocks entschieden ist, also gefuellt oder mit X; bei der 8 fehlte das
  X auf dem neunten Feld. Dazu neu seit versionCode 12: eine Zahl, die nicht mehr aufgehen kann, wird
  rot, im Nonogramm ebenso die Hinweise einer Zeile. Antwort in der Gruppe mit der Release-Nachricht.
- [x] 2026-09-23 **Michi** Offline-Frage vom 21.09.: ja. Raetsel entstehen lokal, nur die
  Bestenliste braucht Netz, Zeiten warten in einer Warteschlange und gehen nach. Antwort in der Gruppe
  mit der Release-Nachricht.
- [x] 2026-09-22 **Dani** Das Achievement-Unlock-Banner passte optisch nicht. Es waechst jetzt
  wirklich vom Kreis zur Pille statt aufzuspringen, nimmt die Breite, die der Titel braucht, und
  traegt nur noch den Titel, groesser, ohne "Achievement unlocked" davor. Bleibt der Stil selbst
  ein Thema, kommt es als neuer Punkt zurueck.
- [x] 2026-09-22 Killer Easy ist deutlich leichter geworden, weil der Killer jetzt den Daily
  traegt und der in der Rueckmeldung als zu schwer ankam. 24 Givens statt 10: der Score faellt
  von 134 bis 224 auf 65 bis 120, die naechsten vierzehn Dailys von im Mittel 178 auf 97. Genius
  bleibt, wo er war (279 bis 624), die Spanne wird also groesser statt verschoben.
- [x] 2026-09-22 **Pia** Schalter im Profil fuer das Leuchten der gleichen Zahlen im Sudoku,
  "Highlight matching numbers", Standard an, gespeichert als `ph:sudokuHighlight`. Aus heisst:
  das Antippen in der Leiste setzt nur noch die Zahl, Notizen leuchten nicht, und eine neunmal
  gelegte Ziffer ist wieder ausgegraut. Dass eine ausgewaehlte Zelle ihre Zwillinge markiert,
  bleibt in beiden Stellungen.
- [x] 2026-09-22 **Michi** Slide beim Wechsel in den Play-Screen. Ein Raetsel ist eine Ebene
  tiefer, nicht ein Schritt zur Seite: es kommt von rechts herein, beim Zurueck schiebt sich die
  Liste von links wieder ins Bild. Die Tab-Wechsel behalten ihre eigene Richtung.
- [x] 2026-09-22 **Michi** Die Perfect-Serie zwang dazu, auch die Typen zu spielen, die einem
  keinen Spass machen. Die Kette ist raus: `perfect-week` faellt weg, gezaehlt werden stattdessen
  perfekte Tage (`perfect-10` und `perfect-50`, im Profil "N perfect days"). Ein ausgelassener
  Tag kostet nichts mehr, er zaehlt nur nicht mit. Belohnt wird der Tag selbst: bei 7/7 wird der
  Daily-Balken zur Flammenfarbe und sagt "clean sweep". `perfect-day` bleibt.
- [x] 2026-09-22 **Pia** Normale Level zaehlten nur die erste Zeit. Eine Wiederholung ersetzt den
  Eintrag jetzt, wenn sie schneller war; das Datum des ersten Loesens bleibt stehen, damit ein
  spaeter wiederholtes Level nicht in die Achievements-Epoche rutscht. Dailys, Weekly und Monthly
  behalten ihren ersten Lauf, das ist die Zeit, die in der Bestenliste steht. Ein wieder
  geoeffnetes Level startet darum einen frischen Lauf mit laufender Uhr und zeigt nach dem Loesen,
  ob es eine neue Bestzeit war.
- [x] 2026-09-22 **Jonas, Pia** Eine Zahl in der Sudoku-Leiste antippen leuchtet jetzt alle
  gleichen Zahlen auf dem Brett an, Notizen eingeschlossen, ohne sie zu setzen. Ist eine Zelle
  ausgewaehlt, setzt derselbe Tipp die Zahl wie bisher und leuchtet zusaetzlich. Eine Ziffer, die
  neunmal liegt, bleibt tippbar und leuchtet nur noch.
- [x] 2026-09-22 **Jonas** Notiz-Ziffern und gesetzte Ziffern sahen zu aehnlich aus. Notizen haben
  jetzt eine eigene, blassere Farbe und ein leichteres Gewicht.
- [x] 2026-09-22 **Dani** Das Ende der Progressbar sah falsch aus. Ursache war der Zaehler: eine
  vor der Umstellung geloeste Killer-Daily zaehlte weiter mit, die Fuellung lief bei 8/7 ueber das
  abgerundete Ende hinaus. Der Zaehler nimmt nur noch die Typen, die einen Daily haben, und die
  Fuellung ist bei 100 Prozent gedeckelt.
- [x] 2026-09-22 **Pia** Die Hint-Markierung war zu kurz und zu leise. Sie haelt jetzt 3 statt
  1,8 Sekunden, pulst viermal, faerbt die Zelle zusaetzlich zum gruenen Rahmen ein und gilt so in
  allen acht Typen.
- [x] 2026-09-22 **Michi** Shapes war im Daily zu leicht. Daily-Shapes steht jetzt auf Hard.
- [x] 2026-09-22 **Pia** Shapes Easy 34, 35 und 36 verlangten dieselben Formen in derselben Anzahl.
  Easy hat jetzt vier Teile statt drei, damit 4604 statt 202 moegliche Raetsel (SHAPES_VERSION 3).
- [x] 2026-09-22 Killer Sudoku ist aus den Dailys raus und wird ein Schwierigkeitsgrad von Sudoku.
  Idee von Moritz und Daniela, von Robert bestaetigt. Am selben Abend umgedreht (Entscheidung
  Moritz): Killer traegt den Daily auf Easy, plain Sudoku sitzt aus. Beide bleiben unter Puzzles
  und in der Weekly- und Monthly-Rotation, es bleiben sieben Dailys.
- [x] 2026-09-21 **Michi** Timer startete erst beim ersten Zug, damit war Loesung merken und dann
  auf Geschwindigkeit eingeben der schnellste Weg. Laeuft jetzt ab dem Oeffnen des Raetsels.
- [x] 2026-09-21 **Michi** Timer lief weiter, wenn man die Benachrichtigungsleiste aufzog. Eigenes
  `appBlur`/`appFocus`-Signal aus `MainActivity`, weil System-Overlays die Activity nicht stoppen.
- [x] 2026-09-21 **Michi** Wischgeste konnte mitten im Raetsel die App verlassen. Die Zurueck-Geste
  fragt jetzt nach.
- [x] 2026-09-21 **Michi** "Could not share" erschien auch beim Abbrechen des Teilens, und der Link
  stand doppelt in der Nachricht.
- [x] 2026-09-21 **Michi** Kein Logo beim Start. Splash-Logo haelt jetzt kurz.
- [x] 2026-09-21 **Michi** Keine Animationen. Reiterwechsel schiebt die Seite, der Themewechsel
  waechst als Kreis aus dem gedrueckten Knopf.
- [x] 2026-09-21 **Michi** Farbschema. Sechs Akzentfarben im Profil, Teal ist dabei.
- [x] 2026-09-21 **Michi** Killer-Kaefige: gestrichelte Linien und kleine Zahlen schlecht lesbar,
  vor allem wenn ein Kaefig ueber die 3x3-Grenze geht. Kaefig ist jetzt eine durchgehende Linie in
  eigener Farbe, die 3x3-Bloecke haben eine eigene Linienfarbe, dazu der Hinweis, dass die
  Kaefigfarben keine Bedeutung tragen.
- [x] 2026-09-21 **Michi** Geloester Zustand sprang optisch auf halbfertig zurueck.
- [x] 2026-09-21 **Michi** Erststart ohne Einfuehrung. Drei Intro-Karten beim ersten Oeffnen.
  Das Namensfeld daraus fehlt noch, siehe Offen.
- [x] 2026-09-21 **Pia** Rueckfrage vor dem Reset, damit das Brett nicht versehentlich wegfliegt.
- [x] 2026-09-20 **Dani** Killer-Kaefiglinien auf iOS, am iPhone gegengetestet.
- [x] 2026-09-20 Aus der Gruppe, vor dem Umzug in diese Datei: Mosaik-Ausgrauen und X-Groesse,
  Levels-Slide beim Stufenwechsel, Shapes-Puls synchron, Daily-Balken, Brett-Rahmen.
- [x] 2026-09-19 **Dani** Long-Press bei Mosaik zu traege. 300 statt 450 ms, gilt auch fuer
  Nonogramm, Crowns und Stars.
- [x] 2026-09-19 **Frieder** Bei Shapes verdeckten die Startteile das Zielmuster. Sie liegen jetzt
  moeglichst daneben: Ring zuerst, sonst der Platz mit den wenigsten verdeckten Zielatomen.
- [x] 2026-09-18 **Pia** Killer-Notizen lagen auf der Kaefigsumme und waren nicht davon zu
  unterscheiden. Notizen rutschen in solchen Zellen unter die Summe.

## Laeuft

- **Michi** Daily-Leaderboard. Gebaut als Gruppen-Bestenliste (Code statt globaler Liste), im Web
  vollstaendig, nativ offen. Siehe den Punkt "Bestenliste in Betrieb nehmen" im Hub-Wiki.

## Verworfen

- **Robert** Stars und Crowns zu einem Typ zusammenlegen, analog zu Killer und Sudoku. Anderer
  Fall: die beiden teilen keine Regelbasis. Falls ein Typ weichen muss, faellt Stars, weil Crowns
  beliebter ist.
- 2026-09-19 Kleine Zielvorschau ueber dem Shapes-Brett. War einen Tag drin, die neue
  Startanordnung reicht und das Brett bleibt aufgeraeumt.
