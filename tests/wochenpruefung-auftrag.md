Unbeaufsichtigte Wochenprüfung halo.spaces auf neon (gestartet von
tests/wochenpruefung.sh, sonntags 08:00). Niemand sieht zu, niemand antwortet
auf Rückfragen. AGENTS.md gilt vollständig; Abweichungen und Ergänzungen
stehen hier. Ziel: Wie gut liefen Tests, CI, Nachtläufe und Releases in den
letzten 7 Tagen, was lässt sich an den Prüfungen verbessern?

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
- **Nachtlauf zu früh beendet?** (Wunsch des Maintainers vom 5.11.2026) Je
  Nacht aus ~/halo-nacht/<datum>.log Beginn („Start, Sitzung“) und Ende
  („Ende“) der Arbeit und Grund des Endes (Fertig-Datei, „08:00 erreicht“,
  dreimal ohne Fertig-Datei aufgehört, Limit) sowie aus dem Bericht, was
  unter „Übersprungen/offen“ steht. Zu früh heißt: Der Lauf hat vor 04:30
  den letzten Eintrag begonnen bzw. vor 04:30 aufgehört, obwohl im Board
  noch machbare Einträge (Todo, kein „Wartet auf OK“, keine offene
  Entscheidung des Maintainers) lagen. Je solche Nacht: ungenutzte Zeit bis
  04:30 in Minuten, Zahl der liegengebliebenen machbaren Einträge und der
  erkennbare Grund (z. B. Plan zu klein gewählt, Einträge fälschlich als
  „braucht Entscheidung“ übersprungen, Abbruch nach Limit, Runde ohne
  Fortsetzung). War das in mindestens zwei Nächten der Woche so, einen
  Vorschlag „Ablauf: Nachtlauf …“ (Wartet auf OK) mit Ursache und Abhilfe
  anlegen (z. B. Auftrag in tests/nachtlauf-auftrag.md schärfen).
- **CI-Wächter:** ~/halo-aufgaben/ci-waechter.log – gemeldete rote Läufe.
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
  ungenutzten Minuten bis 04:30), limit_pausen, releases, releases_per_ci,
  store_fehler, erledigt_bugs, erledigt_features, neu, offen_ende.
Bestehende Wochen nicht überschreiben (außer der eigenen bei erneutem Lauf).
Im Bericht jede Zahl mit der Vorwoche vergleichen, wenn vorhanden.

## 3. Selbst beheben (nur im normalen Lauf)

Erlaubt ohne Rückfrage: kleine Korrekturen an Prüfungen in tests/halo_test.py,
die eine unzuverlässige oder plattformbedingte Prüfung verlässlich machen:
- Toleranzen anpassen, wenn die Abweichung erklärbar ist (Fensterrand,
  Schrift unter Linux/Windows) – nie so weit, dass der Fehler, den die
  Prüfung finden soll, durchrutscht;
- feste Pausen durch Wartebedingungen ersetzen (bis(), ruhig(), stabil();
  AGENTS.md „Warten auf Bedingungen“);
- reine Plattform-Abweichungen (Linux/Windows) als Warnung statt Fehler.
Ablauf: vorher prüfen, dass nichts läuft (kein Runner.Worker, kein
Testfenster, kein Nachtlauf), dann python3 tests/halo_test.py --port 2852
--only "<Prüfung>" (bei Windows-Abweichungen zusätzlich --vm --port 2853),
committen (Stil nach AGENTS.md, Bereich „Tests:“), am Ende gesammelt pushen
und den CI-Lauf mit tests/ci-warten.sh HEAD 9 abwarten (erneut aufrufen,
solange Exitcode 2). Rot durch die eigene Änderung: mit git revert zurück,
pushen, im Bericht sagen. Höchstens fünf solche Korrekturen je Lauf.
Kein Release aus der Wochenprüfung (der nächste Nachtlauf veröffentlicht).

Nur als Vorschlag (Board-Eintrag, Typ Feature oder Bug, Status „Wartet auf
OK“, Titel „Tests: …“ bzw. „Ablauf: …“, mit Begründung aus den Zahlen):
alles, was den Ablauf ändert – .github/workflows/, release.sh, publish.sh,
tests/nachtlauf*, tests/ci-waechter.sh, tests/wochenpruefung*, Zeitpläne,
LaunchAgents, mac-mini-setup.sh, AGENTS.md. Anlegen:
  gh project item-create 1 --owner sruf79 --title "…" --body "…" --format json
  gh project item-edit --project-id PVT_kwHODEPpks4BoBQw --id <id> --field-id PVTSSF_lAHODEPpks4BoBQwzhmjN8Y --single-select-option-id <ff678ae2 Bug | 39bb4253 Feature>
  gh project item-edit --project-id PVT_kwHODEPpks4BoBQw --id <id> --field-id PVTSSF_lAHODEPpks4BoBQwzhmjN5E --single-select-option-id 2327eecc
Vorher im Board nachsehen, ob es den Vorschlag schon gibt (dann ergänzen).

Nie anfassen: die Release-Sperre (Testmarke in release.sh/publish.sh),
die if:-Bedingungen der Jobs mac und windows, tests/mac-runner-hook.sh,
die Freigaberegeln in AGENTS.md. Kein install.sh, nichts im echten Profil.
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
langsamste Prüfungen, Ausfälle), Nachtläufe (je Nacht Beginn, Ende, Grund
des Endes, erledigt, ungenutzte Zeit und liegengebliebene machbare
Einträge, falls zu früh beendet), Geändert (Commit, was und warum; im
Trockenlauf „Würde ändern“), Top-3-Vorschläge (je ein Satz Nutzen, Board-ID
falls angelegt), Probleme dieses Laufs. Den Bericht immer schreiben.

Danach die Fertig-Datei (Pfad oben) anlegen. Keine eigene Push-Meldung
schicken, das macht das Skript.
