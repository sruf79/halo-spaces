# tests.md

Bauen und testen in voller Länge (CI-Jobs, gezielte CI-Läufe, Update-Test, Fehlerkonsole, Warten auf Bedingungen), aus `AGENTS.md` ausgelagert (9.11.2026). Vor neuen Prüfungen oder Arbeit an CI lesen.

## Vollständiger Wortlaut aus `AGENTS.md` (Stand 9.11.2026, vor der Kürzung)

Bei der Kürzung von `AGENTS.md` (9.11.2026, Ablauf-Analyse Stufe 5) unverändert hierher verschoben; nur die Überschriften stehen eine Ebene tiefer. Verweise wie „oben“, „unten“ oder „dieser Datei“ meinen das damalige `AGENTS.md`. Die Kurzfassung für jede Sitzung steht im Kern `AGENTS.md`; Wortlaute der Entscheidungen: `ENTSCHEIDUNGEN.md`.

### Bauen und testen

```bash
./build.sh                                   # → dist/halo-spaces-<version>.xpi und …-atn.xpi
python3 tests/halo_test.py                   # baut vorher selbst, testet hell
python3 tests/halo_test.py --dark            # dunkel
python3 tests/halo_test.py --xpi dist/….xpi --shots /tmp/shots --keep
```

- Der Test legt ein leeres, temporäres Profil an (keine Konten, keine echten
  Daten), installiert das Paket und prüft per Marionette (Port 2839). Ausgabe:
  eine Zeile `OK`/`FEHLER` je Prüfung, Exitcode 0 nur bei Erfolg.
- Thunderbird muss unter `/Applications/Thunderbird.app` liegen (sonst `--tb` oder
  Umgebungsvariable `HALO_TB`, gilt auch für `release.sh` und `update_test.py`).
- Testfenster, die macOS verdeckt, pausieren Animationen – Animationsprüfungen
  überspringen diesen Fall bewusst.
- CI (`.github/workflows/test.yml`) läuft unter Linux mit xvfb gegen Release,
  Beta und ESR; Linux-spezifische Abweichungen der Toolbar sind dort Warnungen.
  Daneben prüft der Job `statisch` ohne Thunderbird die Logik-Tests
  (`tests/logik/`; neue reine Funktionen dort mit abdecken, auch ohne neon
  lauffähig), die Adressen im Netz
  (`tests/adressen.py` – eine neue Adresse braucht dort einen Eintrag mit
  Zweck, Datenschutzhinweise in `store/privacy-en.md` mitprüfen) und das
  Paket mit Mozillas Add-on-Prüfung (`tests/addon_lint.py`, nur Fehler machen
  rot; erwartet ist der Hinweis auf die Experiment-API).
  Der ESR-Job muss grün sein wie die übrigen. Er testet die neueste ESR
  (`esr-latest`), nicht zwingend die Mindestversion: Nach Erscheinen einer
  neuen ESR prüft er bis zum Anheben von `strict_min_version` die
  Mindestversion nicht mehr.
- **CI gezielt von Hand** (Fehlersuche ohne volle Runde): `gh workflow run
  test.yml -R sruf79/halo-spaces -f only="<Teil des Prüfungsnamens>" -f
  ziel=<alle|linux|linux-release|linux-beta|linux-esr|mac|windows>`. Nur
  Linux belegt neon nicht. Ein gezielter Lauf (Schritt „Gezielter Lauf“ im
  Job `changes`) zählt nicht als vollständig grün für `release.sh`, der
  CI-Wächter trägt ihn nicht ein, `ci-warten.sh` wartet nur auf Läufe aus
  einem Push. `mac`/`windows` gezielt nicht während des Nachtlaufs starten –
  sie warten auf demselben Runner und verlängern seine CI-Runde.
- Mindestversion (`strict_min_version`) ist die aktuelle ESR (153). Ältere
  Versionen bekommen keine Updates mehr; vor dem Anheben auf eine neue ESR
  einen Volltest mit ihr (`--tb`, Thunderbird ESR aus download.mozilla.org).
- `tests/update_test.py` stellt das Update von einer älteren Version nach
  (Standard: das letzte veröffentlichte Release, andere mit `--from`)
  (Einstellungen, Toolbar, Begrüßung, userChrome.css); mit `--github` über das
  veröffentlichte `updates.json`. `release.sh` lässt ihn vor der Marke selbst
  laufen (auch wenn die CI die übrigen Prüfungen übernommen hat; aus nur mit
  `NO_UPDATE_TEST=1`), rot heißt kein Release.
- Nach UI-Änderungen: passende Prüfung in `run_checks()` ergänzen, besonders
  an Stellen, an denen es schon Rückschritte gab.
- **Fehlerkonsole** (Entscheidung des Maintainers vom 5.11.2026): Konsolenfehler
  halten kein Release auf, wenn die Prüfungen grün sind. `halo_test.py`
  schreibt die Fehlerkonsole ab dem Start des Laufs mit (ihr Puffer hält nur
  250 Meldungen) und merkt sich zu jeder Meldung die laufende Prüfung. Am
  Ende steht je Fehler aus halo.spaces (bzw. Thunderbird-Meldung, die auf
  einen Eingriff von uns deutet, z. B. GitHub #38) eine Zeile `KONSOLE  …`;
  die Prüfung „Fehlerkonsole …“ bleibt dabei OK (nur Warnung), auch mit
  `--only` (dann nur für die gelaufenen Prüfungen). `update_test.py` meldet
  ebenso nach dem Start der neuen Version. Der CI-Wächter trägt jede Zeile
  als Bug „Tests: Fehlerkonsole – …“ ins Board, und dieser wird wie jeder Bug
  abgearbeitet. Löst eine Prüfung absichtlich einen Fehler in halo.spaces
  aus (kein Netz, kaputte Daten, ersetzte Funktion), meldet sie ihn mit
  `erwartet(/Muster/)` an (gilt nur für diese Prüfung). Die Prüfung nicht zu
  einem Fehlschlag machen und keine Liste „bekannter“ Fehler anlegen.
  Ebenso das Fehlerprotokoll der Erweiterung (`mail-cards-debug.log`, Fehler,
  die unser Code selbst abfängt): Prüfung „Fehlerprotokoll …“ nur Warnung, je
  Meldung eine Zeile `PROTOKOLL  …`, Bug „Tests: Fehlerprotokoll – …“.
  Meldungen werden ohne wechselnde Teile (Profil, Temp-Pfade, Kennung der
  Erweiterung) verglichen; Zeilen aus dem Update-Test trägt `release.sh` über
  `ci-waechter.sh --datei` ein. Solche Bugs erst auf Done, wenn der CI-Lauf
  zum Fix mit denselben Jobs (bei „dunkel“ auch dunkel) die Meldung nicht
  mehr nennt (`ci-warten.sh`) – grüne CI allein beweist es nicht.
  Die Wochenprüfung (sonntags) prüft diesen Ablauf an den Zahlen der Woche
  und sieht sich den Code nur an, wenn er sich geändert hat.
- **Warten auf Bedingungen statt auf feste Zeiten** (Entscheidung des
  Maintainers vom 3.11.2026): neue Prüfungen nutzen die Hilfen aus `PRELUDE`
  – `bis(() => …, "was", ms)` für ein Fertig-Zeichen (Element da, Termine
  geladen, Mail dargestellt, Fenster offen; bricht bei Zeitüberschreitung mit
  Meldung ab), `ruhig(ms)` nach einer Bedienung (wartet auf Leerlauf, höchstens
  `ms`), `stabil(fn)` für „Position steht still“. Feste Pausen (`wait`) nur,
  wo bewusst Zeit vergehen soll (Doppelklick-Abstand, „bleibt offen“,
  Animationsbilder) – mit Kommentar. Bei Prüfungen auf Abwesenheit („keine
  Linie“) zuerst auf die fertig aufgebaute Ansicht warten. Am Ende eines Laufs
  stehen Gesamtdauer und die langsamsten Prüfungen.

Zum Ausprobieren im echten Profil: `./install.sh` (Thunderbird vorher beenden).
Das betrifft das echte Profil des Nutzers – nur auf ausdrücklichen Wunsch.
