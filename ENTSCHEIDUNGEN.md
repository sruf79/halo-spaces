# ENTSCHEIDUNGEN.md

Wortlaute von Entscheidungen des Maintainers, die in `AGENTS.md` (und den
Dateien unter `docs/`) nur als Kurzfassung mit Datum stehen. Die Zitate stehen
hier **unverändert**; ein späterer Vermerk darf eine Entscheidung nur ändern
oder aufheben, wenn er ein neues Zitat des Maintainers mitbringt (Regel
„Entscheidungen des Maintainers wörtlich“ in `docs/board.md`, Pflichtteil in
`AGENTS.md`). Wird hier etwas ergänzt: Wortlaut, Datum, Herkunft, Bezug.
Die Datei wird bei Bedarf gelesen, nicht automatisch geladen.

## 6.11.2026

### Zweite Board-Sitzung `neon-board`
Herkunft: Sitzung global.design.comparison. Wortlaut: „ja, zweite Board-Sitzung vorbereiten lassen. das bedeutet aber auch, dass wir aktuell alle vorhandenen workflows die nur auf neon zielen umbauen müssen“
Deutung der beauftragenden Sitzung (kein Wortlaut des Maintainers): „umbauen“ betrifft nur, was Sitzungen an neon schicken; Läufe, die lokal auf neon mit `gh` arbeiten (Nachtlauf, CI-Wächter, Wochen-/Doku-Prüfung, Rundgang, GitHub-Kommunikation), bleiben, wie sie sind.

### neon schlank halten
Wortlaut: „ja, setz schritt 1 und 2 um“ – Bezug: Vorschlag der Sitzung: neon verteilt Arbeit statt sie selbst im Kontext zu erledigen, und offene Aufträge stehen in einer Datei, die nach dem Verdichten wieder geladen wird.

### Modelle von neon: Routine mit Sonnet, Komplexes mit Opus, im Zweifel Opus
Herkunft: Cloud-Sitzung global.design.comparison. Wortlaut: „neon beauftragen, allerdings zusätzlich "im zweifel opus" eintragen.“ Bezug: der freigegebene Vorschlag der Cloud-Sitzung; ersetzt die frühere Regel „Unteragenten immer Sonnet“.

### Kein täglicher Neustart von neon, /clear von Hand
Herkunft: Cloud-Sitzung global.design.comparison. Wortlaut: „ja täglichen neustart nicht aktivieren. clear von hand.“ Bezug: Befund, dass `kickstart -k` dieselbe Sitzung mit vollem Verlauf fortsetzt (`--resume`, gleiche Sitzungs-ID); `claude remote-control` hat keine Option für eine frische Sitzung. Frühere Entscheidung (Vorschlag der Cloud-Sitzung „neon täglich neu starten, zum Beispiel nach dem Nachtlauf. Die offenen Aufträge stehen in neon-stand.md und werden beim Start wieder geladen“), Wortlaut des Maintainers dazu: „punkt 1 beauftragen.“ – ersetzt durch die Entscheidung oben.

### /bereit: ist neon frei für /clear?
Herkunft: Cloud-Sitzung global.design.comparison. Frage des Maintainers, Wortlaut: „kann ich irgendwie der neon session beibringen dass sie von alleine in neon-stand.md nachsieht wenn ich sie frage ob in der session etwas offen ist oder ich ein /clear laufen lassen kann?“ Die Umsetzung (Projekt-Befehl `.claude/commands/bereit.md`, Regel im Hook-Hinweis) ist die Deutung der Cloud-Sitzung.

### CI nur für Thunderbird
Herkunft: Sitzung neon. Wortlaut: „neue regelung: ab sofort benötigen änderungen an den .md files oder an den settings der sessions keinerlei CI lauf mehr. alle änderungen, die nichts mit thunderbird direkt zu tun haben, benötigen keinen ci lauf mehr“

### Claude nur bei Arbeit, kleineres Modell für Routinen
Herkunft: Sitzung global.design.comparison. Wortlaut: „ja, punkt 2 und 3 umsetzen.“
Ergänzung vom selben Tag zur Doku-Prüfung, Wortlaut: „nein die doku prüfung soll auch widersprüche sehen“ (Regeln dazu = Deutung der Sitzung global.design.comparison, `tests/MAC-MINI.md` Abschnitt 16).

### Zitate erst nach Zustimmung, Konzeptrunden ohne neon
Herkunft: Sitzung halo-spaces-72. Wortlaut: „ja das soll für alle session gelten da wir ansonsten permanent neon benachrichtigen und sich ständig sein context füllt. bei abfragen nach informationen darf jede session selbstständig neon befragen aber zitate von mir sollen erst nach meiner zustimmung an neon übermittelt werden“

### Empfänger `neon-board` für Board-Aufträge aus Cloud-Sitzungen
Die Entscheidung vom 4.11.2026 (Board aus der Cloud nur über neon) gilt seit 6.11.2026 mit Empfänger `neon-board` (siehe „Zweite Board-Sitzung“ oben, Wortlaut dort).

### AGENTS.md entschlacken und aufteilen
Herkunft: Sitzung „Agents.md Aufteilen und Token-Optimierung“. Wortlaut: „ich möchte danach so rasch wie möglich die optimierungen unserer abläufe und dateiänderungen bei agents.md einbringen“
Bezug: Board-Eintrag „Ablauf: AGENTS.md entschlacken, Entscheidungs-Wortlaute in ENTSCHEIDUNGEN.md“ (Stufenplan), Vorläufer-Wortlaute dort: „ja, als Ablauf-Eintrag für Sonntag anlegen.“ (global.design.comparison) und „ja, zusammenlegen und auf Wartet auf OK setzen“.

## 5.11.2026

### Bilder-Erinnerung
Wortlaut: „Erinnere mich jeden tag untertags (bei keinem nachtlauf) bei einem manuellen run an benötigte bilder die noch gebraucht werden“ – ersetzt durch die Korrektur desselben Abends: „Nein jede manuell gestartete sitzung zwischen 08:00 und 22:00 täglich“

## Entscheidungen mit Datum, deren Wortlaut nicht in AGENTS.md stand

Für diese Regeln nennt `AGENTS.md` nur „Entscheidung des Maintainers vom <Datum>“ (Wortlaut war nie eingetragen): 2.11.2026 (Release ohne Rückfrage), 3.11.2026 (Release-Sperre, GitHub-Kommunikation, Warten auf Bedingungen, Volllauf durch CI), 4.11.2026 (neon erreichen, Hotfix, Dunkelmodus nur bei Farben, Reihenfolge eines Laufs, Optionen, Windows-Vergleich, Änderungen direkt nach `main`, Nachtlauf-Mitnahme), 5.11.2026 (Fehlerkonsole, Formen, Nachtlauf nicht behindern, Rundgang, Wochenprüfung, Regeländerungen bündeln, Wer die Liste abarbeitet, Apple-Vorlagen, höchstens drei in Arbeit, Entscheidungen wörtlich), 6.11.2026 (Push-Sperre ab 00:00, Uhrzeit 00:00 statt 00:30). Neue Entscheidungen werden mit Wortlaut hier eingetragen.
