Unbeaufsichtigte Wochenprüfung halo.spaces auf neon (gestartet von
tests/wochenpruefung.sh, sonntags 08:00). Niemand sieht zu, niemand antwortet
auf Rückfragen. AGENTS.md gilt vollständig; Abweichungen und Ergänzungen
stehen hier. Ziel: Wie gut liefen Tests, CI, Nachtläufe und Releases in den
letzten 7 Tagen, was lässt sich an Prüfungen und Abläufen verbessern (als Empfehlung, die der
Maintainer freigibt) – und wirkten die freigegebenen Änderungen der Vorwochen?

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
- **Maintainer nötig** (Messung der Pflichtzeit, Maintainer-Freigabe 10.11.2026): `zsh tests/handeln-zaehlen.zsh <Wochenschlüssel>`
  ausführen (zählt die Zeilen in ~/halo-nacht/handeln.log, also die iPhone-Meldungen mit „[handeln]“) und im Bericht
  die Zeile „Maintainer nötig: n“ nennen, mit der Vorwoche verglichen; in den Kennzahlen als `maintainer_noetig`
  (Zahl). Ausgangswert: ~/halo-nacht/handeln-ausgangswert.txt (Zählung beginnt am 10.11.2026, Woche 2026-W46).
- **Pausen:** `~/halo-nacht/pausen.txt` lesen: aktive Pausen (bis, Grund), Zeilen „PAUSE ABGELAUFEN“ der
  letzten 7 Tage aus ~/halo-nacht/uebersprungen.log zählen, ebenso „PAUSE UNLESBAR“ (Tippfehler: die Pause galt
  nicht, die Routine lief – Zeile in pausen.txt nennen), Pausen mit mehr als 7 Tagen Laufzeit melden.
  Zeilen mit Ablauf 2999-12-31 („migriert aus …“, übernommene alte Dateien) als „dauerhaft, ohne Ablauf“
  melden; Zeilen „PAUSE MIGRIERT“ der letzten 7 Tage zählen. Alte Pausen-Dateien gibt es nicht mehr
  (Ausnahme: die inaktive Vorlage tests/neon-neustart.sh mit PAUSE-NEUSTART).
- **CI-Runden des Nachtlaufs** (Entscheidung des Maintainers vom 7.11.2026): Zeilen
  „VOLLRUNDE-FEHLER <Routine> <Grund>“ und „EINTRAG-FEHLER <Routine> <Grund>“ der letzten 7 Tage
  aus ~/halo-nacht/uebersprungen.log zählen (Vollrunde nicht gestartet/gefunden bzw. rote Prüfung
  nicht ins Board gekommen) und je Grund im Bericht nennen; die Abschnitte „CI-Runde der Nacht“
  der Nachtlauf-Berichte: Nächte mit gestarteter Vollrunde und ihr Ergebnis. Die Zeile
  „CI-Kennzahl“ oben (Tage seit der letzten vollständig grünen Runde) unverändert in Bericht und
  Kennzahlen übernehmen, mit der Vorwoche vergleichen; ab 3 Tagen ohne grüne Runde im Bericht
  nennen, welche Jobs zuletzt rot waren. In derselben Nacht reparierte Prüfungen (Zeilen „CI rot, in
  derselben Nacht repariert“ in den Nachtlauf-Berichten) zählen nicht als offen. Die Zeile
  „Flackernde Prüfungen“ oben (rot, in derselben Nacht ohne Reparaturcommit grün; Entscheidung vom
  7.11.2026) übernehmen und die Prüfungen aus den Zeilen „flackert:“ in
  ~/halo-aufgaben/ci-waechter.log nennen; dieselbe Prüfung mehrmals: Eintrag „Tests: …“ im Board
  prüfen.
- **Behobene GitHub-Issues ohne Antwort** (Entscheidung des Maintainers vom 7.11.2026): Die Zeile
  „Behobene Issues ohne Antwort“ oben (offenes Issue mit Fix-Commit „(GitHub #n)“ auf main und grüner
  CI, älter als 1 Tag, ohne „behoben“-Antwort; tests/issue-abgleich.sh) unverändert in Bericht und
  Kennzahlen übernehmen, mit der Vorwoche vergleichen. Über 0: die Nummern aus
  ~/halo-aufgaben/issue-abgleich.txt (Zeilen „antworten“) nennen und prüfen, warum die
  GitHub-Routine nicht geantwortet hat (Vorprüfung, Läufe der Woche); Zeilen „board-hinweis“ dort
  ebenfalls nennen (Fix ohne „(GitHub #n)“ im Commit).
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
  („Ende“) der Arbeit und Grund des Endes (Zeile „Arbeit beendet: …“ von
  nachtlauf.sh, Zeile „Grund: …“ der Fertig-Datei, Abschnitt „Ende der
  Arbeit“ im Bericht; „Fortsetzung n“-Zeilen zählen) sowie aus dem Bericht, was
  unter „Übersprungen/offen“ steht. Zu früh heißt: Der Lauf hat früher als
  möglich aufgehört, neue Einträge anzufangen – vor 04:30, bzw. nach grüner
  CI und Release (Schritt 5 des Nachtlauf-Auftrags) vor 06:30 –, obwohl im Board
  noch machbare Einträge (Todo, kein „Wartet auf OK“, keine offene
  Entscheidung des Maintainers) lagen. Je solche Nacht: ungenutzte Zeit bis
  zur jeweiligen Grenze (04:30 bzw. 06:30) in Minuten, Zahl der liegengebliebenen machbaren Einträge und der
  erkennbare Grund (z. B. Plan zu klein gewählt, Einträge fälschlich als
  „braucht Entscheidung“ übersprungen, Abbruch nach Limit, Runde ohne
  Fortsetzung). War das in mindestens zwei Nächten der Woche so, die
  Ursache als Empfehlung nach Abschnitt 3b melden (z. B. Auftrag in
  tests/nachtlauf-auftrag.md schärfen; Kennzahl naechte_zu_frueh bzw.
  ungenutzt_min), mit Hinweis, wenn es eine Entscheidung des
  Maintainers berührt.
  Zusätzlich (Entscheidung des Maintainers vom 8.11.2026, Wortlaut in
  ENTSCHEIDUNGEN.md): je Nacht die Minuten zwischen dem Ende der Arbeit
  (letzte Zeile „Arbeit beendet: …“) und 06:30, wenn das Ende davor lag –
  unabhängig vom Grund, mit dem Grund daneben; Summe als
  ungenutzt_bis_0630_min. Gültige Endegründe sind nur: nichts Machbares mehr,
  06:30 erreicht, Sechs-Commits-Grenze, Limit, rote CI in Schritt 4
  (Schritt 5 d des Nachtlauf-Auftrags); andere Gründe vor 06:30 zählen als
  „zu früh“.
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
ISO-Woche, Montag bis Sonntag („2026-W46“; maßgeblich ist der im Auftrag-Kopf mitgegebene „Wochenschlüssel“, nicht selbst ableiten), Wert ein
Objekt mit einer **festen Kennzahlenliste**: immer dieselben Schlüssel, ein fehlender Wert steht
als `null` (nicht weglassen). Feste Kernliste (zusätzlich zu den weiteren Schlüsseln unten):
  ci_gruen, ci_rot (CI-Läufe grün/rot), releases, pushes_je_tag (Objekt Datum → Anzahl der
  Pushes auf main), naechte_ausgelassen, uebersprungen_gesamt (Summe der Zeilen
  „ÜBERSPRUNGEN“), board_neu, board_erledigt, iphone_meldungen (Meldungen aufs iPhone an den
  Maintainer, gezählt aus den Protokollen; null, wenn nicht ermittelbar), maintainer_noetig (Zeilen in handeln.log der Woche).
Weitere Schlüssel, ebenfalls fest:
  ci_laeufe, ci_gruen, ci_rot, ci_abgebrochen,
  job_dauer_min (Objekt Job → Mittelwert in Minuten),
  rote_pruefungen (Objekt Prüfung → Anzahl), unzuverlaessig (Liste),
  naechte, naechte_ausgelassen, naechte_zu_frueh, ungenutzt_min (Summe der
  ungenutzten Minuten bis zur Grenze 04:30 bzw. 06:30), ungenutzt_bis_0630_min
  (Summe der Minuten vom Ende der Arbeit bis 06:30, jeder Grund),
  nach_release_erledigt, limit_pausen, releases, releases_per_ci,
  store_fehler, erledigt_bugs, erledigt_features, neu, offen_ende,
  konsole (Objekt: meldungen, board_neu, board_erledigt, board_offen,
  dubletten, verloren, wieder_aufgetreten, durchsicht_runden,
  durchsicht_abgeschlossen),
  ablauf (Objekt: umgesetzt (freigegebene Änderungen im Verlauf), wirkt, zurueck_vorgeschlagen, offen, empfehlungen (Zahl der Empfehlungen dieser Woche, höchstens 3)),
  uebersprungen (Objekt: Routine → Anzahl der Zeilen „ÜBERSPRUNGEN“),
  push_fehler (Objekt: Routine → Anzahl der Zeilen „PUSH-FEHLER“),
  ci_runde_fehler (Objekt: vollrunde, eintrag → Anzahl der Zeilen „VOLLRUNDE-FEHLER“ bzw.
  „EINTRAG-FEHLER“), vollrunden_gestartet, tage_seit_gruener_vollrunde (Zahl oder null),
  letzte_gruene_vollrunde (ISO-Zeit, Wiener Zeit, oder null), ci_flackert (Zahl),
  issue_ohne_antwort (Zahl oder null),
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
  tests/ci-waechter.sh bzw. tests/ci-warten.sh als Empfehlung (3b).
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

### 3b. Abläufe analysieren und empfehlen, nach Zustimmung umsetzen

Entscheidung des Maintainers (Sitzung project.analysis.control, 8.11.2026, am 9.11.2026
freigegeben; Wortlaut in ENTSCHEIDUNGEN.md; ersetzt die Entscheidung vom 5.11.2026): Die
Wochenprüfung läuft weiter, ändert Abläufe aber **nicht mehr selbst**. Sie analysiert und gibt
Empfehlungen; umgesetzt wird nach Zustimmung des Maintainers. Ziel ist eine wiederkehrende
Routine, die den Workflow immer wieder analysiert und optimiert.

Nicht selbst ändern: tests/nachtlauf.sh, tests/nachtlauf-auftrag.md, tests/ci-waechter.sh,
tests/ci-warten.sh, tests/lauf-hilfen.zsh, tests/wochenpruefung*, tests/dokupruefung-auftrag.md,
tests/farben-betroffen.sh, release.sh/publish.sh, .github/workflows/test.yml, AGENTS.md,
docs/, tests/MAC-MINI.md, Zeitpläne, LaunchAgents, mac-mini-setup.sh, neue Routinen.
Erlaubt bleibt allein Abschnitt 3 (kleine Korrekturen an Prüfungen in tests/halo_test.py und
tests/update_test.py).

**Empfehlung** (höchstens drei je Woche): ein Board-Eintrag, Typ Feature oder Bug, Status
„Wartet auf OK“, Titel „Ablauf: …“, mit vier Angaben:
- Kennzahl (Abschnitt 2) und aktueller Wert, mit dem Beleg aus den Zahlen (mindestens
  zweimal dasselbe Problem in zwei Nächten, Läufen oder Wochen, oder einmal mit klarem
  Schaden);
- Ziel: welcher Wert als besser gilt;
- Begründung: Problem und vorgeschlagene Änderung (Datei, Stelle);
- Rücknahme: wie sie zurückgenommen wird (z. B. `git revert`) und woran man erkennt, dass sie
  nicht wirkt.
Anlegen:
  gh project item-create 1 --owner sruf79 --title "…" --body "…" --format json
  gh project item-edit --project-id PVT_kwHODEPpks4BoBQw --id <id> --field-id PVTSSF_lAHODEPpks4BoBQwzhmjN8Y --single-select-option-id <ff678ae2 Bug | 39bb4253 Feature>
  gh project item-edit --project-id PVT_kwHODEPpks4BoBQw --id <id> --field-id PVTSSF_lAHODEPpks4BoBQwzhmjN5E --single-select-option-id 2327eecc
Vorher im Board nachsehen, ob es die Empfehlung schon gibt (dann ergänzen, nicht doppelt
anlegen). Eine ablehnte oder zurückgestellte Empfehlung nicht erneut stellen, solange sich die
Zahlen nicht geändert haben. Inhalte der Aufgabenliste nie in Commits.

**Verlauf der freigegebenen Änderungen:** ~/halo-aufgaben/ablauf-aenderungen.json bleibt; setzt
eine Sitzung nach Zustimmung eine Empfehlung um, trägt sie dort {datum, commit, problem, beleg,
kennzahl, vorher, ziel, pruefen_ab (nächste Wochenprüfung), ergebnis: null} ein. Die
Wochenprüfung selbst trägt dort nichts ein und ändert keine Datei der Liste oben.

**Wirkungskontrolle** (jede Woche, vor neuen Empfehlungen): Für jeden Eintrag in
ablauf-aenderungen.json mit ergebnis null und erreichtem pruefen_ab die Kennzahl der Woche mit
„vorher“ und „ziel“ vergleichen. Besser: ergebnis „wirkt“ (Datei-Eintrag setzen ist hier erlaubt).
Gleich oder schlechter: Empfehlung „Ablauf: … zurücknehmen“ (Commit, Kennzahl vorher x, jetzt y)
als Board-Eintrag „Wartet auf OK“, ergebnis „zurück vorgeschlagen“; dasselbe Problem nicht noch
einmal auf dieselbe Weise empfehlen. Zu wenig Daten: ergebnis bleibt null, pruefen_ab eine Woche
weiter, höchstens dreimal, dann „unklar“. Sichtbarer Schaden (CI rot, ausgelassene Nacht durch die
Änderung): sofort im Bericht und per Eintrag melden; zurücknehmen darf nur der Nachtlauf oder eine
Sitzung auf Anweisung des Maintainers.

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
  Kurz: <ein Satz: CI grün/rot-Quote, auffälligste Zahl, Anzahl Korrekturen und Empfehlungen>
Diese Zeile geht als Push-Meldung aufs iPhone. Dann Abschnitte:
Kennzahlen (Tabelle mit Vorwoche), Auffällig (unzuverlässige Prüfungen,
langsamste Prüfungen, Ausfälle), Fehlerkonsole (Zahlen aus Abschnitt 1,
Lecks, Durchsicht ja/nein mit Runden), Abläufe (je Empfehlung dieser Woche:
Problem, Beleg, Kennzahl, Ziel, Board-ID; Wirkungskontrolle freigegebener Änderungen:
wirkt/zurück vorgeschlagen/offen mit Zahlen), Nachtläufe (je Nacht Beginn, Ende, Grund
des Endes, erledigt, ungenutzte Zeit und liegengebliebene machbare
Einträge, falls zu früh beendet), Geändert (nur Korrekturen an Prüfungen nach Abschnitt 3: Commit, was und warum; im
Trockenlauf „Würde ändern“), Top-3-Empfehlungen (je ein Satz Nutzen, Board-ID
falls angelegt), Probleme dieses Laufs. Den Bericht immer schreiben.

Danach die Fertig-Datei (Pfad oben) anlegen. Keine eigene Push-Meldung
schicken, das macht das Skript.
