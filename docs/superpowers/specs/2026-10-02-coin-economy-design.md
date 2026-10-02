# Coin-Oekonomie: Double Coins und Katalog nach oben

Stand: 2026-10-02, mit Moritz abgestimmt (Ansatz freigegeben). Grundlage: Simulation
`packages/core/scripts/economy-sim.ts` gegen die Telemetrie (Report 14 Tage) und die
Bestenlisten-Tabelle `scores` (15 angemeldete Spieler, 2026-09-21 bis 2026-10-02).

## Befund

- 9 von 15 angemeldeten Testern loesen 7,5 bis 8,7 der 9 Dailys am Tag. Ein solcher Sweeper
  verdient rund 157 Coins am Tag und hat alle Themes nach gut 3 Wochen, den ganzen Shop
  (15 300 Coins) nach rund 94 Tagen; danach liegen ueber 40 000 Coins im Jahr brach.
- Hints werden selten gebraucht: seit dem Hint-Modell vom 2026-09-29 haben 1,9 % der Dailys einen
  Hint, typisch 0 bis 0,8 Hints am Tag je Spieler. Der freie Hint deckt zwei Drittel, Coins den
  Rest; Hints kosten 1 bis 5 % des Einkommens. Das Video wird praktisch nie gebraucht, der Kauf
  "No Ads · Free Hints" kaum.
- Folge: Hints tragen weder als Coin-Senke noch als Werbeflaeche. Ein hoeherer Hint-Preis traefe
  vor allem Spieler mit vielen Hints und aendert am Ueberschuss wenig.

## Entscheidungen

- **Double Coins (Rewarded):** Auf der Ergebniskarte eines Daily, Weekly oder Monthly ein Knopf
  "Double coins", der nach einem Video die Coins dieser Loesung verdoppelt (alles, was die Loesung
  brachte: Grundbetrag, ohne-Hint-Bonus, Clean Sweep). Einmal je Raetsel. Der Knopf erscheint nur
  in den Apps, nur solange die Periode des Raetsels laeuft (keine Nachholjagd ueber alte Dailys)
  und nur fuer die erste Loesung. Grund: Coins verdient jeder taeglich, sie haben ein Ziel, und der
  Knopf ist das ausdrueckliche Ja, das Googles Richtlinie vor einer Rewarded-Anzeige verlangt.
  Levels, Random und Hustle bleiben aussen vor (kleine Betraege bzw. Hustle soll sich nicht
  abkuerzen lassen).
- **Kein Video, keine Verdopplung:** Anders als beim Hint gibt es die Belohnung nicht, wenn sich
  keine Anzeige ausliefern laesst; der Knopf bleibt dann stehen, ein Toast sagt "No video right
  now". Grund: es ist ein Bonus, kein Weiterkommen; das Offline-Versprechen (der Spieler gewinnt,
  wo das Netz fehlt) gilt fuer alles, was zum Spielen noetig ist. Sonst waere der Flugmodus ein
  Dauer-Verdoppler. Ein Video, das nach 120 s weder Reward noch Ende meldet, zaehlt wie beim
  Hint als bezahlt.
- **Der Kauf verdoppelt automatisch:** mit "No Ads · Free Hints" wird jede neue Periodenloesung
  sofort verdoppelt, ohne Knopf. Sonst verloere ein Kaeufer durch den Kauf etwas. Rueckwirkend
  nichts: der Kauf ist kein Coin-Paket. Name und Produkt-ID bleiben, der Store-Text nennt
  "double coins" mit.
- **Speicherung:** `ph:coins:doubled`, Liste der verdoppelten Loesungs-Ids, abgeleitet wie der Rest:
  `coinsEarned(solves, epoch, doubled)` zaehlt die Awards dieser Ids doppelt, nur fuer
  Periodenloesungen. Der Reset des Fortschritts loescht die Liste mit, das Backup nimmt sie wie
  jeden `ph:`-Schluessel mit. Kein Server.
- **Hint-Karte:** Preis bleibt 20. Ist der freie Hint verbraucht und Video moeglich, steht das
  Video oben, Coins darunter.
- **Interstitials:** weiter nicht. Folgetag-Rueckkehr liegt bei 11 %; nach einigen Wochen
  Production-Daten neu bewerten, dann nur Hustle/Levels/Random mit Frequenzgrenze.

## Katalog nach oben (Vorschlag, Grafik offen)

Mit Verdopplung (Annahme: die Haelfte der Angebote wird angenommen) verdient ein Sweeper rund
230 Coins am Tag, ein Kaeufer rund 300. Der heutige Shop waere nach gut zwei Monaten leer. Ziel:
ein Sweeper braucht 6 Monate oder mehr fuer alles, also rund 25 000 bis 30 000 Coins zusaetzlich.
Vorschlag, je Stueck mit Vorschau zur Abnahme wie bei den Paketen:

- Saisonale Theme-Pakete, nur im Zeitfenster kaufbar (etwa 6 Wochen), danach nie wieder:
  vier im Jahr zu je 1 500. Erneuern das Ziel von selbst.
- Animierte Nameplates (eigene Seltenheit "Prestige"): fuenf zu je 2 000.
- Farbvarianten der sechs Kauf-Themes: je 1 000.
- Animierte Badges: vier zu je 1 500.

Reihenfolge: Double Coins und Kauf-Bonus jetzt; der Katalog muss stehen, bevor `THEMES_FREE`
faellt und die Epoche auf den Launch springt, damit die Oekonomie mit beidem startet.

## Nicht im Umfang

Aenderungen an Verdienstraten, Level- und Hustle-Belohnungen, Hint-Preis.
