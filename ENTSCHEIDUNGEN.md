# ENTSCHEIDUNGEN.md

Wortlaute von Entscheidungen des Maintainers, die in `AGENTS.md` (und den
Dateien unter `docs/`) nur als Kurzfassung mit Datum stehen. Die Zitate stehen
hier **unverändert**; ein späterer Vermerk darf eine Entscheidung nur ändern
oder aufheben, wenn er ein neues Zitat des Maintainers mitbringt (Regel
„Entscheidungen des Maintainers wörtlich“ in `docs/board.md`, Pflichtteil in
`AGENTS.md`). Wird hier etwas ergänzt: Wortlaut, Datum, Herkunft, Bezug.
Die Datei wird bei Bedarf gelesen, nicht automatisch geladen.

## 7.11.2026

### Bildübergabe an neon-board: eigene Datei statt data:-URI
Herkunft: Cloud-Sitzung global.releases, 7.11.2026. Wortlaut (Auftrag): „ich möchte die automatische variante der bildübergabe an andere sessions wie neon-board, welche am wenigsten token verbraucht. wenn wir uns festgelegt haben welche variante das ist, soll diese regelung für alle sessions gelten“; Freigabe auf den Vorschlag der Sitzung: „ja, so umsetzen.“
Bezug: Messung von neon-board am selben Bild (576 x 826 px, 187 KB): Seite mit data:-URI lesen rund 60.000–70.000 Tokens (Schätzung), Bild als eigene Datei mit `Artifact` `action: "read"` und `path` rund 150 Tokens, Hash gleich. Umsetzung (Deutung der Sitzung): Kernzeilen in `AGENTS.md`, Einzelheiten `docs/board.md`, Pflichtbegriff im Wächter `tests/doku_kern_check.sh`.

### Behobene GitHub-Issues den Nutzern mitteilen
Herkunft: Sitzung „agents.md von Neon“ (Auftrag an neon über global.run), 7.11.2026. Anlass, Wortlaut: „wir müssen sicherstellen, dass wir auf github gefixte issues an die user kommunizieren“. Entscheidung, Wortlaut: „neon soll es direkt umsetzen“ (ohne „Wartet auf OK“).
Umsetzung (Deutung der Sitzung): Fix-Commits enden auf „(GitHub #n)“, Teil-Fixe auf „(GitHub #n, teilweise)“; `tests/issue-abgleich.sh` meldet offene Issues mit Fix und grüner CI an die GitHub-Routine (Antwort „behoben“), `publish.sh` schließt beim Release mit „Fixed in x.y.z“, die Wochenprüfung zählt Issues ohne Antwort (`docs/github-komm.md` „Status“).

### Rote CI-Läufe nicht mehr aufs iPhone
Herkunft: Sitzung in der Desktop-App (halo-spaces, Laptop), 7.11.2026. Wortlaut: „ich möchte die meldungen von roten CI läufen nicht mehr aufs iphone gepushed bekommen, bitte dementsprechend agents.md ändern und für diese session hier speichern.“
Bezug: AGENTS.md Tabelle „Aufbau“ (Zeile `tests/ci-waechter.sh`); Weiterleitungs-Sitzung leitet „PUSH: CI rot …“-Zeilen des CI-Wächters nicht mehr per PushNotification weiter. Der Eintrag ins Board bleibt. `tests/ci-waechter.sh` verschickt die Zeile seitdem gar nicht mehr (Nachtrag nach „Ja, abstellen“ in derselben Sitzung).

### Abgelehnte Antworten an Sitzungen: alternativen Weg suchen
Herkunft: über die Sitzung neon-board weitergegeben, vom Maintainer in der Sitzung neon am 7.11.2026 bestätigt („ja, so eintragen“). Wortlaut: „wenn antworten an session abgelehnt werden muss ab sofort automatisch eine alternative gesucht werden, solange, bis man eine lösung gefunden hat. sollte keine lösung gefunden werden sollte es eine rückmeldung geben“ und „das ist eine gültige regel für alle sessions“.
Bezug: AGENTS.md „neon erreichen“ (Absatz „Abgelehnte Antwort an eine Sitzung“); Anlass: `send_message` mit Sitzungs-ID wurde mit `elevated_session_untrusted_device` abgelehnt, `SendMessage` per Name aus `ListAgents` ging durch.
Ergänzung, Sitzung neon, 7.11.2026, Wortlaut: „wenn du anfragen anderer sessions ablehnst bitte sofort an die entsprechende session jegliche antwort als rückmeldung senden“ (nach „ja, bitte auch in AGENTS.md eintragen“).
Bestätigung, über global.run (Sitzung „agents.md von Neon“), 7.11.2026, Wortlaut: „ja hab ich angeordnet, damit sessions nicht anfragen an neon stellen und keinerlei antwort zurückkommt bei ablehnung“.

### Zeitangaben in Wiener Zeit
Herkunft: Sitzung „agents.md von Neon“ (halo-spaces, Cloud), 7.11.2026. Wortlaut: „können wir bitte ab sofort bei zeitangaben immer die wiener Zeit und nicht UTC nehmen? das soll für alle session gelten.“
Bezug: AGENTS.md „Konventionen“ (Zeile „Zeit“), ~/halo-board/CLAUDE.md (erzeugt von tests/mac-remote-control.sh), Prompt der geplanten Aufgabe halo-github-kommunikation. Wiener Zeit: im Winter MEZ (UTC+1), ab 28.3.2027 MESZ (UTC+2); Zeitstempel in Logs, Dateien und auf GitHub dürfen UTC bleiben, beim Berichten wird umgerechnet.

### Jeder Screenshot wird auf neon gespeichert
Herkunft: Sitzung global.features. Wortlaut: „bitte ab sofort alle an dich übermittelten screenshots direkt auf neon in den dafür vorgesehenen folder mit dem richtigen namen abspeichern damit dieser screenshot auch in zukunft gefunden werden kann“ – Zustimmung zum Eintragen als Entscheidung: „ja, bitte als Entscheidung eintragen.“
Bezug: gilt für jeden Screenshot, den der Maintainer einer Sitzung schickt, auch ohne Board-Eintrag (bisher nur Bilder für einen Bug oder ein Feature). Deutung der Sitzung (kein Wortlaut): „der dafür vorgesehene Folder“ ist `~/halo-aufgaben/bilder/`, bei Apple-Apps zusätzlich `~/halo-aufgaben/apple/`; „richtiger Name“ ist Bereich, Oberfläche, Besonderheit (z. B. `kalender-termin-zusammenfassung-ort`).

### Kalender-Test „Mehrwochen-Ansicht scrollen“: Grenze vier Bildwechsel
Herkunft: Sitzung „agents.md von Neon“ (halo-spaces, Cloud), 7.11.2026. Wortlaut: „ein Bild bis 4 Bildwechsel nehmen“.
Bezug: `tests/halo_test.py`, Prüfung „Kalender: Mehrwochen-Ansicht scrollen 3/6 – 25 Wochen am Stück flüssig“: größte Bildzeit höchstens 4 Bildwechsel statt `3*idle+4`. Messwerte vom 7.11. (13 Läufe, neon, macOS 27.2 seit 6.11.): größte Bildzeit v3.20.0 55,0–57,9 ms, main 54,5–59,1 ms, Median 16,7 ms, Ausreißer über zwei Bildwechsel 4–5 (erlaubt 6); kein Fehler in halo.spaces, auch ohne RustDesk-Verbindung gleich.

### Nachtlauf: Rotes selbst ins Board, eine Vollrunde je Nacht, Kennzahl „Tage seit grün“
Herkunft: Sitzung „agents.md von Neon“ (halo-spaces, Cloud) über global.run, 7.11.2026. Wortlaut: „neon soll beide Änderungen und die Kennzahl umsetzen. es gibt immer offene bugs oder features, es ist unrealistisch dass der nachtlauf daher nicht läuft.“
Bezug: `tests/ci-runde.zsh` (von `tests/nachtlauf.sh` nach Claudes Arbeit aufgerufen), `tests/ci-waechter.sh` (`--lauf`, Nachholen nach dem Nachtlauf), `tests/wochenpruefung.sh` (Kennzahl `tage_seit_gruener_vollrunde`), Test `tests/ci_runde_test.zsh`; AGENTS.md „Testrechner“ (Nachtlauf), `tests/MAC-MINI.md` Abschnitte 13–15. Deutung der Sitzung (kein Wortlaut, nach Vorgaben des Auftraggebers): „beide Änderungen“ = (1) der Nachtlauf trägt rote Prüfungen seiner CI-Läufe selbst ein (`Tests: CI rot – <Job>: <Prüfung>`, offener Eintrag wird ergänzt), (2) mindestens eine vollständige CI-Runde auf `main` je 24 Stunden – ohne CI-auslösenden Push startet der Nachtlauf selbst `ziel=alle` (nicht nach 04:30, nicht während seiner Testarbeit), mit Push kommt bei Bedarf `[dunkel]` in die Commit-Nachricht. Diese von Hand gestartete Runde ist die Ausnahme zur Regel „mac/windows gezielt nicht während des Nachtlaufs“ und zählt als vollständig. „Vollständig grün“: alle Testjobs (Linux Release/Beta/ESR, mac, windows; ohne windows-github) liefen und waren grün, dunkel nur, wenn die Runde dunkel testete.

### Nachtlauf räumt verwaiste Zweige `claude/…` auf
Herkunft: Sitzung „Aufgabenliste-Punkte überprüfen“, 7.11.2026, Antwort auf die Liste „Wartet auf OK“. Wortlaut: „1.) ja 2.) sonntags 3.) nein und den punkt archivieren 4.) freigeben“ – 1 = Board-Eintrag „Ablauf: Nachtlauf räumt verwaiste claude/-Zweige auf GitHub auf“ (freigegeben, mit dem Vorschlag darin: löschen nur bei Name `claude/…`, ohne eigene Commits über `origin/main` hinaus und ohne offenen Pull Request; danach die Regel „Änderungen direkt nach `main`“ anpassen: Cloud-Sitzungen lassen ihren Zweig stehen).
Umsetzung (Deutung der Sitzung neon, Stufe 4): nach Claudes Arbeit statt zu Beginn, damit es auch bei „übersprungen“ läuft; `zweige_aufraeumen` in `tests/nachtlauf.sh`, Probelauf mit `--trocken`.

### In derselben Nacht reparierte CI-Läufe gelten als erledigt
Herkunft: Sitzung „agents.md von Neon“ (halo-spaces, Cloud) über global.run, 7.11.2026. Wortlaut: „reparierte läufe sollen dann als erledigt gelten wenn sie in der selben nacht repariert werden“
Bezug: `ci_reparatur` in `tests/ci-runde.zsh`, aufgerufen von `rot()` in `tests/ci-waechter.sh` (Nachtlauf über `--lauf` und Nachholen nach dem Nachtlauf), Kennzahl `ci_flackert` in `tests/wochenpruefung.sh`, Test `tests/ci_runde_test.zsh`; AGENTS.md „Testrechner“ (Nachtlauf), `docs/testrechner.md`, `tests/MAC-MINI.md` Abschnitte 13–14. Deutung des Auftraggebers (kein Wortlaut): repariert = ein späterer vollständiger Lauf derselben Nacht (Nachtfenster des Wächters) auf `main` mit anderem Kopf-SHA zeigt dieselbe Prüfung im selben Job (hell/dunkel) grün; dann kein Eintrag, nur eine Zeile im Nachtlauf-Bericht, bzw. ein schon angelegter Eintrag mit Notiz auf Done und archiviert. Grün ohne Reparaturcommit (gleicher SHA) zählt nicht („flackert“, Eintrag mit Notiz, Wochenprüfung zählt sie); bleibt die Prüfung am Ende der Nacht rot, wird sie wie bisher eingetragen.

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
