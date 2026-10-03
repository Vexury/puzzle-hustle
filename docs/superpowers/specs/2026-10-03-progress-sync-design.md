# Fortschritts-Sync zwischen Web und Apps

Stand: 2026-10-03, mit Moritz abgestimmt (Umfang, Reset-Regel und Ansatz freigegeben). Anlass:
dasselbe Google-Konto im Web und auf dem S23 zeigt Hustle Lv 4 gegen Lv 49, andere Flairs,
Nameplates und Solved-Stats, waehrend die Bestenliste beide Zeilen als die eigene erkennt.

## Ziel

Wer sich auf Web, Android und iOS mit demselben Konto anmeldet, sieht ueberall denselben Stand:
Stats, Serien, Hustle-Level, Coins, Besitz, Flairs, Achievements und Ausruestung. Echtzeit ist
nicht noetig; der Stand zieht beim naechsten Sync nach.

Unveraendert: ohne Login ist die App wie heute, alles ausser Anzeigen und Kauf laeuft ohne Netz,
Spielen wartet nie auf den Sync, ein Fehler oder Offline bleibt still.

Nicht im Umfang: angefangene Bretter (`ph:progress:*`), Ansichten, Einstellungen, Hell/Dunkel
(`theme`), Name (liegt schon auf dem Server), die Bestenlisten-Warteschlange (`ph:queue`).
Grund: echter Brett-Sync braucht eine Konfliktregel fuer dasselbe halb geloeste Brett auf zwei
Geraeten und zahlt sich fuer dieses Publikum nicht aus (siehe Backlog).

## Befund

Fast alles Sichtbare ist schon heute aus `ph:solves` abgeleitet: verdiente Coins, Achievements,
Flairs, Hustle-Level, Stats und Serien. Dazu kommen drei kleine Speicher: das Ausgabenlog
`ph:coins:spent` (Kontostand und Besitz), `ph:coins:doubled` und die Ausruestung `ph:cosmetics`
(`{ badges, flair, theme, nameplate }`, `theme` ist das Theme-Paket). Wer diese vier Speicher
synct, synct das ganze Profil.

## Ansatz

Der Server fuehrt zusammen. Der Client schickt seinen Snapshot an `POST /sync`, der Worker fuehrt
ihn mit dem gespeicherten Stand ueber `mergeSave` aus `packages/core` zusammen, speichert und gibt
das Ergebnis zurueck. Eine Runde, die Zusammenfuehrung ist kommutativ und idempotent, also egal in
welcher Reihenfolge und wie oft; dieselbe getestete Funktion laeuft auf Server und Client.

Verworfen:
- Server als reiner Speicher, Client fuehrt zusammen (GET, mergen, PUT mit Version, Retry):
  Retry-Schleife im Client, die Reset-Regel muesste der Client durchsetzen.
- Normalisierte Tabellen mit Delta-Sync per Cursor: deutlich mehr Code und Migrationen, fuer
  einige 10 KB je Spieler ueberdimensioniert.
- Saved Games aus Play Games Services (Entscheidung vom 2026-09-20): Android-only, der eigene
  Server deckt Web, Android und iOS mit einem Mechanismus ab.

## Snapshot und Merge (`packages/core/src/save.ts`)

```ts
interface SaveData {
  solves: Record<string, SolveRecord>;
  spent: SpendEntry[];
  doubled: string[];
  equipped: Equipped & { at: number };
  resetAt: number;
}
```

`SolveRecord` (heute `apps/web/src/lib/storage.ts`) wandert in die Core. Fuer die Ausruestung
definiert die Core die gespeicherte Form `SavedEquipment` (`{ badges, flair, theme, nameplate, at }`,
liest auch das alte `{ badge }`); `Equipped` in `apps/web` bleibt die abgeleitete Form mit `badge`. `parseSaveData(unknown)` prueft Form, Id-Laenge (hoechstens 64), Obergrenzen (20 000
Loesungen, 5 000 Ausgaben) und verwirft ungueltige Eintraege einzeln, wie `isSpendEntry` heute.

`mergeSave(a, b)`:
- **Reset zuerst:** `R = max(a.resetAt, b.resetAt)`. Die Seite mit dem aelteren `resetAt`
  verliert alle Loesungen mit `solvedAt < R` und alle Ausgaben mit `at < R`. Die Seite, die den
  Reset ausgeloest hat, wird nicht gefiltert; so ueberleben ihre behaltenen Loesungen der
  laufenden Periode wie heute bei `resetProgress`.
- **Loesungen je Id:**
  - Daily, Weekly, Monthly: der Eintrag mit dem frueheren `solvedAt` gewinnt ganz; das ist der
    Lauf, der in der Bestenliste steht.
  - Alles andere: ein Eintrag, der zaehlt, vor einem, der nicht zaehlt (Hustle vor
    `ACHIEVEMENTS_EPOCH`, wie `counted`); danach der bessere nach (weniger Hints, weniger
    Sekunden, weniger Zuege), mit dem frueheren `solvedAt` beider Eintraege.
  - Abweichung von `recordSolve`: lokal gilt bei schneller, aber mit mehr Hints "wer zuerst
    kommt". Der Merge braucht eine feste Reihenfolge, und Hints zuerst schuetzt hintfreie
    Achievements.
- **Ausgaben:** Vereinigung. Item-Kaeufe einmal je Item, der frueheste bleibt (kaufen zwei
  Geraete offline dasselbe Item, zahlt der Spieler einmal). Hint-Kaeufe je `(puzzle, at)`.
- **Verdopplungen:** Vereinigung, ohne Ids, deren Loesung nach dem Merge fehlt.
- **Ausruestung:** das hoehere `at` gewinnt, bei Gleichstand der lexikografisch groessere
  JSON-Wert (damit der Merge kommutativ bleibt). Ausgeruestet zaehlt wie heute nur, was man
  besitzt; das prueft weiter der Client.
- `resetAt` des Ergebnisses ist `R`.

## Server (`apps/api`)

- Migration `0007_saves.sql`: `saves(player_id TEXT PRIMARY KEY REFERENCES players(id), data TEXT
  NOT NULL, updated_at INTEGER NOT NULL)`.
- `POST /sync` (angemeldet): Body hoechstens 1 MB, sonst 413; `parseSaveData`, bei unbrauchbarem
  Body 400. Dann gespeicherten Stand lesen (fehlt er: leerer Save), `mergeSave`, schreiben mit
  Bedingung `updated_at` unveraendert; hat ein anderes Geraet dazwischen geschrieben, einmal neu
  lesen und mergen (kostet dank kommutativem Merge nichts); scheitert auch das, 409, und der
  Client versucht es beim naechsten Ausloeser. Antwort: der zusammengefuehrte Save.
- `/sync` setzt `players.hustle` exakt aus dem zusammengefuehrten Stand (`hustleSolved` aus
  `packages/core/src/hustleProgress.ts`), ohne
  `MAX`. Damit senkt ein Konto-Reset auch den Chip in der Bestenliste, und der Epochenwechsel zum
  Release korrigiert sich beim naechsten Sync selbst (Falle in `docs/pitfalls.md`).
  `POST /hustle` bleibt fuer alte App-Versionen.
- `DELETE /account` loescht die `saves`-Zeile mit.

## Client (`apps/web/src/lib/sync.ts`)

- `readLocalSave()` sammelt den Snapshot aus den vier Speichern plus `ph:sync:resetAt`.
- `applySave(save)` schreibt die vier Speicher zurueck, ruft `rehydrate()`, meldet dem Coin-Store
  die Aenderung und schreibt `ph:sync:resetAt` und `ph:sync:player`.
- Die Antwort wird als `mergeSave(antwort, readLocalSave())` angewendet, nicht blind uebernommen:
  was waehrend der Anfrage geloest oder gekauft wurde, bleibt.
- Ausruestung bekommt einen Zeitstempel in `ph:cosmetics` (`at`), gesetzt von `equip` und
  `toggleShowcase`. Ein alter Eintrag ohne `at` zaehlt als 0.
- Kontowechsel: passt `ph:sync:player` nicht zur Sitzung, schickt der Client einen leeren Save
  (nur `resetAt` 0) und ersetzt den lokalen Stand durch die Antwort, statt fremden Fortschritt
  ins neue Konto zu mischen. Fehlt der Schluessel (Geraet hat nie gesynct), wird zusammengefuehrt.
- Ankuendigungen: vor dem Anwenden laufen `syncAchievements`, `syncFlairs` und
  `syncHustleRewards` normal, damit eigene Freischaltungen ihre Karte bekommen. Danach markiert
  eine stille Variante alles neu Abgeleitete als gesehen; Unlocks vom anderen Geraet erzeugen
  keine Kartenflut.
- Danach wie bisher `pushCosmetics()` und `pushHustle()`.

### Ausloeser

- Nach dem Anmelden, vor `pushCosmetics()`/`pushHustle()`.
- Beim Start und beim Fortsetzen mit Sitzung.
- 5 s entprellt nach jedem Schreiben in einen der vier Speicher.
- Beim Wechsel in den Hintergrund mit `keepalive`, solange der Body unter 64 KB bleibt (Grenze
  von `keepalive`); darueber ein normaler Fetch, der abgebrochen werden darf, der naechste Start
  holt es nach.
- Immer nur eine Anfrage gleichzeitig; ein Ausloeser waehrenddessen merkt sich "nochmal".
- Offline oder Fehler: nichts, keine Meldung.

## Reset

- Angemeldet setzt "Reset progress" zusaetzlich `ph:sync:resetAt = Date.now()` und synct sofort.
  Offline geht der Zeitstempel mit dem naechsten Sync. Der Dialog sagt dann "on all devices".
- Empfaengt ein Geraet ein neueres `resetAt`, raeumt es auch seine nicht gesyncten Teile ab wie
  `resetProgress`: angefangene Bretter (ausser denen behaltener Loesungen), `ph:achievements`,
  `ph:flairs`, `ph:howto:*`, `ph:difficulty:*`. Die Hustle-Ankuendigungslisten raeumt
  `pendingAnnouncements` von selbst auf, weil es nicht mehr Aktuelles aus der Liste wirft; wieder
  Verdientes bekommt so seine Karte.
- Abgemeldet bleibt Reset lokal und setzt kein `resetAt`; nach dem Anmelden kommt der Serverstand
  zurueck. Ein Reset ohne Anmeldung loescht nie ein Konto.
- Bestenlistenzeiten (`scores`) bleiben unberuehrt, wie heute.

## Kanten

- Epochenwechsel zum Release: alte Loesungen bleiben im Save und zaehlen wie heute nicht.
- Alte App-Versionen ohne Sync laufen unveraendert; ihr Stand fliesst nach dem Update ein.
- Native Backup: `ph:sync:*` wird erst nach `restoreBackup()` geschrieben, die Falle aus
  `pitfalls.md` (erster Start legt Schluessel an und sperrt das Backup) greift nicht. Die
  Schluessel kommen wie alle `ph:*` ins Backup.
- Manipulation: ein gefaelschter Snapshot kauft Kosmetik und Achievements, keinen Rang; die
  Bestenliste bleibt getrennt. Das Hustle-Level war ueber `/hustle` schon heute faelschbar.
- Abmelden laesst den lokalen Stand stehen. `DELETE /account` loescht die Serverkopie, nicht den
  lokalen Stand.

## Tests

- core: `mergeSave` je Regel, Kommutativitaet und Idempotenz ueber Fixtures, Reset-Filter auf
  beiden Seiten, Ausruestung bei Gleichstand; `parseSaveData` lehnt Muell und Uebergroessen ab.
- api: `/sync` nach dem Muster der bestehenden Routentests: erster Sync, Merge, Reset, Retry bei
  geaendertem `updated_at`, `players.hustle` exakt, Konto-Loeschung entfernt `saves`.
- web: `sync.ts` mit gemocktem `apiFetch`: Kontowechsel ersetzt, Loesung waehrend der Anfrage
  bleibt, fremde Unlocks still, empfangener Reset raeumt ab, Single-Flight.
- Von Hand: Web und S23 mit demselben Konto, nach Sync identisches Profil (Level, Stats, Coins,
  Nameplate); Reset auf einem Geraet, das andere folgt.

## Datenschutz und Stores

- Neu auf dem Server bei Angemeldeten: geloeste Raetsel mit Zeit, Hints, Zuegen und Zeitpunkt,
  Coin-Ausgaben, Ausruestung. Zweck Sync, geloescht mit dem Konto.
- Anzupassen: Datenschutzerklaerung, `store/listing.md` (Data Safety: App activity / game
  progress, mit dem Konto verknuepft, nicht geteilt), App Privacy in App Store Connect von Hand.
  Vor dem Commit prueft der Agent `puzzle-hustle-store-review`.
- Die Texte muessen zum ausgelieferten Build passen: zusammen mit dem offenen Telemetrie-Punkt vor
  dem Production-Antrag anfassen, aber Sync erst nennen, wenn er im Build ist.
