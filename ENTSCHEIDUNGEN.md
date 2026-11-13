# ENTSCHEIDUNGEN.md

Wortlaute von Entscheidungen des Maintainers, die in `AGENTS.md` (und den
Dateien unter `docs/`) nur als Kurzfassung mit Datum stehen. Die Zitate stehen
hier **unverändert**; ein späterer Vermerk darf eine Entscheidung nur ändern
oder aufheben, wenn er ein neues Zitat des Maintainers mitbringt (Regel
„Entscheidungen des Maintainers wörtlich“ in `docs/board.md`, Pflichtteil in
`AGENTS.md`). Wird hier etwas ergänzt: Wortlaut, Datum, Herkunft, Bezug.
Die Datei wird bei Bedarf gelesen, nicht automatisch geladen.

## 9.11.2026

### Wochenprüfung gibt Empfehlungen, setzt nach Zustimmung um
Herkunft: Sitzung project.analysis.control, 8.11.2026, am 9.11.2026 vom Maintainer in der Sitzung neon zur Übermittlung freigegeben. Wortlaut: „die wochenprüfung sollte sehr wohl laufen aber nach einer analyse empfehlungen geben und vorschläge welche nach meiner zustimmung umgesetzt werden. ziel ist es eine wiederkehrende routine zu bauen welche immer wieder den workflow analysiert und optimiert.“
Vermerk: ersetzt die Entscheidung vom 5.11.2026 („Wochenprüfung verbessert die Abläufe selbst“); beide Wortlaute stehen in dieser Datei.
Bezug: `tests/wochenpruefung-auftrag.md` (Abschnitt 3b), `docs/testrechner.md` „Wochenprüfung“.

### Bilder mit echten Mails dürfen lokal auf neon automatisch beschrieben werden
Herkunft: Sitzung project.analysis.control, 9.11.2026; der Maintainer hat der Übermittlung in der Sitzung neon am 9.11.2026 direkt zugestimmt („ja, den Eintrag so in ENTSCHEIDUNGEN.md“).
Wortlaut: „solange die bilder nur lokal bei neon gespeichert bleiben und nicht auf github oder ins internet veröffentlicht werden ist das okay für mich“
Thema: Bilder mit echten Mails dürfen automatisch beschrieben werden, solange sie nur lokal auf neon bleiben (Angabe der Sitzung project.analysis.control).

### Symbolleisten-Überlauf wie Apple: Suchfeld zuerst, Pillen nie abschneiden
Herkunft: Sitzung project.analysis.control, 9.11.2026; der Maintainer hat der wörtlichen Übermittlung zugestimmt („ja“, laut Nachricht der Sitzung an neon).
Wortlaut 1 (Beschreibung): „bei apple mail werden pillen bei platzmangel niemals abgeschnitten sondern die pille als ganzes ausgeblendet. bei ausgeblendeten pillen wird direkt neben dem suchfeld links davon ein button mit einem chevron eingeblendet (screenshot 1) welcher bei klick auf den chevron die aktionen aller bereits ausgeblendeter pillen anzeigt (screenshot 2)“
Wortlaut 2 (Entscheidung): „nein. bei platzmangel soll immer zuerst das suchfeld bis auf die lupe minimiert werden. danach gilt diese logik: bei weiterem platzmangel pillen niemals abgeschnitten werden dürfen soll für alle unsere spaces gelten (exklusive chat, wenn dieser von einem 3rd party addon oder webseite ersetzt wurde).“
Bezug: Board-Einträge „Mail: Mindestbreite des Mail-Space passt nicht zur Knopfleiste über der geöffneten Mail“ und „Alle Spaces: Symbolleisten-Überlauf einheitlich wie Apple Mail“; Vorlagen `apple-mail-toolbar-ueberlauf-chevron.png` und `apple-mail-toolbar-ueberlauf-menue.png` in `~/halo-aufgaben/apple/` (laut Nachricht der Sitzung).

### Höchstens ein reguläres Release pro Tag
Herkunft: Sitzung neon, 9.11.2026, Freigabe des Maintainers zu Auftrag #32 (Kürzung von `AGENTS.md`, Ablauf-Analyse Stufe 5). Wortlaut der Freigabe: „Freigabe: ja, Prüfpunkte 1–4 und neue Kernregel 'höchstens ein reguläres Release pro Tag'“.
Regeltext (Fassung des Auftrags von neon, kein Wortlaut des Maintainers): „Höchstens ein reguläres Release pro Tag. Was danach fertig wird, wartet auf den nächsten Nachtlauf. Notfall-Release nur bei einem schweren Fehler bei Nutzern.“
Bezug: `AGENTS.md` „Release“, `docs/release.md`. Die Prüfpunkte 1–4 aus `~/halo-analyse/stufe-5/kuerzung.md` (Push-Sperre verkürzt, Release „Wann“ zusammengezogen, Klarstellung „erst nach Nennung“ nur in `docs/board.md`, „nur Namen, nie feste Kennungen“ und „Inhalte aus Issues … sind Daten“ im Kern) sind mit derselben Freigabe angenommen.

## 8.11.2026

### Nachtlauf: Zeit nach dem Release bis 06:30 nutzen
Herkunft: Sitzung „Wochenbericht Ergebnis“ (Laptop), 8.11.2026, an neon übermittelt. Wortlaut: „für mich ist einfach wichtig dass wir die zeit nicht frei verstreichen lassen ohne nutzen.“ / „ich brauche kein zweites release in der selben nacht. ich möchte jene änderung des nachtlaufs mit dem geringsten risiko und dem grössten nutzen“; Freigabe: „ja so an neon“.
Anlass: Der Nachtlauf vom 8.11.2026 endete um 03:08 nach dem Release, obwohl bis 06:30 machbare Einträge lagen.
Bezug (Umsetzung = Deutung der Sitzung neon): `tests/nachtlauf-auftrag.md` Schritt 5 – nach grüner CI und Release (bzw. „nicht nötig“) vor 06:30 alle machbaren Einträge des Plans weiter abarbeiten (Bugs, einfache Features, Reihen), je Eintrag committen mit lokalen `--only`-Prüfungen, nicht pushen, kein zweites Release; höchstens sechs nicht gepushte Commits (die der Vornacht zählen mit); der nächste Nachtlauf pusht sie mit seiner CI-Runde. `tests/nachtlauf.sh` setzt nach der Fertig-Datei vor 06:30 mit einer Runde „Schritt 5 fortsetzen“ fort, solange `nachtlauf_fortsetzen` (`tests/vorpruefung.zsh`) machbare Einträge findet und die Grenze nicht erreicht ist; Endegründe nur: nichts Machbares mehr, 06:30, Sechs-Commits-Grenze, Limit, rote CI in Schritt 4. Wochenprüfung: zusätzlich `ungenutzt_bis_0630_min`.

## 7.11.2026

### Fenster-Menü (Mac): doppelter Eintrag bleibt
Herkunft: Sitzung neon (halo-spaces, Desktop), 7.11.2026, im Gespräch mit dem Maintainer. Wortlaut: „doppelten Eintrag lassen“.
Bezug: Board-Bug „Fenster-Menü (Mac): aktiver Bereich doppelt, stattdessen Häkchen“. Der Eintrag unten im Menü Fenster ist die Fensterliste von macOS (Titel des Hauptfensters = Name des Bereichs); der Fenstertitel wird nicht geändert, das Häkchen am aktiven Bereich (bfcbe89) genügt. (Deutung der Sitzung: Erklärung der Gründe für Bereiche im Fenster-Menü vorher im Gespräch.)

### Bilder-Eingang und Ordner für Bilder und Vorlagen
Herkunft: Sitzung „Apple Mail/Kalender Screenshots für halo.spaces“, 7.11.2026 (an neon übermittelt). Wortlaut der Freigabe: „ich gebe die änderungen frei“; zum dortigen Vorgehen (#26) ebenfalls: „ja so vorgehen bitte“.
Bezug: `halobild` legt in `~/halo-aufgaben/eingang/` ab, `tests/bilder-eingang.zsh` sortiert alle 15 Minuten ohne Claude nach `bilder/` bzw. `apple/` ein und indiziert (Claude nur zum Beschreiben); Absatz „Bilder und Vorlagen“ in `AGENTS.md`, Einzelheiten `docs/board.md` und `tests/MAC-MINI.md` Abschnitte 10 und 18; Kurzübersicht der Indizes im SessionStart-Hook `tests/neon-hook.sh`. Umsetzung (Deutung der Sitzung neon): Schwelle „Bild unzureichend“, Sitzungssperre und Wartezeiten.

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

## Regeltexte aus AGENTS.md zu Entscheidungen ohne eingetragenen Wortlaut

Übernommen am 9.11.2026 vor der Kürzung von `AGENTS.md` (Ablauf-Analyse Stufe 5). **Kein Wortlaut des
Maintainers**, sondern der Regeltext, der bis dahin in `AGENTS.md` stand, unverändert kopiert, damit zu
jeder dort genannten „Entscheidung des Maintainers vom …“ hier ein Text steht. Derselbe Text steht
vollständig auch in `docs/` (Abschnitte „Vollständiger Wortlaut aus `AGENTS.md`“).

### 2.11.2026 und 5.11.2026: Release: Wann (ohne Rückfrage; Nachtlauf veröffentlicht; tagsüber nur Spürbares)
Quelle: `AGENTS.md` „Release“ (Stand 9.11.2026, Zeilen 347–365), wörtlich:

> **Wann:** Jede Sitzung darf ohne Rückfrage veröffentlichen – auch
> unbeaufsichtigt nachts (Entscheidung des Maintainers vom 2.11.2026: schlechte
> Releases werden mit einem neuen Update nach vorn korrigiert, Thunderbird stuft
> nicht zurück). Sie entscheidet selbst, ob ihre Änderungen groß genug für ein
> eigenes Release sind (z. B. ein Bug, den Nutzer spüren, oder eine neue
> Funktion). Wenn nicht, bleibt es beim Commit: Der nächste Nachtlauf
> veröffentlicht alle noch nicht veröffentlichten Bugs und Features
> automatisch, sobald die CI dazu grün ist (Entscheidung des Maintainers vom
> 5.11.2026). Tagsüber (außerhalb des Nachtlaufs) veröffentlicht eine
> Sitzung nur, was Nutzer gerade spüren (Fix für einen gemeldeten oder
> spürbaren Bug); alles andere geht ins Release des Nachtlaufs (Entscheidung
> des Maintainers vom 5.11.2026). Ablauf: Versionshinweise im `README.md` schreiben (eigener
> Commit „README: Versionshinweise x.y.z“), Notizen für den GitHub-Release als
> Datei (englisch, gleicher Inhalt), `./release.sh x.y.z`, bei grünen Tests
> direkt `./publish.sh x.y.z notes.md`. Version: Patch für Korrekturen, Minor
> für neue Funktionen. Kleine Einzelkorrekturen (Abstände, Farben, Tests)
> lohnen meist kein eigenes Release. `release.sh` und `publish.sh` laufen
> **nur auf neon**, nie auf dem Laptop oder in Cloud-Sessions – die
> beauftragen dafür neon (nach dem Push).

### 3.11.2026: Warten auf Bedingungen statt auf feste Zeiten
Quelle: `AGENTS.md` „Bauen und testen“ (Stand 9.11.2026, Zeilen 166–175), wörtlich:

> - **Warten auf Bedingungen statt auf feste Zeiten** (Entscheidung des
>   Maintainers vom 3.11.2026): neue Prüfungen nutzen die Hilfen aus `PRELUDE`
>   – `bis(() => …, "was", ms)` für ein Fertig-Zeichen (Element da, Termine
>   geladen, Mail dargestellt, Fenster offen; bricht bei Zeitüberschreitung mit
>   Meldung ab), `ruhig(ms)` nach einer Bedienung (wartet auf Leerlauf, höchstens
>   `ms`), `stabil(fn)` für „Position steht still“. Feste Pausen (`wait`) nur,
>   wo bewusst Zeit vergehen soll (Doppelklick-Abstand, „bleibt offen“,
>   Animationsbilder) – mit Kommentar. Bei Prüfungen auf Abwesenheit („keine
>   Linie“) zuerst auf die fertig aufgebaute Ansicht warten. Am Ende eines Laufs
>   stehen Gesamtdauer und die langsamsten Prüfungen.

### 3.11.2026: Aufgabenliste nur zu Beginn eines Laufs
Quelle: `AGENTS.md` „Testrechner (Mac mini)“ (Stand 9.11.2026, Zeilen 321–323), wörtlich:

> - **Aufgabenliste nur zu Beginn eines Laufs** abrufen und daraus den Plan
>   machen; vor Push, CI und Release das Board nicht erneut laden (Entscheidung
>   des Maintainers vom 3.11.2026).

### 4.11.2026, geändert 9.11.2026: Windows-Vergleich (Job `windows-github`)
Alter Wortlaut (4.11.2026, Regeltext aus `.github/workflows/test.yml`, kein Zitat des Maintainers eingetragen): „Windows auf einem Rechner von GitHub (Entscheidung des Maintainers vom 4.11.2026): läuft gleichzeitig mit mac und belegt neon nicht. Vorerst neben dem Job windows in der VM zum Vergleich; ist er zwei bis drei Läufe gleich zuverlässig, ersetzt er ihn.“

Geändert am 9.11.2026 (Sitzung project.analysis.control, Ablauf-Analyse Stufe 2), Zitat des Maintainers: „deine empfehlungen durchführen“. Empfehlung war: `windows-github` abschalten, nur von Hand lauffähig (0 von 34 gelaufenen Läufen grün, Stand 9.11.2026). Der Job läuft seitdem nur noch bei `workflow_dispatch`, nie bei Push; der alte Wortlaut bleibt stehen.

### 4.11.2026: neon erreichen
Quelle: `AGENTS.md` „neon erreichen“ (Stand 9.11.2026, Zeilen 182–187), wörtlich:

> Jede Sitzung, egal in welcher Umgebung (Cloud, Desktop-App, CLI auf dem
> Laptop, iPhone, Cowork, Claude Tag/Slack, geplante Aufgaben, Unteragenten
> über ihre Hauptsitzung), kann der dauerhaften Sitzung **`neon`** auf dem
> Mac mini Aufträge geben (Entscheidung des Maintainers vom 4.11.2026). Alles,
> was den Mac braucht – Testläufe, Screenshots, Release –, geht so an neon;
> Board und Bilder an `neon-board` (unten). Reihenfolge, bis einer klappt:

### 4.11.2026: Hotfix
Quelle: `AGENTS.md` „Release“ (Stand 9.11.2026, Zeilen 377–381), wörtlich:

> **Hotfix** (Entscheidung des Maintainers vom 4.11.2026): nur auf seine
> ausdrückliche Anweisung und nur für dringende Korrekturen ohne Änderung am
> Aussehen `HOTFIX="<Muster der betroffenen Prüfungen>" ./release.sh x.y.z` –
> testet nur diese Prüfungen (hell), die Marke vermerkt „Hotfix“; die CI zum
> Push testet danach vollständig, Rot wird nach vorn korrigiert.

### 4.11.2026: Optionen nur in sehr seltenen Fällen
Quelle: `AGENTS.md` „Konventionen“ (Stand 9.11.2026, Zeilen 406–410), wörtlich:

> - **Optionen nur in sehr seltenen Fällen:** halo.spaces ist ein Design, kein
>   Baukasten. Eine Einstellung gibt es grundsätzlich nur dort, wo auch die
>   Apple-App eine anbietet; Wünsche nach „Thunderbird wie vorher“ (originale
>   Menüleiste, Tabs) werden abgelehnt – der Weg dorthin ist das Entfernen
>   von halo.spaces (Entscheidung des Maintainers vom 4.11.2026).

### 4.11.2026 und 5.11.2026: Reihenfolge eines Laufs
Quelle: `AGENTS.md` „Aufgabenliste“ (Stand 9.11.2026, Zeilen 450–457), wörtlich:

> - **Reihenfolge eines Laufs** (Entscheidung des Maintainers vom 4.11.2026,
>   abends; gilt für jede Sitzung, die die Liste abarbeitet, 5.11.2026):
>   1. neue bzw. nicht gepushte Commits durchsehen (Regeln dieser
>   Datei, offensichtliche Fehler), 2. erst dann die Aufgabenliste laden und
>   offene GitHub-Issues/Pull Requests prüfen (siehe „GitHub-Issues und Pull Requests von Nutzern“, `docs/github-komm.md`), 3. Bugs,
>   4. einfache Features, 5. zuletzt Reihen (n/m) – Einzelheiten unter
>   „Reihenfolge beim Abarbeiten“ (der Nachtlauf-Auftrag wiederholt sie für
>   den Lauf; bei Änderungen beide Stellen anpassen).

### 4.11.2026: Board aus Cloud-Sessions nur über neon (seit 6.11.2026 neon-board)
Quelle: `AGENTS.md` „Cloud-Sessions“ (Stand 9.11.2026, Zeilen 553–558), wörtlich:

> In Cloud-Sessions geht `gh project …` nicht (GraphQL gesperrt): **Alles am Board – lesen, neu anlegen,
> ergänzen, Status ändern, archivieren – geht aus Cloud-Sessions immer über die Sitzung `neon-board`,
> ersatzweise `neon`** (Entscheidung des Maintainers vom 4.11.2026, Wortlaut in `ENTSCHEIDUNGEN.md`,
> Weg: „neon erreichen“). Im Auftrag nennen, was anzulegen oder zu ändern ist und was zurückgemeldet
> werden soll; bis zur Antwort nichts als erledigt melden. Entscheidungen des Maintainers mit Wortlaut
> und Herkunft schicken. Notweg ohne neon-board und neon und Einzelheiten: `docs/board.md`.

### 4.11.2026 und 7.11.2026: Änderungen direkt nach main
Quelle: `AGENTS.md` „Cloud-Sessions“ (Stand 9.11.2026, Zeilen 566–574), wörtlich:

> **Änderungen direkt nach `main`** (Entscheidung des Maintainers vom
> 4.11.2026): Cloud-Sessions arbeiten auf ihrem zugewiesenen Zweig, bringen
> fertige Arbeit aber ohne Rückfrage selbst nach `main` – kein Pull Request,
> kein Merge durch den Maintainer. Ablauf am Ende eines Arbeitsblocks:
> `git fetch origin main`, auf `origin/main` rebasen, `git push origin
> HEAD:main`; den eigenen Zweig `claude/…` stehen lassen – der Nachtlauf
> löscht Zweige `claude/…` ohne eigene Commits über `main` hinaus und ohne
> offenen Pull Request (Entscheidung des Maintainers vom 7.11.2026, ersetzt
> das Löschen durch die Sitzung vom 5.11.2026). Dabei:

### 5.11.2026: Fehlerkonsole und Fehlerprotokoll
Quelle: `AGENTS.md` „Bauen und testen“ (Stand 9.11.2026, Zeilen 142–165), wörtlich:

> - **Fehlerkonsole** (Entscheidung des Maintainers vom 5.11.2026): Konsolenfehler
>   halten kein Release auf, wenn die Prüfungen grün sind. `halo_test.py`
>   schreibt die Fehlerkonsole ab dem Start des Laufs mit (ihr Puffer hält nur
>   250 Meldungen) und merkt sich zu jeder Meldung die laufende Prüfung. Am
>   Ende steht je Fehler aus halo.spaces (bzw. Thunderbird-Meldung, die auf
>   einen Eingriff von uns deutet, z. B. GitHub #38) eine Zeile `KONSOLE  …`;
>   die Prüfung „Fehlerkonsole …“ bleibt dabei OK (nur Warnung), auch mit
>   `--only` (dann nur für die gelaufenen Prüfungen). `update_test.py` meldet
>   ebenso nach dem Start der neuen Version. Der CI-Wächter trägt jede Zeile
>   als Bug „Tests: Fehlerkonsole – …“ ins Board, und dieser wird wie jeder Bug
>   abgearbeitet. Löst eine Prüfung absichtlich einen Fehler in halo.spaces
>   aus (kein Netz, kaputte Daten, ersetzte Funktion), meldet sie ihn mit
>   `erwartet(/Muster/)` an (gilt nur für diese Prüfung). Die Prüfung nicht zu
>   einem Fehlschlag machen und keine Liste „bekannter“ Fehler anlegen.
>   Ebenso das Fehlerprotokoll der Erweiterung (`mail-cards-debug.log`, Fehler,
>   die unser Code selbst abfängt): Prüfung „Fehlerprotokoll …“ nur Warnung, je
>   Meldung eine Zeile `PROTOKOLL  …`, Bug „Tests: Fehlerprotokoll – …“.
>   Meldungen werden ohne wechselnde Teile (Profil, Temp-Pfade, Kennung der
>   Erweiterung) verglichen; Zeilen aus dem Update-Test trägt `release.sh` über
>   `ci-waechter.sh --datei` ein. Solche Bugs erst auf Done, wenn der CI-Lauf
>   zum Fix mit denselben Jobs (bei „dunkel“ auch dunkel) die Meldung nicht
>   mehr nennt (`ci-warten.sh`) – grüne CI allein beweist es nicht.
>   Die Wochenprüfung (sonntags) prüft diesen Ablauf an den Zahlen der Woche
>   und sieht sich den Code nur an, wenn er sich geändert hat.

### 5.11.2026 und 6.11.2026: Den Nachtlauf nicht behindern (ab 00:00 kein Push mit Codeänderung)
Quelle: `AGENTS.md` „Testrechner (Mac mini)“ (Stand 9.11.2026, Zeilen 302–310), wörtlich:

> - **Den Nachtlauf nicht behindern** (Entscheidung des
>   Maintainers vom 5.11.2026): Jede von Hand gestartete Sitzung – neon, Cloud, Laptop,
>   Desktop-App – plant ihre Arbeit so, dass um 01:30 nichts mehr läuft, was
>   den Nachtlauf auslassen lässt: ab 00:00 keinen
>   Push mit Codeänderung mehr (die CI dazu muss bis 01:30 durch sein; eine
>   Runde mit Dunkelmodus dauert gut 70 Minuten), keine
>   Testläufe auf neon, die über 01:30 hinausgehen, und keine Runde, die um
>   01:30 noch arbeitet – rechtzeitig abschließen bzw. die Antwort geben und
>   warten.

### 6.11.2026: Push-Sperre 01:30–09:00
Quelle: `AGENTS.md` „Testrechner (Mac mini)“ (Stand 9.11.2026, Zeilen 311–317), wörtlich:

> - **Push-Sperre 01:30–09:00** (Wiener Zeit) für alle Sitzungen außer dem
>   Nachtlauf selbst (und der Wochen- bzw. Doku-Prüfung, die erst nach dem
>   Nachtlauf pushen): Der Nachtlauf wartet auf die CI genau seines Commits;
>   ein weiterer Push verlängert die Wartezeit auf dem einen Runner um eine
>   ganze Runde. Früher nur, wenn neon bestätigt, dass
>   der Nachtlauf fertig ist (Bericht `~/halo-berichte/<datum>-nachtlauf.md`
>   liegt vor); sonst bis danach warten bzw. es dem Maintainer sagen.

### 5.11.2026: Formen (Kapsel, Suchfelder ohne Hover)
Quelle: `AGENTS.md` „Konventionen“ (Stand 9.11.2026, Zeilen 419–428), wörtlich:

> - **CSS:** eigene Variablen mit Präfix `--mt-` (Farben, Radien, `--mt-hairline`),
>   Werte für Hell und Dunkel; Akzent über `AccentColor` vom System. Keine
>   sichtbaren Scrollbalken. Maße und Abstände orientieren sich an Apple Mail.
>   Formen (Entscheidung des Maintainers vom 5.11.2026): Knöpfe und
>   Suchfelder als Kapsel wie bei Apple; übrige Eingabefelder mit kleinem
>   Radius und Haarlinie. Suchfelder haben keinen Hover-Zustand: Weder
>   das Feld noch die Lupe ändert beim Überfahren Farbe oder Form, die
>   Lupe bekommt keine eigene Fläche bzw. Umrandung innerhalb der Kapsel
>   (anders als Symbol-Knöpfe in Kapseln); erst der Fokus (Klick ins
>   Feld) zeigt den blauen Fokusring.

### 5.11.2026: Wer die Liste abarbeitet
Quelle: `AGENTS.md` „Aufgabenliste“ (Stand 9.11.2026, Zeilen 458–464), wörtlich:

> - **Wer die Liste abarbeitet** (Entscheidung des Maintainers vom 5.11.2026):
>   Der Nachtlauf immer von sich aus. Jede andere Sitzung nur, wenn der
>   Maintainer sie dazu auffordert (ganze Liste oder einzelne Einträge) – dann
>   in der Reihenfolge oben, ohne weitere Rückfrage je Eintrag. Tagsüber dürfen
>   so Bugs und Features umgesetzt werden: je Eintrag committen, gepusht wird
>   gesammelt am Ende eines Arbeitsblocks (siehe „Testrechner“), veröffentlicht
>   nur Dringendes (siehe „Release“) – Entscheidung des Maintainers vom 5.11.2026.

### 5.11.2026: Regeländerungen wöchentlich bündeln
Quelle: `AGENTS.md` „Aufgabenliste“ (Stand 9.11.2026, Zeilen 465–471), wörtlich:

> - **Regeländerungen wöchentlich bündeln** (Entscheidung des Maintainers vom
>   5.11.2026): Ideen für Abläufe und Regeln dieser Datei sammelt jede Sitzung
>   als Eintrag „Ablauf: …“ mit Status „Wartet auf OK“, statt sie gleich
>   umzusetzen. Der Maintainer entscheidet sonntags mit der Wochenprüfung; die
>   freigegebenen werden dann in einem Commit übernommen. Ausnahme: Sicherheit
>   und Datenschutz (sofort). Eine Entscheidung, die der Maintainer im Gespräch
>   ausdrücklich trifft, gilt wie bisher gleich.

### 5.11.2026: Reihenfolge beim Abarbeiten (Klarstellung zu „erst nach Nennung“)
Quelle: `AGENTS.md` „Aufgabenliste“ (Stand 9.11.2026, Zeilen 472–484), wörtlich:

> - **Reihenfolge beim Abarbeiten:** zuerst alle offenen Einträge nach Bereich
>   (Titelpräfix) gruppieren und auf Zusammenhänge prüfen – Doppelte
>   zusammenlegen; Bugs, die ein Feature ohnehin behebt, an dieses Feature
>   hängen (Notiz in beiden Einträgen). Dann **erst alle Bugs,
>   danach einfache Features, zuletzt Reihen** (Bugs fixen ist in jedem Lauf
>   wichtiger als neue Features): jeweils Bereich für Bereich, kleine vor
>   großen; die nächste Stufe erst, wenn in der vorigen nichts Machbares übrig
>   ist; von Reihen n/m nur der nächste Schritt – steht er auf Todo und der
>   vorige ist Done, ohne weitere Nennung durch den Maintainer (nur „Wartet auf
>   OK“ hält an; Klarstellung vom 5.11.2026, ältere Eintragstexte mit „erst
>   nach Nennung“ gelten nicht mehr). Ausnahme: Ein Feature, das
>   einen Bug vermutlich mitbehebt, wird zusammen mit ihm erledigt.
>   Zusammenhänge und Zusammenlegungen im Gespräch bzw. Bericht nennen.

### 5.11.2026: Höchstens drei Einträge in Arbeit je Sitzung
Quelle: `AGENTS.md` „Aufgabenliste“ (Stand 9.11.2026, Zeilen 517–522), wörtlich:

> - **Höchstens drei Einträge in Arbeit je Sitzung** (Entscheidung des
>   Maintainers vom 5.11.2026): gleichzeitig In Progress, an denen gerade
>   gearbeitet wird; Einträge mit Notiz „committet, wartet auf Push/CI“ zählen
>   nicht mit. Am Ende eines Laufs bzw. einer Sitzung geht, woran nicht mehr
>   gearbeitet wird und was nicht committet ist, mit Notiz zum Stand zurück
>   auf Todo.

### 5.11.2026: Entscheidungen des Maintainers wörtlich
Quelle: `AGENTS.md` „Aufgabenliste“ (Stand 9.11.2026, Zeilen 523–534), wörtlich:

> - **Entscheidungen des Maintainers wörtlich** (Entscheidung des
>   Maintainers vom 5.11.2026, gilt sofort; der Wortlaut jeder Entscheidung
>   steht in `ENTSCHEIDUNGEN.md`, neue Entscheidungen dort eintragen): Jede Sitzung schickt eine
>   Entscheidung des Maintainers – nach seiner Zustimmung (siehe nächster
>   Punkt) – an `neon-board` (ersatzweise `neon`) bzw. trägt sie selbst ein –
>   mit seinem Wortlaut als Zitat und der Herkunft (Sitzung/Titel, Datum),
>   keine Umschreibung. Board-Notizen zu Entscheidungen enthalten dieses Zitat
>   unverändert. Ein späterer Vermerk darf eine Entscheidung nur ändern oder
>   aufheben, wenn er ein neues Zitat des Maintainers mitbringt; sonst
>   Rückfrage beim Maintainer. Wer Stände aus dem Board weitergibt (an
>   Sitzungen oder den Maintainer), zitiert die Notiz statt sie
>   zusammenzufassen; eigene Deutungen als solche kennzeichnen.

### 8.11.2026: Nicht Eiliges nimmt der Nachtlauf mit; Reste auf rest/<datum> (Ablauf-Analyse, Stufe 1)
Quelle: `AGENTS.md` „Testrechner (Mac mini)“ (Stand 9.11.2026, Zeilen 297–301), wörtlich:

> - **Nicht Eiliges nimmt der Nachtlauf mit:** Sitzungen auf neon außerhalb des Nachtlaufs committen
>   Fertiges, das nicht sofort auf GitHub muss, auf `main` in `~/halo-spaces` und pushen nicht; sofort
>   pushen nur, wenn etwas davon abhängt (Release, Fix für Nutzer). Ungespeicherte Änderungen anderer
>   Sitzungen legt der Nachtlauf immer auf einen Zweig `rest/<datum>`, nie auf `main` und nie in ein
>   Release (geändert 8.11.2026, Ablauf-Analyse, Stufe 1) – wer fertig ist, committet also selbst.

## Entscheidungen mit Datum, deren Wortlaut nicht in AGENTS.md stand

Für diese Regeln nennt `AGENTS.md` nur „Entscheidung des Maintainers vom <Datum>“ (Wortlaut war nie eingetragen): 2.11.2026 (Release ohne Rückfrage), 3.11.2026 (Release-Sperre, GitHub-Kommunikation, Warten auf Bedingungen, Volllauf durch CI), 4.11.2026 (neon erreichen, Hotfix, Dunkelmodus nur bei Farben, Reihenfolge eines Laufs, Optionen, Windows-Vergleich, Änderungen direkt nach `main`, Nachtlauf-Mitnahme), 5.11.2026 (Fehlerkonsole, Formen, Nachtlauf nicht behindern, Rundgang, Wochenprüfung, Regeländerungen bündeln, Wer die Liste abarbeitet, Apple-Vorlagen, höchstens drei in Arbeit, Entscheidungen wörtlich), 6.11.2026 (Push-Sperre ab 00:00, Uhrzeit 00:00 statt 00:30). Neue Entscheidungen werden mit Wortlaut hier eingetragen. Die damaligen Regeltexte stehen oben unter „Regeltexte aus AGENTS.md zu Entscheidungen ohne eingetragenen Wortlaut“.

### 9.11.2026: Jede Sitzung darf Wochen- und 5-Stunden-Kontingent selbst auslesen (Maintainer in neon)
Wortlaut des Maintainers, Sitzung neon, 9.11.2026: „jede session darf darf das aktuelle wochenkontingent und das 5-hour-limit auslesen“. Umsetzung: `tests/kontingent.sh`, Regel in `AGENTS.md` (Testrechner) und `docs/testrechner.md`.

### 9.11.2026: Kontroverse Issues nicht ins Board, Einschätzung im Stand und im Push (Maintainer in neon)
Wortlaut des Maintainers, Sitzung neon, 9.11.2026: „Bei Kontroversen neue Issues nicht ins Board, stattdessen Einschätzung im Stand unter ‚wartet auf Entscheidung‘ und im Push“. Ergänzt die Regel vom 9.11.2026 (Wünsche von Nutzern erst nach Einschätzung und OK ins Board, Commit e1c5a56); Umsetzung in `docs/github-komm.md`.

### 9.11.2026: PRs automatisch nach Release schließen (Freigabeliste) (Maintainer in neon)
Wortlaut des Maintainers, Sitzung neon, 9.11.2026: „ich möchte eine sichere variante um automatisch PRs zu schliessen wenn der entsprechend vermerkte bug/feature erledigt wurde und das entsprechende release veröffentlicht“. Umsetzung (Variante mit Freigabeliste): `tests/pr-freigaben.txt` (nur Einträge mit Zitat des Maintainers), `tests/pr-schliessen.sh` aus `publish.sh` nach dem Release; die GitHub-Routinen schließen nie, kein Merge. Regel in `AGENTS.md`, `docs/github-komm.md`, `docs/release.md`.

### 10.11.2026: Von Nutzern gemeldete Bugs dürfen immer auf die Liste (Maintainer in neon)
Wortlaut des Maintainers, Sitzung neon, 10.11.2026: zuerst „ja von uns bestätigte bugs dürfen immer auf die liste“, dann die Korrektur: „von usern gemeldete bugs dürfen immer auf die liste.“ Es gilt die Korrektur. Auf Anfrage von neon-board, das den Satz vom 9.11.2026 (github.comm.routine, ca. 19:50) „bugs dürfen immer auf die liste, features nur nach absprache mit mir“ weitergab. Gilt als Ausnahme zur Regel vom 9.11.2026: von Nutzern gemeldete Bugs kommen sofort als Entwurf (Todo) ins Board; Features und Wünsche weiter nur nach Absprache. Eingetragen in `AGENTS.md`, `docs/board.md`, `docs/github-komm.md`.

### 10.11.2026: Aufgaben, Knöpfe der gewählten Aufgabe stehen oben in der Toolbar-Zeile (Maintainer in neon)
Wortlaut des Maintainers, Sitzung neon, 10.11.2026 (nach Vorschaubild mit Variante A „über der Aufgabe in der Detailspalte“ und Variante B „oben in der Toolbar-Zeile zwischen ‚+‘ und Suchfeld“): „die anordnung aus bild b ist die korrekte“. Es gilt Variante B (Commit 70e6f3a); sie ersetzt die Anordnung „Knöpfe über der Aufgabe“ aus der Detailansicht 5a/5d (Commit 6c705a0).

### 11.11.2026: Hilfe-Menü bleibt wie heute; Favoriten der Ordnerliste bündig (Variante A) (Maintainer, Leitstelle)
Wortlaut des Maintainers, Leitstelle (Sitzung project.analysis.control), 11.11.2026, nach Ansicht der Entscheidungsbilder von neon (Variante A/B je Thema): „bezüglich hilfe-menü - option a. bezüglich favoriten - option a“. Weitergabe durch die Leitstelle an neon.
Bedeutung (Deutung der Leitstelle): Hilfe-Menü bleibt wie heute (360 pt, wie Apple Mail; Board-Eintrag Done und archiviert). Favoriten-Ausrichtung: Variante A, alles bündig wie Apple Mail, Konten eine Stufe tiefer, Ordnerliste 240 statt 206 px; Board-Eintrag „Seitenleiste: Favoriten-Symbole und Überschrift an den Spalten der Konten ausrichten“ steht auf Todo (Bild `seitenleiste-favoriten-variante-a.png`).
Bezug: Entscheidungsbilder `~/halo-analyse/entscheidungsbilder/` (favoriten-A.png, hilfe-A.png).

### 11.11.2026: Dauerfreigaben Stufen A–D gelten; M30 (automatisches /clear bei neon) wird nicht umgesetzt (Maintainer, Leitstelle)
Wortlaut des Maintainers, Leitstelle (Sitzung project.analysis.control), 11.11.2026: „1.) ja 2.) nicht umsetzen“. Weitergabe durch die Leitstelle an neon.
Bedeutung (Deutung der Leitstelle): 1.) Die Dauerfreigaben Stufen A bis D gelten wie in `docs/dauerfreigaben.md`. 2.) M30 (automatisches /clear bei neon) wird nicht umgesetzt, die Entscheidung vom 6.11.2026 bleibt; der Board-Eintrag M30 wird von neon-board geschlossen.
Bezug: `docs/dauerfreigaben.md`, `docs/umbau.md`.

### 11.11.2026: Hartnäckiges Rot → höheres Modell mit systematischer Fehlersuche (Maintainer in neon)
Wortlaut des Maintainers, Sitzung neon, 11.11.2026: „nein der release bleibt nicht für den nachtlauf. wenn der fehler so oft rot ist müssen wir einen subagenten mit höherem modell starten um das problem effizient zu lösen mittels dem skill superpowers /systematic-debugging“; danach: „wir sollten irgendwo festlegen: je öfter ein problem nicht gelöst wird und der testlauf rot bleibt, desto höher muss das modell für die problemlösung werden.“
Umsetzung: AGENTS.md (Regel „Rot bleibt rot → höheres Modell“), `docs/neon-sitzung.md` (Stufen und Ausnahmen; die Fable-Grenze über das 5-Stunden-Fenster und die Stufen nennt neon, nicht der Wortlaut).
Ergänzung 11.11.2026: Freigabe des Maintainers zum vorgeschlagenen Ablauf (Schritte 0–6, Stopp-Regel), Wortlaut: „ja starte ihn und schreibe bei erfolgreichem ablauf automatisch die neue vorgangsweise in die md-dateien“. Gegenprüfung an vier Fällen vom 10./11.11. (Gruppenkopf/Seitenleiste Linux, Prüfung „206 px“, Schreibschutz Mac, Seitenleiste Adressbuch Windows); Umsetzung in AGENTS.md und `docs/neon-sitzung.md` („Fehlerbehebung bei hartnäckigem Rot“). Eigene Deutung der prüfenden Sitzung, nicht Wortlaut: Wiederholung auf der roten Plattform statt nur auf dem Mac, „nur im vollen Lauf rot“ als Abhängigkeit statt Flackern, Zustand-Zurücksetzen gilt als Abschwächen, gescheitertes Stabilisieren zählt als Fehlversuch, Kontrolle bei Abhängigkeit zusätzlich im vollen Job. Die Stufen ersetzen die vom Vormittag (Sonnet/Opus, Opus, ab dem 3. Fable).

### 11.11.2026: Mail, Anhänge wie Apple Mail als ruhige Kacheln, Variante A (Maintainer, Sitzung global.features)
Wortlaut des Maintainers, Sitzung global.features, 11.11.2026, zu PVTI_lAHODEPpks4BoBQwzhH1USA („Mail: Anhänge wie Apple Mail“): „Variante A, so an neon“. Weitergabe durch neon-board an neon.
Variante A (Vorschauseite https://claude.ai/artifact/97yH1eNSFrYAidVqHwj9kG; Beschreibung von neon-board, Deutung nicht des Maintainers): Anhänge am Ende der Nachricht als ruhige Kacheln statt grauer Leiste: Dateisymbol (Seitenvorschau bzw. Typ-Symbol mit Endung), Name und Größe darunter oder daneben; nur leichte Fläche (hell/dunkel), Radius etwa 10 px; bei mehreren Anhängen ein umbrechendes Raster; „Save“ erst beim Überfahren sichtbar; gilt für einen und mehrere Anhänge; eigene Variablen mit `--mt-`-Präfix, hell und dunkel. Board-Eintrag Status Todo (umsetzbar).

### 11.11.2026: Anhänge, „Save All“ bündig mit der rechten Kachelspalte (Ergänzung zu Variante A) (Maintainer, Sitzung global.features)
Wortlaut des Maintainers, Sitzung global.features, 11.11.2026, zu PVTI_lAHODEPpks4BoBQwzhH1USA, Ergänzung zu „Variante A, so an neon“: „ich möchte den save all button bündig mit der rechten spalte der angehängten icons. das heisst wenn mindestens 2 attachment icons angezeigt werden steht links im eck oberhalb der icons die anzahl der attachments und rechts bündig mit der rechten spalte der icons steht der save all button.“ und „so an neon.“ Weitergabe durch neon-board an neon.
Umsetzung Variante A (Beschreibung von neon-board, Deutung nicht des Maintainers; Vorschauseite https://claude.ai/artifact/8fwZnGRHpFi6N2UDKQg89r, Version 4): Kacheln wie Apple Mail (heller Grund, Seitenvorschau, Name fett zweizeilig, Größe darunter, runder Sichern-Knopf, beim Überfahren Akzentfarbe und Tooltip mit vollem Namen). Ab 2 Anhängen eine Zeile über den Kacheln: links die Anzahl, rechts „Save All“ bündig mit dem rechten Rand der rechten Kachelspalte; Spaltenzahl nach Breite der geöffneten Mail, der Knopf folgt der letzten Spalte und bleibt oben erreichbar; bei einem Anhang keine Zeile. Board-Eintrag Status Todo.

### 11.11.2026: Symbolleisten bei Platzmangel, Reihenfolge der Verkleinerung und kein Nachrücken der Pillen (Maintainer, Sitzung neon)
Wortlaut des Maintainers, 11.11.2026, im Gespräch mit neon: „das nachrücken der pillen muss auch behoben werden. desweiteren gibt es nach wie vor ein problem mit der logik der toolbar buttons wenn das fenster verkleinert wird. zuerst sollen die freien abstände (spacer) zwischen den buttons auf die mindestgrösse minimiert werden, danach die grösse des suchfeldes minimiert werden bis zur lupe. aktuell springt die grösse des suchfelds beim verkleinern des fensters immer wieder von klein auf grösser und wieder zurück. wenn der button mit dem suchfeld nur noch die lupe anzeigt soll sich das auch nicht mehr ändern wenn das fenster noch kleiner wird.“
Ergänzt die Regel „Symbolleisten bei Platzmangel“ (Suchfeld bis auf die Lupe, danach Pillen ausblenden): Reihenfolge beim Verkleinern 1. freie Abstände (Spacer) auf Mindestgröße, 2. Suchfeld bis zur Lupe, 3. erst dann Pillen mit Chevron-Menü. Das Suchfeld darf beim Verkleinern nie wieder größer werden (kein Hin- und Herspringen); zeigt es nur die Lupe, bleibt es dabei, auch bei noch kleinerem Fenster.

### 11.11.2026: Aufgaben-Space, Umbau der Ansichten (Reihe 1/5), Ausnahme zu „Im Zweifel wie Apple“ (Maintainer, Sitzung „Tasks space views analysis“)
Wortlaut des Maintainers, Konzeptrunde 11.11.2026, Sitzung „Tasks space views analysis“, zu PVTI_lAHODEPpks4BoBQwzhH9KZs („Aufgaben: Umbau der Ansichten“, Schritt 1/5); weitergegeben von neon-board, Zustimmung des Maintainers zum Eintrag liegt laut neon-board vor: „der tableview sieht altbacken aus und wird von mir nie genutzt“; „macos reminders [ist] keine gute app“; „ich nutze tasks nur persönlich und privat“; „wir sollten aber features wie zB den seitlichen farbstreifen des zugehörigen kalenders/liste bei jedem task beibehalten. ich finde das sieht gut aus. auch die optik des umbaus soll sich bereits an vorhandenem user design von halo.spaces orientieren (buttons zB).“; „10 ist okay“ (Spalte Completed zeigt die zuletzt erledigten 10). Auswahlantworten: Tabellenansicht „Ja, komplett streichen“; Fortschrittsbalken „Durch drei Zustände ersetzen“; Details „Karte klappt auf, mit Bearbeiten-Knopf“; Mail-Funktionen „Als eigene Reihe nach dem Umbau“.
Festlegung (Beschreibung von neon-board, Deutung nicht des Maintainers; vollständig im Board-Eintrag): Ausnahme zu „Im Zweifel wie Apple“ nur für den Aufgaben-Space; Vorbild Things 3 (Liste, Details auf Abruf, „Heute“), Todoist (Schnelleingabe, Board), Apple Erinnerungen nur für Standardverhalten. Farbstreifen bleibt; Tabellenansicht entfällt; Zustände Offen / In Arbeit / Erledigt statt Fortschrittsbalken; Karte klappt auf; Completed zeigt die zuletzt erledigten 10. Optik nur aus bestehendem Halo-Design.

### 11.11.2026: Reihenfolge der Bereiche beim Abarbeiten der Aufgabenliste (Maintainer, Sitzung neon)
Vorschlag von neon (Gespräch 11.11.2026), dem der Maintainer zustimmte: Innerhalb von Bugs bzw. Features gilt die Folge global (alle Spaces), Mail, Kalender, Adressbuch, Aufgaben, Einstellungen, Chat; Schwere (Absturz, Datenverlust) geht vor Bereich; ein Eintrag, der länger als etwa eine Woche offen ist, rückt eine Stufe vor; ausdrückliche Wünsche des Maintainers im Gespräch haben Vorrang.
Wortlaut des Maintainers, 11.11.2026, im Gespräch mit neon: „Äbderungen am settings Space sollten vor änderungen am chat space kommen aber sonst Sommer ich dir zu. Gilt das ab sofort für jedes abarbeiten von der aufgabenliste, egal ob nachtlauf oder tag?“ (Schreibweise unverändert; gemeint: „Änderungen … stimme ich dir zu“). Also gilt: global, Mail, Kalender, Adressbuch, Aufgaben, **Einstellungen vor Chat**; Begründung des Maintainers: Fehler und Wünsche für Mail fallen mehr Nutzern auf als solche für den Einstellungs-Space; globale Einträge haben Vorrang vor Mail. Gilt ab sofort für jede Sitzung und jeden Lauf (Nachtlauf wie Tag). Ursprüngliche Anregung des Maintainers: „Sollten wir dann nicht den ablauf vom nachtlauf zum abarbeiten von Features und bugs ebenfalls immer nach spaces gruppieren und dementsprechend auch prioritäten vergeben? … Einzige ausnahme und eigentlich noch erster in der Priorität vor dem mail space sind globale Features oder bugs die alle Spaces betreffen.“

### 12.11.2026: M28 „Ablauf: Push ohne Sprachmodell“ gestrichen (Maintainer, Sitzung global.run)
Wortlaut des Maintainers, Sitzung global.run, 12.11.2026: „wenn der gewinn durch einsparung von tokens bei nutzung von einem externen dienst nur minimal ist sollte dieser punkt gestrichen werden oder auf completed gesetzt werden“; auf die Rückfrage (Streichen und Archivieren oder Done): „ja, streichen und archivieren“. Grund (Beschreibung von global.run, Deutung nicht des Maintainers): Einsparung minimal (ein Haiku-Aufruf je Meldung); ein externer Dienst bräuchte eine Datenschutzprüfung (`tests/adressen.py`, Datenschutzhinweise). Board-Eintrag PVTI_lAHODEPpks4BoBQwzhHepEw archiviert (nicht Done).

### 12.11.2026: Aufgaben-Space, Umbau der Ansichten macht die übrigen Aufgaben-Einträge zur Oberfläche obsolet (Maintainer, Sitzung global.run)
Sachentscheidung auf Anweisung des Maintainers (Sitzung global.run, 12.11.2026, ohne Wortlaut): Der Umbau der Ansichten (Board-Eintrag PVTI_…H9KZs) macht die Einträge zur bisherigen Aufgaben-Oberfläche obsolet. Archiviert (nicht Done) wurden PVTI_…H8uzQ und …Hf7pM; …HM_Qc, …GOH2c und …G18MU werden bei Schritt 3 geklärt; …G18Jc, …IEtvU und …HdRlg bleiben.

### 12.11.2026: Ausdrücklich abgelehnte GitHub-Wünsche schließen den Board-Eintrag mit (Maintainer, über github.comm.routine)
Auftrag des Maintainers vom 12.11.2026, übermittelt von github.comm.routine (der Wortlaut stammt aus dieser Übermittlung, nicht aus einem direkten Zitat des Maintainers); im Gespräch mit neon am 12.11.2026 vom Maintainer mit „ja eintragen“ freigegeben: „Wird ein GitHub-Wunsch vom Maintainer ausdrücklich abgelehnt (Issue als ‚nicht geplant‘/wontfix geschlossen), darf der zugehörige Board-Eintrag (Titel ‚… [GitHub #n]‘) automatisch mitgeschlossen werden: per Übergabe an neon-board bzw. Zeile in board-uebergabe.txt, Status Done mit Notiz ‚abgelehnt‘, Entscheidung Maintainer, Datum. Nur bei ausdrücklicher Ablehnung, nie bei offenen oder zurückgestellten Wünschen; erledigte Bugs schließt weiter der Release-Ablauf.“ Erster Fall: #48 (12.11.2026). Umgesetzt in `docs/github-komm.md`.

### 12.11.2026: Sicherung von neon, kein zweites Ziel und kein Wiederherstellungstest (Maintainer, Sitzung neon)
Wortlaut des Maintainers, 12.11.2026, im Gespräch mit neon, auf die Frage nach einem zweiten Ziel außer Haus und einem Wiederherstellungstest: „kein zweites ziel, keinen wiederherstellungstest“. Stand (Beschreibung von neon, Deutung nicht des Maintainers): Time Machine auf die externe Platte „neon.backup“, stündlich, eingerichtet am 12.11.2026; Einzelheiten und Risiko in `docs/neon-ersetzen.md`.

### 13.11.2026: Optische Änderungen an der Seitenleiste gelten für eingeblendet und schwebend (Maintainer, Sitzung neon)
Wortlaut des Maintainers, 13.11.2026, im Gespräch mit neon: „ich möchte festgelegt haben dass optische änderungen an der schwebenden sidebar auch automatisch für die schwebende sidebar geprüft werden und bei problemloser umsetzung auch für beides eingebaut wird“. Dazu, ebenfalls wörtlich (13.11.2026, Gespräch mit neon): „unsere grundlogik ist, dass das design der seitenleiste eingeblendet und schwebend gleich sein muss in der optischen gestaltung. es dürfen allerdings unterschiede sein wie zB der schatten der trennleiste im schwebenden zustand, nachdem durch diesen effekt der unterschied zwischen dem vorderen bereich (=schwebend) und dem hinteren bereich (=thunderbird) deutlicher wird. der fehlende sidebar button im schwebenden zustand ist gewollt und völlig ok. der dadurch entstehende abstand von 3 px oben, links und unten ist auch in ordnung. mir geht es vor allem um das design insgesamt. zB die gestaltung der space kacheln, der neue lichtschein, die fonts von der sidebar usw.“
Stand (Beschreibung von neon, Deutung nicht des Maintainers): Jede Änderung am Aussehen der Seitenleiste (Kacheln, Schein, Schrift, Farben, Abstände) wird auch im schwebenden Zustand geprüft und bei problemloser Umsetzung für beide Zustände eingebaut. Als gewollte Unterschiede nennt der Maintainer Schatten (Trennleiste), den fehlenden Seitenleisten-Knopf und den Abstand von 3 px; dass auch der Radius 10 px und die helle Innenkante dazugehören, ist nicht ausdrücklich gesagt (Vergleich: Artifact Cs7pwaKwM9MbNzanPL1XUj).
Ergänzung des Maintainers, 13.11.2026, im Gespräch mit neon, Wortlaut: „bei schwebender sidebar ist die helle innenkante erlaubt. "bei problemloser umsetzung" - das hast du richtig verstanden. bzgl. radius 10px habe ich keine ahnung, aber gehen wir mal davon aus dass es passt.“ Stand (Beschreibung von neon): Erlaubte Unterschiede im schwebenden Zustand sind damit Schatten, Abstand 3 px, fehlender Seitenleisten-Knopf, helle Innenkante und (vorläufig angenommen, vom Maintainer nicht geprüft) der Radius 10 px. „Bei problemloser Umsetzung“ heißt: Macht der schwebende Zustand bei einer Änderung Probleme, wird sie nicht nur für eine Seite eingebaut, sondern das Problem wird benannt (so von neon gelesen, vom Maintainer mit „das hast du richtig verstanden“ bestätigt).

### 13.11.2026: Seitenleiste, Lichtschein und leuchtende Kachel; Einstellung zum Abschalten des Lichtscheins (Maintainer, Sitzung neon)
Wortlaut des Maintainers, 13.11.2026, im Gespräch mit neon: „bezüglich lichtschein würde ich der empfehlung des agenten folgen“ (Schein C geneigt, Reichweite 1, leise; Trennlinie nur auf Kachelhöhe gefärbt, 1 px, 35 % hell / 30 % dunkel; Einstellungen und Webseiten-Space ohne Schein). Zur Kachel: „hell: bei f2 sieht der mail space button am oberen rahmen verwaschen aus. bei f4a passiert das nicht mehr. dunkel f4b mit rezept wäre quasi das optische gegenstück oder?“; auf den Vorschlag F4a hell und dezentes Rezept dunkel, Umsetzung in zwei Schritten, Antwort „ja“. Zur Einstellung: „als teil dieser umgestaltung möchte ich den usern die option in den halo.space settings geben, dass der lichtkegel in der sidebar abgeschaltet werden kann (design bei space kacheln bleibt)“.
Stand (Beschreibung von neon, Deutung nicht des Maintainers): Die Einstellung ist eine ausdrücklich vom Maintainer entschiedene Ausnahme von „Optionen nur in sehr seltenen Fällen“ (AGENTS.md). Ob „Aus“ auch die gefärbte Trennlinie abschaltet, ist nicht gesagt; neon nimmt es an und hat es im Board-Eintrag als offen gekennzeichnet.
Klärung des Maintainers, 13.11.2026, im Gespräch mit neon, Wortlaut: „ja aus schaltet auch die gefärbte trennlinie ab, mit dem schalter möchte ich die farbänderung in der sidebar an- und wieder ausschalten können.“ Damit steuert der Schalter die gesamte Farbänderung in der Seitenleiste (Lichtschein und gefärbte Trennlinie); die Kachelgestaltung bleibt unberührt.

### 13.11.2026: Director für den Nachtlauf (Nutzen und Aufwand statt fester Reihenfolge) (Maintainer, Sitzung neon)
Wortlaut des Maintainers, 13.11.2026, im Gespräch mit neon: „wäre es nicht sinnvoll eine art „director“ bei jedem start des nachtlaufs alle punkte anzusehen und dann nach ebenfalls die punkte priorisieren und abarbeiten?“ Begründung, ebenfalls wörtlich: „die aktuelle vorgangsweise in der nacht die schwersten punkte zuerst zu machen hat einen kleinen logik flaw. bei einer 50 punkte liste kann ich eventuell 2,3 schwere pro nacht macht oder stattdessen vielleicht 30 kleine punkte. solange der nachtablauf fix und nicht dynamisch ist wird es immer vor- und nachteile geben.“ Freigabe, wörtlich: „ja und ich möchte den director bereits heute nacht zum ersten mal einsetzen“. Produktidee, wörtlich: „halo.spaces ist unser produktname … unser anspruch ist es dass diese extension so großartig aussieht für ein freies addon dass es zur meistgenutzten extension/theme für thunderbird wird obwohl es nicht im store verfügbar ist“; dazu (Beschreibung von neon, kein Wortlaut): 80 % der Nutzer nutzen vor allem Mail, Mail wird zuerst verbessert, global behält Platz 1.
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): `tests/nachtlauf-auftrag.md` Schritt 1a/1b; Rahmenregeln (Schwere zuerst, Wünsche des Maintainers, höchstens ein großer Eintrag je Nacht (durch die Zusatzinfo unten ersetzt), Bereichsfolge als Gleichstand, Dauerfreigaben und „Wartet auf OK“ unverändert, höchstens drei In Progress, Wartendes auf Push/CI nicht neu bearbeiten), Plan in `~/halo-nacht/<datum>-plan.md` und im Nachtbericht unter „Director-Plan“, Rückfall auf die feste Reihenfolge; Einzelheiten `docs/testrechner.md` „Director im Nachtlauf“.
Zusatzinfo des Maintainers, 13.11.2026, im Gespräch mit neon, Wortlaut: „Zusatzinfo: Der Grund weswegen nachts zuerst schwere Features gemacht werden sollten war der, dass ich selbst schlafe und daher nicht Claude benutze. Untertags würde ich zu oft aktuelle arbeiten an schweren Features aufgrund der langen dauer unterbrechen.“ Zur Deutung von neon, dass die Stufenregel (erst alle Bugs, dann einfache Features, zuletzt Reihen) nachts nur noch Gleichstand-Regel des Directors ist, wörtlich: „1. passt so“.
Folge (Beschreibung von neon, Deutung nicht des Maintainers): Die Regel „höchstens ein großer Eintrag je Nacht“ entfällt. Der Director darf mehrere große Einträge einplanen, so viele wie Nachtzeit (neue Einträge bis 04:30) und Kontingent zulassen, und zieht sie bei vergleichbarem Nutzen vor; eine Reserve von grob einem Drittel der Nachtzeit bleibt für kleine Einträge mit hohem Nutzen; kleine Einträge, die die Tagesroutine ohnehin schafft, bevorzugt er nachts nicht. Der Director-Plan im Bericht nennt Zeitbudget, Zahl großer und kleiner Einträge und die Reserve.
Zweiter Zusatz des Maintainers, 13.11.2026, im Gespräch mit neon. Frage, wörtlich: „Soll er sich auch am ende des nachtlaufs kümmern dass die entsprechenden Punkte in der aufgabenliste geschlossen und archiviert werden , die entsprechenden Pull requests geschlossen werden und die github.comm.Routine Session anweisen die Kommunikation zu den usern auf GitHub weiterzuführen (wenn issue durch nachtlauf gefixt wurde zb)?“ Antwort, wörtlich: „Ja direktor schlägt PRs vor welche geschlossen werden können.“ Zur Kommunikation, wörtlich: „Heisst das der Direktor informiert github.comm.Routine Session welche aber dennoch erst um 09:00 den Usern antwortet und bei ihrer routine bleibt?“
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): Der Director schlägt im Nachtbericht schließbare PRs mit fertiger Zeile für `tests/pr-freigaben.txt` vor, schließt aber keinen (Entscheidung vom 9.11.2026 bleibt). Board-Einträge (`fertig.sh`) und Issues (`publish.sh`, „Fixed in x.y.z“) schließt der Nachtlauf schon. Einen Hinweis an die GitHub-Routine braucht es nicht: Nach dem Release sind die Issues bereits mit „Fixed in x.y.z“ beantwortet und geschlossen, Fixes vor dem Release meldet `tests/issue-abgleich.sh` über `~/halo-aufgaben/issue-abgleich.txt`; die Routine bleibt bei ihren Zeiten (9:00, 14:00, 19:00).
Vierter Zusatz des Maintainers, 13.11.2026, im Gespräch mit neon, Haltung des Directors. Auf die Frage „eher vorsichtig oder mutig planen?“, wörtlich: „1. was bringt langfristig mehr Produktivität?“ (die Wahl überließ er dem Director nach diesem Maßstab). Auf die Frage „wie streng auf Mail und sichtbare Qualität, mit festem Betriebsanteil?“, wörtlich: „2. das design ist wichtig aber nicht das einzig wichtige.“ Dazu, wörtlich: „Zusatz zu zwei: die funktionalität eines email-clients muss gewährleistet sein“. Auf die Frage „unklare Einträge übergehen oder versuchen?“, wörtlich: „3. unklare einträge sollte er lieber auf warte auf ok setzen und fragen hierfür in seinen morgenbericht stellen“.
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): Planung nur mit belegter Kapazität, anfangs 70–80 %, danach nach Trefferquote; Nutzen gleichrangig aus Vertrauen, Mail-Funktion, Stabilität/Release-Fähigkeit, Design (Mail zuerst als Gewicht), Nutzer-Bugs, Betrieb soweit er Releases sichert; Rahmenregel (a) umfasst „Mail-Grundfunktion gestört oder gefährdet“, keine Änderung mit Risiko für die Mail-Funktion ohne absichernde Prüfung; unklare Einträge auf „Wartet auf OK“ mit Rückfrage-Notiz, höchstens 5 Fragen je Nacht im Nachtbericht („Rückfragen an den Maintainer“), der Morgenbrief zeigt sie (`tests/morgenbrief.sh`).
Fünfter Zusatz des Maintainers, 13.11.2026, im Gespräch mit neon, zur Mail-Funktion, wörtlich: „Vorbild für mail-funktionalität ist apple mail.  Manche mail clients haben überbordernde funktionen welche 99% der user nicht nutzen“.
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): Maßstab für „Mail-Grundfunktion“ (Rahmenregel a des Directors) ist der Funktionsumfang von Apple Mail, nicht der volle Umfang von Thunderbird; seltene Thunderbird-Funktionen bewertet der Director niedrig und gibt ihnen keinen Vorrang, neue Optionen ohne belegten Nutzen setzt er im Zweifel mit Rückfrage auf „Wartet auf OK“. „Nichts ersatzlos entfernen“ bleibt: Er streicht oder versteckt keine Thunderbird-Funktion.

### 13.11.2026: Tagesroutine: „Plan abgearbeitet“ ist kein Ende (Maintainer, Sitzung neon)
Herkunft: Gespräch neon, 13.11.2026. Frage des Maintainers, wörtlich: „Aber sollte die tagesroutine nicht bis zum abend arbeiten?“ Antwort von neon (kein Wortlaut des Maintainers): Nach dem Skript endet der Tag mit „Ende: Plan abgearbeitet“, sobald die einmal geschriebene Plandatei leer ist, auch wenn bis 22:00 noch Zeit und Kontingent wären; nur nach „nichts_passend“ im Sparmodus wird bis zur nächsten vollen Stunde gewartet (Entscheidung des Maintainers 12.11.2026: „warten statt enden, höchstens bis 22:00“). Vorschlag von neon: „Plan abgearbeitet“ ist kein Ende; die Routine wartet wie im Sparmodus bis zur nächsten vollen Stunde ohne Claude, liest das Kontingent neu und plant neu (neue Liste, neue Commits, neues Kontingent). Antwort des Maintainers, wörtlich: „Ja“.
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): `tests/tagesroutine.sh` wartet nach abgearbeitetem Plan ohne Claude bis zur nächsten vollen Stunde (nur vor 20:30), prüft dann wie sonst Zeit, Pause, belegt, Tageslimit und Kontingent und startet eine neue Plan-Runde; heute schon Bearbeitetes wird nicht erneut geplant. Ende bei leerem Plan einer Plan-Runde oder nach drei Plan-Runden hintereinander ohne erledigten Eintrag. Die Entscheidung vom 12.11.2026 (Sparmodus wartet) bleibt unverändert. Bezug: `docs/testrechner.md` „Tagesroutine“.

### 13.11.2026: Tagesroutine auch am Wochenende ab 12:00 (Maintainer, Sitzung neon)
Herkunft: Gespräch neon, 13.11.2026. Wortlaut des Maintainers: „Bitte lass die tagesroutine auch am Wochenende ab 12:00 mittags laufen.“
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): Die Tagesroutine läuft zusätzlich Samstag und Sonntag, Beginn 12:00 statt 09:00 (`START_WOCHENENDE` in `tagesroutine.conf`), sonst gleiche Regeln (letzter Beginn 20:30, Ende 22:00, Sparmodus, Neuplanen, Tageslimit eigener Commits). Am Wochenende wartet sie zusätzlich, solange Wochen-, Doku-Prüfung oder Design-Rundgang laufen oder auf ihren Start warten. Den LaunchAgent lädt der Maintainer. Bezug: `docs/testrechner.md` „Tagesroutine“.
Änderung des Maintainers, 13.11.2026, Gespräch neon, Wortlaut: „Auch am wochenende tagesablauf Routine um 10::00 starten wie unter der woche“. Umsetzung (Beschreibung von neon): Samstag und Sonntag Beginn 10:00 statt 12:00, Werktage bleiben 09:00, sonst unverändert. Der Design-Rundgang ist seit 13.11.2026 vom Maintainer auf weiteres pausiert (Hinweis des Maintainers über neon).

### 13.11.2026: Volldampf ab Dienstag 17.11.2026 (Nachtlauf und Tag nach dem Wochenreset, gratis Limit-Reset von Hand) (Maintainer, Sitzung neon)
Fakten von der Nutzungsseite (Einstellungen > Nutzung, Stand 13.11.2026, Angabe des Maintainers): ein „Full reset“ läuft am 10. Dezember ab, zwei „Fable reset“ laufen am 9. März ab; „Each button uses the reset that expires first“. Der Reset wird nur von Hand ausgelöst, nicht aus Claude Code.
Wortlaut des Maintainers, 13.11.2026, Gespräch neon: „Daher meinte ich ja auch beim nachtlauf am dienstag kurz nach dem wochenreset mit volldampf die Token-intensivsten dinge anzugehen und bei erreichen des wochenlimits den gratis reset benutzen“.
Wortlaut, ebenda: „Freier aber auch nicht überbordernd. Fable verbraucht viel mehr vom wochen- und stundenlimit und wir wollendss fable kontingent nicht verschwenden. Bau den plan "volldampf" für den nachtlauf vom nächsten dienstag 17.11.2026 ein wobei der hinweis auf aktiven volldampf status immer im direktor Bericht erwähnt werden muss. Ist volldampf aktiv soll Auch unter tags nicht gespart werden unter Berücksichtigung des 5 stunden Limits“.
Änderung, Wortlaut, ebenda: „Nein tatsächlich darf vollgas status solange laufen bis wochenlimit verbraucht wurde. Ist wie ein override schalter“.
Klarstellung, Wortlaut, ebenda: „Nein wenn das wochenlimit erreicht wurde wird Volldampf automatisch deaktiviert. Nur bei erreichen des wichenlimits und nicht bei erreichen des 5 Stunden Limits“.
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers; `docs/testrechner.md` „Volldampf“): Datei `~/halo-nacht/volldampf.txt` mit Zeile `volldampf 2026-11-17T01:00+01:00 2026-11-24T01:00+01:00 <Grund>` (Ende = nächster Wochenreset als Sicherung; Widerruf: Zeile löschen). Solange aktiv: Sollkurve, Sparmodus, Reserve und die 70–80 %-Vorsicht des Directors bremsen nicht, Tagesroutine mit doppeltem Commit-Tageslimit, Nachtlauf-Fortsetzungen bis 08:00; das 5-Stunden-Fenster bremst wie bisher. Ab 98 % Woche („alle Modelle“) wird Volldampf dauerhaft beendet (Marker `~/halo-nacht/volldampf-beendet.txt`, iPhone-Meldung), auch wenn der Wert nach dem freien Reset sinkt; wieder ein nur mit neuer Zeile des Maintainers. Fable im Volldampf nur für die schwersten Fälle, höchstens zwei je Nacht und einer am Tag, nacheinander, 5-Stunden-Fenster unter 60 %, ohne Soll-Bedingung, Stopp bei „Fable only“ über 80 % (derzeit nicht lesbar) – diese Werte und die 98 % sind Vorschläge von neon, nicht vom Maintainer bestätigt.

### 13.11.2026: Fünf offene Director-Fragen, Empfehlungen umsetzen (Maintainer, Sitzung neon)
Wortlaut des Maintainers, 13.11.2026, Gespräch neon, als Antwort auf fünf Fragen von neon mit je einem Vorschlag: „Ja sie Empfehlungen umsetzen“ (Schreibweise unverändert).
Vorschläge von neon, die damit gelten (Beschreibung von neon, Deutung nicht des Maintainers): (1) Fable-Werte im Volldampf bleiben (höchstens 2 je Nacht, 1 am Tag, nacheinander, 5-Stunden-Fenster unter 60 %, nur schwerste Fälle). (2) „Fable only“ ist nicht lesbar: Werte bleiben; die iPhone-Meldungen bei 90 % Woche und beim Beenden nennen zusätzlich „Fable-Anteil in Einstellungen > Nutzung mit ansehen“; Bericht vermerkt „Fable only nicht lesbar, Stopp nur über die Zahl der Agenten“. (3) Die Erinnerung bei 90 % bleibt. (4) „Seitenleiste: Lichtschein und gefärbte Trennlinie (Umsetzung 2/3)“ samt Schalter darf der Director ab der Nacht auf Samstag einplanen (Prüfung schwebend und Animation, Testpaket /vorab im Bericht ankündigen, Größe selbst beurteilen, bei Zweifel Rückfrage). (5) Von mehreren Nutzern unabhängig gemeldeter gleicher Fehler (z. B. GitHub #59, #61, #62, #63, #64 nach 3.26.0) oder ein Fehler, der ein Bedienelement bzw. die Anzeige für alle Nutzer einer Plattform blockiert, gilt wie „Mail-Grundfunktion gestört“ (Rahmenregel a, Vorrang); Einzelmeldung hoher Nutzen ohne Vorrang; der Director fasst Issues mit gemeinsamer Ursache zusammen.
