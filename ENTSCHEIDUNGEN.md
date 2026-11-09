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
