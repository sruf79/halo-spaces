# Testrechner (Mac mini) – Einzelheiten

Ausgelagert aus `AGENTS.md` (6.11.2026, Token sparen): voller Wortlaut des früheren Abschnitts „Testrechner (Mac mini)“. Die harten Sperren (Push-Sperre, kein Push ab 00:00, `if:`-Bedingung der Mac-Jobs, `Runner.Worker`) stehen weiter in `AGENTS.md`; bei Änderungen beide Stellen angleichen. Nur bei Bedarf lesen (Arbeit auf neon, CI, Nachtlauf, VM).

Ein Mac mini übernimmt die Tests rund um die Uhr (Anleitung: `tests/MAC-MINI.md`):
eigener Benutzer `neosky.cat` (Administrator) ohne echte Mails mit automatischer Anmeldung, erreichbar
nur über Tailscale (keine Portfreigabe), Claude Code per SSH aus der Desktop-App
und per Remote Control aus Cloud-Sitzungen (Einrichtung `tests/MAC-MINI.md`
Abschnitt 12, Bedienung Abschnitt „Cloud-Sessions“ unten).

- `tests/mac-mini-setup.sh --check` prüft den Rechner (Ruhezustand, Thunderbird,
  Python, gh, Bildschirm, Rechte, Anmeldung, Tailscale, SSH, Runner, Remote Control, Windows-VM, Auslagerung) und ändert
  nichts; ohne `--check` richtet es ein, was ohne Passwort geht, und macht einen
  Probelauf.
- Marionette-Ports: 2839 Standard, 2845 CI-Jobs `mac` und `windows`, ab 2850 für Läufe von Hand
  und parallele Sitzungen (`--port`).
- Job `mac` in `.github/workflows/test.yml` (self-hosted, Label `halo-mac`) läuft
  nur bei Push auf `main` und von Hand – nie bei `pull_request`, weil das Repo
  öffentlich ist. Die `if:`-Bedingung nicht lockern; auf dem Mac weist zusätzlich
  `tests/mac-runner-hook.sh` alles andere ab.
- Jeder Push auf `main` belegt neon mit dem Job `mac` rund 17 Minuten, mit
  Dunkelmodus rund 35. Der Job `windows` (~19 Minuten) läuft nicht mehr bei Push,
  sondern nur von Hand bzw. einmal je Nacht vor dem Release (`ziel=windows`,
  `tests/nachtlauf-auftrag.md` Schritt 4a; `release.sh` verlangt ihn). Beide starten erst nach
  grünem Linux (~17 Minuten vorher; Entscheidung des Maintainers vom
  5.11.2026), bei Rot unter Linux laufen sie nicht – ein ganzer Lauf dauert
  damit rund 50 Minuten, mit Dunkelmodus rund 70. Solange er
  läuft (Prozess `Runner.Worker`), keine eigenen Testläufe starten – zwei
  Testfenster nehmen sich gegenseitig den Fokus.
- **CI nur für Thunderbird** (Entscheidung des Maintainers vom 6.11.2026,
  Wortlaut in `ENTSCHEIDUNGEN.md`: Änderungen an `.md` und Sitzungs-Einstellungen
  und alles ohne direkten Thunderbird-Bezug brauchen keinen CI-Lauf): `test.yml` startet nur, wenn ein Push etwas ändert,
  das Thunderbird direkt betrifft – `extension/`, `chrome/`, `icons/`,
  `build.sh` und die Prüfungen, die die CI ausführt (`halo_test.py`,
  `perf.js`, `update_test.py`, `testserver.py`, `adressen.py`,
  `addon_lint.py`, `tests/logik/`); `.md` darin zählt nicht. Doku, Store,
  `.claude/`, Abläufe auf neon (Nachtlauf, Wächter, Rundgang, Setup),
  Release-Skripte und Workflows lösen keinen Lauf aus. Die Liste steht in
  `paths:` in `test.yml` und gleich in `tests/ci-noetig.sh` (beide zusammen
  ändern); `release.sh` und `ci-warten.sh` nutzen dieses Skript
  (`ci-warten.sh` meldet dann „kein CI-Lauf nötig“, Exitcode 0). Ein Push, der
  nur den Release-Commit enthält (`updates.json` und die Versionszeile in
  `manifest.json`), erkennt der Job `changes`, alle Testjobs werden
  übersprungen. Jede Thunderbird-Änderung testet wie gewohnt.
- **Dunkelmodus nur bei Farben** (Entscheidung des Maintainers vom
  4.11.2026): Der Job `mac` testet dunkel nur, wenn seit dem zuletzt dunkel
  getesteten Stand Farben betroffen sind – Stilblätter (`*.css`), Symbole
  (`*.svg`, `extension/icons/`), Farbwerte im Code oder Prüfungen zu Farben
  bzw. Dunkelmodus, oder `[dunkel]` in einer Commit-Nachricht; im Zweifel
  dunkel. Die Regel steht in `tests/farben-betroffen.sh` (CI-Job `changes`
  und `release.sh`, dort gegen das letzte Release); von Hand gestartete Läufe
  testen immer dunkel.
- **Gesammelt pushen:** je Eintrag committen, aber erst am Ende eines
  zusammenhängenden Arbeitsblocks (Phase) pushen – vorher nur die Prüfungen,
  die die geänderte Stelle betreffen (`--only`, hell; dunkel zusätzlich nur,
  wenn Farben betroffen sind), kein Volllauf (Entscheidung des
  Maintainers vom 3.11.2026). Den Volllauf übernimmt die CI (Linux mit Beta,
  `mac` hell und bei Farben dunkel, `windows`), deren Ergebnis danach prüfen. Früher pushen
  nur, wenn etwas davon abhängt (z. B. Test im echten Profil).
- **Nicht Eiliges nimmt der Nachtlauf mit:** Sitzungen auf neon außerhalb
  des Nachtlaufs committen Fertiges, das nicht sofort auf GitHub muss
  (Abläufe, Skripte, Prüfungen, Doku, kleine Korrekturen), auf `main` in
  `~/halo-spaces` und pushen nicht; der nächste Nachtlauf pusht diese Commits
  zusammen mit seinen eigenen in einer CI-Runde (Entscheidung des Maintainers
  vom 4.11.2026). Sofort pushen nur, wenn etwas davon abhängt (Release, Fix
  für Nutzer, Stand wird anderswo gebraucht). Der Nachtlauf nimmt zu Beginn
  ohne Rückfrage alles Offene mit: diese Commits (auf `main`, gehen mit
  seiner CI-Runde hinaus) und ungespeicherte Änderungen, an denen gerade
  keine Sitzung arbeitet – diese immer auf einen Zweig `rest/<datum>`, auch
  wenn ihre Prüfungen grün wären, nie auf `main`, nie in ein Release, nicht
  gepusht, im Bericht unter „Mitgenommen“ mit Dateien genannt (geändert
  8.11.2026, Ablauf-Analyse, Stufe 1; vorher kamen grüne Änderungen auf
  `main`) –, gleicht mit GitHub ab und arbeitet erst dann die Aufgabenliste ab.
- **Den Nachtlauf nicht behindern** (Entscheidung des Maintainers vom
  5.11.2026): Jede von Hand gestartete Sitzung – neon, Cloud, Laptop,
  Desktop-App – plant ihre Arbeit so, dass um 01:30 nichts mehr läuft, was
  den Nachtlauf auslassen lässt (siehe „Nachtlauf“ unten): ab 00:00 keinen
  Push mit Codeänderung mehr (die CI dazu muss bis 01:30 durch sein; eine
  Runde mit Dunkelmodus dauert gut 70 Minuten – Entscheidung des Maintainers
  vom 6.11.2026, vorher 00:30), keine
  Testläufe auf neon, die über 01:30 hinausgehen, und keine Runde, die um
  01:30 noch arbeitet – rechtzeitig abschließen bzw. die Antwort geben und
  warten.
- **Push-Sperre 01:30–09:00** (Wiener Zeit) für alle Sitzungen außer dem
  Nachtlauf selbst (und der Wochen- bzw. Doku-Prüfung, die erst nach dem
  Nachtlauf pushen): Der Nachtlauf wartet auf die CI genau seines Commits,
  Reparaturrunden bis 07:30, Ende spätestens 09:00; ein weiterer Push
  verdrängt dessen Lauf zwar nicht mehr, verlängert aber die Wartezeit auf
  dem einen Runner um eine ganze Runde. Früher nur, wenn neon bestätigt, dass
  der Nachtlauf fertig ist (Bericht `~/halo-berichte/<datum>-nachtlauf.md`
  liegt vor); sonst bis danach warten bzw. es dem Maintainer sagen.
- **Aufgabenliste nur zu Beginn eines Laufs** abrufen und daraus den Plan
  machen (Reihen-Schritte nur einzeln, „Wartet auf OK“ bleibt liegen). Vor
  Push, CI und Release das Board nicht erneut laden: Was während des Laufs
  dazukommt, arbeitet der nächste Nachtlauf ab; Dringendes nennt der
  Maintainer der laufenden Sitzung direkt (Entscheidung des Maintainers vom
  3.11.2026). Status der eigenen Einträge pflegen geht weiter.
- **Nachtlauf:** jede Nacht 01:30 (ab 4.11.2026) arbeitet `tests/nachtlauf.sh`
  die Aufgabenliste ab (kein neuer Eintrag ab 04:30), pusht, wartet auf die
  CI für genau diesen Commit (`tests/ci-warten.sh`) und veröffentlicht bei
  Grün; bei Rot höchstens zwei Reparaturrunden (beheben oder `git revert`),
  sonst kein Release (Entscheidung des Maintainers vom 3.11.2026). Nach
  grüner CI und Release arbeitet er vor 06:30 alle machbaren Einträge weiter
  ab (Entscheidungen des Maintainers vom 5. und 8.11.2026, Wortlaut in
  `ENTSCHEIDUNGEN.md`): je Eintrag committen, nur `--only` lokal (rot: zurück
  auf Todo, nichts committen), nicht pushen, kein zweites Release, höchstens
  sechs nicht gepushte Commits (die der Vornacht zählen mit); der nächste
  Nachtlauf pusht sie mit seiner CI-Runde. Legt Claude die Fertig-Datei vor
  06:30 an, prüft `nachtlauf_fortsetzen` (`tests/vorpruefung.zsh`, ohne
  Claude) Board und Commits und startet bei machbaren Einträgen unter der
  Grenze eine Runde „Schritt 5 fortsetzen“ (höchstens vier; eine ohne neuen
  Commit beendet). Endegründe nur: nichts Machbares mehr, 06:30,
  Sechs-Commits-Grenze, Limit, rote CI in Schritt 4 (Zeile „Grund: …“ der
  Fertig-Datei, „Arbeit beendet: …“ im Protokoll, Abschnitt „Ende der
  Arbeit“ im Bericht). Bericht in
  `~/halo-berichte/` mit den CI-Läufen, Kurzfassung aufs iPhone. Auf einen
  laufenden CI-Job wartet er (bis 90 Minuten). Er lässt aus, nur, wenn neon
  wirklich belegt ist: eine andere Claude-Sitzung ist mitten in einer Runde
  (fertige Sitzungen, die auf eine Antwort warten, zählen nicht; Entscheidung
  des Maintainers vom 4.11.2026), oder es laufen Tests, VM-Lauf, Release bzw.
  die CI ist nach dieser Wartezeit noch nicht fertig. Vor der Arbeit bringt er Thunderbird unter `/Applications`
  auf die aktuelle Version von Mozilla (nur mit Mozillas Signatur), damit die
  CI-Runde der Nacht damit testet. Nach Claudes Arbeit (auch wenn die Vorprüfung nichts fand) löscht
  `zweige_aufraeumen` (`tests/nachtlauf.sh`) verwaiste Zweige `claude/…` auf GitHub – nur ohne eigene
  Commits über `origin/main` hinaus und ohne offenen Pull Request, nie `rest/…` o. a.; je Zweig eine
  Zeile im Bericht, Abschnitt „Verwaiste Zweige“ (Entscheidung des Maintainers vom 7.11.2026). Danach wartet
  `ci_nacht_abschluss` (`tests/ci-runde.zsh`) noch laufende CI-Läufe der Nacht ab (bis 90 Minuten,
  längstens 09:00), trägt rote Prüfungen daraus über `ci-waechter.sh --lauf` ins Board ein (gleiche
  Dublettenprüfung wie der Wächter, `windows-github` und gezielte Läufe nicht; in derselben Nacht
  reparierte Prüfungen nicht, siehe unten) und startet, wenn seit
  24 Stunden keine Vollrunde lief und er nichts CI-Auslösendes gepusht hat, selbst
  `gh workflow run test.yml -f ziel=alle` (bis 04:30 Wiener Zeit; Lauf über `--created` und Kopf-SHA
  gefunden, abgewartet, Rotes eingetragen). Das ist die einzige von Hand gestartete Runde während des
  Nachtlaufs und zählt als vollständig (Entscheidung des Maintainers vom 7.11.2026, Wortlaut in
  `ENTSCHEIDUNGEN.md`). Fehler dort brechen nichts ab: `VOLLRUNDE-FEHLER …` bzw. `EINTRAG-FEHLER …` in
  Protokoll und `~/halo-nacht/uebersprungen.log`. Der Bericht bekommt den Abschnitt „CI-Runde der Nacht“
  mit der Zeile „Letzte vollständig grüne Runde: <Datum, Wiener Zeit> (vor N Tagen)“. Probe ohne Push,
  Dispatch und Board: `nachtlauf.sh --trocken`; Test `zsh tests/ci_runde_test.zsh` (`--echt`: nur lesend
  gegen GitHub). Pausieren nur über `~/halo-nacht/pausen.txt` (eine Datei für alle Routinen, `pause_setzen`, mit Ablaufzeit; `tests/MAC-MINI.md` Abschnitt 13). Das gilt für Routinen, die `pause_start` aufrufen (LaunchAgents und die lokale Aufgabe der Desktop-App); in der Cloud geplante Aufgaben gibt es nicht (`list_triggers` leer) und würden die Datei nicht lesen. Details
  `tests/MAC-MINI.md` Abschnitt 13.
- **Claude nur bei Arbeit, kleineres Modell für Routinen** (Entscheidung des Maintainers vom 6.11.2026, Wortlaut in `ENTSCHEIDUNGEN.md`):
  Nachtlauf, Design-Rundgang, Doku-Prüfung und GitHub-Kommunikation prüfen vorher
  per Skript ohne Claude (`tests/vorpruefung.zsh`, `tests/github-vorpruefung.sh`),
  ob es etwas zu tun gibt: Nachtlauf bei machbaren Board-Einträgen (Todo/In
  Progress, nicht „Wartet auf OK“), nicht gepushten Commits, offenen Änderungen
  oder unveröffentlichten Änderungen seit dem letzten Release-Tag
  (`~/halo-nacht/IMMER` erzwingt den Lauf); Rundgang nur bei neuen oder geänderten
  Ausreißern bzw. neu nicht erreichten Oberflächen; Doku-Prüfung
  (Stand `~/halo-aufgaben/doku-pruefung.stand`) nur bei geänderten `.md` oder geänderten
  Skripten, die eine `.md` nennt, mit Abgleich gegen alle `.md` auf Widersprüche,
  und als Vollprüfung am ersten Samstag im Monat bzw. mit `~/halo-nacht/DOKU-VOLL`
  (Ergänzung vom selben Tag, Wortlaut in `ENTSCHEIDUNGEN.md`; Regeln = Deutung der Sitzung
  global.design.comparison, `tests/MAC-MINI.md` Abschnitt 16);
  GitHub-Kommunikation nur bei Neuem von anderen seit „Letzte Prüfung“. Ein
  übersprungener Lauf schreibt `ÜBERSPRUNGEN <Routine> <Grund>` ins Protokoll und in
  `~/halo-nacht/uebersprungen.log`, ohne Push aufs iPhone; die Wochenprüfung zählt
  diese Zeilen. Modelle: Sonnet mit niedriger Reasoning-Stufe (`--model sonnet
  --effort low`, Vollprüfung der Doku `medium`) für die Auswertung des Rundgangs, die Doku-Prüfung, neon-board
  und die Unteragenten von neon sowie für die GitHub-Kommunikation (Einstellung in
  der Desktop-App, Schritte `tests/MAC-MINI.md` Abschnitt 17a); Opus bleibt für
  Nachtlauf und Wochenprüfung, Haiku für `push()`. Gesamtübersicht (je Thema eine Wahrheit, 9.11.2026):
  `neon` Sonnet medium, `neon-board` Sonnet low, `github.comm.routine` Sonnet low, Nachtlauf und
  Wochenprüfung Opus; die GitHub-Aufgabe läuft täglich 9:00, 14:00 und 19:00 Wiener Zeit
  (Cron `0 9,14,19 * * *`).
- **Bilder-Eingang:** alle 15 Minuten sortiert `tests/bilder-eingang.zsh` (ohne Claude, nur
  `cp`/`mv`, `shasum`, `sips`) Bilder aus `~/halo-aufgaben/eingang/` nach `bilder/` bzw.
  `apple/` ein und legt Indexzeilen an; Claude (Sonnet, `--effort low`) startet nur für
  „unbeschrieben“-Zeilen. Belegt neon nicht; Einzelheiten `tests/MAC-MINI.md` Abschnitt 18.
- **CI-Wächter:** alle 15 Minuten trägt `tests/ci-waechter.sh` (nur `gh`,
  kein Claude) für rote CI-Läufe auf `main` je Lauf einen Bug ins Board ein,
  die gescheiterten Prüfungen als Liste im Text (Prüfungen mit offenem
  Eintrag ergänzen diesen, eine Notiz je Eintrag und Lauf); „wackelig“ vermerkt er
  einmal je Prüfung, die 3× rot war ohne Änderung, die Thunderbird betrifft
  (`tests/MAC-MINI.md` Abschnitt 14), keine Meldung aufs iPhone; Läufe während Nachtlauf
  oder Wochenprüfung übernehmen diese selbst – rote Läufe der Nacht, die der Nachtlauf nicht eingetragen
  hat (`~/halo-nacht/<datum>.ci-eingetragen`), holt er nach dessen Ende nach. **In derselben Nacht
  repariert** (Entscheidung des Maintainers vom 7.11.2026, `ci_reparatur` in `tests/ci-runde.zsh`, eine
  Funktion für Nachtlauf und Nachholen): zeigt ein späterer Vollrunden-Lauf derselben Nacht (Nachtfenster
  wie oben) auf einem anderen Kopf-SHA dieselbe Prüfung im selben Job und Schritt (hell/dunkel) grün,
  legt der Wächter keinen Eintrag an, sondern schreibt „CI rot, in derselben Nacht repariert: <Job>:
  <Prüfung> (rot: Lauf X, grün: Lauf Y, Commit Z)“ in den Nachtlauf-Bericht; einen offenen Eintrag
  setzt er mit Notiz auf Done und archiviert ihn. Grün nur auf demselben SHA: Eintrag mit Notiz
  „flackert“, Zeile `flackert:` im Wächter-Protokoll (Kennzahl `ci_flackert` der Wochenprüfung).
  Bleibt die Prüfung bis zum Ende der Nacht rot, wird sie wie bisher eingetragen. Zeilen `KONSOLE  …` trägt er für
  jeden Lauf als Bug `Tests: Fehlerkonsole – …` ein, Zeilen `PROTOKOLL  …` als
  `Tests: Fehlerprotokoll – …` (kein Rot). Versuchsjobs mit
  `continue-on-error` in `test.yml` (derzeit `windows-github`) übergeht er
  ganz – kein Eintrag, kein Push, auch nicht für ihre KONSOLE-/PROTOKOLL-Zeilen
  (Entscheidung des Maintainers vom 5.11.2026); ihre Fehler sammelt ein
  Eintrag von Hand. `tests/MAC-MINI.md` Abschnitt 14.
- **Wochenprüfung:** sonntags 08:00 (wartet bis 09:15 auf den Nachtlauf) wertet `tests/wochenpruefung.sh` die
  letzten 7 Tage aus (CI, Nachtläufe, Berichte, Board; auch, ob der Nachtlauf früher als
  möglich – vor 04:30 bzw. nach grüner CI vor 06:30 – aufhört, obwohl noch
  machbare Einträge lagen, dazu `ungenutzt_bis_0630_min`). Kennzahlen stehen je ISO-Woche
  (Montag bis Sonntag, `2026-W46`) mit fester Liste und `null` bei fehlenden Werten in
  `~/halo-aufgaben/wochen-kennzahlen.json` (Kern: CI grün/rot, Releases, Pushes je Tag, ausgelassene
  Nächte, übersprungene Routinen, Board neu/erledigt, Meldungen aufs iPhone). Sie behebt nur kleine Dinge an
  Prüfungen selbst (`tests/halo_test.py`, `tests/update_test.py`) und **ändert Abläufe nicht
  mehr selbst** (Entscheidung des Maintainers, Sitzung project.analysis.control, 8.11.2026, am
  9.11.2026 freigegeben, Wortlaut in `ENTSCHEIDUNGEN.md`; ersetzt die Entscheidung vom 5.11.2026):
  Sie gibt höchstens drei Empfehlungen je Woche als Board-Einträge „Ablauf: …“ mit Status
  „Wartet auf OK“ (Kennzahl, Ziel, Begründung, Rücknahme); umgesetzt wird nach Zustimmung des
  Maintainers, der Verlauf steht in `~/halo-aufgaben/ablauf-aenderungen.json`. Die Folgewoche prüft
  die Wirkung an der Kennzahl; wirkt es nicht, empfiehlt sie die Rücknahme. Release-Sperre,
  `if:`-Bedingungen der Mac-Jobs und Freigaberegeln bleiben ohnehin unangetastet. Bericht
  `~/halo-berichte/<datum>-wochenpruefung.md`. `tests/MAC-MINI.md` Abschnitt 15.
- **Doku-Prüfung:** samstags 08:00 (wartet ebenso bis 09:15 auf den
  Nachtlauf) prüft `tests/wochenpruefung.sh --doku` alle `.md`-Dateien auf
  Widersprüche, Veraltetes, Doppeltes, Unklares und Abweichungen vom Code
  (Kennzahlen in `~/halo-aufgaben/doku-kennzahlen.json`), korrigiert
  eindeutige Fakten selbst und legt echte Widersprüche und Regeländerungen
  nur als „Doku: …“ mit „Wartet auf OK“ an. Bericht
  `~/halo-berichte/<datum>-dokupruefung.md`. `tests/MAC-MINI.md` Abschnitt 16.
- **Design-Rundgang** (Entscheidung des Maintainers vom 5.11.2026; seit 13.11.2026 vom Maintainer auf weiteres pausiert, `pausen.txt`):
  samstags 10:00 (wartet auf Nachtlauf, Doku-Prüfung und CI, spätester
  Start 14:00) nimmt `tests/rundgang-woche.sh` mit `ui_tour.py --messung`
  alle Oberflächen auf (immer hell, dunkel nur bei Farbänderungen seit dem
  vorigen Rundgang), vergleicht mit dem häufigsten Wert je Kategorie und der
  Vorwoche und lässt Claude neue Ausreißer als Bug eintragen (außer
  Entscheidungen des Maintainers und „Wartet auf OK“). Bericht
  `~/halo-berichte/<datum>-rundgang.md`, Pause über `~/halo-nacht/pausen.txt` (Routine `rundgang`).
  `tests/MAC-MINI.md` Abschnitt 17.
- Neue Routinen auf neon laufen als LaunchAgent ohne eigene Sitzung der
  Desktop-App; die Routine „GitHub-Kommunikation“ ist nur für GitHub-Nutzer da
  und bekommt keine weiteren Aufgaben (Entscheidung des Maintainers vom 3.11.2026).
- **Windows-VM** (Parallels Desktop Pro, Anleitung `tests/MAC-MINI.md`
  Abschnitt 11): VM `Windows 11` (Windows-Hostname `win11`, Windows 11
  Enterprise ARM, Benutzer `neosky.cat` mit automatischer Anmeldung, IP im
  Parallels-Netz 10.211.55.3). Fest 4 Kerne und 6 GB, startet mit dem Mac
  (`start-host`), einzige Freigabe `~/halo-vm` = `\\Mac\halo` in Windows.
  Darin Thunderbird (`C:\Program Files\Mozilla Thunderbird`), Beta
  (`C:\Program Files\Thunderbird Beta`), beide x64 unter Emulation, ohne
  Selbst-Update; Python `C:\Program Files\Python315-arm64\python.exe`;
  `openssl` aus Git für Windows. Snapshot `sauber` = Grundzustand.
  - Testen: `python3 tests/halo_test.py --vm --port 2851 [--dark] [--beta]
    [--only …] [--shots …]` – setzt die VM fort, testet darin (Marionette nur
    in der VM auf 127.0.0.1), holt Screenshots zurück und pausiert die VM
    (`--vm-weiter`: laufen lassen). Ein Lauf dauert gut 15 Minuten.
  - Nie gleichzeitig mit einem Mac-Lauf; das Skript wartet selbst
    (`~/halo-vm/lauf.lock` bzw. laufendes Test-Thunderbird auf dem Mac).
  - Windows-Abweichungen wie Linux behandeln (`sys.platform != "darwin"`, in
    der VM ist es `win32`).
  - Einrichten/Prüfen: `tests/mac-mini-setup.sh [--check]` (Windows-Seite:
    `tests/win-vm-setup.ps1`). Befehle in der VM: `prlctl exec "Windows 11"
    --current-user …` (angemeldete Sitzung) bzw. ohne `--current-user` als
    SYSTEM. `prlctl exec` reicht keine Anführungszeichen weiter – Argumente
    ohne Leerzeichen/Quotes übergeben oder über eine Datei in `~/halo-vm`.
  - Die VM darf für Tests umkonfiguriert werden (Speicher, Kerne,
    Start/Pause/Neustart, Snapshots) – danach kurz sagen, was geändert wurde.
    Beim Probelauf blieb der Mac bei 6 GB VM über 40 % freiem Speicher ohne
    zusätzliche Auslagerung. Kein Passwort, kein Microsoft-Konto, keine
    echten Mails in der VM.
  - CI: Job `windows` in `test.yml` läuft nur bei `workflow_dispatch` (`ziel=alle|windows`,
    der Nachtlauf startet ihn vor dem Release), nach `mac` (gleicher Runner und Wächter; ohne `concurrency`-Gruppe, damit GitHub keinen
    wartenden Lauf abbricht – der eine Runner arbeitet die Jobs der Reihe
    nach ab), vorerst nur hell, Port 2845,
    Screenshots als Artefakt `test-windows`.
  - Zum Vergleich gibt es daneben Job `windows-github` auf einem Windows-Rechner
    von GitHub (belegt neon nicht, `continue-on-error`): Prüfungen am Bildtakt zählen dort nur als Warnung
    (`HALO_FRAMES_WARN=1`). Seit 9.11.2026 läuft er nur noch von Hand
    (`workflow_dispatch`), nie bei Push: 0 von 34 gelaufenen Läufen waren grün (Stand 9.11.2026,
    Freigabe des Maintainers „deine empfehlungen durchführen“). Er ersetzt den Job `windows` damit nicht
    (ursprüngliche Entscheidung vom 4.11.2026, siehe `ENTSCHEIDUNGEN.md`).
- Zwischendurch nur betroffene Prüfungen: `python3 tests/halo_test.py --port 2851
  --only "<Teil des Prüfungsnamens>"` (1–2 Minuten). Neue Prüfungen müssen auch
  unter Linux (CI, xvfb) und mit der Beta grün sein. Regelmäßig testet die
  Beta nur noch die CI unter Linux; auf dem Mac (`tests/beta.sh`) und in der
  VM (`--vm --beta`) läuft sie nur noch von Hand.

## Vollständiger Wortlaut aus `AGENTS.md` (Stand 9.11.2026, vor der Kürzung)

Bei der Kürzung von `AGENTS.md` (9.11.2026, Ablauf-Analyse Stufe 5) unverändert hierher verschoben; nur die Überschriften stehen eine Ebene tiefer. Verweise wie „oben“, „unten“ oder „dieser Datei“ meinen das damalige `AGENTS.md`. Die Kurzfassung für jede Sitzung steht im Kern `AGENTS.md`; Wortlaute der Entscheidungen: `ENTSCHEIDUNGEN.md`.

### Testrechner (Mac mini)

Ein Mac mini (`tests/MAC-MINI.md`) testet rund um die Uhr; erreichbar nur über Tailscale und die Sitzung
`neon` (siehe „neon erreichen“). **Einzelheiten – Setup-Prüfung, CI-Laufzeiten, Dunkelmodus-Regel,
Nachtlauf, CI-Wächter, Wochen- und Doku-Prüfung, Design-Rundgang, Windows-VM, Modelle der Routinen,
gezielte Prüfungen: `docs/testrechner.md` (vor Arbeit auf neon, an CI oder Routinen lesen).** Hier nur,
was jede Sitzung beachten muss:

- Marionette-Ports: 2839 Standard, 2845 CI-Jobs `mac` und `windows`, ab 2850 für Läufe von Hand
  und parallele Sitzungen (`--port`).
- Job `mac` in `.github/workflows/test.yml` (self-hosted, Label `halo-mac`) läuft
  nur bei Push auf `main` und von Hand – nie bei `pull_request`, weil das Repo
  öffentlich ist. Die `if:`-Bedingung nicht lockern; auf dem Mac weist zusätzlich
  `tests/mac-runner-hook.sh` alles andere ab.
- Jeder Push auf `main` mit Thunderbird-Änderung belegt neon mit der CI (`mac`) rund 35 Minuten,
  mit Dunkelmodus rund 50; der Windows-Lauf (~19 Minuten) folgt einmal je Nacht vor dem Release. Solange sie läuft (Prozess `Runner.Worker`), keine eigenen Testläufe
  starten – zwei Testfenster nehmen sich gegenseitig den Fokus. Änderungen an `.md`, `.claude/`,
  Abläufen auf neon und Release-Skripten brauchen keinen CI-Lauf (Entscheidung vom 6.11.2026,
  `ENTSCHEIDUNGEN.md`; Liste in `tests/ci-noetig.sh`).
- **Gesammelt pushen:** je Eintrag committen, erst am Ende eines Arbeitsblocks pushen; vorher nur die
  betroffenen Prüfungen (`python3 tests/halo_test.py --port 2851 --only "<Teil des Namens>"`, hell;
  dunkel nur bei Farben), kein Volllauf – den macht die CI, ihr Ergebnis danach prüfen.
- **Nicht Eiliges nimmt der Nachtlauf mit:** Sitzungen auf neon außerhalb des Nachtlaufs committen
  Fertiges, das nicht sofort auf GitHub muss, auf `main` in `~/halo-spaces` und pushen nicht; sofort
  pushen nur, wenn etwas davon abhängt (Release, Fix für Nutzer). Ungespeicherte Änderungen anderer
  Sitzungen legt der Nachtlauf immer auf einen Zweig `rest/<datum>`, nie auf `main` und nie in ein
  Release (geändert 8.11.2026, Ablauf-Analyse, Stufe 1) – wer fertig ist, committet also selbst.
- **Den Nachtlauf nicht behindern** (Entscheidung des
  Maintainers vom 5.11.2026): Jede von Hand gestartete Sitzung – neon, Cloud, Laptop,
  Desktop-App – plant ihre Arbeit so, dass um 01:30 nichts mehr läuft, was
  den Nachtlauf auslassen lässt: ab 00:00 keinen
  Push mit Codeänderung mehr (die CI dazu muss bis 01:30 durch sein; eine
  Runde mit Dunkelmodus dauert gut 70 Minuten), keine
  Testläufe auf neon, die über 01:30 hinausgehen, und keine Runde, die um
  01:30 noch arbeitet – rechtzeitig abschließen bzw. die Antwort geben und
  warten.
- **Push-Sperre 01:30–09:00** (Wiener Zeit) für alle Sitzungen außer dem
  Nachtlauf selbst (und der Wochen- bzw. Doku-Prüfung, die erst nach dem
  Nachtlauf pushen): Der Nachtlauf wartet auf die CI genau seines Commits;
  ein weiterer Push verlängert die Wartezeit auf dem einen Runner um eine
  ganze Runde. Früher nur, wenn neon bestätigt, dass
  der Nachtlauf fertig ist (Bericht `~/halo-berichte/<datum>-nachtlauf.md`
  liegt vor); sonst bis danach warten bzw. es dem Maintainer sagen.
- **Pausen mit Ablaufzeit:** `~/halo-nacht/pausen.txt` (`pause_setzen <Routine> <bis> <Grund>` aus
  `tests/lauf-hilfen.zsh`), damit keine Sperre vergessen wird; Einzelheiten `docs/testrechner.md`,
  `tests/MAC-MINI.md` Abschnitt 13.
- **Aufgabenliste nur zu Beginn eines Laufs** abrufen und daraus den Plan
  machen; vor Push, CI und Release das Board nicht erneut laden (Entscheidung
  des Maintainers vom 3.11.2026).
- **Nachtlauf** (`tests/nachtlauf.sh`, jede Nacht 01:30) arbeitet die Aufgabenliste ab, pusht, wartet
  auf die CI und veröffentlicht bei Grün; Pausieren nur über `~/halo-nacht/pausen.txt` (`pause_setzen`, mit Ablaufzeit).
  Nach grüner CI und Release arbeitet er vor 06:30 alle machbaren Einträge weiter ab, je Eintrag
  committet mit lokalen `--only`-Prüfungen, ohne Push und ohne zweites Release, höchstens sechs nicht
  gepushte Commits; die pusht der nächste Nachtlauf mit seiner CI-Runde (Entscheidung vom 8.11.2026,
  `ENTSCHEIDUNGEN.md`, Auftrag Schritt 5). Rotes aus seinen CI-Läufen trägt er selbst ins Board ein; lief in 24 Stunden keine vollständige
  Runde und pusht er nichts CI-Auslösendes, startet er nach seiner Arbeit (bis 04:30) selbst eine
  mit `ziel=alle` – die einzige erlaubte von Hand gestartete Runde während des Nachtlaufs, sie zählt
  als vollständig (Entscheidung vom 7.11.2026, `tests/ci-runde.zsh`, `docs/testrechner.md`). Zeigt ein
  späterer vollständiger Lauf derselben Nacht auf einem anderen Commit die rote Prüfung im selben Job
  grün, gilt sie als repariert: kein Eintrag (nur Zeile im Bericht), ein offener geht mit Notiz auf
  Done; grün auf demselben Commit heißt „flackert“ und zählt nicht (Entscheidung vom 7.11.2026,
  gilt auch für das Nachholen durch den CI-Wächter). Die übrigen
  Routinen (CI-Wächter, Wochenprüfung, Doku-Prüfung, Rundgang) und die Windows-VM stehen in
  `docs/testrechner.md`; Windows-Abweichungen wie Linux behandeln.

## Zeitfenster-Hook (aktiv, in ~/.claude/settings.json eingetragen)

`tests/zeitfenster-hook.sh` ist als PreToolUse-Hook für das Werkzeug Bash vorbereitet (Befund B7), und in
`~/.claude/settings.json` eingetragen (Freigabe des Maintainers). Er liest
die Hook-JSON von stdin und sperrt mit Exitcode 2 und kurzer Meldung: `git push` von 01:30 bis 09:00 Wiener Zeit sowie von
00:00 bis 01:30, wenn `tests/ci-noetig.sh origin/main HEAD` Exitcode 0 meldet (`git push --delete` und Push von Tags allein
bleiben frei); außerdem Befehle, die `halo_test.py`, `update_test.py`, `store_shots.py` oder `ui_tour.py` starten, solange
`Runner.Worker` läuft. Ausnahmen: gesetzte Umgebungsvariable `HALO_LAUF` (setzen Nachtlauf, Wochen-/Doku-Prüfung und Rundgang
selbst) und die Datei `~/halo-nacht/SPERRE_AUS` (bewusster Schalter des Maintainers). Fail open: bei jedem Fehler (kein JSON,
kein jq/python, Zeit nicht lesbar, ci-noetig nicht ausführbar) Exitcode 0. Prüfung: `zsh tests/zeitfenster-hook-test.sh`
(Zeit über `HALO_JETZT=HHMM`, Runner über `HALO_RUNNER`, ci-noetig über `HALO_CI_NOETIG` simuliert). Abschalten: den Eintrag
aus `~/.claude/settings.json` entfernen.

## Erzeugt-Hook (ab 11.11.2026)

`tests/erzeugt-hook.sh` (Kopie `~/.config/halo-spaces/erzeugt-hook.sh`, PreToolUse für die Werkzeuge Edit und Write in
`~/.claude/settings.json`) sperrt mit Exitcode 2 das Bearbeiten erzeugter Dateien: `extension/theme.css`, alles unter `dist/`
(nur in einem Stand mit `build.sh`) und `*.xpi`; die Meldung nennt die Quelle (`chrome/userChrome.css` bzw. `chrome/spaces.css`,
auch für den Bereiche-Block, den der Hook nicht erkennt). Bash bleibt frei, `build.sh` und `release.sh` erzeugen die Dateien
weiter. Fail open, Schalter `~/halo-nacht/SPERRE_AUS` wie oben. Prüfung: `zsh tests/erzeugt-hook-test.sh`; nach Änderung die
Kopie erneuern. Abschalten: Eintrag aus `~/.claude/settings.json` entfernen (Sicherung in `~/halo-sicherung/`).

## halo-zsh: eigene Kopie von zsh für Routinen mit Mausbewegung

Nachtlauf, Wochenprüfung, Doku-Prüfung und Rundgang starten über `~/.config/halo-spaces/bin/halo-zsh` statt `/bin/zsh` (Kopie von `/bin/zsh`, mit `codesign --force --sign -` signiert; `tests/mac-mini-setup.sh` legt sie an). Grund: Die Freigabe unter Systemeinstellungen → Datenschutz & Sicherheit → Bedienungshilfen gilt für genau diese Datei; `/bin/zsh` selbst soll sie nicht bekommen, sonst dürfte jedes zsh-Skript die Maus bewegen. Nach einem macOS-Update kann `/bin/zsh` sich ändern; `mac-mini-setup.sh --check` weist dann hin (es ersetzt die Kopie nie stillschweigend, weil die Freigabe an der Datei hängt). Dann `halo-zsh` löschen, `mac-mini-setup.sh` ausführen (kopiert und signiert neu) und der Maintainer gibt die neue Datei unter Bedienungshilfen frei. Alle übrigen LaunchAgents bleiben bei `/bin/zsh`.

## Kontingent selbst auslesen

Jede Sitzung (neon, Laptop, Routinen, Unteragenten) darf das Kontingent selbst lesen, ohne Rückfrage beim Maintainer:

```bash
zsh tests/kontingent.sh      # „Woche 88 % (Zurücksetzen 01:00), 5 Stunden 24 %, Status allowed_warning“
```

- Das Skript ruft `claude -p` mit Haiku einmal auf und liest das `rate_limit_event` (Felder `unifiedWindows.seven_day` und `five_hour`, `utilization` 0 bis 1, `resetsAt`). Ergebnis auch in `~/halo-nacht/kontingent.json`. Kostet einen winzigen Teil des Kontingents.
- Nur bei Bedarf aufrufen: vor Push, Revert, Warten auf die CI, langen Läufen und wenn der Maintainer ein Limit nennt; nie in Schleifen oder Takten.
- Ohne Zahl (Ausgabe „KONTINGENT: nicht lesbar“): Status aus `get_session` (`rate_limit_info.status`: `allowed`, `allowed_warning`, `rejected`) als Ersatz nehmen, nichts erfinden.
- Grenzen und Schutzregeln legt der Maintainer fest (z. B. Wechsel auf Sonnet bei 96 %); das Auslesen allein ändert keine Regel.
- Nicht erlaubt: Zugangsdaten oder Schlüsselbund auslesen, um das Kontingent anders abzufragen.


## Pflichtzeit des Maintainers messen (10.11.2026)

Jede iPhone-Meldung aus `push()` (`tests/lauf-hilfen.zsh`) beginnt mit `[info]` oder `[handeln]`. `[handeln]` (drittes Argument `handeln` oder `HALO_PUSH_ART=handeln`) setzen nur Stellen, an denen der Maintainer etwas tun oder entscheiden muss (heute: `NOTFALL:` in `tests/notfall.sh`, fehlende Bildschirmaufnahme im Rundgang). Solche Meldungen stehen zusätzlich als `<Zeit> <Quelle> <Text>` in `~/halo-nacht/handeln.log`; `zsh tests/handeln-zaehlen.zsh [<Woche>]` zählt sie je ISO-Woche, die Wochenprüfung schreibt „Maintainer nötig: n“ in den Bericht. Ausgangswert: `~/halo-nacht/handeln-ausgangswert.txt`. Probelauf ohne Nachricht: `HALO_PUSH_TROCKEN=1`.

## Morgenbrief (ab 11.11.2026)

`tests/morgenbrief.sh` (Kopie in `~/.config/halo-spaces/`, LaunchAgent `at.halo-spaces.morgenbrief`, täglich 08:30) schickt eine einzige iPhone-Meldung ohne Sprachmodell (nur die Zustellung über `push()`): erste Zeile „Du musst heute: …“ (`[handeln]`) oder „Nichts nötig“ (`[info]`), danach Nachtlauf, Tagesroutine, Release, CI, Windows, Kontingent gegen die Sollkurve. Am Wochenende nur bei `[handeln]`. Schreibt `~/halo-berichte/<datum>-morgenbrief.md` und je Tag eine Zeile in `~/halo-nacht/kontingent-tage.tsv` (für `tests/vergleich-6-12.sh`, Messplan in `docs/umbau.md`). Pause: Routine `morgenbrief` in `pausen.txt`. Probe: `zsh tests/morgenbrief.sh --trocken` (Testdaten über `HALO_JETZT`, `HALO_MB_*`, siehe Kopf des Skripts).

## Tagesroutine (ab 11.11.2026)

`tests/tagesroutine.sh` (Kopie in `~/.config/halo-spaces/`, LaunchAgent `at.halo-spaces.tagesroutine`, Mo–Fr ab 09:00, Sa und So ab 10:00, jeweils bis 22:00 Wiener Zeit (Maintainer 13.11.2026, Wortlaut in `ENTSCHEIDUNGEN.md`; `START_WOCHENENDE` in `tagesroutine.conf`, das Skript beginnt am Wochenende auch bei früherem Start erst dann)) arbeitet die Aufgabenliste ab: je Eintrag ein Commit, **pusht nie nach `main`**; fertige Commits schiebt das Skript ohne Force auf `pruef/tagesroutine-<datum>` (nur Linux und statisch, neon bleibt frei), am Tagesende wird der Zweig gelöscht, den Rest nimmt der Nachtlauf mit. Das Modell richtet sich nach der Sollkurve des Wochenkontingents (Soll = Stunden seit Dienstag 00:00 UTC (Wiener Zeit 01:00 im Winter, 02:00 im Sommer) / 168; Schwellen in `~/.config/halo-spaces/tagesroutine.conf`); 5-Stunden-Fenster ab 80 % oder mehr als 10 Punkte über Soll: nichts Neues, aber kein Ende: ohne Claude bis zur nächsten vollen Stunde warten (beim 5-Stunden-Fenster bis zu dessen Ende, wenn das früher ist), Kontingent neu lesen, neu entscheiden; wie beim Sparmodus-Warten nur bis 19:30, weil danach kein Eintrag mehr beginnt (Maintainer 12.11.2026, „die risikoärmere variante bitte“). Tageslimit: höchstens 8 eigene Commits (nur Commits, deren Autorzeit in einer Claude-Runde dieses Laufs liegt; fremde Commits und ein Rebase von `main` zählen nicht), danach endet der Lauf. Bis 10 Punkte über Soll gilt der **Sparmodus** (Maintainer 12.11.2026): Rate = (100 − Ist − Reserve 15) / Stunden bis zum Reset; erst wenn das seit Tagesbeginn (09:00, Sa/So 10:00) Angesparte die geschätzten Kosten eines Eintrags deckt (1 Punkt, ab 3 Messungen deren Mittel), eine Runde mit dem niedrigsten Modell (Haiku) für einen Eintrag, den es sicher schafft (Einstufung in `tests/tagesroutine-auftrag.md`), sonst ohne Claude bis zur vollen Stunde warten; ergibt die Runde „nichts_passend“, endet der Lauf nicht: er wartet ohne Claude bis zur nächsten vollen Stunde, liest das Kontingent neu und entscheidet neu (Haiku-Runde also stündlich, sofort bei Moduswechsel), nur bis 19:30, danach Ende mit „Sparmodus: nichts Passendes (bis 19:30 stündlich geprüft)“; die Runde zählt nicht als Eintrag (Maintainer 12.11.2026, „einfachere variante umsetzen mit jeder stunde“); höchstens ein Eintrag je Tag, bis drei gemessen sind; Messungen (Woche vor/nach, Dauer) in `~/halo-nacht/tagesroutine-spar.tsv` und im Bericht. Ist der Plan abgearbeitet, endet der Lauf nicht (Maintainer 13.11.2026, „Ja“ zum Vorschlag von neon, Wortlaut in `ENTSCHEIDUNGEN.md`): er wartet wie nach „nichts_passend“ ohne Claude bis zur nächsten vollen Stunde, liest das Kontingent neu und startet eine neue Plan-Runde (Plan `~/halo-nacht/<datum>-tagesroutine-plan-<n>.tsv`, heute schon Bearbeitetes aus `<datum>-tagesroutine-erledigt.txt` ausgeschlossen); nur solange die nächste volle Stunde vor 20:30 liegt. Ende bei leerem Plan einer Plan-Runde („kein Plan in Plan-Runde n“) oder nach drei Plan-Runden hintereinander ohne erledigten Eintrag (Schutz vor stündlichem Leerlauf); der Bericht hat je Plan-Runde einen Abschnitt und eine Übersicht „Plan-Runden“, unter „Ende“ den echten Endgrund. Sie beginnt nichts, solange der Mac belegt ist (CI, Testlauf, Windows-VM, andere Sitzung im Repo, ungespeicherte Änderungen) oder Nachtlauf, Wochen-, Doku-Prüfung bzw. Design-Rundgang laufen oder warten (Sperrdateien in `~/halo-nacht`; Doku-Prüfung Sa und Wochenprüfung So beginnen 08:00 und können über 10:00 hinaus laufen, die Doku-Prüfung am 7.11.2026 bis 09:57). Bericht `~/halo-berichte/<datum>-tagesroutine.md`, Pausen nur über `pausen.txt`. Probe ohne Claude und ohne Schreiben: `zsh tests/tagesroutine.sh --trocken` (Testwerte über `HALO_JETZT`, `HALO_KONTINGENT_WOCHE`/`_5H`, `HALO_SPAR_DATEI`); Prüfung der Entscheidung: `zsh tests/tagesroutine_test.zsh`.

## Director im Nachtlauf (ab 13.11.2026)

Entscheidung des Maintainers vom 13.11.2026 (Wortlaut in `ENTSCHEIDUNGEN.md`). Der Nachtlauf arbeitet die Liste nicht mehr in fester Reihenfolge ab: Nach dem Laden der Liste und dem Zusammenlegen Doppelter plant die Nachtlauf-Sitzung selbst als „Director“ (kein eigener claude-Aufruf, gleiches Modell Opus, höchstens etwa 15 Minuten). Er bewertet jeden offenen Eintrag (ohne „Wartet auf OK“ und ohne Einträge, die der Nachtlauf nicht macht) mit Nutzen 1–5 (Vertrauen/Datenverlust/Absturz, Sichtbarkeit in Mail bzw. allen Spaces, Beitrag zum Design-Anspruch, von Nutzern gemeldet), Aufwand klein/mittel/groß (Schätzung; gemessene Werte aus `~/halo-nacht/<datum>-tagesroutine-plan.tsv`, `tagesroutine-spar.tsv`, Notizen und früheren Berichten) und Abhängigkeiten (Reihen nur der nächste Schritt, Zusammengehöriges zusammen) und plant ein Zeitbudget (neue Einträge bis 04:30, Schritt 5 bis 06:30, Kontingent). Große Einträge, die lange ununterbrochene Arbeit brauchen, gehören in die Nacht (der Maintainer schläft und würde tagsüber unterbrechen, Zusatzinfo vom 13.11.2026): mehrere sind erlaubt, so viele wie Zeit und Kontingent zulassen, bei vergleichbarem Nutzen zieht er sie vor; kleine und mittlere ordnet er nach Nutzen je Aufwand, kleine, die die Tagesroutine ohnehin schafft, bevorzugt er nachts nicht. Haltung (Maintainer 13.11.2026: Maßstab „was bringt langfristig mehr Produktivität?“): nur mit belegter Kapazität planen; solange weniger als drei Berichte mit Director-Plan vorliegen, grob 70–80 % der Nachtkapazität und einen großen Eintrag nur, wenn er die CI-Runde nicht gefährdet; danach nach Trefferquote mehr oder weniger (eine rote CI entwertet die ganze Nacht). Nutzen gleichrangig aus Vertrauen, Funktion des Mailclients (lesen, schreiben, senden, suchen, Ordner, Konten, Anhänge, Kalender- und Kontaktabruf; muss immer gewährleistet sein; Maßstab ist der Umfang von Apple Mail, nicht der volle Umfang von Thunderbird – seltene Thunderbird-Funktionen zählen nicht als Grundfunktion und werden niedrig bewertet, aber nie gestrichen oder versteckt, „Nichts ersatzlos entfernen“ gilt weiter; neue Optionen ohne belegten Nutzen im Zweifel als Rückfrage), Stabilität und Release-Fähigkeit, sichtbarem Design (Mail zuerst als Gewicht), von Nutzern gemeldeten Bugs, Betrieb nur soweit er Releases sichert; Design ist wichtig, aber nicht das einzige und nie auf Kosten der Mail-Funktion. Unklare Einträge setzt er auf „Wartet auf OK“ mit Notiz „Rückfrage Director <Datum>: …“ und schreibt höchstens 5 Fragen in den Bericht unter „Rückfragen an den Maintainer“; `tests/morgenbrief.sh` nimmt sie als Punkt „Du musst heute“ in den Morgenbrief, die Zahl steht auch in der Zeile „Kurz:“. Feste Rahmenregeln, die er nicht überstimmt: Schwere (Absturz, Datenverlust, Mail-Grundfunktion gestört oder ungeprüft gefährdet) zuerst; ausdrückliche Wünsche des Maintainers bzw. „Vorrang“ danach; Reserve von grob einem Drittel der Nachtzeit für kleine Einträge mit hohem Nutzen; Gleichstand nach Bugs, einfachen Features, Reihen und der Bereichsfolge (global, Mail, Kalender, Adressbuch, Aufgaben, Einstellungen, Chat; über 7 Tage offen rückt eine Stufe vor); Dauerfreigaben und „Wartet auf OK“ unverändert; höchstens drei Einträge zugleich In Progress; Einträge, die nur auf Push/CI warten, nicht neu bearbeiten. Der Plan steht in `~/halo-nacht/<datum>-plan.md` (Schritt 2, Schritt 5 und Fortsetzungen arbeiten danach) und im Nachtbericht unter „Director-Plan“ (Reihenfolge, id, Titel, Nutzen, Aufwand, Begründung, Zeitbudget, Zahl großer und kleiner Einträge, Reserve, Übersprungenes mit Grund; am Ende je Eintrag Spalte „Ergebnis“ – fertig mit Commit-Hash, nicht geschafft bzw. übersprungen mit Grund – und „Aufwand geschätzt → tatsächlich“ in Minuten bzw. Kontingentpunkten, soweit messbar). Vor dem Schätzen liest er diesen Abschnitt der letzten drei Nachtberichte und passt seine Schätzungen an, wo sie deutlich danebenlagen. Der übrige Nachtbericht und die iPhone-Zeile („Kurz:“) bleiben unverändert, der Morgenbrief zeigt zusätzlich die Rückfragen (Maintainer 13.11.2026: der Nachtbericht bleibt, der Director-Plan ist ein Abschnitt darin). Am Ende schlägt er im Bericht unter „Pull Requests zum Schließen vorgeschlagen“ schließbare PRs mit Grund und fertiger Zeile für `tests/pr-freigaben.txt` vor; er schließt selbst keinen und trägt nichts ein (Zusatz des Maintainers vom 13.11.2026). Board-Einträge (`fertig.sh`), Issues („Fixed in x.y.z“ durch `publish.sh`) und Antworten an Nutzer (GitHub-Routine bei ihrem nächsten planmäßigen Lauf, `docs/github-komm.md` „Status“) laufen unverändert; der Director schickt der Routine keine Nachricht. Kann er nicht sauber planen, gilt die feste Reihenfolge weiter und der Bericht nennt „Director: Rückfall auf feste Reihenfolge, Grund …“; der Lauf fällt deswegen nie aus. Wirkt ohne Skriptänderung: `tests/nachtlauf.sh` liest `tests/nachtlauf-auftrag.md` bei jedem Start aus dem Checkout. `nachtlauf_arbeit` und `nachtlauf_fortsetzen` (`tests/vorpruefung.zsh`) zählen nur machbare Einträge und legen keine Reihenfolge fest.

## Volldampf (ab 17.11.2026)

Entscheidung des Maintainers vom 13.11.2026 (Wortlaute in `ENTSCHEIDUNGEN.md`): nach dem Wochenreset „mit volldampf die Token-intensivsten dinge anzugehen“, „Ist wie ein override schalter“, und „wenn das wochenlimit erreicht wurde wird Volldampf automatisch deaktiviert. Nur bei erreichen des wichenlimits und nicht bei erreichen des 5 Stunden Limits“.

- **Datei:** `~/halo-nacht/volldampf.txt`, eine Zeile je Fenster: `volldampf <ab ISO mit Zone> <bis ISO mit Zone> <Grund>`. Stand 13.11.2026: `volldampf 2026-11-17T01:00+01:00 2026-11-24T01:00+01:00 …` (ab = Wochenreset, bis = nächster Wochenreset als Sicherung). Setzen: `volldampf_setzen <ab> <bis> <Grund>` aus `tests/lauf-hilfen.zsh`; Widerruf: Zeile löschen. Aktiv nur zwischen ab und bis; abgelaufene Zeilen räumt der Nachtlauf an seinem Ende weg („VOLLDAMPF ABGELAUFEN …“ im Protokoll); unlesbare Zeilen gelten als nicht aktiv („VOLLDAMPF UNLESBAR …“ in Protokoll und `uebersprungen.log`).
- **Ende beim Wochenlimit:** Vor jeder Runde (Nachtlauf: vor dem Start, vor jeder Fortsetzung und nach jeder Limit-Pause; Tagesroutine: bei jeder Entscheidung) prüft `volldampf_wochenlimit_pruefen` die Woche („alle Modelle“ aus `tests/kontingent.sh`). Ab `VOLLDAMPF_WOCHE_ENDE` (98 %, Vorschlag; in `tagesroutine.conf` einstellbar) ist Volldampf **dauerhaft** beendet: Marker `~/halo-nacht/volldampf-beendet.txt` (`<ab> <bis> <Zeit> <Woche>`), Protokollzeile „Volldampf beendet: Wochenlimit erreicht (N %, HH:MM)“, einmal eine iPhone-Meldung `[handeln]` („freien Reset in Einstellungen > Nutzung drücken, Volldampf nur auf Zuruf wieder an“). Danach bleibt er aus, auch nach dem freien Reset oder dem Wochenreset; wieder ein nur mit einer neuen Zeile (anderes ab oder bis). Woche und 5-Stunden-Fenster sind im `rate_limit_event` getrennte Werte (`unifiedWindows.seven_day` bzw. `five_hour`); nur `seven_day` beendet Volldampf, das 5-Stunden-Limit nie.
- **Erinnerung an den Reset** (Vorschlag von neon, vom Maintainer am 13.11.2026 bestätigt, eigener Commit): bei aktivem Volldampf und Woche ab 90 % (`VOLLDAMPF_ERINNERN`) einmal je Fenster eine iPhone-Meldung „Volldampf: Wochenkontingent bei N %, freien Reset in Einstellungen > Nutzung drücken?“ (`volldampf_reset_erinnern`, Zustand `~/halo-nacht/volldampf-erinnert.txt`; sinkt die Woche unter 90 %, ist sie wieder möglich). Entfernen: den Commit zurücknehmen.
- **Gratis-Reset:** Einstellungen > Nutzung (Stand 13.11.2026: ein „Full reset“ bis 10. Dezember, zwei „Fable reset“ bis 9. März; „Each button uses the reset that expires first“). Nur von Hand durch den Maintainer, nie aus Claude Code.
- **Nachtlauf** (`tests/nachtlauf.sh`, Auftrag Schritt 1c): Zeile „Volldampf: …“ im Auftrag; solange aktiv plant der Director mit voller Kapazität (ohne 70–80 %-Vorsicht und ohne Reserve von einem Drittel), die token-intensivsten wertvollen Einträge zuerst (reine Umbauten ohne Nutzernutzen nachrangig); Rahmenregeln, Mail-Schutz, Rückfragen und „Wartet auf OK“ unverändert. Fortsetzungen bis 08:00 (höchstens acht, Grenze zwölf nicht gepushte Commits statt 06:30/vier/sechs). Pflichtvermerk: erste Zeile im „Director-Plan“ und Anfang der Zeile „Kurz:“ („Volldampf aktiv bis …“, „Volldampf beendet: …“; „angemeldet (ab …, bis …), nicht aktiv“ nur im Director-Plan); fehlt er in „Kurz:“, setzt das Skript ihn vor die iPhone-Zeile.
- **Tagesroutine** (`tests/tagesroutine.sh`): Sollkurve und Sparmodus bremsen nicht (Stufe „Volldampf“), Modellwahl wie im Normalbetrieb (Plan und komplexe Einträge `MODELL_STARK`, Routine `MODELL_ROUTINE`), `MAX_COMMITS_TAG` gilt doppelt; das 5-Stunden-Fenster (`FUENF_STUNDEN_MAX`, Warten bis zum Fensterende) bremst wie bisher. Zustand in „Kurz:“, im Abschnitt Kontingent und im Trockenlauf (`HALO_VOLLDAMPF_DATEI` zum Proben).
- **Fable im Volldampf** (Vorschläge von neon nach „Freier aber auch nicht überbordernd“, nicht vom Maintainer bestätigt): nur für die schwersten Fälle (belegte Ursache fehlt nach Opus bei hohem Nutzen, oder Analyse/Design mit starkem Modell), nie für Routine; höchstens zwei Fable-Agenten je Nacht und einer am Tag, nacheinander; 5-Stunden-Fenster unter 60 % (`FABLE_5H_MAX_VOLLDAMPF`), ohne Soll-Bedingung; Stopp bei „Fable only“ über 80 % (`FABLE_WOCHE_MAX`). Der Fable-Wochenwert ist derzeit nicht lesbar (`kontingent.sh` liefert nur `seven_day` und `five_hour`, `~/halo-nacht/usage.json` der Statuszeile entsteht nicht); die Berichte vermerken „Fable only nicht lesbar, Stopp nur über die Zahl der Agenten“, und die iPhone-Meldungen bei 90 % und beim Beenden bitten, den Fable-Anteil in Einstellungen > Nutzung mit anzusehen. Werte vom Maintainer am 13.11.2026 bestätigt („Ja sie Empfehlungen umsetzen“).
- **Prüfen:** `zsh tests/volldampf_test.zsh` (Fenster, Ende beim Wochenlimit, kein Wiederaufnehmen, 5-Stunden-Limit beendet nicht, unlesbare Zeilen, Aufräumen), `zsh tests/tagesroutine_test.zsh` (Abschnitt Volldampf). Nicht unter `tests/logik/`, weil Änderungen dort die CI auslösen.

### Director: Vorrang gehäufter Nutzer-Bugs, Freigabe Lichtschein 2/3 (13.11.2026)

Maintainer 13.11.2026, „Ja sie Empfehlungen umsetzen“ (Wortlaut und Vorschläge in `ENTSCHEIDUNGEN.md`): Ein von mehreren Nutzern unabhängig gemeldeter gleicher Fehler (`[GitHub #n]`-Einträge mit gemeinsamer Ursache, z. B. #59, #61–#64 nach 3.26.0) und ein Fehler, der ein Bedienelement oder die Anzeige für alle Nutzer einer Plattform blockiert, zählen wie „Mail-Grundfunktion gestört“ (Rahmenregel a, Vorrang); der Director fasst sie im Plan zusammen. Eine Einzelmeldung hat hohen Nutzen, aber keinen Vorrang. „Seitenleiste: Lichtschein und gefärbte Trennlinie (Umsetzung 2/3)“ mit dem Schalter darf der Director einplanen (Prüfung schwebend und Animation, Testpaket /vorab im Bericht ankündigen, Größe selbst beurteilen, bei Zweifel Rückfrage).
