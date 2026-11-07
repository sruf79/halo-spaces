Unbeaufsichtigte Wochenprüfung halo.spaces auf neon (gestartet von
tests/wochenpruefung.sh, sonntags 08:00). Niemand sieht zu, niemand antwortet
auf Rückfragen. AGENTS.md gilt vollständig; Abweichungen und Ergänzungen
stehen hier. Ziel: Wie gut liefen Tests, CI, Nachtläufe und Releases in den
letzten 7 Tagen, was lässt sich an Prüfungen und Abläufen verbessern –
und wirkten die Verbesserungen der Vorwochen?

## 1. Auswerten (letzte 7 Tage)

- **CI-Läufe** von test.yml auf main:
  gh run list -R sruf79/halo-spaces -w test.yml -b main -L 100 --json databaseId,headSha,status,conclusion,createdAt,updatedAt,event,displayTitle
  Je Lauf: gh run view <id> -R sruf79/halo-spaces --json jobs (Dauer je Job
  aus startedAt/completedAt), bei Rot --log-failed (Zeilen „FEHLER  <Prüfung>
  – …“; tests/ci-warten.sh <commit> 0 fasst beides zusammen).
  Kennzahlen: Anzahl Läufe, grün/rot/abgebrochen, mittlere und längste Dauer
  je Job, gescheiterte Prüfungen mit Häufigkeit und Job.
  **Unzuverlässig** heißt: dieselbe Prüfung ist im selben Job einmal rot und
  einmal grün, ohne dass sich dazwischen etwas am Paket oder an den Tests
  geändert hat (git diff --name-only <sha1> <sha2> zeigt nur *.md, store/,
  release.sh, publish.sh oder nichts, bzw. ein „Re-run“ desselben Commits).
- **Langsamste Prüfungen:** Jede Testausgabe endet mit „Dauer der Prüfungen:
  … am längsten:“ und den zehn langsamsten. Aus den Logs grüner Jobs lesen
  (gh run view <id> -R sruf79/halo-spaces --log --job <job-id> | grep -A12
  "Dauer der Prüfungen"), je Job die Prüfungen, die öfter vorne stehen.
- **Nachtläufe und Releases:** ~/halo-nacht/*.log (nur Dateien der letzten 7
  Tage, einschließlich des Nachtlaufs von heute früh – die Wochenprüfung
  startet erst, wenn er fertig ist), ~/halo-berichte/* (Nachtlauf-, Release- und Wochenberichte):
  erledigte Einträge, Limit-Pausen („Limit – Pause“), ausgelassene Nächte und
  Grund, Einträge zurück auf Todo, Release mit lokalen Tests oder über grüne
  CI („CI-Lauf … grün“ im Release-Bericht), Store-Upload-Fehler, Push-Fehler.
- **Übersprungene Läufe** (Entscheidung des Maintainers vom 6.11.2026, Sitzung global.design.comparison, Wortlaut: „ja, punkt 2 und 3 umsetzen.“): Zeilen „ÜBERSPRUNGEN <Routine> <Grund>“ der
  letzten 7 Tage aus ~/halo-nacht/uebersprungen.log (Routinen nachtlauf, rundgang,
  dokupruefung, github-kommunikation) je Routine zählen. Das sind Läufe, bei denen
  die Vorprüfung nichts zu tun fand – keine ausgelassenen Nächte (naechte_ausgelassen
  zählt nur „belegt“), keine zu früh beendeten und keine Fehler. Prüfen, ob die
  Vorprüfung zu streng war (z. B. am selben Tag ein offener machbarer Eintrag im
  Board, den der Nachtlauf hätte nehmen sollen) und im Bericht nennen.
- **Pausen:** `~/halo-nacht/pausen.txt` lesen: aktive Pausen (bis, Grund), Zeilen „PAUSE ABGELAUFEN“ der
  letzten 7 Tage aus ~/halo-nacht/uebersprungen.log zählen, ebenso „PAUSE UNLESBAR“ (Tippfehler: die Pause galt
  nicht, die Routine lief – Zeile in pausen.txt nennen), Pausen mit mehr als 7 Tagen Laufzeit melden.
  Dauerhafte Pausen ohne Ablauf melden (Dateien ~/halo-nacht/PAUSE, PAUSE-WOCHE, PAUSE-DOKU,
  PAUSE-NEUSTART, ~/halo-tour/PAUSE, wenn vorhanden): „dauerhaft, ohne Ablauf“ mit Alter der Datei.
- **Push-Fehler:** Zeilen „PUSH-FEHLER <Routine> <Grund>“ der letzten 7 Tage aus
  ~/halo-nacht/uebersprungen.log je Routine zählen (die iPhone-Meldung kam nicht an, z. B.
  falscher Sitzungsname). Jede ist ein Fehler im Ablauf: Grund im Bericht nennen, bei
  wiederholtem Grund die Ursache beheben (Name der Sitzung, `push()` in
  tests/lauf-hilfen.zsh).
- **Remote Control:** ~/Library/Logs/halo-remote-control.log (und .1 … .5,
  rotiert ab 10 MB): Startzeilen („Start: …“, je Neustart der Sitzung neon)
  und Fehlerzeilen der letzten 7 Tage zählen, ebenso für die Board-Sitzung
  neon-board in ~/Library/Logs/halo-neon-board.log (falls vorhanden); häufige Neustarts oder neue
  Fehlerarten im Bericht nennen.
- **Speicher von neon:** `sysctl vm.swapusage` (belegte und gesamte
  Auslagerung) und `memory_pressure` (freier Anteil) zum Zeitpunkt der
  Prüfung; über drei Viertel belegte Auslagerung im Bericht nennen (Vergleich
  zur Vorwoche).
- **Nachtlauf zu früh beendet?** (Wunsch des Maintainers vom 5.11.2026) Je
  Nacht aus ~/halo-nacht/<datum>.log Beginn („Start, Sitzung“) und Ende
  („Ende“) der Arbeit und Grund des Endes (Fertig-Datei, „08:00 erreicht“,
  dreimal ohne Fertig-Datei aufgehört, Limit) sowie aus dem Bericht, was
  unter „Übersprungen/offen“ steht. Zu früh heißt: Der Lauf hat früher als
  möglich aufgehört, neue Einträge anzufangen – vor 04:30, bzw. nach grüner
  CI und Release (Schritt 5 des Nachtlauf-Auftrags) vor 06:30 –, obwohl im Board
  noch machbare Einträge (Todo, kein „Wartet auf OK“, keine offene
  Entscheidung des Maintainers) lagen. Je solche Nacht: ungenutzte Zeit bis
  zur jeweiligen Grenze (04:30 bzw. 06:30) in Minuten, Zahl der liegengebliebenen machbaren Einträge und der
  erkennbare Grund (z. B. Plan zu klein gewählt, Einträge fälschlich als
  „braucht Entscheidung“ übersprungen, Abbruch nach Limit, Runde ohne
  Fortsetzung). War das in mindestens zwei Nächten der Woche so, die
  Ursache beheben wie in Abschnitt 3b (z. B. Auftrag in
  tests/nachtlauf-auftrag.md schärfen; Kennzahl naechte_zu_frueh bzw.
  ungenutzt_min) – bzw. als Vorschlag, wenn es eine Entscheidung des
  Maintainers berührt.
- **CI-Wächter:** ~/halo-aufgaben/ci-waechter.log – gemeldete rote Läufe.
- **Fehlerkonsole und Fehlerprotokoll** (Wunsch des Maintainers vom
  5.11.2026; AGENTS.md „Bauen und testen“, Bullet „Fehlerkonsole“): Kommen
  die Meldungen zuverlässig ins Board, ohne Verlust, Dubletten und
  Fehlalarme, und halten sie nichts auf? Aus echten Daten der Woche:
  - Zeilen „KONSOLE  “/„PROTOKOLL  “ in den CI-Logs (gh run view <id> --log
    | grep -aE 'KONSOLE  |PROTOKOLL  '): Anzahl verschiedener Meldungen,
    je Job; Hinweise „Fehlerkonsole schon beim Start voll“ und „ohne
    Mitschrift“;
  - Board-Einträge „Tests: Fehlerkonsole – …“/„Tests: Fehlerprotokoll – …“:
    neu, erledigt, offen; Dubletten (gleiche oder fast gleiche Meldung in
    zwei offenen Einträgen), Einträge ohne Zeile „Schlüssel:“, „Wieder
    aufgetreten“, auf Done gesetzt, obwohl die Meldung im Lauf danach noch
    kam;
  - ~/halo-aufgaben/ci-waechter.log: „nicht lesbar“, „übersprungen“, „Board
    nicht lesbar“, „mehr als 60 Meldungen“; ~/halo-aufgaben/ci-waechter.versuche;
  - Meldungen in CI-Logs, die kein Board-Eintrag abdeckt (verloren);
  - Dauer der Läufe gegenüber der Vorwoche (Mitschrift kostet sie spürbar?).
  **Durchsicht des Codes nur, wenn sich in der Woche daran etwas geändert
  hat** (git log --since=7.days -- tests/halo_test.py tests/update_test.py
  tests/ci-waechter.sh tests/ci-warten.sh release.sh tests/lauf-hilfen.zsh,
  dort die Teile zur Fehlerkonsole bzw. zum Fehlerprotokoll) oder die Daten
  oben ein Leck zeigen: dann in Runden prüfen, wo es Fehler gibt und was
  sich verbessern lässt (verlorene, falsch zugeordnete oder doppelte
  Meldungen, Prüfung doch rot, Bug fälschlich als behoben, spürbar längere
  Läufe, Quoting/Escapes). Die erste Runde macht ein Unteragent
  (Agent-Werkzeug), der nur Ziel und Stellen bekommt, nicht die eigenen
  Vermutungen; seine Befunde selbst nachprüfen. Fertig erst nach drei Runden
  in Folge ohne Fehler oder Verbesserung, höchstens fünf Runden – sonst im
  Bericht „nicht abgeschlossen“ mit Stand. Befunde behandeln wie Abschnitt 3.
- **Design-Rundgang** (samstags, tests/MAC-MINI.md Abschnitt 17): aus
  ~/halo-aufgaben/rundgang-kennzahlen.json der Lauf der Woche – Status
  (fertig, ausgelassen mit Grund, pausiert, gescheitert), Dauer je Schema,
  OK/nicht erreicht, Ausreißer neu/behoben/gesamt; dazu der Bericht
  ~/halo-berichte/<datum>-rundgang.md. Im Bericht mit der Vorwoche
  vergleichen; zweimal in Folge ausgelassen oder deutlich mehr nicht
  erreichte Oberflächen nennen.
- **Board:** gh project item-list 1 --owner sruf79 --limit 300 --format json
  (offen: Anzahl je Status und Typ). Erledigte Einträge werden archiviert und
  fehlen dort – sie stattdessen aus den Nachtlauf-Berichten und den
  Commits der Woche zählen. Durchsatz = in der Woche erledigte Einträge
  (Bugs/Features getrennt), neu angelegte, offene am Ende.

## 2. Kennzahlen speichern

~/halo-aufgaben/wochen-kennzahlen.json: ein Objekt, Schlüssel ist die
ISO-Woche („2026-W45“), Wert ein Objekt mit mindestens:
  ci_laeufe, ci_gruen, ci_rot, ci_abgebrochen,
  job_dauer_min (Objekt Job → Mittelwert in Minuten),
  rote_pruefungen (Objekt Prüfung → Anzahl), unzuverlaessig (Liste),
  naechte, naechte_ausgelassen, naechte_zu_frueh, ungenutzt_min (Summe der
  ungenutzten Minuten bis zur Grenze 04:30 bzw. 06:30), nach_release_erledigt, limit_pausen, releases, releases_per_ci,
  store_fehler, erledigt_bugs, erledigt_features, neu, offen_ende,
  konsole (Objekt: meldungen, board_neu, board_erledigt, board_offen,
  dubletten, verloren, wieder_aufgetreten, durchsicht_runden,
  durchsicht_abgeschlossen),
  ablauf (Objekt: geaendert, wirkt, zurueck, offen, vorschlaege),
  uebersprungen (Objekt: Routine → Anzahl der Zeilen „ÜBERSPRUNGEN“),
  push_fehler (Objekt: Routine → Anzahl der Zeilen „PUSH-FEHLER“),
  pausen (Objekt: aktiv, abgelaufen, unlesbar, lang_ueber_7_tage, dauerhaft),
  rundgang (Objekt: status, minuten, nicht_erreicht, ausreisser_neu,
  ausreisser_behoben, ausreisser_gesamt).
Bestehende Wochen nicht überschreiben (außer der eigenen bei erneutem Lauf).
Im Bericht jede Zahl mit der Vorwoche vergleichen, wenn vorhanden.

**Token-Bilanz** (Entscheidung des Maintainers, Cloud-Sitzung
global.design.comparison, 6.11.2026, Wortlaut: „ist das viel aufwand? wenn
nein - ja token zusammenzählen“): `python3 tests/token-bilanz.py --tage 7
--json` zählt die Tokens aus den Sitzungsprotokollen je Art (Nachtlauf,
Wochenprüfung, Doku-Prüfung, Rundgang, GitHub-Kommunikation, neon, neon-board,
push, sonstige) und legt sie als Wochenwert in
~/halo-aufgaben/token-kennzahlen.json ab (Abschnitt „basis“ = Stand vor den
Sparmaßnahmen vom 6.11.2026, nie überschreiben). Im Bericht knapp: Summe und
Ausgabe-Tokens je Art gegen „basis“ und Vorwoche (in %), Anteil „sonstige“;
nur Zählwerte, keine Inhalte. Zuordnungsregeln im Kopf des Skripts.

## 3. Selbst beheben (nur im normalen Lauf)

Erlaubt ohne Rückfrage: kleine Korrekturen an Prüfungen in tests/halo_test.py,
die eine unzuverlässige oder plattformbedingte Prüfung verlässlich machen:
- Toleranzen anpassen, wenn die Abweichung erklärbar ist (Fensterrand,
  Schrift unter Linux/Windows) – nie so weit, dass der Fehler, den die
  Prüfung finden soll, durchrutscht;
- feste Pausen durch Wartebedingungen ersetzen (bis(), ruhig(), stabil();
  AGENTS.md „Warten auf Bedingungen“);
- reine Plattform-Abweichungen (Linux/Windows) als Warnung statt Fehler.
- eindeutige Fehler im Umgang mit Fehlerkonsole und -protokoll (Abschnitt
  1) in tests/halo_test.py und tests/update_test.py; Fehler in
  tests/ci-waechter.sh bzw. tests/ci-warten.sh als Ablaufänderung (3b).
  Nie so, dass eine Konsolen- oder Protokollmeldung doch zum Fehlschlag
  wird; die zwei strengen Prüfungen („Senden rückgängig“,
  Today-Pane-Animation) bleiben streng. Die Bugs aus den Meldungen selbst
  (der Fehler in halo.spaces) arbeitet der Nachtlauf ab, nicht diese Prüfung.
Ablauf: vorher prüfen, dass nichts läuft (kein Runner.Worker, kein
Testfenster, kein Nachtlauf), dann python3 tests/halo_test.py --port 2852
--only "<Prüfung>" (bei Windows-Abweichungen zusätzlich --vm --port 2853),
committen (Stil nach AGENTS.md, Bereich „Tests:“), am Ende gesammelt pushen
und den CI-Lauf mit tests/ci-warten.sh HEAD 9 abwarten (erneut aufrufen,
solange Exitcode 2). Rot durch die eigene Änderung: mit git revert zurück,
pushen, im Bericht sagen. Höchstens fünf solche Korrekturen je Lauf.
Kein Release aus der Wochenprüfung (der nächste Nachtlauf veröffentlicht).

### 3b. Abläufe selbst verbessern, mit Wirkungskontrolle

Entscheidung des Maintainers vom 5.11.2026: Die Wochenprüfung verbessert die
Arbeitsabläufe selbst, statt nur vorzuschlagen – wenn die Zahlen es klar
begründen – und nimmt eine Änderung zurück, die nicht wirkt.

Erlaubt ohne Rückfrage: Änderungen an tests/nachtlauf.sh,
tests/nachtlauf-auftrag.md, tests/ci-waechter.sh, tests/ci-warten.sh,
tests/lauf-hilfen.zsh, tests/wochenpruefung*, tests/dokupruefung-auftrag.md,
tests/farben-betroffen.sh, release.sh/publish.sh (außer der Sperre),
.github/workflows/test.yml (außer den if:-Bedingungen der Jobs mac und
windows) und den beschreibenden Sätzen dazu in AGENTS.md und
tests/MAC-MINI.md. Bedingungen:
- **Begründet:** dasselbe Problem zeigt sich in den Zahlen mindestens
  zweimal (zwei Nächte, zwei Läufe, zwei Wochen) oder einmal mit klarem
  Schaden (verlorene Meldung, verpasstes Release, ausgelassene Nacht). Im
  Commit und im Bericht steht die Zahl, die es belegt.
- **Messbar:** vorher festlegen, an welcher Kennzahl (Abschnitt 2) die
  Wirkung nächste Woche abzulesen ist, und welcher Wert als besser gilt.
- **Klein und einzeln:** je Änderung ein Commit (Bereich „Ablauf:“ bzw. der
  Dateiname), höchstens drei Ablaufänderungen je Lauf.
- **Geprüft:** Shell-Skripte mit zsh -n und, wo vorhanden, einem
  Trockenlauf (--trocken); Workflow-Änderungen gezielt mit gh workflow run
  test.yml … -f ziel=linux, bevor sie auf main gehen; danach pushen und
  die CI wie in Abschnitt 3 abwarten. Geänderte Läufe auf neon danach mit
  tests/mac-mini-setup.sh --ohne-probelauf übernehmen.
- **Eingetragen:** in ~/halo-aufgaben/ablauf-aenderungen.json je Änderung
  ein Eintrag {datum, commit, problem, beleg, kennzahl, vorher, ziel,
  pruefen_ab (nächste Wochenprüfung), ergebnis: null}.

Nicht selbst, nur als Vorschlag (Board-Eintrag, Typ Feature oder Bug,
Status „Wartet auf OK“, Titel „Ablauf: …“, mit Begründung aus den Zahlen):
alles, was einer **Entscheidung des Maintainers** widerspricht oder sie
ändert (in AGENTS.md und den Aufträgen mit „Entscheidung des Maintainers
vom …“ gekennzeichnet – z. B. Zeiten, Push-Sperre, Reihenfolge der
Aufgabenliste, Dunkelmodus nur bei Farben, Freigaben), Zeitpläne und
LaunchAgents, mac-mini-setup.sh, neue Routinen, alles, was Kosten
spürbar erhöht (längere CI-Runden, mehr Claude-Läufe), und Änderungen ohne
messbare Kennzahl. Anlegen:
  gh project item-create 1 --owner sruf79 --title "…" --body "…" --format json
  gh project item-edit --project-id PVT_kwHODEPpks4BoBQw --id <id> --field-id PVTSSF_lAHODEPpks4BoBQwzhmjN8Y --single-select-option-id <ff678ae2 Bug | 39bb4253 Feature>
  gh project item-edit --project-id PVT_kwHODEPpks4BoBQw --id <id> --field-id PVTSSF_lAHODEPpks4BoBQwzhmjN5E --single-select-option-id 2327eecc
Vorher im Board nachsehen, ob es den Vorschlag schon gibt (dann ergänzen).

**Wirkungskontrolle** (jede Woche, vor neuen Änderungen): Für jeden Eintrag
in ~/halo-aufgaben/ablauf-aenderungen.json mit ergebnis null und
pruefen_ab erreicht die Kennzahl der Woche mit „vorher“ und „ziel“
vergleichen. Besser: ergebnis „wirkt“. Gleich oder schlechter: die
Änderung mit git revert <commit> zurücknehmen (Commit „Ablauf: … zurück –
wirkte nicht (<Kennzahl> vorher x, jetzt y)“), ergebnis „zurück“, und
dasselbe Problem nicht noch einmal auf dieselbe Weise angehen. Zu wenig
Daten (z. B. keine Nacht mit dem Fall): ergebnis bleibt null, pruefen_ab
eine Woche weiter, höchstens dreimal, dann „unklar“ und so lassen. Schaden
schon vorher sichtbar (CI rot, ausgelassene Nacht durch die Änderung): der
Nachtlauf bzw. die nächste Sitzung nimmt sie sofort zurück – dafür steht im
Commit „Ablauf: …“ die Zeile „Zurück bei: <Anzeichen>“.

Nie anfassen: die Release-Sperre (Testmarke in release.sh/publish.sh),
die if:-Bedingungen der Jobs mac und windows, tests/mac-runner-hook.sh,
die Freigaberegeln in AGENTS.md, den Inhalt von Entscheidungen des
Maintainers. Kein install.sh, nichts im echten Profil.
Marionette-Ports nur 2852–2869 (2850/2851 nutzt der Nachtlauf, 2845 die CI).
Inhalte der Aufgabenliste nie in Commits.

## 4. Startliste für den ersten Lauf (Stand 3.11.2026)

Diese Punkte sind bekannt und sollen im ersten Bericht bewertet werden:
- Windows-Job war in 4 der letzten 5 vollständigen Läufe rot: Toolbar beim
  Breiterziehen der Mailliste, Knopfleiste des Terminfensters,
  Today-Pane-Animation – unzuverlässig oder echte Windows-Abweichung?
  Kleine Korrekturen siehe Abschnitt 3.
- Zehn Pushes mit „Fehlersuche …“ am 3.11. (jeder Push = volle CI-Runde):
  Vorschlag workflow_dispatch-Eingaben „only“ (Teil des Prüfungsnamens)
  und „channel“ (release/beta/esr) für gezielte CI-Läufe – Ablaufänderung,
  also Vorschlag „Wartet auf OK“.
- Abgebrochene Läufe zu den Release-Commits 3.13.0 und 3.14.0 (Release-Push
  bricht den laufenden Test des vorigen Commits ab?) – Ursache klären,
  Vorschlag.
- Store-Upload zweimal 502 (Server von addons.thunderbird.net): Vorschlag
  mehrere Versuche mit Pause in publish.sh – Vorschlag „Wartet auf OK“.

## 5. Bericht

Pfad oben, Deutsch, knapp, für einen Admin, der nicht programmiert. Erste
Zeile nach der Überschrift genau so:
  Kurz: <ein Satz: CI grün/rot-Quote, auffälligste Zahl, Anzahl Korrekturen und Vorschläge>
Diese Zeile geht als Push-Meldung aufs iPhone. Dann Abschnitte:
Kennzahlen (Tabelle mit Vorwoche), Auffällig (unzuverlässige Prüfungen,
langsamste Prüfungen, Ausfälle), Fehlerkonsole (Zahlen aus Abschnitt 1,
Lecks, Durchsicht ja/nein mit Runden), Abläufe (je Änderung dieser Woche:
Problem, Beleg, Kennzahl, Ziel; Wirkungskontrolle früherer Änderungen:
wirkt/zurück/offen mit Zahlen), Nachtläufe (je Nacht Beginn, Ende, Grund
des Endes, erledigt, ungenutzte Zeit und liegengebliebene machbare
Einträge, falls zu früh beendet), Geändert (Commit, was und warum; im
Trockenlauf „Würde ändern“), Top-3-Vorschläge (je ein Satz Nutzen, Board-ID
falls angelegt), Probleme dieses Laufs. Den Bericht immer schreiben.

Danach die Fertig-Datei (Pfad oben) anlegen. Keine eigene Push-Meldung
schicken, das macht das Skript.
