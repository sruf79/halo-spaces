# release.md

Release in voller Länge (Ablauf, Marke, Hotfix, `publish.sh`, Bericht, Issues, Store), aus `AGENTS.md` ausgelagert (9.11.2026). Vor jedem Release lesen; `release.sh` und `publish.sh` nur auf neon.

## Höchstens ein Release pro Tag

**Höchstens ein reguläres Release pro Tag.** Was danach fertig wird, wartet auf den nächsten Nachtlauf. Notfall-Release nur bei einem schweren Fehler bei Nutzern. (Freigabe des Maintainers vom 9.11.2026, Wortlaut in `ENTSCHEIDUNGEN.md`; gilt zusätzlich zu „Wann“ unten.)

## Pull Requests nach dem Release schließen

Nach dem Schließen der Issues ruft `publish.sh` `tests/pr-schliessen.sh <version>` auf: Es schließt nur
offene PRs mit Eintrag in `tests/pr-freigaben.txt`, deren Issue-Fix „(GitHub #n)“ im Release liegt
(Dank-Kommentar, kein Merge), verschiebt die Zeile nach `tests/pr-freigaben-erledigt.txt` und committet
beide Listen lokal (der nächste Push nimmt sie mit). Alles andere (nicht in der Liste, ohne Issue,
„hold“, schon zu, Kandidaten mit „Closes #n“) steht nur im Bericht; Fehler stehen dort als „FEHLER“ und
halten das Release nicht auf. Probe ohne Änderung: `./publish.sh --trocken x.y.z` bzw.
`zsh tests/pr-schliessen.sh x.y.z --trocken`; Test ohne Netz: `zsh tests/pr_schliessen_test.zsh`
(Entscheidung vom 9.11.2026, `ENTSCHEIDUNGEN.md`).

## Vollständiger Wortlaut aus `AGENTS.md` (Stand 9.11.2026, vor der Kürzung)

Bei der Kürzung von `AGENTS.md` (9.11.2026, Ablauf-Analyse Stufe 5) unverändert hierher verschoben; nur die Überschriften stehen eine Ebene tiefer. Verweise wie „oben“, „unten“ oder „dieser Datei“ meinen das damalige `AGENTS.md`. Die Kurzfassung für jede Sitzung steht im Kern `AGENTS.md`; Wortlaute der Entscheidungen: `ENTSCHEIDUNGEN.md`.

### Release (selbstständig auf neon)

```bash
./release.sh 3.1.0              # Version, update_url, Tests hell (dunkel bei Farben), updates.json, Testmarke
./publish.sh 3.1.0 notes.md     # Sperre prüfen, commit, push, GitHub-Release, Hash- und Update-Prüfung, Bericht
```

**Wann:** Jede Sitzung darf ohne Rückfrage veröffentlichen – auch
unbeaufsichtigt nachts (Entscheidung des Maintainers vom 2.11.2026: schlechte
Releases werden mit einem neuen Update nach vorn korrigiert, Thunderbird stuft
nicht zurück). Sie entscheidet selbst, ob ihre Änderungen groß genug für ein
eigenes Release sind (z. B. ein Bug, den Nutzer spüren, oder eine neue
Funktion). Wenn nicht, bleibt es beim Commit: Der nächste Nachtlauf
veröffentlicht alle noch nicht veröffentlichten Bugs und Features
automatisch, sobald die CI dazu grün ist (Entscheidung des Maintainers vom
5.11.2026). Tagsüber (außerhalb des Nachtlaufs) veröffentlicht eine
Sitzung nur, was Nutzer gerade spüren (Fix für einen gemeldeten oder
spürbaren Bug); alles andere geht ins Release des Nachtlaufs (Entscheidung
des Maintainers vom 5.11.2026). Ablauf: Versionshinweise im `README.md` schreiben (eigener
Commit „README: Versionshinweise x.y.z“), Notizen für den GitHub-Release als
Datei (englisch, gleicher Inhalt), `./release.sh x.y.z`, bei grünen Tests
direkt `./publish.sh x.y.z notes.md`. Version: Patch für Korrekturen, Minor
für neue Funktionen. Kleine Einzelkorrekturen (Abstände, Farben, Tests)
lohnen meist kein eigenes Release. `release.sh` und `publish.sh` laufen
**nur auf neon**, nie auf dem Laptop oder in Cloud-Sessions – die
beauftragen dafür neon (nach dem Push). Ausnahme: Notfall-Release nach `docs/notfall.md`
(startet und gibt nur der Maintainer von Hand frei, nie eine Sitzung).

**Einzige Bedingung: grüne Tests.** `release.sh` schreibt nur dann die Marke
`dist/release-<version>.ok` (Version, Hash des Pakets, gelaufene Tests, ob
dunkel lief), wenn hell (und ggf. dunkel) grün waren – oder die CI denselben Stand vollständig
grün getestet hat (Linux mit Beta und `mac` im Push-Lauf, `windows` im eigenen Lauf von Hand
`ziel=windows` zum selben oder einem späteren Stand ohne Thunderbird-Änderung; Linux und `mac` grün
ohne grünen Windows-Lauf heißt kein Release; dann werden die Tests
übersprungen, solange seitdem nichts geändert wurde, was Thunderbird direkt
betrifft (`tests/ci-noetig.sh`, siehe „CI nur für Thunderbird“); `FORCE_TESTS=1` testet trotzdem). Bei einem
Testfehler setzt `release.sh` Manifest und `updates.json` zurück und bricht
ab. `publish.sh` veröffentlicht ohne passende Marke nicht. `SKIP_TESTS=1`
ist nur zum Ausprobieren – ohne Marke kein Release.
Die Sperre nicht umgehen; ist ein Test rot, erst beheben.
**Hotfix** (Entscheidung des Maintainers vom 4.11.2026): nur auf seine
ausdrückliche Anweisung und nur für dringende Korrekturen ohne Änderung am
Aussehen `HOTFIX="<Muster der betroffenen Prüfungen>" ./release.sh x.y.z` –
testet nur diese Prüfungen (hell), die Marke vermerkt „Hotfix“; die CI zum
Push testet danach vollständig, Rot wird nach vorn korrigiert.

`publish.sh` committet nur `extension/manifest.json`, `updates.json` und ggf.
`README.md`; andere geänderte oder neue Dateien bleiben draußen (Warnung).
Danach prüft es den Download von GitHub (Hash) und die `updates.json`, die
Thunderbird über `update_url` abruft (neue Version, Hash, Download-Adresse) –
schlägt das fehl, meldet es laut „FEHLER“, Exitcode 1: dann sofort klären,
sonst bekommen Nutzer das Update nicht. Am Ende liegt ein Bericht in
`~/halo-berichte/<datum>-halo.spaces-<version>.md` (Version, Neues/Behobenes,
Tests, Veröffentlichung, Store-Upload); den Bericht im Gespräch bzw. als
Morgenbericht kurz zusammenfassen.

Zwischen `release.sh` und `publish.sh` darf nicht neu gebaut werden, sonst
passt der Hash nicht mehr (Marke und `updates.json`) und Thunderbird lehnt
das Update ab. Danach die behobenen GitHub-Issues mit „Fixed in x.y.z“
schließen (siehe unten). `store/max-version` mit neuen Thunderbird-Versionen
anheben (nach Test).
