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

Berichtigung von neon, 14.11.2026 (Beschreibung von neon, Deutung nicht des Maintainers): Das „Ende bei leerem Plan einer Plan-Runde“ in der Umsetzung oben war nicht Wortlaut des Maintainers und widersprach seinem „Ja“ (am 14.11.2026 endete die Routine deshalb um 15:06 mit „kein Plan in Plan-Runde n“, obwohl bis 20:30 Zeit war). Seither beendet auch ein leerer Plan (Runde 1 oder später) den Tag nicht: wie nach „Plan abgearbeitet“ ohne Claude bis zur nächsten vollen Stunde warten (nur vor 20:30), Kontingent neu lesen, neu planen; Bericht „Plan-Runde n: 0 Einträge, nächste Planung HH:00“. Der Leerlauf-Schutz (drei Plan-Runden hintereinander ohne erledigten Eintrag) zählt nur Pläne mit Einträgen; leere Pläne zählen nicht.

### 13.11.2026: Tagesroutine auch am Wochenende ab 12:00 (Maintainer, Sitzung neon)
Herkunft: Gespräch neon, 13.11.2026. Wortlaut des Maintainers: „Bitte lass die tagesroutine auch am Wochenende ab 12:00 mittags laufen.“
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): Die Tagesroutine läuft zusätzlich Samstag und Sonntag, Beginn 12:00 statt 09:00 (`START_WOCHENENDE` in `tagesroutine.conf`), sonst gleiche Regeln (letzter Beginn 20:30, Ende 22:00, Sparmodus, Neuplanen, Tageslimit eigener Commits). Am Wochenende wartet sie zusätzlich, solange Wochen-, Doku-Prüfung oder Design-Rundgang laufen oder auf ihren Start warten. Den LaunchAgent lädt der Maintainer. Bezug: `docs/testrechner.md` „Tagesroutine“.
Änderung des Maintainers, 13.11.2026, Gespräch neon, Wortlaut: „Auch am wochenende tagesablauf Routine um 10::00 starten wie unter der woche“. Umsetzung (Beschreibung von neon): Samstag und Sonntag Beginn 10:00 statt 12:00, Werktage bleiben 09:00, sonst unverändert. Der Design-Rundgang ist seit 13.11.2026 vom Maintainer auf weiteres pausiert (Hinweis des Maintainers über neon).

### 13.11.2026: Volldampf ab Dienstag 17.11.2026 (Nachtlauf und Tag nach dem Wochenreset, gratis Limit-Reset von Hand) (Maintainer, Sitzung neon)
Fakten von der Nutzungsseite (Einstellungen > Nutzung, Stand 13.11.2026, Angabe des Maintainers): ein „Full reset“ läuft am 10. Dezember ab, zwei „Fable reset“ laufen am 9. März ab; „Each button uses the reset that expires first“. Der Reset wird nur von Hand ausgelöst, nicht aus Claude Code.
Wortlaut des Maintainers, 13.11.2026, Gespräch neon: „Daher meinte ich ja auch beim nachtlauf am dienstag kurz nach dem wochenreset mit volldampf die Token-intensivsten dinge anzugehen und bei erreichen des wochenlimits den gratis reset benutzen“.
Wortlaut, ebenda: „Freier aber auch nicht überbordernd. Fable verbraucht viel mehr vom wochen- und stundenlimit und wir wollendss fable kontingent nicht verschwenden. Bau den plan "volldampf" für den nachtlauf vom nächsten dienstag 17.11.2026 ein wobei der hinweis auf aktiven volldampf status immer im direktor Bericht erwähnt werden muss. Ist volldampf aktiv soll Auch unter tags nicht gespart werden unter Berücksichtigung des 5 stunden Limits“.
Änderung, Wortlaut, ebenda: „Nein tatsächlich darf vollgas status solange laufen bis wochenlimit verbraucht wurde. Ist wie ein override schalter“.
Klarstellung, Wortlaut, ebenda: „Nein wenn das wochenlimit erreicht wurde wird Volldampf automatisch deaktiviert. Nur bei erreichen des wichenlimits und nicht bei erreichen des 5 Stunden Limits“. **Abgelöst am 18.11.2026** (siehe „18.11.2026 – Volldampf: Pause beim Wochenlimit, Soll bis zum nächsten Reset“): beim Wochenlimit pausiert Volldampf nur bis zum freien Reset; das 5-Stunden-Limit bleibt ohne Wirkung.
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers; `docs/testrechner.md` „Volldampf“): Datei `~/halo-nacht/volldampf.txt` mit Zeile `volldampf 2026-11-17T01:00+01:00 2026-11-24T01:00+01:00 <Grund>` (Ende = nächster Wochenreset als Sicherung; Widerruf: Zeile löschen). Solange aktiv: Sollkurve, Sparmodus, Reserve und die 70–80 %-Vorsicht des Directors bremsen nicht, Tagesroutine mit doppeltem Commit-Tageslimit, Nachtlauf-Fortsetzungen bis 08:00; das 5-Stunden-Fenster bremst wie bisher. Ab 98 % Woche („alle Modelle“) wird Volldampf dauerhaft beendet (Marker `~/halo-nacht/volldampf-beendet.txt`, iPhone-Meldung), auch wenn der Wert nach dem freien Reset sinkt; wieder ein nur mit neuer Zeile des Maintainers. Fable im Volldampf nur für die schwersten Fälle, höchstens zwei je Nacht und einer am Tag, nacheinander, 5-Stunden-Fenster unter 60 %, ohne Soll-Bedingung, Stopp bei „Fable only“ über 80 % (derzeit nicht lesbar) – diese Werte und die 98 % sind Vorschläge von neon, nicht vom Maintainer bestätigt.

### 13.11.2026: Fünf offene Director-Fragen, Empfehlungen umsetzen (Maintainer, Sitzung neon)
Wortlaut des Maintainers, 13.11.2026, Gespräch neon, als Antwort auf fünf Fragen von neon mit je einem Vorschlag: „Ja sie Empfehlungen umsetzen“ (Schreibweise unverändert).
Vorschläge von neon, die damit gelten (Beschreibung von neon, Deutung nicht des Maintainers): (1) Fable-Werte im Volldampf bleiben (höchstens 2 je Nacht, 1 am Tag, nacheinander, 5-Stunden-Fenster unter 60 %, nur schwerste Fälle). (2) „Fable only“ ist nicht lesbar: Werte bleiben; die iPhone-Meldungen bei 90 % Woche und beim Beenden nennen zusätzlich „Fable-Anteil in Einstellungen > Nutzung mit ansehen“; Bericht vermerkt „Fable only nicht lesbar, Stopp nur über die Zahl der Agenten“. (3) Die Erinnerung bei 90 % bleibt. (4) „Seitenleiste: Lichtschein und gefärbte Trennlinie (Umsetzung 2/3)“ samt Schalter darf der Director ab der Nacht auf Samstag einplanen (Prüfung schwebend und Animation, Testpaket /vorab im Bericht ankündigen, Größe selbst beurteilen, bei Zweifel Rückfrage). (5) Von mehreren Nutzern unabhängig gemeldeter gleicher Fehler (z. B. GitHub #59, #61, #62, #63, #64 nach 3.26.0) oder ein Fehler, der ein Bedienelement bzw. die Anzeige für alle Nutzer einer Plattform blockiert, gilt wie „Mail-Grundfunktion gestört“ (Rahmenregel a, Vorrang); Einzelmeldung hoher Nutzen ohne Vorrang; der Director fasst Issues mit gemeinsamer Ursache zusammen.

## Tagesroutine am Wochenende: Start um 09:00 (13.11.2026)

Herkunft: Gespräch mit neon, 13.11.2026. Wortlaut des Maintainers: „Start am Wochenende um 09:00“. Vorausgegangen waren am selben Tag „Bitte lass die tagesroutine auch am Wochenende ab 12:00 mittags laufen.“ und „Auch am wochenende tagesablauf Routine um 10::00 starten wie unter der woche“; die Frage „Moment kann doku Prüfung gleichzeitig mit tagesablauf laufen? Wenn ja auch am Wochenende tagesroutine um 09:00 starten“ beantwortete neon: nicht gleichzeitig, die Routine wartet auf Doku-Prüfung (Samstag 08:00) und Wochenprüfung (Sonntag 08:00), beginnt dann also meist erst gegen 10:00. Wirkung: Sa und So ab 09:00, bis 22:00, letzter Beginn 20:30; START_WOCHENENDE=09:00 in tagesroutine.conf.

## LaunchAgents laden und neu starten (13.11.2026)

Herkunft: Gespräch mit neon, 13.11.2026. Wortlaute des Maintainers: „Nein mach du das“ (neon sollte den Startplan der Tagesroutine mit dem neuen Wochenend-Start laden, statt dass der Maintainer den Befehl ausführt), dann „Würde es schaden wenn du auch ab sofort alle launchagents starten und restarten darfst?“. neon antwortete mit einem eingegrenzten Vorschlag (Zeitplan-Agenten ja, mit Bedingungen; die drei Fernsteuerungs-Agenten bleiben beim Maintainer); Maintainer: „Ja“. Wirkung: `docs/dauerfreigaben.md`, Stufe B (Laden und Neustart der Zeitplan-Agenten bei freigegebener Änderung, nur ohne laufenden Lauf, plist geprüft, Meldung im Bericht oder Morgenbrief); Stufe C bleibt: neue oder inhaltlich geänderte LaunchAgents nur auf ausdrücklichen Wunsch im Gespräch, Neustart der Fernsteuerungs-Agenten.

## Today-Pane: Knöpfe immer nur als Symbol (14.11.2026, GitHub #62)

Herkunft: Gespräch mit neon, 14.11.2026, Rückfrage des Directors aus dem Nachtlauf vom 14.11. Frage von neon (in einfachen Worten): Bei der Symbolleisten-Darstellung „Symbol plus Text“ reicht in der Today-Pane neben dem Titel der Platz nicht; A: Knöpfe dort immer nur als Symbol, B: der Titel weicht. Wortlaut des Maintainers: „ja a.“. Wirkung: In der Today-Pane zeigen die Knöpfe immer nur das Symbol, unabhängig von der gewählten Symbolleisten-Darstellung; der Titel bleibt. Gilt für den Eintrag „Today-Pane: Symbolleisten-Knöpfe überlappen den Titel [GitHub #62]“.

## Nachtlauf räumt unbenötigte Reste mit Risiko null auf (14.11.2026)

Herkunft: Gespräch mit neon, 14.11.2026. Wortlaut des Maintainers: „unbenötigte reste sollten immer am ende des nachtlaufs automatisch aufgeräumt werden ohne nachfrage wenn das risiko null ist“. Anlass: Der Wächter für Pausen meldete am 14.11. um 08:00 ROT wegen alter Stände in Arbeitskopien von Hilfsagenten unter `.claude/worktrees/agent-*`; dazu lag eine tote Sperrdatei `~/halo-nacht/rundgang.lock` (Prozess 14522 vom 5.11. existierte nicht mehr).
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): `tests/aufraeumen.sh` (Probe mit `--trocken`), aufgerufen am Ende des Nachtlaufs (`tests/nachtlauf-auftrag.md` Schritt 6a, Rückfall in `tests/nachtlauf.sh`), Dauerfreigabe Stufe B. Entfernt wird nur, wenn alle Bedingungen erfüllt sind: (a) Arbeitskopien von Hilfsagenten: nichts Ungespeichertes oder Unversioniertes, ignorierte Dateien nur erzeugte (dist/, theme.css, __pycache__ u. ä.), jeder Commit steckt in `main`, nicht von einem lebenden Prozess gesperrt, kein Prozess arbeitet darin, keine Änderung und kein Protokoll des Hilfsagenten jünger als 6 Stunden; `git worktree remove` ohne `--force`, Zweig nur mit `git branch -d`. (b) Sperrdateien in `~/halo-nacht`: Prozess existiert nicht und Datei älter als 1 Stunde. (c) Zweige `claude/…`, `rest/…`, `pruef/…` lokal und auf GitHub: nur ohne Commit über `origin/main` hinaus, ohne offenen Pull Request, nicht in einer Arbeitskopie ausgecheckt (erweitert das Aufräumen von `claude/…` vom 7.11.2026). Nichts anderes (keine Berichte, Bilder, Sitzungen, Sicherungen, kein `dist/`, nichts im Arbeitsbaum von `main`). Alles Übrige bleibt und erscheint als „Rest mit Risiko, nichts angefasst“ im Bericht und als Hinweis im Morgenbrief.

## Director: Priorität steigt mit der Zahl verwandter Einträge (14.11.2026)

Herkunft: Gespräch mit neon, 14.11.2026. Frage von neon: Soll eine Gruppe von Einträgen zur selben Stelle höhere Priorität bekommen (Vorschlag: ab drei Einträgen)? Wortlaut des Maintainers: „ich würde eine regelung einbauen, wonach die priorität incrementiell steigt je mehr punkte auf das selbe problem verweisen und nicht erst ab 3 zusammenhängenden“.
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): `tests/nachtlauf-auftrag.md` Schritt 1a, Abschnitt „Häufung“: je weiterer Eintrag eine halbe Nutzenstufe mehr, höchstens 5, Gruppe am Stück erledigen, im Plan nennen.
Ergänzung (Gespräch mit neon, 14.11.2026), Wortlaut des Maintainers: „nein ich möchte hier keine manuellen adjustierungen sondern ebenfalls funktionierende automatismen die zusammenhängende punkte auf der liste zuverlässig erkennen und dementsprechend höher priorisieren, je mehr gemeinsame punkte verknüpft sind“. Keine manuellen Notizen oder Verknüpfungen in Board-Einträgen.
Weitere Ergänzung (14.11.2026), Wortlaut des Maintainers: „der automatismus soll natürlich bei der tagesroutine und auch bei der nachtroutine automatisch eingesetzt werden“.
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): `tests/haeufung.py` bildet die Gruppen deterministisch (gleicher Bereich und gemeinsame Stelle der Oberfläche nach fester Begriffsliste mit Synonymen, Verweise auf GitHub-Nummern, Board-ids, Bilder und Auswahlnamen, transitiv; Schritte derselben Reihe zählen nicht) und schreibt `~/halo-nacht/<datum>-haeufung.md` und `.tsv` mit Zuschlag und Grund je Verbindung; nur Lesen. Der Director im Nachtlauf (`tests/nachtlauf-auftrag.md` Schritt 1a) und jede Plan-Runde der Tagesroutine (`tests/tagesroutine.sh`, Auftrag Schritt 2) rufen es auf und übernehmen Gruppen und Zuschläge verbindlich; Rückfall auf eigene Gruppierung mit Vermerk nur, wenn das Skript scheitert. Tests: `tests/haeufung_test.zsh`, `tests/tagesroutine_test.zsh`.

## Designer: Einspruchsrecht des Directors (14.11.2026)

Herkunft: Gespräch mit neon, 14.11.2026. Anlass (Beschreibung von neon, kein Wortlaut): Der Maintainer will eine Rolle „Designer“ (Agent, mindestens Opus), hauptverantwortlich für das Gesamtdesign, vom Director in Nachtlauf bzw. Tagesroutine beauftragt, wenn der nächste Eintrag ein Designthema ist; der Designer arbeitet nur nach präzisen Vorgaben (Produktphilosophie, Funktionsumfang eines Mailclients, Apple Mail als Maßstab). Wortlaut des Maintainers: „wie in einer echten firma hat der direktor ein einspruchsrecht wenn die lösungen des designers den fundamentalen grundphilosophien von halo.spaces widersprechen“.
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): Entwurf `docs/design-vorgaben.md` (noch nicht live, `tests/nachtlauf-auftrag.md` unverändert). Der Director prüft das Ergebnis gegen die Grundphilosophien G1–G13 (Abschnitt 3), Einspruch nur mit Zitat der verletzten Regel, der Designer überarbeitet einmal; bleibt es strittig, Eintrag auf „Wartet auf OK“ mit Rückfrage an den Maintainer. Geschmacksfragen sind kein Einspruchsgrund (Abgrenzung offen, Frage F1).

## Designer: Director beauftragt selbstständig, Prüfung vorab (14.11.2026)

Herkunft: Gespräch mit neon, 14.11.2026 (Ergänzung zum Eintrag oben). Wortlaut des Maintainers: „wenn ein status eines tasks auf todo ist und der direktor diesen tasks im verlauf des nachtlaufs oder tageslaufs als nächsten zu bearbeitenden schritt wählt kann der direktor selbstständig den designer beauftragen sich um das problem zu kümmern. nachfragen sollte im besten fall keine entstehen sondern bereits alle im vorfeld überprüft worden sein.“
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers; `docs/design-vorgaben.md` Abschnitt 6a, Entwurf): (1) Der Director beauftragt den Designer bei jedem Todo-Eintrag mit Designthema selbstständig, ohne Rückfrage, in Nachtlauf und Tagesroutine. (2) Vorab-Prüfung vor der Beauftragung: Soll-Zustand eindeutig (Wo/Erwartet/Ist), Apple-Vorlage vorhanden, Maße belegt, kein Widerspruch zu Grundphilosophien oder ENTSCHEIDUNGEN.md, keine offene Entscheidungsfrage; im Plan „Vorab geprüft: ja“. (3) Bei einer Lücke zuerst „Im Zweifel wie Apple“ (Vorlage messen); nur bei echtem Widerspruch oder fehlender Vorlage Rückfrage über „Wartet auf OK“, möglichst vor dem Lauf. (4) Bekannte Lücken stehen als Fragen in `docs/design-vorgaben.md` Abschnitt 9, damit der Maintainer sie vorab schließen kann.
Zweite Ergänzung des Maintainers (14.11.2026, Gespräch mit neon), Wortlaut: „wenn der direktor und/oder designer einen task nicht erldigen konnte weil unklarheiten entstehen müssen diese unklarheiten so bald wie möglich erwähnt werden. beim nachtlauf reicht der morgenbericht, untertags kann mich die session neon direkt kontaktieren und nachfragen“.
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers; `docs/design-vorgaben.md` Abschnitt 8, Entwurf): Unklarheit bei Director oder Designer → Eintrag sofort beim Auftreten auf „Wartet auf OK“ mit Notiz „Rückfrage <Rolle> <Datum>: …“. Nachtlauf: Frage im Bericht „Rückfragen an den Maintainer“ bzw. im Morgenbrief (höchstens 5). Tagesroutine: Frage sofort per SendMessage an die Sitzung neon (nur Name), neon fragt den Maintainer direkt im Gespräch; die Tagesroutine arbeitet mit dem nächsten Eintrag weiter. In `tests/tagesroutine-auftrag.md` und `tests/tagesroutine.sh` noch nicht umgesetzt.

## Designer: offene Fragen nach Apple beantworten, einheitliche Spaces, Vorschaubilder, iPhone tagsüber (14.11.2026)

Herkunft: Gespräch mit neon, 14.11.2026 (Antwort auf die 16 Fragen in `docs/design-vorgaben.md`). Wortlaut des Maintainers: „deine 16 offenen fragen können sicherlich automatisch beantwortet werden wenn man sich ansieht wie das design bei apple mail aussieht. fehlende screenshots kann ich gerne nachliefern. wenn es kein vorbild von apple gibt (wie bei f3) kann der designer basierend auf unseren vorgaben selbst entscheiden. bislang haben wir aber noch nicht exakt den designer definiert und seinen arbeitsauftrag definiert. Frage für F7 - ist es für einen modernen email-client wirklich essentiell bei den attachments auch die dateigrösse anzuzeigen? wie machen das andere email-clients, wie macht es apple? das sollte die frage bereits beantworten. bezüglich f5 - der designer sollte sich um ein einheitliches und konsistentes design in allen spaces kümmern. jeder space in halo.spaces muss der selben grundphilosphie folgen, die spaces dürfen nicht wie unterschiedliche apps aussehen die nicht zusammengehören. bezüglich F1 weiss ich nicht genau was du hier willst. wenn es wirklich offene fragen vom designer gibt die meine entscheidungen in bezug auf design oder grafik benötigen möchte ich immer anhand von vorschaubildern entscheiden, die mir der designer vorlegt. bezüglich tagesroutine - wenn unklarheiten bezüglich design auftreten die ich sofort entscheiden muss möchte ich die nachricht aufs iphone geschickt haben“.
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers; Entwurf, nicht live): `docs/design-vorgaben.md` Abschnitt 9 „Entschiedene Fragen“ (F1–F16 nach Vorlagen bzw. Vorgaben beantwortet, offen nur fehlende Screenshots in 9a), neuer Grundsatz G14 „Einheitlich in allen Spaces“, F7: Apple Mail zeigt in beiden Vorlagen keine Größe, daher keine Größe in der Anhang-Kachel (Größe im Tooltip, damit nichts ersatzlos wegfällt); Rückfragen des Designers nur als Vorschaubilder A/B, nachts über den Morgenbericht, in der Tagesroutine sofort aufs iPhone (Umbau von `tests/tagesroutine.sh` beschrieben, nicht umgesetzt); Arbeitsauftrag Abschnitt 11 und Entwurf `tests/designer-auftrag.md` (nicht eingehängt).

## Designer: F7 entscheidet der Designer; Persönlichkeit und Bedeutung von „Halo“ (14.11.2026)

Herkunft: Gespräch mit neon, 14.11.2026. Wortlaut des Maintainers: „f7 - hier ein screenshot aus outlook von macos bezüglich attachments. fraglich ist nur, ob outlook als besonders schöner und moderner email client gilt. andere email clients welche als schöner und moderner mit besserem design gelten haben vielleicht keine dateigrösse. der designer soll hier entscheiden. bezüglich 1 und 2 hab ich dir jetzt bilder per halobild geschickt“ und „bezüglich designer persönlichkeit: wenn der designer trotz abwägung der grundphilosophie noch immer keine entscheidung treffen konnte kann er auch mich fragen. halo bedeutet Lichthof und bezieht sich bei unserer extension auf die farbigen spaces und in zukunft auch auf deren lichtschein in der sidebar (wenn diese umgesetzt wurden).“
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers; Entwurf, nicht live): `docs/design-vorgaben.md` F7 mit Belegen (Apple Mail ohne Größe, Outlook für macOS und Thunderbird mit Größe) und Entscheidung des Designers als Eichfall E16: keine Größe in der Kachel, Größe im Tooltip; Abschnitt 2 um „Halo = Lichthof“ (2a), Rangfolge bei Konflikten (2b, Ableitung), „ruhig genug“ (2c) und den letzten Ausweg (2d) ergänzt; `tests/designer-auftrag.md` mit den Schritten „Bilder selbst ansehen“ und „Abgleich mit Eichfällen“; Kontakte und Erinnerungen-Details als Vorlagen vorhanden (`contacts-window-*.png`, `erinnerungen-task-*.png`).

## Designer freigegeben, Director mit Designer verbunden; Apple-Screenshots nachgeliefert, kein Tab-Fokus auf Toolbar-Knöpfen (14.11.2026)

Herkunft: Gespräch mit neon, 14.11.2026. Wortlaut des Maintainers: „screenshots für 1 hab ich dir übermittelt. bei punkt 2 - bei apple mail kann man nicht mit tabulator einen toolbar knopf auswählen, daher keine screenshots. bei punkt 3 und 4 hab ich screenshots geschickt. designer ist jetzt freigegeben von mir. verbinde den direktor mit dem designer.“
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): `docs/design-vorgaben.md` ist live, Abschnitt 9a mit den nachgelieferten Vorlagen geschlossen (`mail-toolbar-pille-hover/-active.png`, `mail-hell.png`, `mail-settings-allgemein(-dunkel).png`); Regel zu Punkt 2: Fokusring nur dort, wo Apple einen zeigt, die Tastaturbedienung von Thunderbird bleibt erhalten (G2). Der Director beauftragt den Designer im Nachtlauf (`tests/nachtlauf-auftrag.md` 1a g, 2a; Designfragen nachts nur im Bericht unter „Rückfragen an den Maintainer“) und in der Tagesroutine (`tests/tagesroutine-auftrag.md` „Designer“, `tests/tagesroutine.sh`: Designfragen sofort als „[handeln]“-Push aufs iPhone, die Routine arbeitet weiter). Übersicht `docs/testrechner.md` „Director und Designer“.

## Director trägt PRs mit Nachweis selbst zum Schließen ein (14.11.2026)

Herkunft: Gespräch mit neon, 14.11.2026. Frühere Festlegung (13.11.2026), Wortlaut des Maintainers: „Ja direktor schlägt PRs vor welche geschlossen werden können.“ Frage von neon (kein Wortlaut des Maintainers): Der Director schließt einen PR selbst, wenn (1) der Inhalt nachweislich schon in main ist (Commit-Vergleich), (2) der Fix in einem Release steht, (3) er dem Autor einen freundlichen Dank mit „Fixed in x.y.z“ schreibt; alles andere (abgelehnt, unklar, Inhalt nicht in main) bleibt beim Maintainer. Antwort des Maintainers, Wortlaut: „ja bitte“.
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): Der Director schließt nicht selbst per `gh`, sondern trägt den PR in `tests/pr-freigaben.txt` ein (Issue-Feld `director`, „Director <Datum>, Nachweis: <Hashes>, Release <x.y.z>“), nur wenn alle drei Bedingungen belegt sind und kein nicht übernommener Fremdcode im PR steckt; `publish.sh` schließt ihn über `tests/pr-schliessen.sh`, das jeden Hash gegen das Tag `v<x.y.z>` prüft (sonst „wartet“), mit Dank „Fixed in x.y.z“; nie Merge. Die GitHub-Routinen schließen weiter nie. Bericht: „PRs zum Schließen eingetragen: #n (Nachweis …)“. Stellen: `AGENTS.md`, `tests/nachtlauf-auftrag.md` Schritt 1a e, `docs/github-komm.md`, `docs/dauerfreigaben.md` B, `docs/testrechner.md` „Director im Nachtlauf“; Test `tests/pr_schliessen_test.zsh`.

## Lichtschein: Variante D und Schein in den Einstellungen (14.11.2026)

Herkunft: Gespräch mit neon, 14.11.2026, nach der Vorschau des Designers (Varianten A bis D). Wortlaut des Maintainers: „ich folge der empfehlung des designers mit variante d. bezüglich licht in den einstellungen (hell/dunkel) soll der designer bitte ebenfalls licht einbauen.“ Zum gefundenen Fehler („Design ohne Aufblitzen“, Kopie mit altem Design, Commit 37bf1f2): „bezüglich gefundenem fehler - das kann beim nächsten nachtlauf mitgenommen werden“.
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): Variante D = Kegel um 25 % höher, Breite unverändert (Kern 120 × 113 px, Hauptlicht 230 × 219 px, gefärbte Linie ±219 / ±109,5 px, Stärke 16 % hell / 20 % dunkel; Messung und Bilder des Designers unter ~/halo-aufgaben/vorschau/lichtschein-radius-2026-11-14/). Das ändert die Festlegung vom 13.11.2026 („kein Schein in Einstellungen“); der Webseiten-Space bleibt ohne Schein. Farbe des Scheins in den Einstellungen: offene Frage an den Designer (siehe nächster Eintrag). Der Fehler 37bf1f2 geht mit dem nächsten Nachtlauf ins Release.

## Lichtschein in den Einstellungen: Mehrfarb-Hauch (14.11.2026)

Herkunft: Gespräch mit neon, 14.11.2026, nach der zweiten Vorschau des Designers (Grau stark, Schiefer, Mehrfarb-Hauch; ~/halo-aufgaben/vorschau/lichtschein-einstellungen-2026-11-14/). Rückmeldung des Maintainers vorab, wörtlich: „den lichtkegel bei grau hell sieht man gar nicht in der sidebar weil der hintergrund der sidebar die selbe farbe wie das einfallende licht hat“. Frage von neon (in einfachen Worten): Soll in den Einstellungen der Schein ausnahmsweise nicht der Kachelfarbe folgen, sondern als leiser Mehrfarb-Hauch in allen Space-Farben erscheinen (Empfehlung des Designers), oder Grau stark, oder kein Schein? Antwort des Maintainers, wörtlich: „ja mehrfarb hauch passt“.
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): Im Einstellungen-Space gilt „Scheinfarbe = alle Space-Farben wie der halo.spaces-Ring“ als Ausnahme von „Scheinfarbe = Kachelfarbe“; Stärke halb (8 % hell / 10 % dunkel), Maße Variante D, gleiche Stärke hell und dunkel; Webseiten-Space bleibt ohne Schein. Der Designer setzt es um (Board-Eintrag „Lichtschein Variante D und Schein auch im Einstellungen-Space“). Der Entwurf des Designers nennt als Restbedeutung, dass ein Mehrfarbverlauf von manchen als Regenbogen-Zeichen gelesen werden kann; als blasser Pastellhauch kaum. Der Maintainer hat das gesehen und die Variante gewählt.

## Seitenleiste: Zielbild der aktiven Kachel d2h, inaktive Kacheln 8 %, Schalter schaltet auch die Linie ab (14.11.2026)

Herkunft: Gespräch mit neon, 14.11.2026, nach den Vorschauen des Designers (~/halo-aufgaben/vorschau/kachel-entwicklung-2026-11-14/). Wortlaut des Maintainers: „d2h ist jetzt zielbild.“ und „bezüglich punkt 2 folge ich der empfehlung mit 8%.“ (Punkt 2: inaktive Kacheln 8 % statt 11 %, ändert Eichfall E1). Zusätzlich, wörtlich: „wenn wir via settings den lichtkegel deaktivieren muss natürlich auch die auswirkung der farbe auf vertikale trennline deaktiviert sein.“
Umsetzung (Beschreibung von neon nach den Messwerten des Designers, Deutung nicht des Maintainers; Entwurf, nicht live): Zielbild d2h = aktive Kachel als Lichtquelle mit Neigung des Lichts je Kachelposition ((2,5 − Index) × 30 px); Fläche hell gleichmäßig 34 %, dunkel mit leisem Restverlauf 36 % links bis 44 % rechts; feine Kante rundum 1 px, hell 28 %, dunkel 35 %, rechts 1 px mit 55 % hell bzw. 60 % dunkel und weichem Saum; Lichtkante oben, leiser Schatten unten; gerichteter Lichthof nur rechts; farbige Trennlinie geneigt in heutiger Stärke (nicht die stärkere Linie); inaktive Kacheln 8 %. Gemessen: Unterschied aktiv zu inaktiv ΔE 20 bis 35 (Mail 20,5 hell / 27,1 dunkel), Graustufen ΔL ≥ 7, Deuteranopie ≥ 10; Ausnahme graue Einstellungen-Kachel hell ΔE 8,5. Ersetzt die Kachel F4a (3/3, Ring 40 %, Hof 9 px). Der Schalter für den Lichtschein (`extensions.mailcards.sidebarGlow`) nimmt schon heute `mc-glow` von der Spaces-Leiste und damit die Farbwirkung der Linie; eine Prüfung „Schalter aus: Linie neutral, alle Spaces, eingeblendet und schwebend“ kommt bei der Umsetzung dazu. Umsetzung durch den Designer über das Board (Eintrag F4a 3/3 wird ersetzt).

## Lichtschein nur zusammen mit den neuen Kacheln veröffentlichen (14.11.2026)

Herkunft: Gespräch mit neon, 14.11.2026. Frage von neon (kein Wortlaut des Maintainers): Lichtschein und neue Kacheln nur als ein Paket in dasselbe Release, bis die Kachel d2h fertig und grün getestet ist; die Fehlerkorrektur „Design ohne Aufblitzen“ (37bf1f2) gehört nicht zum Paket und geht wie geplant mit dem nächsten Nachtlauf ins Release. Antwort des Maintainers, wörtlich: „ja, kein lichtschein ohne neue kacheln“.
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers; Entwurf, nicht live): Die Commits zum Lichtschein liegen auf dem Zweig `paket/lichtschein-kachel` und kommen erst nach `main`, wenn Lichtschein und Kachel d2h zusammen fertig und grün sind; bis dahin veröffentlicht kein Release den Lichtschein. Testpakete über /vorab enthalten weiter alles.

## Lichtschein und Kachel d2h dürfen noch in der Nacht auf den 15.11.2026 veröffentlicht werden (14.11.2026)

Herkunft: Gespräch mit neon, 14.11.2026, auf die Frage, ob der Director die Kacheln im heutigen Nachtlauf einbauen und gleich mit dem Lichtkegel veröffentlichen soll (neon schlug vor: Testpaket, Freigabe morgen). Wortlaut des Maintainers: „alternativ dazu  könnten wir natürlich den direktor anweisen im heutigen nachtlauf die kacheln einzubauen, dann könnten wir diese gleich mit dem neuen lichtkegel veröffentlichen“ und „es gibt bei einem neuen design wie den lichtkegeln und den buttons nicht viel zu testen, da diese keine neue funktionalität mit sich bringen. entweder sie sehen gut aus oder nicht.“
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): Der Nachtlauf setzt zuerst die Kachel d2h auf dem Paketzweig um und veröffentlicht bei grünen Prüfungen und grüner CI Lichtschein und Kachel zusammen; ist etwas nicht fertig oder rot, bleibt es auf dem Zweig (`tests/nachtlauf-auftrag.md` Schritt 1a). „Kein Lichtschein ohne neue Kacheln“ gilt unverändert.

## Designer und Director bekommen ein Gedächtnis und lernen dazu (14.11.2026)

Herkunft: Gespräch mit neon, 14.11.2026, auf die Fragen „Lernt der Designer eigentlich mit jeder getroffenen Entscheidung dazu …“ und „Lernt der Direktor dazu?“ sowie die Rückfrage, warum der Eintrag auf „Wartet auf OK“ steht. Wortlaut des Maintainers: „Designer und Direktor müssen ein Gedächtnis haben und dazulernen“.
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): Designer: Schritt 9 „Dazulernen“ in `tests/designer-auftrag.md` und Schritt 8 in `docs/design-vorgaben.md` 6b (neue Regeln, Maßstäbe und Entscheidungen am Ende jedes Laufs in `docs/design-vorgaben.md` eintragen; Commit 8c1912c). Director: Rückblick „Plan gegen Ergebnis“ am Ende des Nachtlaufs in `~/halo-nacht/rueckblick.md`, den der Director beim Planen liest (Board-Eintrag „Director lernt aus Rückblick“, Status Todo). Die Gegenmittel gegen die Nachteile (nur belegte Zeilen mit Quelle und Wiederholung, Höchstlänge, Ablauf alter Zeilen, Rückblick ändert nur Schätzungen und nie die Rahmenregeln, Regeln für den Auftrag nur als Vorschlag im Morgenbericht) sind Entwurf von neon; ob Regeln ohne Bestätigung des Maintainers in den Auftrag dürfen, ist nicht entschieden.

## Jede Rolle bei halo.spaces hat ein Gedächtnis und lernt aus Fehlern und Erfolgen (14.11.2026)

Herkunft: Gespräch mit neon, 14.11.2026, Zusatz zur Entscheidung „Designer und Direktor müssen ein Gedächtnis haben und dazulernen“. Wortlaut des Maintainers: „Zusatz: Halo.spaces wird wie eine Firma geführt in der unterschiedliche Persönlichkeiten für unterschiedliche Zwecke arbeiten. Jede aktuelle und zukünftig angestellte Persönlichkeit muss ein Gedächtnis haben und aus ihren Fehlern und Erfolgen dazulernen“
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): Gilt für alle heutigen Rollen (Director, Designer, Nachtlauf, Tagesroutine, CI-Wächter, Wochen- und Doku-Prüfung, Rundgang, GitHub-Kommunikation, neon, neon-board) und jede künftige. Eine neue Rolle wird nur eingeführt, wenn ihr Auftrag einen Schritt „Dazulernen“ und einen Ort für ihr Gedächtnis (Datei mit Quelle, Höchstlänge, Ablaufdatum der Zeilen) enthält. Board-Eintrag „Ablauf: Gedächtnis für jede Rolle“ (Todo) legt Ort und Form je Rolle fest.

## GitHub: Inaktivitätsregel für Issues, die auf Nutzer warten (15.11.2026)

Herkunft: Gespräch des Maintainers mit der Sitzung halo-github (github.comm.routine), 15.11.2026; der Wortlaut wurde von dieser Sitzung an neon weitergegeben, der Maintainer hat ihn in neon bestätigt („ich erlaube es“, 15.11.2026, nach Rückfrage von neon). Wortlaut des Maintainers: „ja neue regel für die zukunft - wenn wir auf github auf die antwort eines nutzers warten fragen wir nach 1 woche wartezeit erneut nach. dann warten wir wieder eine woche und wenn bis dahin noch immer keine antwort kommt wird das issue geschlossen mit dem hinweis auf inactivity.“ Auf die Rückfrage, ob die Regel auch rückwirkend gilt: „ja rückwirkend auch“. Zur Ausnahme: „wenn der nutzer natürlich auf einen fix von uns wartet gilt selbstverständlich die ausnahme, das hast du richtig angenommen“.
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): Regel mit Markierung „we will close this issue due to inactivity“ im Stand `~/halo-aufgaben/github-komm-stand.md` und in `docs/github-komm.md`; die Nachfrage postet die Routine (halo-github), das Schließen macht neon bzw. der Maintainer, nicht halo-github; bewusst offene Issues (z. B. #59) und Issues, bei denen der Nutzer auf unseren Fix wartet (z. B. #45), sind ausgenommen. Nachfragen am 15.11.2026 bei #31 und #52; Frist 22.11.2026 14:00 Wiener Zeit. Das Schließen ist nach außen sichtbar; neon schließt erst, wenn der Maintainer es an dem Tag bestätigt (Vorschlag von neon, nicht entschieden).

## GitHub: Inaktive Issues werden nach zwei Wochen Wartezeit automatisch geschlossen, ohne Rückfrage (15.11.2026)

Herkunft: Gespräch mit neon, 15.11.2026, Ergänzung zur Inaktivitätsregel (siehe Eintrag davor) und zur Aussage „wichtig für die neue regelung ist, dass sie allgemeingültig ist und wir nicht einzelne erinnerungen irgendwo eintragen müssen“. Wortlaut des Maintainers: „und ich möchte dass das schliessen von inaktiven github issues wo wir 2 wochen auf antwort gewartet haben automatisch geschieht ohne mich zu fragen“
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers; geändert 15.11.2026 nach den Ergänzungen unten): Ersetzt den Vorschlag von neon, vor dem Schließen die Bestätigung des Maintainers einzuholen, und die Zuständigkeit „neon bzw. Maintainer, nicht halo-github“ aus dem Eintrag davor. Das Schließen macht `tests/inaktivitaet.sh` allgemeingültig aus dem Zustand auf GitHub, ohne Einzel-Fristen, allein im Lauf der GitHub-Routine (Vorprüfung `tests/github-vorpruefung.sh`, 9/14/19 Uhr), nicht im Nachtlauf; die Vorprüfung meldet der Routine auch fällige Nachfragen, die Routine postet sie. Ausnahmen über das Label `keep-open`/`waiting-on-us` bzw. `tests/inaktivitaet-ausnahmen.txt`; nach /clear nennt der Rollenblock in `tests/neon-hook.sh` die Regel; Dauerfreigabe Stufe B (`docs/dauerfreigaben.md`).
Ergänzung (Gespräch mit neon, 15.11.2026, über die beauftragende Sitzung weitergegeben): „ok aber eigentlich sollte sich nicht nur der nachtlauf darum kümmern sondern die github routine um 9/14/19 uhr. diese sollte auch nach einem /clear diese allgemeine regel kennen.“
Ergänzung (Gespräch mit neon, 15.11.2026, über die beauftragende Sitzung weitergegeben): „wir sollten nicht zuviel in den nachtlauf hineinpacken, wenn der ablauf gestört wird hängen zuviele issues dran“
Ergänzung (Gespräch mit neon, 15.11.2026): „solange ein user auf unsere antwort oder ein feature von uns wartet werden die entsprechenden issues nicht geschlossen. die github routine überprüft ja regelmässig alle github issues und muss auch entsprechend überprüfen, ob eventuell ein feature oder fix von unser released wurde dass mit dem gemeldeten issue zu tun hat. wenn das der fall ist soll eine antwort mit dem hinweis des fix im neuen release vermerkt werden und das issue geschlossen werden.“
Umsetzung (Deutung von neon, nicht des Maintainers): Das ist die allgemeine Regel statt einzelner Ausnahmen; offen bleibt jedes Issue, in dem ein Nutzer auf uns wartet (auch auf eine zugesagte Funktion, z. B. #54). Die GitHub-Routine prüft zusätzlich bei jedem Lauf die Releases gegen offene Issues und schließt mit Hinweis auf das Release, wenn ein Fix oder eine Funktion dazu veröffentlicht wurde. Umsetzung steht als Board-Eintrag aus.
Entscheidung (Gespräch mit neon, 15.11.2026): „ich folge deinen empfehlungen“, bezogen auf die Empfehlung von neon, die Labels `keep-open` und `waiting-on-us` nicht anzulegen (Nutzer-Wartezustand erkennt die Routine am Gesprächsverlauf).

## Ein einziger Bericht statt Morgenbrief und Nachtlauf-Bericht (15.11.2026)

Herkunft: Gespräch mit neon, 15.11.2026. Wortlaut des Maintainers: „ich denke wir sollten morgenbrief und bericht nachtlauf zusammenführen und einen einzigen bericht machen.“ und, nach Rückfrage von neon (die Nachricht war abgebrochen): „ja wir sollten nur einen bericht haben. dieser sollte sowohl den vergangenen nachtlauf zusammenfassen und auch die vorschau auf den heutigen ablauf der tagesroutine (falls dieser ablauf nicht von mir manuell geändert wird). wie von dir vorgeschlagen sollte der morgenbericht aus einer kurzen zusammenfassung und dann den technik details zum aufklappen bestehen“. Davor, ebenfalls wörtlich: „der morgenbrief sollte kürzer und weniger technisch ausfallen.“ und „schicke nie den pfad zu (nacht, morgen) berichten, der nützt mir in dieser session nichts. ich möchte stattdessen immer den bericht hier am laptop in dieser session öffnen können“.
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): Ein Bericht je Tag, `~/halo-berichte/<datum>-bericht.md`, setzt `tests/morgenbrief.sh` um 08:30 ohne Sprachmodell aus den vorhandenen Quellen zusammen: Kurzfassung in einfachen Worten oben (höchstens 10 Zeilen: was in der Nacht geschah, was rot ist, Rückfragen als kurze Ja/Nein-Fragen, Vorschau auf die Tagesroutine, Kontingent), darunter die Technik-Details (Nachtlauf-Bericht, Briefzeilen, CI, Windows, Aufräumen, Tagesroutine) zum Aufklappen. Die Vorschau ordnet die offenen Einträge des Boards nach den festen Regeln, nennt Pause und Volldampf und ist unverbindlich (die erste Plan-Runde um 09:00 entscheidet; ändert der Maintainer den Ablauf von Hand, gilt das). Geöffnet wird der Bericht als Seite in der Sitzung mit `/bericht`, nie als Pfad; aufs iPhone geht weiter eine kurze Meldung ohne Pfade und Hashes. Der Nachtlauf schreibt seinen Bericht unverändert und wird dafür nicht länger (Maintainer 15.11.2026: „wir sollten nicht zuviel in den nachtlauf hineinpacken“).

## Director entscheidet nach fehlgeschlagenem Nachtlauf selbst über ein Release unter Tage (15.11.2026)

Herkunft: Gespräch mit neon, 15.11.2026, nach der Nacht auf den 15.11. (kein Release wegen roter Windows-CI). Wortlaut des Maintainers: „der direktor soll bitte ab sofort bei fehlgeschlagenen nachtläufen selbst entscheiden, ob die commits und änderungen des fehlgeschlagenen nachtlaufs so wichtig sind dass diese aufgrund des fehlgeschlagenen nachtlaufs einen release unter tage rechtfertigen“
Ergänzung des Maintainers (15.11.2026, über neon): „wenn der fehlgeschlagene release des nachtlaufs wichtig genug ist damit es am tag dennoch released wird sollte der wunsch des direktors im morgenbericht stehen damit ich es weiss“
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers; umgesetzt 15.11.2026: tests/release-nachtlauf-gescheitert.sh, tests/release-unter-tage.sh, NUR_CI=1 in release.sh, tests/tagesroutine-auftrag.md „Release unter Tage“, Wunsch-Zeile „Release unter Tage: Wunsch ja/nein – …“ im Nachtlauf-Bericht, Kriterien docs/release.md): Ändert die Regel „Tagsüber nur, was Nutzer gerade spüren; alles andere veröffentlicht der nächste Nachtlauf“ (AGENTS.md, Release) nur für diesen Fall: Ist der letzte Nachtlauf ohne Release geblieben, entscheidet der Director in der ersten Plan-Runde der Tagesroutine selbst, ob die Änderungen so wichtig sind (spürbar für Nutzer: Fehlerkorrekturen, Sicherheit, von Nutzern gemeldete Bugs; nicht reine Design- oder Ablaufänderungen), dass ein Release unter Tage gerechtfertigt ist, und begründet das im Bericht. Die Bedingung „grüne Tests“ (Testmarke von release.sh, vollständig grüne CI samt Windows) und „höchstens ein reguläres Release pro Tag“ bleiben unverändert.

## Rote Prüfung, die jedes Release verhindert, hat höchste Priorität (15.11.2026)

Herkunft: Gespräch mit neon, 15.11.2026, nach der Frage, ob ein vom Lichtschein unabhängiges Flackern der Windows-Prüfung nicht höhere Priorität im Tagesablauf haben müsste. Wortlaut des Maintainers: „wenn ein fehler wie das flackern allgemein JEDEN release verhindern würde muss so ein fehler mit höchster priorität behoben werden. ohne regelmässige updates können wir das produkt nicht weiterpflegen und unserer produktphilosophie folgen.“
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): Ein Fehler, der jedes Release verhindert (rote oder flackernde Prüfung, die die Testmarke blockiert), geht in jedem Lauf (Nachtlauf, Tagesroutine, von Hand gestartete Sitzungen) allen anderen Einträgen vor, auch Schwere und Bereichsfolge. Im Nachtlauf wird er vor dem erneuten Zusammenführen des Pakets mit Lichtschein und Kachel behoben (belegte Ursache, Prüfung nie abschwächen); danach führt der Director das Paket ohne Rückfrage erneut zusammen. Letzteres (Zusammenführen ohne Rückfrage) ist Deutung von neon aus der Antwort des Maintainers auf die Empfehlung, nicht sein Wortlaut.

## Favoriten bündig bei unveränderter Breite, Name der lokalen Ordner darf gekürzt erscheinen (15.11.2026)

Herkunft: Gespräch mit neon, 15.11.2026, zum Eintrag „Seitenleiste: Favoriten-Symbole und Überschrift an den Spalten der Konten ausrichten“ (Rückfrage der Tagesroutine vom 14.11.). Wortlaut des Maintainers: „anstelle dass wir die ganze logik der sidebar umbauen sollten wir den einfacheren weg gehen und den namen "local folder" optisch abkürzen falls das notwendig ist. jene user, denen der vollständige name von local folders wichtig ist, können frei die sidebar via verschiebbare trennleiste vergrössern bei bedarf.“
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): Variante A bündig (Favoriten-Symbole auf der Spalte der Kontoordner, „Favourites“ an den Kontonamen, Konten unter All Inboxes/All Sent eine Stufe tiefer), aber ohne Änderung der Standardbreite (bleibt 206 px, kein 240); der Name der lokalen Ordner darf bei Platzmangel mit „…“ gekürzt erscheinen. Die Prüfung „Ordnerliste: im neuen Profil 206 px breit, ‚Local Folders‘ nicht gekürzt“ wird entsprechend geändert (Vorgabe des Maintainers, keine Abschwächung nach eigenem Ermessen); die Aufgabenliste-Prüfung bleibt unverändert. Der Linux-Befund (Ordnerliste dort nur 160 px) ist getrennt zu klären und vor dem Push unter Linux zu belegen (Prüfzweig).

## Designer macht beim Design-Rundgang eigene Gestaltungsvorschläge (15.11.2026)

Herkunft: Gespräch mit neon, 15.11.2026, zum Eintrag „Design-Rundgang wieder einschalten, Auswertung durch den Designer“. Wortlaut des Maintainers: „ich möchte dass der designer ab sofort beim design-rundgang auch eigene vorschläge bezüglich anpassung unseres designs gibt. beispiel: vermutlich werden wir im laufe der kommenden tage die neuen lichtkegel und die neuen licht-kacheln veröffentlichen. bezugnehmend auf diese neue optik und unsere design philosophie könnte der designer bei einem rundgang entscheiden, dass ab sofort die aktiven buttons bei allen spaces eine farbige umrandung gemäß der space lichtkegel farbe bekommt, sofern das weiterhin unserem anspruch entspricht den schönsten und modernsten email client zu bauen.“
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): Der Rundgang des Designers prüft nicht nur Abweichungen von Vorlagen und Vorgaben, sondern macht auch eigene Vorschläge zur Weiterentwicklung des Designs, gemessen an Designphilosophie und Anspruch („der schönste und modernste E-Mail-Client“); das Beispiel (farbige Umrandung aktiver Knöpfe in der Farbe des Space-Lichtkegels) ist ein Beispiel, kein Auftrag. Ob der Designer einen Vorschlag selbst umsetzen darf oder der Maintainer ihn vorher sieht (Vorschaubild), hat der Maintainer nicht gesagt; bis dahin gilt: Vorschlag mit Vorschaubild im Bericht, Umsetzung erst nach Freigabe (Regel „Optionen nur wie Apple“ und „Im Zweifel wie Apple“ bleiben Rahmen, Abweichungen begründet der Designer).

## Skill systematic-debugging muss in allen Sitzungen und Unteragenten verfügbar sein (15.11.2026)

Herkunft: Gespräch mit neon, 15.11.2026, nachdem `/systematic-debugging` in der Sitzung nicht verfügbar war. Wortlaut des Maintainers: „dieser skill muss für alle sessions verfügbar sein. ansonsten würden unteragenten im zuge des nachtlaufs oder tagesablaufs diesen nicht zur verfügung stehen haben.“
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): Der Skill (MIT-Lizenz, Quelle: synchronisiertes Plugin „superpowers“, Lizenzdatei als LICENSE-Quelle beigelegt) liegt jetzt als Benutzer-Skill in ~/.claude/skills/systematic-debugging auf neon; eine neue `claude -p`-Sitzung im Projekt findet ihn (geprüft 15.11.2026). Nicht im Repo (öffentlich, fremde Datei). Bei neuer Einrichtung des Mac mini oder Auf dem Laptop muss der Ordner ebenfalls dorthin; Prüfung steht aus.

## Kontextmenüs der Kacheln: Umsetzung im Paketzweig (15.11.2026)

Herkunft: Gespräch mit neon, 15.11.2026, zur Rückfrage der Tagesroutine beim Eintrag „Spaces-Leiste: Kontextmenüs der Kacheln deaktivieren“ (jetzt auf main oder im Paketzweig mitnehmen); neon empfahl den Paketzweig. Wortlaut des Maintainers: „ja“ (auf die Frage „Soll das Menü in den Paketzweig?“ nach der Aussage, der Paketzweig sei die risikoärmere Variante).
Umsetzung (Deutung von neon, nicht des Maintainers): Der Eintrag wird auf paket/lichtschein-kachel zusammen mit dem Umbau der Kacheln umgesetzt, nicht auf main. Der Zweck des Eintrags ist, dass ein Rechtsklick auf eine Kachel kein Menü mehr zeigt; neon hatte ihn dem Maintainer vorher irrtümlich als „Menü soll erscheinen“ beschrieben.

## Ablauf: Board-Zugriffe bei Abfragelimit wiederholen, verlorene Notizen nachtragen, freigegeben (15.11.2026)

Herkunft: Gespräch mit neon, 15.11.2026; Vorlage des Eintrags (Beleg: zwei Einträge blieben wegen verlorener Notizen auf Todo, obwohl behoben) mit der Frage „Soll ich ihn freigeben?“. Wortlaut des Maintainers: „ja“.
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): Der Eintrag „Ablauf: Board-Zugriffe bei Abfragelimit wiederholen, verlorene Notizen nachtragen“ steht auf Todo und wird von den Läufen umgesetzt (tests/board.sh, CI-Wächter).

## Halo als übergeordnetes Gestaltungsmerkmal für alle Bereiche (15.11.2026)

Herkunft: Gespräch des Maintainers mit dem Designer (Sitzung designer), 15.11.2026. Wortlaut des Maintainers: „wir haben uns vor kurzem für ein neues design der kacheln und der lichtkegeln festgelegt. dieses neue design wurde allerdings noch nicht released, ist also unveröffentlicht. der name dieses projects heisst "halo.spaces" und bezieht die farbigen buttons und die lichtkegeln sind die entsprechenden design-elemente. die buttons und die lichtkegeln sind das übergeordnete gestaltungsmerkmal für alle anderen bereiche von halo.spaces, das betrifft dialoge, popups, buttons, etc. natürlich auch weiterhin im hinblick auf das ruhige design von apple apps (mail, calender, etc.).“
Empfehlungen des Designers darauf (Beschreibung des Designers, kein Wortlaut des Maintainers): (1) Der Hauptknopf in Dialogen (z. B. OK, Senden, Erstellen) trägt die Farbe des aktiven Space nach der Bauart der Kachel d2h. Der Fokusring bleibt in der Systemfarbe, damit er nicht mit dem Halo verwechselt wird (G5). Die genaue Form des Knopfs entscheidet der Maintainer am Vorschaubild, das gerade entsteht. (2) Dialoge und Popups bekommen keinen eigenen Lichtkegel. Je Dialog oder Popup trägt nur ein Element Farbe und Licht, der Hauptknopf. Den Lichtkegel gibt es nur in der Seitenleiste. (3) Harte Regel als G15. Reihenfolge: Übertragung erst, wenn das Paket Lichtschein und Kachel d2h veröffentlicht ist, dann Bereich für Bereich mit Vorschaubildern, zuerst Dialoge mit Hauptknopf.
Wortlaut des Maintainers darauf: „ich folge deinen empfehlungen und möchte ein vorschaubild“
Umsetzung (Beschreibung des Designers, Deutung nicht des Maintainers): Regel G15 „Halo führt“ in `docs/design-vorgaben.md` (dazu P2, 2a, G11, Abschnitt 4 „Akzent“, F3, Eichfall E19); Einspruchsgründe jetzt G1–G15. G15 gilt für die Umsetzung erst, wenn das Paket Lichtschein und Kachel d2h veröffentlicht ist; vorher färbt kein Lauf Dialoge, Popups oder Knöpfe um.

Nachtrag (Gespräch des Maintainers mit dem Designer, Sitzung designer, 15.11.2026; ersetzt den Vermerk „Farbe offen“): Frage des Designers, kein Wortlaut des Maintainers: Ob eine je Space wechselnde Knopffarbe unruhig wirkt. Empfehlung des Designers: Der Halo kommt über das Licht, nicht über die Farbe; der Hauptknopf hat in allen Spaces dieselbe Farbe, die Systemfarbe, in der Bauart „Satt mit Licht“ (helle Kante oben, weicher Schein nach unten); die Space-Farbe bleibt nur an den Kacheln und im Lichtkegel der Seitenleiste. Zustände: bereit, gedrückt (dunkler, ohne Licht), gesperrt (grau, flach, ohne Licht). Wortlaut des Maintainers darauf, unverändert: „ich folge deinen empfehlungen. konsistentes space-übergreifendes design ist hier wichtiger. bitte mach mir eine neue vorschau gemäß deinen empfehlungen“. Messwerte der Zustände nach Freigabe der Vorschau über einen Board-Eintrag, bis dahin keine Umsetzung.
Nachtrag (Gespräch des Maintainers mit dem Designer, Sitzung designer, 15.11.2026), Wortlaute des Maintainers, unverändert, in dieser Reihenfolge: 1. „die vorschau passt. ein wichtiger zusatz - das neue button design muss natürlich für alle buttons gelten, ebenso solche, die nur ein grafisches icon beinhalten. (zum beispiel attachment-icon beim fenster einer offenen mail)“ 2. „bei meinem zusatz meinte ich den button mit der büroklammer“ 3. „1.knopf-familie passt so
2. ja
3. du brauchst mir hier kein vorschaubild machen, ich folge deiner empfehlung.“ Vorschläge des Designers, auf die sich die Antworten beziehen (Beschreibung des Designers, kein Wortlaut): Knopf-Familie (Hauptknopf, Textknopf, Symbolknopf mit Zuständen bereit, Maus, gedrückt, gesperrt; Büroklammer als Symbolknopf; einzeln stehende Symbolknöpfe rund grau mit Lichtkante), Antwort 2: die zwei Wahrnehmungsregeln (Abschnitt 10 von docs/design-vorgaben.md), Antwort 3: Der Senden-Knopf im Verfassen-Fenster ist dort der Hauptknopf (Systemfarbe, Licht, weißes Symbol). Einzelheiten und Vorschauseiten in G15 von docs/design-vorgaben.md. Umsetzung erst nach Veröffentlichung des Pakets Lichtschein und Kachel d2h, über einen Board-Eintrag.

## Vorrang „aus einem Guss“, Bestandsaufnahme aller Fenster und Dialoge (15.11.2026)

Herkunft: Gespräch des Maintainers mit dem Designer (Sitzung designer), 15.11.2026. Anlass, Wortlaut des Maintainers: „aktuell haben wir bei halo.spaces zwar einen guten design-ansatz, aber momentan wirkt die extension noch wie ein fleckenteppich. unterschiedliche buttons, unterschiedliche icons, unterschiedliches design bei fenstern, fehlende elemente bei buttons wie rechts seite zeigt kein icon (hierfür existiert bereits ein eintrag auf der aufgabenliste), verschobene bereiche beim verfassen email fenster wie subject, topic, etc. - bei uns wirkt halo.spaces momentan nicht wie aus einem guss.“
Vorschlag des Designers darauf (Beschreibung des Designers, kein Wortlaut des Maintainers): Programm „Aus einem Guss“ in drei Schritten: (1) Bestandsaufnahme aller Fenster und Dialoge im Testprofil ohne Änderung am Programm; (2) vier Grundbausteine, je mit Vorschau zur Freigabe: Knöpfe, Symbole, Fenster und Dialoge, Felder und Formulare; (3) Umsetzung Baustein für Baustein über alle Fenster zugleich, dazu eine Prüfung je Lauf, die Abweichungen vom Baustein meldet. Reihenfolge nach Sichtbarkeit: Verfassen-Fenster, Mail-Fenster, Dialoge. Frage 2 des Designers: Soll „aus einem Guss“ Vorrang vor neuen Funktionen haben, bis die vier Bausteine stehen? Fehler, die die Mail-Funktion stören, gehen weiter vor (G1).
Antwort des Maintainers, Wortlaut: „1. ja und von mir aus können wir die bestandsaufnahme bereits heute laufen lassen. du kannst dem director empfehlen diesen rundgang bereits heute im tagesablauf zu starten wenn du für diesen rundgang eine höhere priorität siehst gemäß designphilosophie
2. ja aus einem guss hat vorrang
3. besonders stören mich aktuell popups oder fenster vom originalen thunderbird design, welche noch nicht via halo.spaces angepasst wurden. zum beispiel das fenster im kalender space das man sieht, wenn man eine invitation im kalender doppelklickt“
Umsetzung (Deutung von neon, nicht des Maintainers): Programm und Rangfolge in `docs/design-vorgaben.md` (2b Punkt 4, G14, F13, Abschnitt 12). Einträge, die zu den vier Bausteinen gehören bzw. die Einheitlichkeit herstellen, gehen neuen reinen Funktionen vor, bis die vier Bausteine stehen; davor bleiben Fehler, die jedes Release verhindern (Eintrag „Rote Prüfung …“ vom 15.11.2026), G1 und die übrigen Bugs. Fenster im originalen Thunderbird-Design sind die dringendsten Abweichungen. Die Regel steht kurz in AGENTS.md, `docs/board.md`, `docs/testrechner.md`, `tests/nachtlauf-auftrag.md` (Rahmenregel b) und `tests/tagesroutine-auftrag.md` (Schritt 2). Die Bestandsaufnahme (Schritt 1) steht als Board-Eintrag „Design: Bestandsaufnahme aus einem Guss (alle Fenster, Dialoge, Popups)“ (Reihe 1/3) mit der Empfehlung des Designers an den Director, sie heute in der Tagesroutine zu starten (nach Release-Blockern und G1-Fehlern, vor allen übrigen Einträgen).

## Rundgänge und Bestandsaufnahme archivieren und verzeichnen (15.11.2026)

Herkunft: Gespräch des Maintainers mit dem Designer (Sitzung designer), 15.11.2026. Frage des Maintainers, Wortlaut: „und werden dann alle screenshots archiviert und indiziert für zukünftige arbeiten?“
Vorschlag des Designers darauf (Beschreibung des Designers, kein Wortlaut des Maintainers): 1. Gleiches Verzeichnis: Die Bestandsaufnahme legt ihr Verzeichnis im selben Aufbau an wie der Wochen-Rundgang (<hell|dunkel>-ergebnis.json: id, Bereich, Art, Beschreibung, erreichbar, Bilder). Je Fenster zwei Felder dazu: Zustand (halo / teilweise / original), Auffälligkeiten nach Baustein (Knöpfe, Symbole, Fenster und Dialoge, Felder und Formulare); so lassen sich spätere Läufe automatisch vergleichen (rundgang_vergleich.py). 2. Dauerhaft aufbewahren, nie löschen: die Bestandsaufnahme vom 15.11.2026 (Vorher-Bild für „aus einem Guss“) und je veröffentlichter Version ein Rundgang; alle übrigen Rundgänge wie bisher Bilder nach 8 Wochen löschen, JSON bleibt (rund 85 MB je Lauf; Lauf vom 5.11.: 547 Bilder, 84 MB). 3. Gesamtverzeichnis: Die Liste aus dem Quelltext (Karte I6P5o) wird das Gesamtverzeichnis aller Fenster mit neuestem Bild, Zustand und Verlauf; dort sucht man künftig zuerst (Designer, Nachtlauf, die spätere wiederkehrende Prüfung I5aks, bleibt unberührt). 4. Nie ins Repo, nur Testdaten.
Antwort des Maintainers, Wortlaut: „ja einverstanden“
Umsetzung (Deutung von neon, nicht des Maintainers): Die Bestandsaufnahme liegt in `~/halo-aufgaben/vorschau/bestandsaufnahme-2026-11-15/` mit der Datei `DAUERHAFT` („dauerhaft, nicht löschen“), dazu der Verweis (symbolischer Link) `~/halo-tour/2026-11-15-bestandsaufnahme`, damit `rundgang_vergleich.py --vorher` sie neben den Wochen-Rundgängen findet; die automatische Wahl des vorigen Rundgangs nimmt nur reine Datumsordner und damit nicht die Bestandsaufnahme. Der Löschlauf des Wochen-Rundgangs (`rundgang_ausduennen` in `tests/vorpruefung.zsh`) überspringt Ordner mit `DAUERHAFT` und symbolische Links. Für „je veröffentlichter Version ein Rundgang“ legt, wer veröffentlicht, `DAUERHAFT` (mit Version) in den ersten Rundgang danach; ältere Läufe werden nicht rückwirkend zugeordnet. Das Gesamtverzeichnis (Punkt 3) entsteht über die Karte I6P5o (neon-board). Einzelheiten `tests/MAC-MINI.md`, Abschnitt Rundgang.

## Alle Einträge zu Optik und Design gehören immer dem Designer (15.11.2026)

Herkunft: Gespräch des Maintainers mit neon, 15.11.2026. Wortlaut des Maintainers: „ich möchte alle tasks auf der aufgabenliste welche mit optik und design zu tun haben immer dem designer übergeben. der designer ist verantwortlich für die gesamtoptik von halo.spaces“
Nachtrag, Wortlaut des Maintainers (15.11.2026), auf die Rückfrage von neon, ob die heutige Liste einmal ausdrücklich zugeordnet werden soll: „nein. der direktor legt die priorität der tasks auf der liste fest und weist sie dem designer bei bedarf zu“
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): Der Director legt wie bisher Reihenfolge und Priorität aller Einträge fest und weist Einträge zu Optik und Design beim Planen dem Designer zu; der Designer wählt weder Reihenfolge noch Einträge selbst, und die Liste wird nicht gesondert durchgesehen. Ein Eintrag zu Optik und Design wird nur vom Designer umgesetzt, kein anderer Agent setzt ihn selbst um. Das gilt auch für gemischte Einträge, soweit der sichtbare Teil betroffen ist (Aussehen an den Designer, Logik normaler Ablauf). Der Designer ist für die Gesamtoptik verantwortlich: er achtet auch bei Einträgen anderer Bereiche und bei Fehlerbehebungen mit sichtbarer Wirkung auf Einheitlichkeit. Regeln: `AGENTS.md` (Konventionen, Designer), `docs/design-vorgaben.md` (Abschnitt 2, F13), Aufträge von Nachtlauf und Tagesroutine.

## Design-Einträge: sofort eintragen, Designer bildet Gruppen, höchstens eine Gruppierung je Lauf (15.11.2026)

Herkunft: Gespräch des Maintainers mit neon, 15.11.2026. Fragen von neon, auf die er antwortet (Beschreibung von neon): Eigene Design-Bugs weiter direkt eintragen (Director weist zu); Gruppen durch den Designer statt durch den Director; Häufigkeit der Anfrage. Wortlaut des Maintainers zu den Gruppen: „aktuell gruppiert der direktor ja bugs und features in zusammenhängende gruppen. sollte aber nicht der designer diese funktion übernehmen wenn es um zusammenhängende einträge geht das design und die optik betreffend?“ Wortlaut des Maintainers zur Zustimmung: „ja. diese regelung schützt uns vor stückwerk-arbeit, wo wir mehr zeit verschwenden mit dem bearbeiten von einzelnen tasks anstelle ein regelwerk für multiple einträge zu nutzen.“
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): Eigene Bugs und Wünsche zu Optik und Design trägt der Maintainer weiter sofort als Entwurf ein; der Director weist sie dem Designer zu. Der Designer bildet die Gruppen aller Design-Einträge nach den vier Bausteinen und legt Zusammengehöriges zusammen; Priorität und Reihenfolge bleiben beim Director, Häufung erhöht sie wie bisher; Einträge mit Logik gruppiert der Director, der Designer bekommt den sichtbaren Teil. Höchstens eine Gruppierung je Lauf, nur bei neuen oder geänderten Design-Einträgen; Tagesroutine übernimmt die letzte, im Sparmodus immer.

## Design-Rundgang wieder an, auf Sonntag verschoben (15.11.2026)

Herkunft: Gespräch des Maintainers mit neon, 15.11.2026. Wortlaut des Maintainers: „bitte aktiviere wieder den wöchentlichen design-rundgang. dieser läuft aktuell jeden samstag oder? wäre es nicht sinnvoll die doku-prüfung und den design-rundgang an 2 verschiedenen tagen am wochenende, also samstag und sonntag laufen zu lassen anstelle am selben tag?“
Umsetzung (Beschreibung von neon, Deutung nicht des Maintainers): Die Pause vom 13.11.2026 in `pausen.txt` ist aufgehoben (Sicherung `~/halo-sicherung/pausen.txt.vor-rundgang-2026-11-15`). Der Rundgang läuft sonntags 10:00 statt samstags (LaunchAgent und `tests/mac-mini-setup.sh`); Doku-Prüfung bleibt samstags 08:00, Wochenprüfung sonntags 08:00. Der Rundgang wartet weiter auf laufende Prüfungen (spätester Start 14:00). Der Eintrag „Ablauf: Design-Rundgang wieder einschalten, Auswertung durch den Designer“ ist damit freigegeben.
Nachtrag (Gespräch des Maintainers mit neon, 15.11.2026), Wortlaut: „den design-rundgang bitte ebenfalls um 08:00 festlegen. falls der nachtlauf noch aktiv ist wird der design-rundgang automatisch danach gestartet oder?“ Umsetzung (Beschreibung von neon): Der Rundgang läuft sonntags 08:00 (LaunchAgent geladen). Er wartet auf laufenden Nachtlauf, Wochenprüfung, Doku-Prüfung, CI, Testläufe und Sitzungen und startet danach von selbst, spätestens um 14:00; zuerst wartet er 60 Sekunden, damit die Sperrdatei der gleichzeitig startenden Wochenprüfung sicher da ist.
Wortlaut des Maintainers zu „Ablauf: CI-Wächter – Schlüssel für Fehlerprotokoll ohne Ort …“ (15.11.2026): „ansonsten folgende ich deinen empfehlungen bezüglich schlüssel.“ (Empfehlung von neon: Ja.)
Nachtrag (Gespräch des Maintainers mit neon, 15.11.2026), Wortlaut: „hätte das auch nachteile im vergleich zur jetzigen schedule? falls nein oder falls geringere nachteile deinen vorschlag umsetzen“ (Vorschlag von neon: Rundgang samstags 22:15, Wochenprüfung sonntags 08:00 und Doku-Prüfung samstags 08:00 bleiben; Gründe: Rundgang braucht als Einziger die Fenster und stört sich mit der Tagesroutine, nach 22:00 ist der Mac frei, die Wochenprüfung wertet den Rundgang der Woche aus, der Nachtlauf nimmt die Funde mit). Umsetzung (Beschreibung von neon): Der Rundgang läuft samstags 22:15 (LaunchAgent geladen), spätester Start 23:30, claude wird spätestens um 01:15 beendet, damit um 01:30 nichts mehr läuft; die Wartezeit von 60 s entfällt. Nachteile, die neon fand: ein Lauf nachts ohne Aufsicht (Anzeige schläft nicht, Schlafen aus), Meldungen kommen erst am Morgen.

## Fertiger Rundgang bzw. fertige Bestandsaufnahme steht auf „Wartet auf OK“ (15.11.2026)

Herkunft: Gespräch des Maintainers mit dem Designer (Sitzung designer), 15.11.2026, Zeitstempel der Nachricht 19:31 UTC; Wortlaut im Protokoll des Designers gegengeprüft. Vorschlag des Designers (Wortlaut des Designers, nicht des Maintainers): „Wenn ein Rundgang fertig ist, setzt neon den Eintrag gleich auf ‚Wartet auf OK‘. Dann sehen Sie auf der Liste, dass etwas auf Ihren Blick wartet.“ Wortlaut des Maintainers darauf: „ja deien vorschlag als regel an neon geben“ (Schreibweise unverändert).
Umsetzung (Deutung des Designers, von neon übernommen, nicht des Maintainers): Gilt für jeden Design-Rundgang und jede Bestandsaufnahme mit eigenem Board-Eintrag. Liegen Bilder und Liste vor, geht der Eintrag auf „Wartet auf OK“ mit Notiz zu Ablageort und Zahlen, nicht auf In Progress oder Done. Der Designer wertet aus und meldet dem Maintainer; Done erst nach dessen OK oder nach Freigabe des Folgeschritts. Anlass: Die Bestandsaufnahme vom 15.11. stand nach dem Lauf noch auf In Progress. Ablage: `tests/MAC-MINI.md` Abschnitt 17, `tests/rundgang-auftrag.md` Abschnitt 5.
Nachtrag (15.11.2026): Die Bestandsaufnahme (Schritt 1/3) wurde von neon-board noch am Abend mit Freigabe des Maintainers auf Done gesetzt und archiviert (Wortlaut im Protokoll des Designers: „ja darfst du weitergeben.“; Beleg: Board-Abfrage „archiviert, Done“). Die Statusänderung auf „Wartet auf OK“ aus der Warteschlange wurde deshalb gestrichen. Weiter im Eintrag „Aus einem Guss 2/3“. Die Regel „Wartet auf OK nach fertigem Rundgang“ gilt ab dem nächsten Rundgang (22.11.2026).

## Jüngerer freigegebener Design-Eintrag gilt vor dem älteren (15.11.2026)

Herkunft: Gespräch des Maintainers mit dem Designer (Sitzung designer), 15.11.2026; beide Wortlaute im Protokoll des Designers gegengeprüft. Anlass, Wortlaut des Maintainers: „Wichtig: wenn wir alle diese Designs umsetzen dürfen nicht danach veraltete Design tasks auf der Liste abgearbeitet werden und uns dann das Design wieder zerstören“
Vorschlag des Designers darauf (Wortlaut des Designers, nicht des Maintainers): „Bevor ein Eintrag mit Designthema umgesetzt wird, prüft der Designer, ob ein jüngerer freigegebener Eintrag dieselbe Stelle betrifft. Dann gilt der jüngere. Der ältere wird nicht umgesetzt, sondern mit Verweis geschlossen oder an den jüngeren angepasst.“ Frage des Designers: „Soll die Regel für die Zukunft so an neon gehen?“ Antwort des Maintainers, Wortlaut: „Empfehlung A passt. Ja neon- board muss aufräumen. Die Regel gilt auch in Zukunft“
Umsetzung (Deutung des Designers, von neon übernommen, nicht des Maintainers): Der Prüfschritt steht in der Vorab-Prüfung der Designer-Einträge (`docs/design-vorgaben.md` 6a, `tests/nachtlauf-auftrag.md` Schritt 1a g, `tests/tagesroutine-auftrag.md` Abschnitt „Designer“) und als Verweis in 2b Punkt 3. Die einmalige Aufräumrunde auf der Liste gibt der Designer getrennt an neon-board.

## Ablauf des Designumbaus freigegeben, Kacheln und Lichtkegel ein Paket, Volldampf ab dem Nachtlauf (16.11.2026)

Herkunft: Gespräch des Maintainers mit dem Designer (Sitzung designer), 16.11.2026, 11:34 Wiener Zeit; Wortlaute im Protokoll des Designers belegt. Gegenstand: Ablaufplan des Designers `~/halo-aufgaben/vorschau/nachtlauf-plan-2026-11-17.md`.
Freigabe, Wortlaut des Maintainers: „ansonsten bin ich mit deinem vorschlag bezüglich ablauf des designumbaus einverstanden. kacheln und lichtkegel sind ein paket und abnahmerunde morgen.“
Hintergrund, Wortlaut des Maintainers: „wir haben für claude einen gratis weekly limit reset und wollen den so bald wie möglich einlösen. hierfür werden wir ab heute nacht 01:30 mit beginn des nachtlaufs mit volldampf alle token intensiven tasks so rasch wie möglich abarbeiten. sobald das weekly limit (oder das fable limit) erreicht wurde werde ich manuell das limit wieder zurücksetzen. so verbrauchen wir unseren gratis limit reset und können maximal produktiv sein.“
Umsetzung (Deutung des Designers bzw. der umsetzenden Sitzung, nicht des Maintainers): Erst das Paket Kachel d2h + Lichtschein Variante D als Ganzes mit voller CI samt Windows und Release, dann ohne Pause die Kette Knöpfe → Felder → Fenster und Dialoge → Aufgaben-Umbau Schritte 2–4, Symbole nebenher; neue Design-Einträge nach Plan Abschnitt 3. Im Volldampf entfällt die Grenze „ein großer Schritt je Nacht“; Reihenfolge, Vorab-Prüfung 6a, Designer-Abgleich, grüne Prüfungen und ein reguläres Release pro Tag bleiben. Gilt bis zum Ende der Volldampf-Woche (24.11.2026 01:00). Ablage: `tests/nachtlauf-auftrag.md` Schritt 1d; Notizen an den betroffenen Board-Einträgen (Plan Abschnitt 4).
Nachtrag, Wortlaut des Maintainers (neon-Sitzung, 16.11.2026): „Nein nach dem wöchentlichen reset von mir läuft der rest der woche mit regulärem nachtlauf und Tagesablauf. Bei letzterem wird sowieso die Aktivität an die Kapazität vorhandener tokens angepasst“. Gemeint ist: Nach dem manuellen Reset wird die Volldampf-Zeile nicht wieder eingeschaltet. Umsetzung (Deutung von neon): `~/halo-nacht/volldampf.txt` bleibt unverändert und endet beim Wochenlimit; die Design-Reihenfolge des Plans bleibt Rahmen, die Lockerungen „ohne Pause“ gelten nur solange Volldampf läuft.

## Ablehnungen immer zurückmelden (16.11.2026)

Herkunft: neon-Sitzung, 16.11.2026. Anlass: neon lehnte die Bitte von github.comm.routine ab (blockierter Schreibzugriff) und meldete es zunächst nur dem Maintainer. Wortlaut des Maintainers: „ab sofort schreibst du bei ablehnungen anfragen anderer sessions betreffend IMMER eine rückmeldung. Immer.“ und: „diese regelt gilt ab sofort für immer und auch nach neustart der session.“ Gilt für jede Sitzung. Ebenfalls Wortlaut: „bitte trage den vermerk in github-komm-stand.md immer ein wenn die github.comm.routine darum bittet“ (Dauerfreigabe für neon, nur diese Datei).

## GitHub: Wünsche mit mehreren Punkten (16.11.2026)

Herkunft: neon-Sitzung, 16.11.2026, Anlass GitHub #66. Wortlaute des Maintainers: „#66 ist eine ausnahme“ sowie „1. sehe ich genauso 2. jeder wunsch wird evaluiert und der user erhält feedback. wenn ein wunsch sinn macht kommt er auf unsere to-do liste und das issue ist auf waiting gesetzt, egal wieviele andere wünsche innerhalb des selben requests bereits von uns abgelehnt wurden. 3. wir schliessen das issue erst wenn alle im issue erwähnten einzelnen punkte entweder abgelehnt oder umgesetzt wurden.“ Umsetzung: `docs/github-komm.md` „Wünsche mit mehreren Punkten“ (Punkt 4 dort ist Deutung von neon).
Nachtrag (16.11.2026), Wortlaut des Maintainers zur Zuständigkeit bei Wünschen: „der designer bewertet nur wünsche das design, die optik oder das user interface betreffend aber nicht grundsätzliche funktionalitäten. der wunsch nach funktionalität bewertet der direktor.“ sowie „1. komplette abwegige ideen wie einen 3d-simulator in thunderbird einzubauen sollten sofort vom direktor abgelehnt werden. 2. feature requests die interessant genug sind sollen mir vom direktor vorgelegt werden. 3. wenn ich einverstanden bin kommt der feature request zum designer falls der feature request mit dem thema design zu tun hat. 4. das bedeutet also dass entweder der direktor oder der designer den board eintrag vornimmt. 5. ja github.comm.routine bleibt weiterhin kommunikationsstelle nach aussen.“ Umsetzung siehe `docs/github-komm.md` Punkt 4.

Nachtrag (16.11.2026, neon-Sitzung), Wortlaut des Maintainers zur Volldampf-Woche: „weg 1. wir müssen unser wochenkontingent so rasch wie möglich verbrauchen ab morgen nacht 01:30“ (Nachtlauf mit Volldampf arbeitet statt bis 08:00 bis 08:45, claude bis 09:00) und „korrektur: die maximale produktivität zählt“ (Deutung von neon: die Zeit bis 09:00 voll nutzen, daher 08:45 statt 08:30). Umsetzung `tests/nachtlauf.sh`, Commit `f817abd`.

Nachtrag (16.11.2026, neon-Sitzung), Wortlaut des Maintainers auf die Frage, ob die Tagesroutine in der Volldampf-Woche um 08:45 statt 09:00 beginnen soll: „nur solange volldampf läuft“. Umsetzung: LaunchAgent der Tagesroutine täglich 08:45; mit Volldampf Beginn `START_VOLLDAMPF` 08:45 nach dem Ende des Nachtlaufs, ohne Volldampf wartet das Skript bis 09:00 (`tests/tagesroutine.sh`, `docs/testrechner.md` „Volldampf“).

Nachtrag (17.11.2026, neon-Sitzung), Volldampf-Woche, parallele Agenten: Auf den Hinweis „Wochen Limit erst bei 3%“ und den Vorschlag, bis zu zwei Opus-Agenten gleichzeitig an getrennten Einträgen arbeiten zu lassen, antwortete der Maintainer: „Ja“. Umsetzung (Deutung neon): gilt nur solange Volldampf läuft; Nachtlauf-Fortsetzungen und Tagesroutine (Auftragsdateien); gepusht wird weiter nur über Prüfzweig und Nachtlauf.

Nachtrag (17.11.2026, neon-Sitzung), Wortlaut des Maintainers: „Volldampf heisst maximale Produktivität“. Umsetzung (Deutung neon): Die Grenze von zwei parallelen Opus-Agenten ist auf bis zu vier angehoben; Bremse nur das Wochenlimit.

Nachtrag (17.11.2026, neon-Sitzung), Wortlaut des Maintainers: „du darfst im volldampf so viele agents gleichzeitig laufen lassen wie es möglich und notwendig ist“. Umsetzung (Deutung neon): keine feste Obergrenze mehr (löst „bis zu vier“ ab); Grenzen bleiben getrennte Einträge, Testläufe nacheinander, Wochenlimit.

Nachtrag (17.11.2026, Herkunft: Gespräch des Maintainers mit dem Designer, 09:19 Wiener Zeit, im Designer-Protokoll geprüft), Verfassen-Kapseln (I6FHI Punkt 1): Wortlaut des Maintainers: „Ich folge deiner Empfehlung“ (= Möglichkeit 2, Kapseln 38 px, Senden mitwachsend; Umsetzungsdetails im Board-Eintrag I6FHI, Deutung des Designers).

Nachtrag (17.11.2026, neon-Sitzung), Wortlaut des Maintainers: „volldampf bedeutet maximale produktivität. setze alle einstellungen und eintscheidungen um, damit die maximale produktivität während des volldampfs gewährleistet bleibt. das betrifft die anzahl der gleichzeitigen agents, die anzahl der releases, einfach alles.“ Anlass: Frage, ob heute ein zweites Release sinnvoll wäre, weil der Stapel nicht gepushter Commits (14) sonst zu groß für eine rote CI wird. Umsetzung (Deutung neon): Während der Volldampf-Zeile (bis 24.11.2026 01:00, endet bei Wochenlimit) entfallen die Tagesgrenzen für Releases, Commits und Fortsetzungen sowie die Regel „Tagesroutine pusht nie“; Bedingung grüne Tests samt Windows, Testmarke, Push-Sperre 01:30–09:00 und der Schutz des Nachtlaufs (ab 00:00 kein Push) bleiben, ebenso Notfall-, Hotfix- und Hook-Regeln.

Nachtrag (17.11.2026, neon-Sitzung), Wortlaut des Maintainers: „nochmals: produktivität steht über allem. ich habe auch kein problem mit 30 releases untertags während volldampf läuft solange wir so viel wie möglich abarbeiten können“. Umsetzung (Deutung neon): Im Volldampf beliebig viele Zwischen-Releases tagsüber (Tests, CI samt Windows und Testmarke unverändert); Wächter-Prozess statt Einzelauslösung.

Nachtrag (17.11.2026, neon-Sitzung), Wortlaut des Maintainers: „prioritäten reihenfolge während volldampf: 1. wochenkontingent so rasch wie möglich verbrauchen indem die token-intensivsten tasks priorisiert werden 2.multiple releases ohne limit von halo.spaces innerhalb des tages“. Umsetzung (Deutung neon): Plan-Runden im Volldampf ordnen die token-intensivsten Einträge zuerst; Releases ohne Tageslimit über den Wächter; Tests, CI und Windows wie bisher.

Nachtrag (17.11.2026, neon-Sitzung), Wortlaut des Maintainers: „während volldampf dürfen wir bei bedarf auch fable zur problemlösung nutzem um weniger zeit zu verschwenden“. Umsetzung (Deutung neon): Im Volldampf darf Fable bei Bedarf für die Problemlösung (rote oder flackernde Prüfungen, unklare Ursachen) eingesetzt werden, auch schon vor dem zweiten Fehlversuch, um Zeit zu sparen; sonstige Regeln von „Rot bleibt rot“ (Ursache belegen, Prüfung nie abschwächen) bleiben.

Nachtrag (17.11.2026, neon-Sitzung), Wortlaut des Maintainers auf die Frage, welche Hebel für volle Auslastung ohne Rückfrage freigegeben sein sollen (Reihen ohne einzelne Abnahme, Designer-Bausteine parallel, offene Rückfragen): „du darfst alles um volldampf maximal laufen zu lassen“. Umsetzung (Deutung neon, solange die Volldampf-Zeile gilt): Reihen (n/m) dürfen mehrere Schritte nacheinander ohne Abnahme dazwischen bearbeitet werden; der Designer darf Bausteine parallel durch Unteragenten bauen lassen; offene Entscheidungen im Zweifel „wie Apple“. Unverändert: Tests, CI, Windows, Testmarke, Dauerfreigaben C und D (docs/dauerfreigaben.md), Sicherheit und Datenschutz, Antworten an Nutzer auf GitHub nur über die dafür vorgesehene Routine, nichts am echten Profil.

Nachtrag (17.11.2026, neon-Sitzung), Wortlaut des Maintainers: „ich habe ursprünglich erwartet dass wir mittels volldampf modus die 100% weekly limit in maximal 48 stunden verbrauchen“. Stand 14:55 Wiener Zeit: Woche 14 %, 5 Stunden 8 %. Umsetzung (Deutung neon): Ziel des Volldampfs ist, das Wochenkontingent in höchstens 48 Stunden ab dem Reset (Di 17.11.2026 01:00, also bis Do 19.11.2026 01:00) zu verbrauchen; dazu das 5-Stunden-Fenster dauerhaft bei etwa 75 % oder höher halten (nötig sind rund 2,5 Punkte Woche je Stunde, bisher etwa 1).

Optionen ausmisten (17.11.2026, neon-Sitzung; Grundlage ~/halo-nacht/optionen-bestandsaufnahme-2026-11-17.md, Nummern daraus): Wortlaut des Maintainers auf die vorgelegte Ja/Nein-Liste: „3-nein / 10-wie apple / 13-behalten, tatsächlich nutze ich diese funktion selbst häufig und diese gefällt mir sehr gut. / 19-disablen / 29-mit designer abstimmen / 20-wie apple / 23-folge ich deiner empfehlung / 24-folge ich deiner empfehlung / 16-folge ich deiner empfehlung / 17-folge ich deiner empfehlung / 11-folge ich deiner empfehlung / 22-folge ich deiner empfehlung“. Umsetzung (Deutung neon): 3 bleibt (nicht streichen); 10 wie Apple = Option entfällt, „Auf meinem Mac“ erscheint automatisch, sobald etwas darin liegt; 13 bleibt; 19 = Option entfällt, deckende Menüs aus; 29 mit dem Designer abstimmen; 20 wie Apple = Option entfällt, Blatt im Fenster fest; 23, 24 = nur noch about:config; 16, 17 = Fehlerbehebung (17 als Knopf „Zurücksetzen“); 11 = ins „…“-Menü der Kontaktliste; 22 = entfällt, Thunderbirds Update-Einstellung gilt.

GitHub-Issues auf Bitte des Nutzers schließen (17.11.2026, neon-Sitzung; Wortlaute von github.comm.routine übermittelt, vom Maintainer im Gespräch mit neon am 17.11.2026 bestätigt: „ja ich bestätige“). Regel: „regel ab sofort gültig für jetzt und immer - wenn ein user schreibt you can close the ticket bitte immer sofort schliessen“. Zusatz: „zusatz - wenn ein user schreibt dass ein ticket geschlossen werden kann bitte sofort überprüfen ob es noch einen eintrag auf der aufgabenliste gibt. falls ja - diesen eintrag ebenfalls sofort archivieren“. Reihenfolge: „ich würde es in dieser reihenfolge machen - 1. antwort an den user 2. nach verknüpftem task in der auftragsliste suchen und diesen schliessen, falls vorhanden 3. erst dann das issue auf github schliessen. grund: wenn wir aufgrund des github limits das auftragsboard nicht laden können und daher den verknüpftem task nicht schliessen können ist vielleicht bereits das issue geschlossen und der verknüpfte task nicht, welcher dann offen bleibt“. Umsetzung (Deutung neon, wie von github.comm.routine formuliert): Gilt nur bei ausdrücklicher Bitte des Nutzers; Inaktivität und Ablehnungen laufen wie bisher. Kann das Board nicht geladen werden (Limit), das Issue nicht schließen, Maintainer informieren, später wiederholen.

Volldampf, Abendgrenze heute (17.11.2026, neon-Sitzung), Wortlaut des Maintainers: „es gibt für den heutigen tagesablauf unter volldampf kein zeitlimit abends ausser der nachtlauf wird dadurch gestört“. Umsetzung (Deutung neon): Der Wächter für Zwischen-Releases darf einen Push bis 22:30 beginnen (vorher 19:30), damit ein Release (Linux, Mac, Windows, rund 2,5 Stunden) vor 01:00 fertig ist und um 01:30 nichts mehr läuft; ab 00:00 kein Push mit Codeänderung bleibt unberührt. Agenten und Bildaufträge laufen ohne Abendgrenze, solange sie den Nachtlauf nicht stören.

Volldampf, automatischer Auslastungswächter (17.11.2026, neon-Sitzung, übermittelt im Auftrag an den Agenten), Wortlaute des Maintainers: „Warum muss ich immer nachfragen und damit manuell nachjustieren? Volldampf sollte automatisch sein und permanent auf maximale Produktivität überprüfen.“ und zum Zeitraum: „Das gilt für taglauf und nachtlauf solange Volldampf aktiv ist“. Umsetzung (Deutung neon, nicht Wortlaut): Wächter `tests/auslastung-schleife.zsh` (von Hand gestartet, Takt 10 Minuten, Tag und Nacht) misst das Kontingent gegen eine Sollkurve „100 % in 48 Stunden nach dem Reset“ und startet bei Rückstand oder 5-Stunden-Fenster unter 60 % weitere Worker (`claude -p`, Auftrag `tests/auslastung-auftrag.md`, eigener Worktree und Prüfzweig, kein main, kein Release), höchstens 4 Arbeits-Sitzungen (Datei `auslastung.conf`, Grenze 8), nachts eine weniger und nur unter dem Soll; Ende beim Wochenlimit oder Volldampf-Ende (`docs/testrechner.md` „Auslastungswächter“). Die Schwellen 60 %, 90 %, 4 bzw. 8, die Nachtregel und die Fable-Bedingung sind Vorschläge von neon; die 48 Stunden stammen aus dem Nachtrag oben („… in maximal 48 stunden verbrauchen“).

## 17.11.2026 – Release- und Commit-Auskünfte für github.comm.routine

Maintainer (in neon, 17.11.2026, auf die Frage, ob neon für github.comm.routine nachschlagen soll): „ja mach das, jetzt und auch in zukunft ohne rückfrage“. Gemeint (Deutung): neon liest für github.comm.routine nur lesend im Checkout ~/halo-spaces, ob ein Fix auf origin/main liegt, in welchem Release-Tag er zuerst steht, wo ein Hash liegt und welches Release aktuell ist, und antwortet der Sitzung mit dem Ergebnis. Änderungen, Pushes und Schreibzugriffe gehören nicht dazu.

## 17.11.2026 – Betterbird

Maintainer (in neon, 17.11.2026): „bezüglich punkt 2 - wie unterscheidet sich betterbird von thunderbird? ist das hinsichtlich ui ganz anders? ansonsten können wir nicht gleichzeitig die extension für sowohl thunderbird als auch betterbird designen“, danach auf neons Vorschlag, nur Thunderbird zu unterstützen: „ja ergänze in agents.md“. Wortlaut in `AGENTS.md`.

## 17.11.2026 – GitHub #45: Ausnahme entfernt

Maintainer (in neon, 17.11.2026), nach neons Empfehlung (Ausnahme zu #45 in `tests/inaktivitaet-ausnahmen.txt` entfernen, damit die Inaktivitätsregel gilt; #45 beim Release schließen, das den schmalen Fall behebt, mit „Fixed in x.y.z“): „ich folge deinen empfehlungen. wichtig ist, dass github issues nicht ewig lang offen bleiben“. Die Ausnahme vom 15.11.2026 für #45 ist damit aufgehoben.

## 17.11.2026 – Volldampf: Ein-/Ausschalter

Maintainer (in neon, 17.11.2026): „in zukunft werden wir vielleicht öfters volldampf nutzen. daher müssen wir dieses regelwerk klar absichern um quasi mittels ein- und aus-schalter jederzeit aktivieren und wieder deaktivieren zu können“; davor: „nein wir werden keinen trockenlauf laufen lassen. wir müssen dann sofort weiter aktiv im regulären modus laufen.“ Umsetzung: `tests/volldampf.sh an|aus|status`.

## 17.11.2026 – Volldampf: Fable nur mit Beleg

Maintainer (in neon, 17.11.2026): „bitte vergiss nicht dass du bei allen tasks für maximale produktivität auch fable nutzen kannst während des volldampf modus“ und „bitte auch bei nachtläufen fable für schwierige sachen im volldampf nutzen, aber nur, wenn diese erwiesenermaßen bessere, schnellere oder fehlerfreiere ergebnisse bringen“. Umsetzung: Wächter-Schwellen `FABLE_ABSTAND=5`, `FABLE_5H=75` (`auslastung.conf`); Beleg-Regel in `tests/nachtlauf-auftrag.md`, `tests/tagesroutine-auftrag.md`, `tests/auslastung-auftrag.md`.

## 17.11.2026 – Regelwerk Volldampf und Alltag: Antworten des Maintainers

Maintainer (in neon, 17.11.2026), auf vier Fragen des Regelwerk-Agenten: „1. 40 commits“ (Tageslimit der Tagesroutine im Alltag); „2. im volldampf gibt es keine limits für fable Nutzung wenn derer Einsatz bei komplexen themen oder problemen hilfreich ist und die produktivität erhöht“; „3.ich folge deiner Empfehlung“ (Worker nach „aus“ machen den laufenden Eintrag fertig, nehmen keinen neuen); „4. nein nur tagsüber“ (der Auslastungswächter startet nachts nur Worker, solange die Woche unter dem Soll liegt; keine Ausweitung auf Nächte über dem Soll). Umsetzung: `MAX_COMMITS_TAG` 40 im Skript, Fable-Grenzen im Volldampf aufgehoben (`tests/tagesroutine.sh`, `tests/auslastung-schleife.zsh`, `tests/nachtlauf-auftrag.md`), `docs/alltagsmodus.md`, `docs/volldampf-regelwerk.md`.

## 18.11.2026 – Volldampf: Pause beim Wochenlimit, Soll bis zum nächsten Reset

Maintainer (Mittwoch 18.11.2026 08:51, über die Koordinationssitzung): „wir sind aktuell bei 58% des weekly limits und es ist mittwoch 8:51. vermutlich werden wir ans ende des wochenlimits erst donnerstag stossen, im schlechteren fall freitag. wenn wir dann das limit zurücksetzen haben wir 100% token aber nur noch wenig zeit dieses bis zum nächsten automatischen weekly limit reset aufzubrauchen. meine logik wäre daher jene, dass wir ab dem manuellen weekly limit reset weiterhin permanent den verbrauch an die vorhandenen token knüpfen, was vor allem nach dem manuellen weekly limit reset bedeuten würde dass wir quasi weiterhin mit volldampf arbeiten. ziel ist, dass nach dem manuellen reset des weekly limits am donnerstag oder freitag weiterhin so intensiv gearbeitet wird, dass der wir kurz vor dem nächsten automatischen weekly limit reset kommenden dienstag kaum noch token übrig haben“

Ergänzung, ebenda (18.11.2026): „genau und nach dem nächsten automatischen weekly limit reset kommenden dienstag um 01:30 soll wieder der reguläre modus laufen, wo wir aber dennoch automatisch den verbrauch und die intensität permanent an unser token kontingent knüpfen und adjustieren“

Löst die Regel vom 13.11.2026 „wenn das wochenlimit erreicht wurde wird Volldampf automatisch deaktiviert“ als dauerhaftes Ende ab (dort vermerkt, nicht gelöscht). Umsetzung (Beschreibung, Deutung nicht des Maintainers; `docs/testrechner.md` „Volldampf“): ab 98 % pausiert Volldampf nur (Marke `volldampf-beendet.txt`, keine neuen Einträge und Worker, laufende fertig), bis ein Sturz der Woche um mindestens 20 Punkte ohne automatischen Reset dazwischen den freien Reset belegt (Anker `~/halo-nacht/wochenanker.txt`); dann läuft Volldampf von selbst weiter, Soll = Stunden seit dem Anker / Stunden bis zum nächsten automatischen Reset × 100 % (gemeinsame Rechenstelle `wochen_soll` in `tests/lauf-hilfen.zsh`). Ende bleibt der automatische Reset Di 24.11.2026 01:00 bzw. Widerruf; der Anker verfällt dort, ab dem Nachtlauf 01:30 gilt der Alltagsmodus mit der 168-h-Sollkurve.

## 18.11.2026 – GitHub: Inaktivitätsregel, offener Board-Eintrag ist automatische Ausnahme

Herkunft: Gespräch des Maintainers mit der Koordinationssitzung, 18.11.2026, zu #45 (Vorschlag, die Ausnahme für #45 wieder von Hand einzutragen). Wortlaut des Maintainers: „Nein manuelle ausnahmen eintragen bedeutet nur dass unsere automatisch logik nicht greift. Warum ist das der fall wenn der user weiterhin auf etwas von uns wartet?“; auf den Vorschlag „Ein Issue ist von der Inaktivitätsregel ausgenommen, solange auf der Aufgabenliste ein offener Eintrag dazu existiert“: „Ja #45 regel vorschlag passt für mich“.
Umsetzung (Beschreibung der umsetzenden Sitzung, Deutung nicht des Maintainers): `tests/inaktivitaet.sh` lädt die Aufgabenliste einmal je Lauf (`tests/board.sh export`) und meldet „ausgenommen #n (offener Board-Eintrag)“, solange ein Eintrag mit Status nicht Done (auch „Wartet auf OK“, archivierte zählen nicht) im Titel oder Text auf „GitHub #n“ (auch „[GitHub #n]“, „GitHub-Issue #n“) verweist; mit Done bzw. Archivieren endet die Ausnahme von selbst. Ist das Board nicht lesbar, schließt das Skript nichts (FEHLER-Zeile). Board-Inhalte erscheinen nur in der Skriptausgabe, nie auf GitHub. Ausnahmedatei `tests/inaktivitaet-ausnahmen.txt` und Labels `keep-open`/`waiting-on-us` bleiben für bewusst offene Issues ohne Eintrag (#59). Ergänzt die Regel vom 15.11.2026 (Einträge oben) und hebt die Wirkung von „17.11.2026 – GitHub #45: Ausnahme entfernt“ auf, solange der Eintrag zu #45 offen ist.

## 18.11.2026 – Empfehlungen des Designers ohne Rückfrage als Notiz; Windows-Rundgang bei knappem 5-Stunden-Fenster

Maintainer (in neon, 18.11.2026), zur Frage, ob Empfehlungen des Designers eingetragen werden sollen: „Punkt 4 - warum fragst du? Wenn Designer Empfehlungen ausspricht bitte eintragen“. Folge (Deutung, nicht des Maintainers): Empfehlungen des Designers gehören immer ohne Rückfrage als Notiz an die passende Karte, gekennzeichnet als Deutung des Designers.

Zum Windows-Rundgang (Board-Eintrag JQNsA): „wäre auch ein perfekter task für die Situation wenn wir bereits knapp am 5h-Limit sind“. Folge (Deutung, nicht des Maintainers): Der Windows-Rundgang läuft, wenn das 5-Stunden-Fenster knapp ist, tagsüber und nicht neben einem Lauf auf neon.
