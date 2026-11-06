Unbeaufsichtigte Doku-Prüfung halo.spaces auf neon (gestartet von
tests/wochenpruefung.sh --doku, samstags 08:00). Niemand sieht zu, niemand
antwortet auf Rückfragen. AGENTS.md gilt vollständig; Abweichungen und
Ergänzungen stehen hier. Ziel: Sind die .md-Dateien des Repos richtig,
widerspruchsfrei, aktuell und knapp – und was lässt sich daran verbessern?
Gegenstück zur Wochenprüfung (sonntags, Läufe und Prüfungen).

## 0. Vorher

- git status muss sauber sein (keine ungespeicherten Änderungen an
  verfolgten Dateien). Sonst arbeitet jemand anderes im Repo: nichts ändern,
  nur auswerten, im Bericht vermerken.
- git fetch origin; liegt main hinter origin/main, git rebase origin/main.
  Konflikt: git rebase --abort, nur auswerten, im Bericht vermerken.
- Merken, ob git log origin/main..main schon Commits zeigt (nicht gepushte
  Commits anderer Sitzungen, AGENTS.md „Nicht Eiliges nimmt der Nachtlauf
  mit“) – das entscheidet in Abschnitt 4 über den Push.

## 1. Prüfen

Steht im Auftrag davor eine Zeile „Seit der letzten Prüfung … geänderte
.md-Dateien: …“ (Entscheidung des Maintainers vom 6.11.2026, Sitzung global.design.comparison, Wortlaut: „ja, punkt 2 und 3 umsetzen.“), prüfe nur diese Dateien und was sie berühren
(Verweise, Dateilisten und Pfade gegen den Code, Widersprüche zu anderen .md); die
übrigen sind seit der letzten Prüfung unverändert und werden nicht erneut gelesen.
Ohne diese Zeile gilt:

Alle verfolgten .md-Dateien (git ls-files '*.md'), außer extension/vendor/.
Zusätzlich die Kopf-Kommentare der Skripte in tests/ und der Workflows, soweit
.md-Dateien auf sie verweisen. Je Datei und über Dateien hinweg:

- **Widersprüche:** zwei Regeln, die nicht beide gelten können (innerhalb
  einer Datei oder zwischen AGENTS.md, tests/MAC-MINI.md, den Aufträgen
  tests/*-auftrag.md, README.md, store/*.md).
- **Gegen den Stand des Repos:** Pfade, Dateinamen, Dateilisten (z. B.
  Tabelle „Aufbau“ in AGENTS.md gegen git ls-files), Abschnittsnummern und
  -namen, auf die verwiesen wird, Zeiten und Zeitpläne (gegen
  tests/mac-mini-setup.sh und die Skripte), Ports, Befehle und Optionen
  (gegen --help bzw. den Code), Versionen (strict_min_version,
  store/max-version), Zahlen (Zeilenzahlen, Dauer der CI-Jobs aus den
  letzten grünen Läufen: gh run list/gh run view … --json jobs).
- **Veraltet:** Aussagen, die der Code oder eine spätere Entscheidung des
  Maintainers (Datum im Text) überholt hat.
- **Doppelt:** dieselbe Regel an mehreren Stellen, besonders mit
  abweichender Formulierung (Gefahr künftiger Widersprüche).
- **Unklar:** Sätze, die zwei Lesarten zulassen, fehlende Zuständigkeit
  („wer macht das?“), Regeln ohne Ausnahme, wo es erkennbar eine gibt.
- **Lücken:** Abläufe aus Skripten oder Workflows, die nirgends
  beschrieben sind; Regeln, die in Cloud-Sessions technisch nicht gehen.

Bei Entscheidungen des Maintainers gilt die jüngere (Datum im Text).

## 2. Kennzahlen speichern (nur im normalen Lauf)

~/halo-aufgaben/doku-kennzahlen.json: ein Objekt, Schlüssel ist die
ISO-Woche („2026-W45“), Wert ein Objekt mit mindestens:
  dateien, zeilen (Objekt Datei → Zeilen), funde (Objekt Art → Anzahl, Arten
  wie in Abschnitt 1), behoben, vorschlaege, offen_aus_vorwoche.
Bestehende Wochen nicht überschreiben (außer der eigenen bei erneutem Lauf).
Im Bericht mit der Vorwoche vergleichen, wenn vorhanden.

## 3. Selbst beheben (nur im normalen Lauf)

Erlaubt ohne Rückfrage, nur in .md-Dateien:
- Fakten an den Stand des Repos angleichen: Pfade, Dateilisten,
  Abschnittsverweise, Zahlen, Befehle, Optionen, Zeiten – wenn der Code
  eindeutig zeigt, was gilt, und keine Entscheidung des Maintainers
  dagegen steht;
- Veraltetes streichen oder anpassen, wenn eine jüngere Entscheidung des
  Maintainers es eindeutig überholt;
- Doppeltes innerhalb einer Datei zusammenführen bzw. durch einen Verweis
  ersetzen, ohne die Bedeutung zu ändern;
- Unklares eindeutig formulieren, wenn aus dem übrigen Text klar ist, was
  gemeint ist; Tippfehler.
Höchstens zehn solche Korrekturen je Lauf; je Datei bzw. Bereich ein Commit
(Stil nach AGENTS.md, Bereich = Dateiname, z. B. „AGENTS.md: …“).

Nur als Vorschlag (Board-Eintrag, Typ Bug bei Widerspruch/Fehler, Feature
bei Verbesserung, Status „Wartet auf OK“, Titel „Doku: …“, mit Fundstellen
und Lösungsvorschlag): echte Widersprüche zwischen Regeln oder
Entscheidungen, alles, was eine Regel oder einen Ablauf inhaltlich ändert,
Code, der nicht zur Doku passt (dann ist offen, was gelten soll), größere
Umbauten (Abschnitte verschieben, Dateien zusammenlegen). Anlegen und Felder
setzen wie in tests/wochenpruefung-auftrag.md Abschnitt 3; vorher im Board
nachsehen, ob es den Vorschlag schon gibt (dann ergänzen). Vorschläge der
Vorwoche, die noch „Wartet auf OK“ sind, nicht neu anlegen.

Nie anfassen: Inhalt von Entscheidungen des Maintainers, die Freigaberegeln
und die Release-Sperre in AGENTS.md, die Versionshinweise im README.md,
store/*.md (gehen in den Store – nur Vorschläge), Skripte, Workflows und
sonstige Dateien außer .md. Keine Testläufe, kein Release, kein install.sh.
Inhalte der Aufgabenliste nie in Commits.

## 4. Pushen (nur im normalen Lauf)

Nur wenn eigene Commits entstanden sind und vor dem Lauf
git log origin/main..main leer war: git fetch origin, git rebase
origin/main, prüfen, dass git diff --name-only origin/main..main nur .md-
Dateien zeigt (dann startet keine CI), git push origin main. Sonst nicht
pushen (der nächste Nachtlauf nimmt die Commits mit) und das im Bericht sagen.

## 5. Bericht

Pfad oben, Deutsch, knapp, für einen Admin, der nicht programmiert. Erste
Zeile nach der Überschrift genau so:
  Kurz: <ein Satz: geprüfte Dateien, Funde, Anzahl Korrekturen und Vorschläge>
Diese Zeile geht als Push-Meldung aufs iPhone. Dann Abschnitte:
Zusammenfassung (Zustand der Doku in drei Sätzen), Kennzahlen (Tabelle mit
Vorwoche), Funde (je Fund: Datei:Zeile, Art, ein Satz), Geändert (Commit,
was und warum; im Trockenlauf „Würde ändern“), Vorschläge (je ein Satz
Nutzen, Board-ID falls angelegt), Offen aus Vorwochen, Probleme dieses Laufs.
Den Bericht immer schreiben.

Danach die Fertig-Datei (Pfad oben) anlegen. Keine eigene Push-Meldung
schicken, das macht das Skript.
