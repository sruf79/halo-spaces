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
  getesteten Stand Farben betroffen sind – Symbole (`*.svg`,
  `extension/icons/`), in Stilblättern nur geänderte Zeilen mit Farbbezug
  (Farbwerte, Farbvariablen, Hintergrund, Rahmen, Schatten, Filter,
  Dunkel-Blöcke; geänderte Selektoren, wenn ihr Block Farbe setzt;
  `tests/farben_css.py`, seit 20.11.2026, Board „Dunkel-Lauf verkleinern“
  Schritt 1), Farbwerte im Code oder Prüfungen zu Farben bzw. Dunkelmodus,
  oder `[dunkel]` in einer Commit-Nachricht; im Zweifel dunkel. Reine Maße,
  Abstände, Schrift und Anzeige testet hell allein. Die Regel steht in `tests/farben-betroffen.sh` (CI-Job `changes`
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
  laufenden CI-Job wartet er bis zu dessen Ende, längstens bis 03:30; auf Testläufe (Worker, `halo_test.py`,
  Thunderbird mit Marionette, Marionette-Port) bis 60 Minuten, auf `release.sh`/`publish.sh` bis 20 Minuten
  (Maintainer 18.11.2026, vorher 90 Minuten nur auf die CI; `nachtlauf_warten` in `tests/vorpruefung.zsh`,
  Prüfung `zsh tests/nachtlauf_warten_test.zsh`; nach 03:30 von Hand gestartet: CI höchstens 90 Minuten).
  Grenze 03:30 statt 04:00: bis 06:30 bleiben drei Stunden für Arbeit, Push, CI-Runde (35–50 Minuten) und
  Release, und die Vollrunde kann noch vor 04:30 starten; läuft eine CI zwei Stunden nach dem Push-Stopp
  (00:00) noch, hängt sie meist. Er lässt aus, nur, wenn neon
  wirklich belegt ist: eine andere Claude-Sitzung ist mitten in einer Runde
  (fertige Sitzungen, die auf eine Antwort warten, zählen nicht; Entscheidung
  des Maintainers vom 4.11.2026; sofort, ohne Warten), ein VM-Lauf (sofort), oder CI, Tests bzw. Release
  sind nach ihrer Wartezeit noch nicht fertig (Bericht „ausgelassen“ und Push wie bisher). Vor der Arbeit bringt er Thunderbird unter `/Applications`
  auf die aktuelle Version von Mozilla (nur mit Mozillas Signatur), damit die
  CI-Runde der Nacht damit testet. Am Ende der Arbeit (auch wenn die Vorprüfung nichts fand) räumt
  `tests/aufraeumen.sh` Reste mit Risiko null auf (Abschnitt „Aufräumen“ unten; ersetzt das Löschen
  verwaister Zweige `claude/…` vom 7.11.2026). Danach wartet
  `ci_nacht_abschluss` (`tests/ci-runde.zsh`) noch laufende CI-Läufe der Nacht ab (bis 90 Minuten,
  längstens 09:00; das ist das Warten nach dem eigenen Push, nicht das Warten vor dem Start), trägt rote Prüfungen daraus über `ci-waechter.sh --lauf` ins Board ein (gleiche
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
  GitHub-Kommunikation nur bei Neuem von anderen seit „Letzte Prüfung“ (dazu fällige Nachfragen bzw.
  wegen Inaktivität geschlossene Issues aus `tests/inaktivitaet.sh`, das die Vorprüfung aufruft und das
  schließt, unabhängig vom Nachtlauf; `docs/github-komm.md` „Inaktivität“). Ein
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
- **Wochenprüfung:** sonntags 08:00 (wartet bis 09:15 auf den Nachtlauf, danach wie der Nachtlauf auf eine CI bis zu
  ihrem Ende, längstens 10:00, auf Testläufe 60 und auf `release.sh`/`publish.sh` 20 Minuten; andere Sitzung,
  Windows-VM und ungespeicherte Änderungen sofort auslassen; Maintainer 18.11.2026, vorher 90 Minuten nur auf die
  CI; `woche_warten` in `tests/vorpruefung.zsh`, Prüfung `zsh tests/nachtlauf_warten_test.zsh`; Grenze 10:00, weil
  eine CI ab dem Ende der Push-Sperre 09:00 auch dunkel vorher fertig ist und die Tagesroutine Sa/So so lange
  wartet) wertet `tests/wochenpruefung.sh` die
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
  samstags 22:15 (wartet auf Nachtlauf, Doku-Prüfung und CI, spätester
  Start 23:30) nimmt `tests/rundgang-woche.sh` mit `ui_tour.py --messung`
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
  - **Frische VM** (Maintainer 18.11.2026: „wir sollten die vm bereits am anfang rebooten vor den CI testläufen, damit
    der reboot nicht ebenfalls andere CI's stört“): `tests/vm_frisch.py` startet die VM kalt neu (`prlctl stop`,
    bei Zeitüberschreitung `--kill`, `start`, bis 5 Minuten Warten auf Windows), prüft den Bildtakt
    (`tests/win-bildtakt.ps1`: mehr als 3 von 30 Bildern über 1,6 × Mittel = gestört, dann ein zweiter Neustart,
    sonst „FEHLER VM gestört“) und pausiert sie wieder; immer gelöst in eigener Sitzung (launchd und der
    GitHub-Runner beenden ihn nicht mit). Aufrufe: nach jedem Lauf mit `--vm` (halo_test.py übergibt die Sperre
    `~/halo-vm/lauf.lock` ohne Lücke, ein Folgelauf wartet auf die frische VM), Nachlauf-Schritt „VM frisch“ im
    Job `windows` (auch nach Zeitüberschreitung oder Abbruch; `tests/vm-frisch.sh --nach-lauf`) und einmal
    täglich 00:45–01:14 aus dem CI-Wächter (`--taeglich`, Tagesmarke erst bei Erfolg); läuft CI oder ein Test,
    lässt der tägliche Aufruf aus. `tests/vm-frisch.sh` nimmt die Dateien aus dem letzten Commit, nicht aus dem
    Arbeitsbaum. Die Sperre wird atomar genommen (`os.link`). Keine Altersgrenze, kein eigener Aufruf nach einem
    Neustart des Macs (die VM startet dann ohnehin kalt mit). Im Lauf selbst nur der Kurztest (Sekunden), bei
    Störung ein kalter Neustart als Rückfall, dann „FEHLER VM gestört“. `HALO_VM_KEIN_NEUSTART=1` (Läufe von Hand):
    weder Rückfall noch Neustart danach. Protokoll `~/halo-nacht/vm-frisch.log`; Logiktest ohne VM:
    `python3 tests/vm_neustart_test.py`.
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
- Jeder Push auf `main` mit Thunderbird-Änderung belegt neon mit der CI (`mac`) rund 30 Minuten,
  mit Dunkelmodus rund 60 (hell und dunkel je rund 30, gemessen an 200 Läufen bis 19.11.2026); der Windows-Lauf (~19 Minuten) folgt einmal je Nacht vor dem Release. Solange sie läuft (Prozess `Runner.Worker`), keine eigenen Testläufe
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
`Runner.Worker` läuft; dazu neue Testläufe, solange die Marke `~/halo-nacht/zwischen-faellig.txt` des Zwischen-Release-Wächters
frisch ist (Meldung „Zwischen-Release fällig, bitte warten“, neon-Auftrag #48; gilt auch mit `HALO_LAUF`, außer `zwischen-release`
und `nachtlauf`; `docs/regelwerk-kontingent.md` Bremse 3). Ausnahmen: gesetzte Umgebungsvariable `HALO_LAUF` (setzen Nachtlauf,
Wochen-/Doku-Prüfung und Rundgang selbst) und die Datei `~/halo-nacht/SPERRE_AUS` (bewusster Schalter des Maintainers). Fail open: bei jedem Fehler (kein JSON,
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

`tests/morgenbrief.sh` (Kopie in `~/.config/halo-spaces/`, LaunchAgent `at.halo-spaces.morgenbrief`, täglich 08:30) arbeitet ohne Sprachmodell (nur die Zustellung über `push()`). **Ein einziger Bericht** (Maintainer 15.11.2026, Wortlaute in `ENTSCHEIDUNGEN.md`): täglich, auch Sa/So, `~/halo-berichte/<datum>-bericht.md`. Oben die Kurzfassung in einfachen Worten, höchstens 10 Zeilen: Nacht (Zeile „Kurz:“ des Nachtlauf-Berichts ohne Klammern, Hashes, Pfade; dazu der Satz zur Zeile „Release unter Tage: Wunsch ja|nein“, falls vorhanden), Tests (was rot ist), „Heute von dir“ (Rückfragen des Directors mechanisch gekürzt auf Bereich und letzte Frage als Ja/Nein, übrige `[handeln]`-Punkte; höchstens 5), Vorschau der Tagesroutine, Kontingent. Darunter die Technik als aufklappbare `<details>`-Blöcke: ganzer Nachtlauf-Bericht, alle Briefzeilen, Release/CI/Windows, Aufräumen, Tagesroutine-Berichte seit dem letzten Brief, Vorschau-Liste. Der Nachtlauf schreibt seinen Bericht unverändert und wird nicht länger. **Vorschau der Tagesroutine** (unverbindlich, die erste Plan-Runde entscheidet): `board.sh export` (ein gh-Aufruf, kein Kontingent) geordnet nach den Regeln aus `docs/board.md` (schwer zuerst, Bugs, Features, Reihen; Bereichsfolge nach Titelpräfix; Alters-Zuschlag +0,5 Stufe je volle 7 Tage, höchstens +1,5, Alter aus dem Anlagedatum von `board.sh export`, sonst dem ältesten Datum im Text); ohne „Wartet auf OK“, Ablauf- und Release-Einträge, ohne „wartet auf Push/CI“, von Reihen nur der nächste Schritt; war die CI rot und gab es kein Release, steht die rote Prüfung zuerst (Schritt 1b). Abschnitt **„Überfällig“**: Einträge mit Notiz „Entscheidung fehlt seit <Datum>: <Frage>“ oder in „Wartet auf OK“ (seit dem Statuswechsel), jeweils über 7 Tage, je Zeile Titel, Tage, Frage; dazu ein Punkt „Zu tun“ in der Kurzfassung. Dazu Pause der Routine `tagesroutine` aus `pausen.txt`, Volldampf aus `volldampf.txt` und die Stufe aus Kontingent und `tagesroutine.conf` (Sparmodus, nichts Neues). **iPhone-Meldung** wie bisher eine, `[handeln]` wenn der Maintainer etwas tun muss, sonst `[info]`, am Wochenende nur bei `[handeln]`: höchstens 3 Zeilen („Du musst heute: …“ bzw. „Nichts nötig“, Nacht, erste Frage) und „Bericht in der Sitzung neon mit /bericht öffnen“, ohne Pfade und Hashes. **Öffnen:** Skill `/bericht [<datum>]` (`.claude/skills/bericht/SKILL.md`) baut mit `tests/bericht-html.py` eine Seite und veröffentlicht sie privat mit `Artifact`; Pfade zu Berichten werden dem Maintainer nie genannt. Außerdem je Tag eine Zeile in `~/halo-nacht/kontingent-tage.tsv` (für `tests/vergleich-6-12.sh`, Messplan in `docs/umbau.md`). Pause: Routine `morgenbrief` in `pausen.txt`. Probe: `zsh tests/morgenbrief.sh --trocken` (Testdaten über `HALO_JETZT`, `HALO_MB_*`, `HALO_MB_AUSGABE` für den Bericht, siehe Kopf des Skripts); Prüfung: `zsh tests/morgenbrief_test.zsh`.

## Tagesroutine (ab 11.11.2026)

Festlegung mit Fundstellen: Alltag (Tagesroutine, Sparmodus, Nachtlauf) in `docs/alltagsmodus.md`, Volldampf in `docs/volldampf-regelwerk.md`.

`tests/tagesroutine.sh` (Kopie in `~/.config/halo-spaces/`, LaunchAgent `at.halo-spaces.tagesroutine` täglich 08:45, Mo–Fr ab 09:00, Sa und So ab 09:00, mit Volldampf ab 08:45, jeweils bis 22:00 Wiener Zeit (Maintainer 13.11.2026 und 16.11.2026, Wortlaut in `ENTSCHEIDUNGEN.md`; `START`, `START_WOCHENENDE`, `START_VOLLDAMPF` in `tagesroutine.conf`; ohne Volldampf wartet das Skript nach dem Start um 08:45 ohne Claude bis zum Beginn)) arbeitet die Aufgabenliste ab: je Eintrag ein Commit, **pusht nie nach `main` und committet nie auf `main`**: seit 18.11.2026 (Maintainer: „hier folge ich deiner empfehlung“, Wortlaut in `ENTSCHEIDUNGEN.md`) arbeitet Claude in der eigenen Arbeitskopie `~/halo-tagesroutine` (`HALO_TR_WT`) auf dem Zweig `pruef/tagesroutine-<datum>`, den das Skript je Tag von `origin/main` anlegt (Ungespeichertes eines abgebrochenen Vortags sichert es mit `git stash`, ohne Arbeitskopie kein Lauf, nie ersatzweise `main`). Fertige Commits schiebt das Skript ohne Force auf den gleichnamigen Prüfzweig auf GitHub (nur Linux und statisch, neon bleibt frei). Nach `main` kommen sie im Volldampf über den Wächter `tests/zwischen-schleife.zsh` (grüner Stand des Prüfzweigs, wie jeder `pruef/…`-Zweig), sonst übernimmt sie der Nachtlauf (`tests/nachtlauf-auftrag.md` Schritt 0 b: `git merge` jedes lokalen `pruef/tagesroutine-*` nach `main`, Hashes bleiben). Am Tagesende löscht das Skript den Prüfzweig auf GitHub nur, wenn er schon in `origin/main` steckt, und löst die Arbeitskopie vom Zweig; danach räumt `tests/aufraeumen.sh` ihn ab. So bleibt `main` in `~/halo-spaces` frei von Thunderbird-Commits der Tagesroutine, die sonst „Release unter Tage“ sperren (Anlass 18.11.2026). Das Modell richtet sich nach der Sollkurve des Wochenkontingents (Soll = Stunden seit Dienstag 00:00 UTC (Wiener Zeit 01:00 im Winter, 02:00 im Sommer) / 168; Schwellen in `~/.config/halo-spaces/tagesroutine.conf`); 5-Stunden-Fenster ab 80 % oder mehr als 10 Punkte über Soll: nichts Neues, aber kein Ende: ohne Claude bis zur nächsten vollen Stunde warten (beim 5-Stunden-Fenster bis zu dessen Ende, wenn das früher ist), Kontingent neu lesen, neu entscheiden; wie beim Sparmodus-Warten nur bis 19:30, weil danach kein Eintrag mehr beginnt (Maintainer 12.11.2026, „die risikoärmere variante bitte“). Tageslimit: höchstens 8 eigene Commits (nur Commits, deren Autorzeit in einer Claude-Runde dieses Laufs liegt; fremde Commits und ein Rebase von `main` zählen nicht), danach endet der Lauf. Bis 10 Punkte über Soll gilt der **Sparmodus** (Maintainer 12.11.2026): Rate = (100 − Ist − Reserve 15) / Stunden bis zum Reset; erst wenn das seit Tagesbeginn (START, Sa/So START_WOCHENENDE, beide 09:00) Angesparte die geschätzten Kosten eines Eintrags deckt (1 Punkt, ab 3 Messungen deren Mittel), eine Runde mit dem niedrigsten Modell (Haiku) für einen Eintrag, den es sicher schafft (Einstufung in `tests/tagesroutine-auftrag.md`), sonst ohne Claude bis zur vollen Stunde warten; ergibt die Runde „nichts_passend“, endet der Lauf nicht: er wartet ohne Claude bis zur nächsten vollen Stunde, liest das Kontingent neu und entscheidet neu (Haiku-Runde also stündlich, sofort bei Moduswechsel), nur bis 19:30, danach Ende mit „Sparmodus: nichts Passendes (bis 19:30 stündlich geprüft)“; die Runde zählt nicht als Eintrag (Maintainer 12.11.2026, „einfachere variante umsetzen mit jeder stunde“); höchstens ein Eintrag je Tag, bis drei gemessen sind; Messungen (Woche vor/nach, Dauer) in `~/halo-nacht/tagesroutine-spar.tsv` und im Bericht. Ist der Plan abgearbeitet, endet der Lauf nicht (Maintainer 13.11.2026, „Ja“ zum Vorschlag von neon, Wortlaut in `ENTSCHEIDUNGEN.md`): er wartet wie nach „nichts_passend“ ohne Claude bis zur nächsten vollen Stunde, liest das Kontingent neu und startet eine neue Plan-Runde (Plan `~/halo-nacht/<datum>-tagesroutine-plan-<n>.tsv`, heute schon Bearbeitetes aus `<datum>-tagesroutine-erledigt.txt` ausgeschlossen); nur solange die nächste volle Stunde vor 20:30 liegt. Auch ein leerer Plan (Runde 1 oder später) beendet den Tag nicht, sondern wartet genauso bis zur nächsten vollen Stunde und plant neu (Bericht „Plan-Runde n: 0 Einträge, nächste Planung HH:00“; Berichtigung von neon 14.11.2026, die frühere Umsetzung „Ende bei leerem Plan“ war nicht Wortlaut des Maintainers). Ende nur, wenn die nächste volle Stunde nach 20:30 liegt, oder nach drei Plan-Runden hintereinander mit Einträgen, aber ohne erledigten (Schutz vor stündlichem Leerlauf; leere Pläne zählen nicht); der Bericht hat je Plan-Runde einen Abschnitt und eine Übersicht „Plan-Runden“, unter „Ende“ den echten Endgrund. Sie beginnt nichts, solange der Mac belegt ist (CI, Testlauf, Windows-VM, andere Sitzung im Repo, ungespeicherte Änderungen) oder Nachtlauf, Wochen-, Doku-Prüfung bzw. Design-Rundgang laufen oder warten (Sperrdateien in `~/halo-nacht`; Doku-Prüfung Sa und Wochenprüfung So beginnen 08:00 und können über 10:00 hinaus laufen, die Doku-Prüfung am 7.11.2026 bis 09:57). Bericht `~/halo-berichte/<datum>-tagesroutine.md`, Pausen nur über `pausen.txt`. Probe ohne Claude und ohne Schreiben: `zsh tests/tagesroutine.sh --trocken` (Testwerte über `HALO_JETZT`, `HALO_KONTINGENT_WOCHE`/`_5H`, `HALO_SPAR_DATEI`); Prüfung der Entscheidung: `zsh tests/tagesroutine_test.zsh`.

**Release unter Tage** (Maintainer 15.11.2026, Wortlaut in `ENTSCHEIDUNGEN.md`): einzige Ausnahme von „pusht nie“. Nur die erste Plan-Runde bekommt die Zeile „Release unter Tage (Skript): …“ aus `tests/release-nachtlauf-gescheitert.sh` (ohne Sprachmodell, `ja <Grund>`/`nein <Grund>`; Bericht „Kurz:“ mit „kein Release“, oder kein Release an dem Tag trotz Thunderbird-Änderungen) samt dem Wunsch des Nachtlaufs („Release unter Tage: Wunsch ja/nein – …“). Bei „ja“ entscheidet der Director nach `docs/release.md` „Release unter Tage: Kriterien“, schreibt Entscheidung und Begründung in den Plan-Abschnitt und die Plan-Datei und veröffentlicht nur über `tests/release-unter-tage.sh` (Uhrzeit 09–22, ein Release je Tag, nichts belegt, lokale Commits ohne Thunderbird-Änderung, README und Notizen, dann `NUR_CI=1 ./release.sh` – ohne vollständig grüne CI samt Windows keine Marke – und `./publish.sh`). Ergebnisdatei `~/halo-nacht/<datum>-release-unter-tage.erg` (`release <version> <Commit>`, `kein_release <Grund>`, `nicht_noetig <Grund>`) → Abschnitt „## Release unter Tage“ im Bericht, bei Release eine iPhone-Meldung `[info]`. Tests: `zsh tests/release_unter_tage_test.zsh`.

## Director im Nachtlauf (ab 13.11.2026)

Entscheidung des Maintainers vom 13.11.2026 (Wortlaut in `ENTSCHEIDUNGEN.md`). Der Nachtlauf arbeitet die Liste nicht mehr in fester Reihenfolge ab: Nach dem Laden der Liste und dem Zusammenlegen Doppelter plant die Nachtlauf-Sitzung selbst als „Director“ (kein eigener claude-Aufruf, gleiches Modell Opus, höchstens etwa 15 Minuten). Er bewertet jeden offenen Eintrag (ohne „Wartet auf OK“ und ohne Einträge, die der Nachtlauf nicht macht) mit Nutzen 1–5 (Vertrauen/Datenverlust/Absturz, Sichtbarkeit in Mail bzw. allen Spaces, Beitrag zum Design-Anspruch, von Nutzern gemeldet), Aufwand klein/mittel/groß (Schätzung; gemessene Werte aus `~/halo-nacht/<datum>-tagesroutine-plan.tsv`, `tagesroutine-spar.tsv`, Notizen und früheren Berichten) und Abhängigkeiten (Reihen nur der nächste Schritt, Zusammengehöriges zusammen) und plant ein Zeitbudget (neue Einträge bis 04:30, Schritt 5 bis 06:30, Kontingent). Große Einträge, die lange ununterbrochene Arbeit brauchen, gehören in die Nacht (der Maintainer schläft und würde tagsüber unterbrechen, Zusatzinfo vom 13.11.2026): mehrere sind erlaubt, so viele wie Zeit und Kontingent zulassen, bei vergleichbarem Nutzen zieht er sie vor; kleine und mittlere ordnet er nach Nutzen je Aufwand, kleine, die die Tagesroutine ohnehin schafft, bevorzugt er nachts nicht. Haltung (Maintainer 13.11.2026: Maßstab „was bringt langfristig mehr Produktivität?“): nur mit belegter Kapazität planen; solange weniger als drei Berichte mit Director-Plan vorliegen, grob 70–80 % der Nachtkapazität und einen großen Eintrag nur, wenn er die CI-Runde nicht gefährdet; danach nach Trefferquote mehr oder weniger (eine rote CI entwertet die ganze Nacht). Nutzen gleichrangig aus Vertrauen, Funktion des Mailclients (lesen, schreiben, senden, suchen, Ordner, Konten, Anhänge, Kalender- und Kontaktabruf; muss immer gewährleistet sein; Maßstab ist der Umfang von Apple Mail, nicht der volle Umfang von Thunderbird – seltene Thunderbird-Funktionen zählen nicht als Grundfunktion und werden niedrig bewertet, aber nie gestrichen oder versteckt, „Nichts ersatzlos entfernen“ gilt weiter; neue Optionen ohne belegten Nutzen im Zweifel als Rückfrage), Stabilität und Release-Fähigkeit, sichtbarem Design (Mail zuerst als Gewicht), von Nutzern gemeldeten Bugs, Betrieb nur soweit er Releases sichert; Design ist wichtig, aber nicht das einzige und nie auf Kosten der Mail-Funktion. Unklare Einträge setzt er auf „Wartet auf OK“ mit Notiz „Rückfrage Director <Datum>: …“ und schreibt höchstens 5 Fragen in den Bericht unter „Rückfragen an den Maintainer“; `tests/morgenbrief.sh` nimmt sie als Punkt „Du musst heute“ in den Morgenbrief, die Zahl steht auch in der Zeile „Kurz:“. Feste Rahmenregeln, die er nicht überstimmt: vor allem ein Fehler, der jedes Release verhindert (rote oder flackernde Prüfung, die die Testmarke blockiert; Maintainer 15.11.2026, `ENTSCHEIDUNGEN.md`; Vorgehen nach „Rot bleibt rot“, erst danach erneutes Zusammenführen von `paket/lichtschein-kachel`); dann Schwere (Absturz, Datenverlust, Mail-Grundfunktion gestört oder ungeprüft gefährdet) zuerst; ausdrückliche Wünsche des Maintainers bzw. „Vorrang“ danach, ebenso Einträge „aus einem Guss“ (Einheitlichkeit, vier Grundbausteine) vor neuen reinen Funktionen (Maintainer 15.11.2026, `docs/design-vorgaben.md` 2b Punkt 4); Reserve von grob einem Drittel der Nachtzeit für kleine Einträge mit hohem Nutzen; Gleichstand nach Bugs, einfachen Features, Reihen und der Bereichsfolge (global, Mail, Kalender, Adressbuch, Aufgaben, Einstellungen, Chat); Alter als Zuschlag im Nutzen aus `tests/haeufung.py` (+0,5 je volle 7 Tage, höchstens +1,5, Abschnitt „Alter (Skript)“); Dauerfreigaben und „Wartet auf OK“ unverändert; höchstens drei Einträge zugleich In Progress; Einträge, die nur auf Push/CI warten, nicht neu bearbeiten. Der Plan steht in `~/halo-nacht/<datum>-plan.md` (Schritt 2, Schritt 5 und Fortsetzungen arbeiten danach) und im Nachtbericht unter „Director-Plan“ (Reihenfolge, id, Titel, Nutzen, Aufwand, Begründung, Zeitbudget, Zahl großer und kleiner Einträge, Reserve, Übersprungenes mit Grund; am Ende je Eintrag Spalte „Ergebnis“ – fertig mit Commit-Hash, nicht geschafft bzw. übersprungen mit Grund – und „Aufwand geschätzt → tatsächlich“ in Minuten bzw. Kontingentpunkten, soweit messbar). Vor dem Schätzen liest er diesen Abschnitt der letzten drei Nachtberichte und passt seine Schätzungen an, wo sie deutlich danebenlagen. Der übrige Nachtbericht und die iPhone-Zeile („Kurz:“) bleiben unverändert, der Morgenbrief zeigt zusätzlich die Rückfragen (Maintainer 13.11.2026: der Nachtbericht bleibt, der Director-Plan ist ein Abschnitt darin). Am Ende schlägt er im Bericht unter „Pull Requests zum Schließen vorgeschlagen“ schließbare PRs mit Grund und fertiger Zeile für `tests/pr-freigaben.txt` vor (Zusatz des Maintainers vom 13.11.2026); selbst ein trägt er nur PRs, deren Inhalt nachweislich in `main` und in einem Release ist (Zeile `director` mit Hashes und Release, Dauerfreigabe 14.11.2026, `docs/dauerfreigaben.md` B), Bericht „PRs zum Schließen eingetragen: #n (Nachweis …)“; schließen und mergen tut er nie, das Schließen macht `publish.sh`. Board-Einträge (`fertig.sh`), Issues („Fixed in x.y.z“ durch `publish.sh`) und Antworten an Nutzer (GitHub-Routine bei ihrem nächsten planmäßigen Lauf, `docs/github-komm.md` „Status“) laufen unverändert; der Director schickt der Routine keine Nachricht. Kann er nicht sauber planen, gilt die feste Reihenfolge weiter und der Bericht nennt „Director: Rückfall auf feste Reihenfolge, Grund …“; der Lauf fällt deswegen nie aus. Wirkt ohne Skriptänderung: `tests/nachtlauf.sh` liest `tests/nachtlauf-auftrag.md` bei jedem Start aus dem Checkout. `nachtlauf_arbeit` und `nachtlauf_fortsetzen` (`tests/vorpruefung.zsh`) zählen nur machbare Einträge und legen keine Reihenfolge fest.

## Volldampf (ab 17.11.2026)

Überblick auf einer Seite (Zustände des Kontingents, Reihenfolge der Bremsen, Aufgaben nach Aufwand): `docs/regelwerk-kontingent.md`.

Entscheidung des Maintainers vom 13.11.2026 (Wortlaute in `ENTSCHEIDUNGEN.md`): nach dem Wochenreset „mit volldampf die Token-intensivsten dinge anzugehen“, „Ist wie ein override schalter“, und „wenn das wochenlimit erreicht wurde wird Volldampf automatisch deaktiviert. Nur bei erreichen des wichenlimits und nicht bei erreichen des 5 Stunden Limits“.

- **Datei:** `~/halo-nacht/volldampf.txt`, eine Zeile je Fenster: `volldampf <ab ISO mit Zone> <bis ISO mit Zone> <Grund>`. Stand 13.11.2026: `volldampf 2026-11-17T01:00+01:00 2026-11-24T01:00+01:00 …` (ab = Wochenreset, bis = nächster Wochenreset als Sicherung). Setzen: `volldampf_setzen <ab> <bis> <Grund>` aus `tests/lauf-hilfen.zsh`; Widerruf: Zeile löschen. Aktiv nur zwischen ab und bis; abgelaufene Zeilen räumt der Nachtlauf an seinem Ende weg („VOLLDAMPF ABGELAUFEN …“ im Protokoll); unlesbare Zeilen gelten als nicht aktiv („VOLLDAMPF UNLESBAR …“ in Protokoll und `uebersprungen.log`).
- **Pause beim Wochenlimit, Weiterlauf nach dem freien Reset** (Maintainer 18.11.2026, Wortlaut in `ENTSCHEIDUNGEN.md`; löst „wenn das wochenlimit erreicht wurde wird Volldampf automatisch deaktiviert“ vom 13.11.2026 als dauerhaftes Ende ab): Vor jeder Runde (Nachtlauf: vor dem Start, vor jeder Fortsetzung und nach jeder Limit-Pause; Tagesroutine: bei jeder Entscheidung; Auslastungswächter: je Takt) prüft `volldampf_wochenlimit_pruefen` die Woche („alle Modelle“ aus `tests/kontingent.sh`). Ab `VOLLDAMPF_WOCHE_ENDE` (98 %, in `tagesroutine.conf` einstellbar) ist Volldampf **pausiert**: Marke `~/halo-nacht/volldampf-beendet.txt` (Name unverändert; `<ab> <bis> <Zeit> <Woche>`), Protokollzeile „Volldampf pausiert: Wochenlimit erreicht (N %, HH:MM)“, einmal `[handeln]` aufs iPhone („freien Reset in Einstellungen > Nutzung drücken, danach läuft Volldampf von selbst weiter bis Dienstag 01:00“). Während der Pause beginnen keine neuen Einträge und Worker (Tagesroutine und Nachtlauf nach Alltagsregeln, Auslastungs- und Zwischen-Release-Wächter warten statt zu enden), laufende machen fertig. **Freier Reset erkennen:** `wochen_reset_erkennen` vergleicht jeden ohnehin gelesenen Wochenwert mit dem letzten gespeicherten (`~/halo-nacht/wochenstand.txt`); fällt er um mindestens 20 Punkte (`VOLLDAMPF_RESET_SPRUNG`), ohne dass der automatische Reset (Di 00:00 UTC) dazwischen lag, schreibt es den Anker `anker <Zeit> <vorher> <nachher>` nach `~/halo-nacht/wochenanker.txt`, protokolliert „Freier Reset erkannt …“ und schickt eine `[info]`-Meldung. Eine Marke vor dem Anker gilt nicht mehr, Volldampf läuft automatisch weiter; erreicht die Woche danach wieder 98 %, pausiert er erneut. Kein zusätzlicher Haiku-Aufruf; nur der pausierte Auslastungswächter liest das Kontingent höchstens stündlich (`PAUSE_KONT_ALTER` 60 Minuten). **Ende** bleibt `bis` der Regelzeile (automatischer Wochenreset Di 24.11. 01:00) oder `aus`/Widerruf des Maintainers. Woche und 5-Stunden-Fenster sind getrennte Werte (`unifiedWindows.seven_day` bzw. `five_hour`); nur `seven_day` pausiert, das 5-Stunden-Limit nie.
- **Sollkurve nach dem freien Reset** (Maintainer 18.11.2026: „… dass der wir kurz vor dem nächsten automatischen weekly limit reset kommenden dienstag kaum noch token übrig haben“): eine Rechenstelle `wochen_soll` (`tests/lauf-hilfen.zsh`, Python-Teil `WOCHE_DEF_PY`) für Tagesroutine (Alltag), Morgenbrief und `volldampf_status` (damit Nachtlauf-Auftrag und Berichte); Auslastungswächter, Leitstand und Tagesroutine im Volldampf nehmen seit 20.11.2026 die Kalenderwoche (`kalender_soll`, unten „Auslastungswächter“). Ohne Anker in dieser Woche wie bisher: Stunden seit Di 00:00 UTC / 168 × 100 %. Mit Anker: Soll = Stunden seit dem Anker / Stunden vom Anker bis zum nächsten automatischen Reset × 100 % („Soll bis nächster Reset“, 100 % am Reset; Beispiel Anker Fr 10:00, jetzt Sa 10:00: 24 / 87 h = 27,6 %). Berichte zeigen „Soll bis nächster Reset N %“ (Alltag); `volldampf_status` nennt seit 20.11.2026 nur noch „freier Reset TT.MM. HH:MM“. Der Anker verfällt mit dem automatischen Reset.
- **Übergang zum Alltag am automatischen Reset** (Maintainer 18.11.2026: „genau und nach dem nächsten automatischen weekly limit reset kommenden dienstag um 01:30 soll wieder der reguläre modus laufen, wo wir aber dennoch automatisch den verbrauch und die intensität permanent an unser token kontingent knüpfen und adjustieren“): um 01:00 endet die Regelzeile (`bis`), der Auslastungswächter beendet sich beim nächsten Takt („ende Volldampf nicht aktiv“), der Zwischen-Release-Wächter beginnt nach 22:30 keinen Push mehr und beendet sich ebenfalls beim nächsten Takt, der Anker zählt nicht mehr (älter als der letzte Reset). Ab dem Nachtlauf 01:30 gilt der Alltagsmodus (`docs/alltagsmodus.md`) mit der 168-h-Sollkurve ab dem automatischen Reset, Sparmodus und Modellwahl nach Kontingent, ohne Lücke: zwischen 01:00 und 01:30 beginnt nichts Neues. Die Volldampf-Zeile räumt der Nachtlauf an seinem Ende weg. Geprüft in `tests/volldampf_test.zsh` („Übergang …“), `tests/auslastung_schleife_test.zsh` und `tests/morgenbrief_test.zsh`.
- **Erinnerung an den Reset** (Vorschlag von neon, vom Maintainer am 13.11.2026 bestätigt, eigener Commit): bei aktivem Volldampf und Woche ab 90 % (`VOLLDAMPF_ERINNERN`) einmal je Fenster eine iPhone-Meldung „Volldampf: Wochenkontingent bei N %, freien Reset in Einstellungen > Nutzung drücken?“ (`volldampf_reset_erinnern`, Zustand `~/halo-nacht/volldampf-erinnert.txt`; sinkt die Woche unter 90 %, ist sie wieder möglich). Entfernen: den Commit zurücknehmen.
- **Gratis-Reset:** Einstellungen > Nutzung (Stand 13.11.2026: ein „Full reset“ bis 10. Dezember, zwei „Fable reset“ bis 9. März; „Each button uses the reset that expires first“). Nur von Hand durch den Maintainer, nie aus Claude Code.
- **Nachtlauf** (`tests/nachtlauf.sh`, Auftrag Schritt 1c): Zeile „Volldampf: …“ im Auftrag; solange aktiv plant der Director mit voller Kapazität (ohne 70–80 %-Vorsicht und ohne Reserve von einem Drittel), die token-intensivsten wertvollen Einträge zuerst (reine Umbauten ohne Nutzernutzen nachrangig); Rahmenregeln, Mail-Schutz, Rückfragen und „Wartet auf OK“ unverändert. Fortsetzungen bis 08:45 (höchstens 50, Grenze 40 nicht gepushte Commits statt 06:30/vier/sechs; `VD_FORTSETZ_MAX`, `VD_MAX_COMMITS`; Maintainer 17.11.2026, Mengen praktisch aufgehoben). Pflichtvermerk: erste Zeile im „Director-Plan“ und Anfang der Zeile „Kurz:“ („Volldampf aktiv bis …“, „Volldampf pausiert: …“; „angemeldet (ab …, bis …), nicht aktiv“ nur im Director-Plan); fehlt er in „Kurz:“, setzt das Skript ihn vor die iPhone-Zeile.
- **Tagesroutine** (`tests/tagesroutine.sh`): Sollkurve und Sparmodus bremsen nicht (Stufe „Volldampf“), Modellwahl wie im Normalbetrieb (Plan und komplexe Einträge `MODELL_STARK`, Routine `MODELL_ROUTINE`), statt `MAX_COMMITS_TAG` gilt `MAX_COMMITS_VOLLDAMPF` (0 = kein Tageslimit, 17.11.2026); das 5-Stunden-Fenster (`FUENF_STUNDEN_MAX`, Warten bis zum Fensterende) bremst wie bisher. Dazu seit 18.11.2026 (Maintainer: „ich folge allen empfehlungen von dir.“) derselbe **Fenster-Takt** wie im Auslastungswächter: neue Einträge nur, solange das 5-Stunden-Fenster nicht über dem verstrichenen Anteil plus `FENSTER_RESERVE` (25 Punkte, `tagesroutine.conf`) liegt, sonst ohne Claude warten, bis der Takt aufholt (höchstens bis zur vollen Stunde); Rechnung `fenster_takt`/`FENSTER_DEF_PY` in `tests/lauf-hilfen.zsh`, ohne bekanntes Fensterende kein Takt. Zustand in „Kurz:“, im Abschnitt Kontingent und im Trockenlauf (`HALO_VOLLDAMPF_DATEI` zum Proben).
- **Beginn der Tagesroutine** (Maintainer 16.11.2026 auf die Frage nach 08:45 statt 09:00: „nur solange volldampf läuft“): der LaunchAgent startet `tagesroutine.sh` täglich um 08:45. Ist Volldampf aktiv (`volldampf_aktiv`), beginnt das Zeitfenster um `START_VOLLDAMPF` (08:45), nahtlos nach dem Nachtlauf, der bis 08:45 Fortsetzungen macht (claude hart bis 09:00); vor der ersten Runde wartet das Skript minütlich auf das Ende des Nachtlaufs (`~/halo-nacht/lauf.lock`, bis 30 Minuten, danach weiter über `belegt_tag`), sodass nie zwei Claude-Läufe zugleich im Repo arbeiten. Ohne Volldampf wartet das Skript ohne Claude bis `START` bzw. `START_WOCHENENDE` (09:00; Feld `WARTE_START`, höchstens 60 Minuten vor dem Beginn), entscheidet dann neu, das Verhalten ab 09:00 ist unverändert. Probe: `HALO_JETZT=…T08:45… HALO_VOLLDAMPF_DATEI=… zsh tests/tagesroutine.sh --trocken`; Prüfungen in `tests/tagesroutine_test.zsh` („Beginn 08:45 nur mit Volldampf“).
- **Fable im Volldampf** (Vorschläge von neon nach „Freier aber auch nicht überbordernd“, nicht vom Maintainer bestätigt): nur für die schwersten Fälle (belegte Ursache fehlt nach Opus bei hohem Nutzen, oder Analyse/Design mit starkem Modell), nie für Routine; höchstens zwei Fable-Agenten je Nacht und einer am Tag, nacheinander; 5-Stunden-Fenster unter 60 % (`FABLE_5H_MAX_VOLLDAMPF`), ohne Soll-Bedingung; Stopp bei „Fable only“ über 80 % (`FABLE_WOCHE_MAX`). Der Fable-Wochenwert ist derzeit nicht lesbar (`kontingent.sh` liefert nur `seven_day` und `five_hour`, `~/halo-nacht/usage.json` der Statuszeile entsteht nicht); die Berichte vermerken „Fable only nicht lesbar, Stopp nur über die Zahl der Agenten“, und die iPhone-Meldungen bei 90 % und beim Beenden bitten, den Fable-Anteil in Einstellungen > Nutzung mit anzusehen. Werte vom Maintainer am 13.11.2026 bestätigt („Ja sie Empfehlungen umsetzen“). **Überholt am 17.11.2026** („im volldampf gibt es keine limits für fable nutzung wenn derer einsatz bei komplexen themen oder problemen hilfreich ist und die produktivität erhöht“): im Skript `FABLE_5H_MAX_VOLLDAMPF` und `FABLE_WOCHE_MAX` 100, keine Zahl je Nacht oder Tag; es bleibt die Beleg-Regel.
- **Ein-/Ausschalter** (Maintainer 17.11.2026: „in zukunft werden wir vielleicht öfters volldampf nutzen. daher müssen wir dieses regelwerk klar absichern um quasi mittels ein- und aus-schalter jederzeit aktivieren und wieder deaktivieren zu können“): `zsh tests/volldampf.sh an [<bis>] [<Grund>]` schreibt die Regelzeile (bis = nächster Wochenreset Di 01:00) und startet Auslastungs- und Zwischen-Release-Wächter; `aus` verschiebt die Zeile nach `~/halo-nacht/volldampf-aus-<Zeit>.txt`, beendet beide Wächter, Worker machen ihre Arbeit fertig; `status` zeigt Regel und Wächter. Alle Volldampf-Werte gelten nur bei aktiver Zeile (Tagesroutine: `LETZTER_BEGINN_VOLLDAMPF`/`ENDE_VOLLDAMPF` in `tagesroutine.conf`, Nachtlauf: `VD_*`, Wächter beenden sich selbst); die Zahl der Worker steht in `~/.config/halo-spaces/auslastung.conf` (`MAX_WORKER`) und gilt nur, solange der Wächter läuft. Schalten nur auf Zuruf des Maintainers. Prüfung: `zsh tests/volldampf_test.zsh`.
- **Maximale Produktivität** (Maintainer 17.11.2026: „volldampf bedeutet maximale produktivität. … das betrifft die anzahl der gleichzeitigen agents, die anzahl der releases, einfach alles.“; dazu: „wir wollen keine defekten releases veröffentlichen … von daher sollten die tests weiterhin laufen wie bisher.“): im Volldampf entfallen nur Mengen- und Tempo-Grenzen – keine feste Obergrenze paralleler Agenten, kein Tageslimit für Commits, Nachtlauf-Grenzen 50/40, mehrere reguläre Releases je Tag. **Zwischen-Release** tagsüber (17.11.2026 „ich habe auch kein problem mit 30 releases untertags während volldampf läuft“): Wächter `tests/zwischen-schleife.zsh`, von Hand im Hintergrund gestartet, alle 5 Minuten, Push-Beginn 09:00 bis 22:30 (Maintainer 17.11.2026, ENTSCHEIDUNGEN.md „Abendgrenze“; danach wartet er bis 09:00 statt zu enden, das Release selbst darf bis 24:00 fertig werden); neuester grüner Prüfzweig-Stand mit mindestens 3 Thunderbird-Commits über `origin/main` wird im eigenen Worktree `~/halo-zwischen-release` (Checkout `~/halo-spaces` unberührt) mit nächster Minor-Version veröffentlicht: kurze Claude-Runde (README, Notizen), `tests/zwischen-release.zsh` (Push, Push-Lauf und Windows-Lauf grün), `release-unter-tage.sh --volldampf` mit `NUR_CI=1`; rot: derselbe Stand erst nach einem neuen grünen Stand. **Vorrang** (neon-Auftrag #48, 19.11.2026): ist ein Stand fällig und neon belegt, schreibt der Wächter `~/halo-nacht/zwischen-faellig.txt` (je Takt und während des Release-Laufs erneuert); solange sie frisch ist, startet der Auslastungswächter keine Worker und der Zeitfenster-Hook weist neue Testläufe ab, laufende machen fertig; nach 120 Minuten für denselben Stand gibt der Wächter den Vorrang auf (Meldung an neon); ein Abbruch von `zwischen-release.zsh` wegen „belegt“ zählt nicht als Fehlversuch. Pause: `pause_setzen zwischen-release …`. Die Tagesroutine zeigt nur, ob der Wächter läuft. Unverändert: grüne Tests samt Windows und Testmarke, Push-Sperre 01:30–09:00, ab 00:00 kein Push, ein Release je Nachtlauf, Notfall/Hotfix, Hooks. Einzelheiten `docs/release.md` „Volldampf“.
- **Auslastungswächter** (Maintainer 17.11.2026: „Volldampf sollte automatisch sein und permanent auf maximale Produktivität überprüfen.“, „Das gilt für taglauf und nachtlauf solange Volldampf aktiv ist“; Wortlaute in `ENTSCHEIDUNGEN.md`): `tests/auslastung-schleife.zsh`, von Hand gestartet (`nohup zsh ~/halo-spaces/tests/auslastung-schleife.zsh >/dev/null 2>&1 &!`, kein LaunchAgent), Takt 10 Minuten, Tag und Nacht, nur solange `volldampf_aktiv`. Je Takt: Arbeits-Sitzungen zählen (alle `claude -p --model … --session-id|--resume` außer Haiku: Worker, Tagesroutine, Nachtlauf, Zwischen-Release; nicht die Remote-Control-Sitzungen); Grenze `MAX_WORKER` (4, höchstens 8), nachts dieselbe Grenze (Maintainer 17.11.2026, Commit 9d2b9f0; nachts startet er nur unter dem Soll); erst unter der Grenze das Kontingent (`kontingent.json` bis 15 Minuten alt, sonst `tests/kontingent.sh`). Soll = vergangene Zeit der Kalenderwoche (`kalender_soll`: 100 − (resetsAt − jetzt) / 6048 s, resetsAt aus `kontingent.json`, sonst Di 00:00 UTC), auch nach einem freien Reset (Maintainer 20.11.2026, `ENTSCHEIDUNGEN.md` „Kontingent-Drossel nach der Kalenderwoche“; bis dahin 48-h-Kurve bzw. „Soll bis nächster Reset“). Volldampf pausiert (Wochenlimit, Status nicht „allowed“): warten statt enden, Kontingent höchstens stündlich, nach dem erkannten freien Reset von selbst weiter. Start eines Workers tags bei Woche unter Soll oder 5-Stunden-Fenster unter 60 %, nachts nur unter Soll; kein Start ab 90 % im 5-Stunden-Fenster, höchstens einer je Takt (Abstand 10 Minuten); Fenster-Takt wie oben (Tagesroutine). **Aufgabenzuteilung nach Aufwand** (Maintainer 18.11.2026: „ich folge allen empfehlungen von dir.“): ab 70 % im 5-Stunden-Fenster (`FENSTER_DROSSEL`) nur noch Worker der Klasse „tokenarm“ (`MODELL_TOKENARM` sonnet, kein Fable, höchstens `TOKENARM_MAX` 1 gleichzeitig, Klasse als Feld 8 in `~/halo-nacht/auslastung/worker-<Nr>`), Auftrag „Klasse tokenarm“: Prüfung wiederholen oder kleine Routine in einer Datei, nie Fehlersuche, Analyse, Reihen oder Features (löst „höchstens eine Arbeits-Sitzung ab 70 %“ ab). **Windows-Rundgang bei knappem Fenster** (Maintainer 18.11.2026: „wäre auch ein perfekter task für die Situation wenn wir bereits knapp am 5h-Limit sind“, „ich folge allen empfehlungen von dir.“): ab `RUNDGANG_5H` (85 %) und unter `RUNDGANG_5H_BIS` (98 %) im 5-Stunden-Fenster, `RUNDGANG_VON`–`RUNDGANG_BIS` (09:00–22:00), ohne Nachtlauf und ohne `belegt()` (CI, Testlauf, VM, Release; andere Sitzungen zählen nicht) startet der Wächter vor Stopp, Takt und Drossel einmal je Tag eine Sonnet-Sitzung; seit 19.11.2026 (Maintainer: „Der start sollte nicht nur das 5h-limit sondern auch das wochenlimit und aktuelle wochenkontingent berücksichtigen“) auch bei Fenster unter 85 %, wenn die Kontingent-Drossel greift (`drossel_stufe` ab 1; Schalter `RUNDGANG_BEI_DROSSEL`, Standard 1), nie bei Wochenlimit (Status nicht „allowed…“ oder Woche ab `VOLLDAMPF_WOCHE_ENDE`), Vorrang-Marke des Zwischen-Release oder belegtem neon; die Lage-Zeile nennt den Anlass („5 h: …“ bzw. „Drossel Stufe n: …“). Die Sitzung (`MODELL_RUNDGANG`, höchstens `RUNDGANG_MAX_MIN` 120 Minuten) mit dem Bildauftrag `RUNDGANG_NR` (35) wörtlich aus `~/halo-aufgaben/neon-stand.md` und dem Rahmen `tests/auslastung-rundgang.md` (Voraussetzungen prüfen, nichts committen, `bilder.lock`, Ergebnis `erledigt|teilweise|zurück`); Marken `~/halo-nacht/auslastung/rundgang-<Nr>-<Datum>` und `…-erledigt` (danach nie wieder); das Ergebnis trägt der Wächter als Stand in `neon-stand.md` ein, neon meldet dem Designer. Ist der Auftrag dort nicht mehr offen oder `RUNDGANG_NR=0`, startet nichts. Modell opus, fable erst ab `FABLE_ABSTAND` (20) Punkten unter dem Soll der Kalenderwoche, 5-Stunden-Fenster unter 50 % und ohne anderen Fable-Lauf. Ende bei Status nicht „allowed…“, Woche ab `VOLLDAMPF_WOCHE_ENDE` (Marker wie sonst) oder Volldampf-Ende. **Vorprüfung ohne Sprachmodell** (Maintainer 19.11.2026, „1. ja“ auf neons Vorschlag, Worker nur noch zu starten, wenn ein passender Eintrag in der Liste steht, und leere Läufe sofort zu beenden; Anlass `~/halo-berichte/2026-11-19-pruefzweige.md`: 100 von 178 Starts am 17./18.11. endeten mit „nichts_passend“): erst wenn alle Schwellen einen Start erlauben, lädt der Wächter die Aufgabenliste (`tests/board.sh export`, höchstens alle `BOARD_ALTER` 15 Minuten, Zwischenspeicher `~/halo-nacht/auslastung/board.json`) und sucht mit den maschinell lesbaren Kriterien des Worker-Auftrags einen möglichen Eintrag: Status Todo, letzte Sperr-Notiz nicht „In Arbeit:“, kein Titel „Design:“/„(Design-Eintrag)“/„Ablauf:“/„Release:“/„Store:“, kein Feature mit „GitHub #n“, nicht in einem Plan von heute (Nachtlauf, Tagesroutine); dazu freie Bug-Jagd-Fälle (nicht für Klasse tokenarm). Was nur ein Sprachmodell entscheiden kann (Optik ohne Kennzeichen, Entscheidung nötig), übernimmt er aus dem Befund der Worker: endet einer mit „nichts_passend“, startet bei unveränderten Kandidaten (Fingerabdruck, `leer-<Klasse>`) keiner mehr, höchstens `LEER_GUELTIG` 720 Minuten lang. Ohne Treffer: kein Worker, Protokollzeile „kein passender Eintrag (…)“ mit Zeit, nächste Prüfung nach `LEER_WARTEN` (15) Minuten; Liste nicht lesbar: warten. Schwellen in `~/.config/halo-spaces/auslastung.conf` (Zeilen `SCHLÜSSEL=Wert`: `MAX_WORKER`, `BOARD_ALTER`, `LEER_WARTEN`, `LEER_GUELTIG`, `SOLL_STUNDEN`, `FENSTER_MIN`, `FENSTER_STOPP`, `MODELL`, `FABLE_ABSTAND`, `FABLE_5H`, `FENSTER_DROSSEL`, `FENSTER_RESERVE`, `MODELL_TOKENARM`, `TOKENARM_MAX`, `RUNDGANG_NR`, `RUNDGANG_5H`, `RUNDGANG_5H_BIS`, `RUNDGANG_VON`, `RUNDGANG_BIS`, `MODELL_RUNDGANG`, `RUNDGANG_MAX_MIN`, `NACHT_BIS`, `START_ABSTAND`, `KONT_ALTER`, `WORKER_MAX_MIN`, `TAKT`), jede Prüfung neu gelesen. Pause: `pause_setzen auslastung …`. Log `~/halo-nacht/<datum>-auslastung.log` (mit Sitzungs-IDs, damit `belegt()` die Worker übergeht), Zustand `~/halo-nacht/auslastung/`. **Worker:** eigener Worktree `~/halo-worker/worker-<JJJJMMTT-HHMM>-<Nr>` ohne Zweig auf `origin/main`; den Zweig `pruef/worker-…` legt der Worker erst unmittelbar vor dem ersten Commit an (`git switch -c`), ohne Commit entfernt der Wächter Worktree und leeren Zweig gleich nach dem Lauf (Commits ohne Zweig bekommen ihn nachträglich; Maintainer 19.11.2026); Datum in Ergebnis-, Ausgabe- und Berichtsnamen je Start, `claude -p --permission-mode auto` wie die Tagesroutine, aber ohne `HALO_LAUF` (Zeitfenster-Hook gilt), Auftrag `tests/auslastung-auftrag.md` (ein Eintrag ohne Optik, Board-Notiz „In Arbeit: worker-<Nr>“ als Sperre, nicht in Plänen von Nachtlauf/Tagesroutine, Bug-Jagd-Verdachtsfälle über `~/halo-nacht/auslastung-vergeben.txt`, Push nur auf den eigenen Prüfzweig 09:00–23:59, nachts nur committen; diese Zweige pusht der Wächter einmal je Tag ab 09:00 nach (`zweige_nachpushen`: lokale `pruef/worker-*` mit Commits vor `origin/main`, deren Stand nicht schon auf origin liegt und deren letzter Commit höchstens `NACHPUSH_STUNDEN` (24) Stunden alt ist, höchstens `NACHPUSH_MAX` (3) je Tag, neueste zuerst, ohne Force, nie `main`; der Rest nur im Protokoll („zu alt“, „über der Grenze“); Marke `nachpush-<Datum>` vor dem ersten Push; neon 19.11.2026, die Push-Sperre bleibt unverändert), Gedächtnis `~/halo-nacht/worker-gedaechtnis.md`, Bericht `~/halo-berichte/<datum>-worker-<Nr>.md`), Ports 2874–2889 (zwei je Nummer), Testläufe nur über `tests/auslastung-test.zsh` (Sperre `~/halo-nacht/bilder.lock`, wartet auf `belegt()`), nach 4 Stunden beendet. Nachtlauf- und Tagesauftrag übergehen Einträge mit Worker-Notiz. Der Wächter ändert nie Regeln, Rechte oder Hooks, pusht nur beim Nachpush der Worker-Zweige und veröffentlicht nie. Grüne Worker-Zweige übernimmt nach main, wer pusht (neon bzw. Nachtlauf); der Wächter nicht. Probe: `zsh tests/auslastung-schleife.zsh --trocken` (Testwerte `HALO_JETZT`, `HALO_AS_*`, siehe Kopf).
- **Kontingent-Drossel** (Maintainer 19.11.2026: „ja umbauen und so rasch wie möglich live schalten“; seit 20.11.2026 nach der Kalenderwoche, Maintainer: „aber es geht mir ja immer darum wieviel % token wir noch im vergleich zur verbleibenden restzeit bis zum reset kommenden dienstag um 01:00 haben.“, „ja, stell die ampel so um. wäre es nicht alarmierender, wenn wir mehr % token als % woche verbraucht haben?“, `ENTSCHEIDUNGEN.md` „Kontingent-Drossel nach der Kalenderwoche“): Drossel nach oben für Auslastungswächter und Tagesroutine, nur im Volldampf. `drossel_stufe` in `tests/lauf-hilfen.zsh` (eine Stelle für beide) rechnet ohne Claude und ohne Verlauf d = Verbrauch der Woche (`seven_day`, %, ungerundet aus `kontingent.json`, wenn zum übergebenen Wert passend) minus vergangene Wochenzeit (%, `kalender_woche`: 100 − (resetsAt − jetzt) / 6048 s, resetsAt aus `kontingent.json`, ohne lesbares resetsAt Di 00:00 UTC; Sommerzeit egal). Stufen (Grenzen `DROSSEL_STUFE1/2/3` 0/5/15 Punkte, Deutung von neon): **0** d ≤ 0, wie bisher; **1** (0 < d ≤ 5) keine neuen Worker (auch nicht bei Fenster unter 60 %), Tagesroutine nur kein Fable (Plan und komplexe Einträge bleiben `MODELL_STARK`, Routine ist im Volldampf ohnehin `MODELL_ROUTINE`); **2** (5 < d ≤ 15) zusätzlich Tagesroutine nur jede zweite Runde: nach einer echten Claude-Runde (Merker in `runde()`) wartet die nächste ohne Claude so lange wie die letzte Claude-Runde, 10 bis 60 Minuten; **3** (d > 15) Tagesroutine nichts Neues bis zur vollen Stunde (derselbe Warteweg wie „deutlich über dem Soll“), danach neu entscheiden. Ab `DROSSEL_ROT` (90) % verbraucht gilt Stufe 3 nur, wenn zugleich d > 0 (sonst stünde die Tagesroutine gegen Wochenende bis zu ~17 h still; „≥ 90 %“ ist sonst nur das Rot des Dashboards); `VOLLDAMPF_WOCHE_ENDE` (98 %) und die 5-Stunden-Bremsen gelten unverändert. Steigen sofort, zurück erst `DROSSEL_HYSTERESE` (1) Punkt unter der Einschaltgrenze der Stufe (Stufe 1 also erst bei d ≤ −1). Fail-open (keine Drossel): `kontingent.json` fehlt oder unlesbar, ihr `stand` älter als `DROSSEL_STAND_STUNDEN` (3), jetzt nach resetsAt oder `stand` vor dem Wochenbeginn (resetsAt − 7 Tage; ein alter Wert gegen Wochenzeit ~0 nach dem Reset ergäbe sonst fälschlich Stufe 3). Gilt auch nach einem freien Reset: nur die Kalenderwoche zählt (Anker, Tempo und Fehlstunden entfallen). Zustand `~/halo-nacht/drossel-stufe.txt` (Zeile 1 „<Stufe> <d in Punkten> <ISO> <seit> [offen]“, Zeile 2 Wirkung, Zeile 3 Grund; gilt nur ab dem Wochenbeginn; bei Fail-open nur Zeit erneuert und Marke „offen“, die Stufe bleibt als Gedächtnis der Hysterese; der Wächter erneuert sie in jedem Takt, auch wenn er vorher zurückkehrt), Leitstand-Feld `drossel` und Stufe je Verlaufspunkt. Schwellen `DROSSEL_*` in `auslastung.conf`, danach `tagesroutine.conf` (gilt für beide), `DROSSEL_AUS=1` schaltet ab. Sichtbar: Wächter-Protokoll („warten Drossel Stufe n …“ bzw. „; Drossel Stufe 0 …“ in der Lage), Kontingent-Zeile der Tagesroutine („Drossel Stufe n …“), Trockenläufe. Nie gebremst: Nachtlauf, Zwischen-Release-Wächter, Tests und Testmarke, Reparatur roter CI (Nebenzweig-Regel) und des roten Prüfzweigs der Tagesroutine, Release unter Tage in der ersten Plan-Runde, Windows-Rundgang (vor der Drossel geprüft); laufende Arbeit wird nie abgebrochen. Prüfen: `zsh tests/drossel_test.zsh`, Abschnitte „Drossel“ in `tests/auslastung_schleife_test.zsh` und `tests/tagesroutine_test.zsh`. Bis 20.11.2026 rechnete die Drossel hoch, wann die Woche 98 % erreicht (Tempo der letzten 6 h, Fehlstunden bis zum Reset, Grenzen 0/12/30, Hysterese 6 h).
- **Rotes Release, Zähler** (Maintainer 18.11.2026, `docs/release.md` „Rote Änderung auf einen Nebenzweig“): Zwischen-Release-Wächter (echtes Rot nach der einen Wiederholung, je rote Prüfung) und `tests/release-unter-tage.sh` (Push-Lauf auch im 2. Versuch rot, Schlüssel „Stand <Hash>“) tragen in `~/halo-nacht/rot-zaehler.txt` ein (`rot_eintragen`, `tests/lauf-hilfen.zsh`; Tab-getrennt Zeit, Schlüssel, Zweig, Stufe, Stand; 14 Tage) und nennen in der Meldung an neon die Modellstufe (1 Opus, 2 und 3 Fable, ab 4 Maintainer); Verursacher nimmt nur `tests/rot-nebenzweig.sh` heraus (jede Rücknahme wegen roter Release-CI, eindeutige Zuordnung oder `--commit` mit belegter Ursache; Nebenzweig `pruef/rot-<Karte>`, Schlüssel Board-Karte bzw. `patch:<patch-id>`, Board-Notiz, Modellstufe), nie ein nacktes `git revert`; `tests/nachtlauf.sh` meldet neue Zweige `pruef/rot-*` an neon und warnt im Bericht vor Reverts der Nacht ohne Zählerzeile. Prüfung: `zsh tests/rot_zaehler_test.zsh`, `zsh tests/rot_nebenzweig_test.zsh`.
- **Prüfen:** `zsh tests/volldampf_test.zsh` (Fenster, Pause beim Wochenlimit, freier Reset und Anker, Sollkurve nach Anker, Übergang am automatischen Reset, 5-Stunden-Limit pausiert nicht, unlesbare Zeilen, Aufräumen), `zsh tests/tagesroutine_test.zsh` (Abschnitt Volldampf), `zsh tests/release_unter_tage_test.zsh` (Volldampf, Zwischen-Release), `zsh tests/zwischen_schleife_test.zsh` (Wächter, Worktree), `zsh tests/auslastung_schleife_test.zsh` (Auslastungswächter: Sollkurve, Schwellen, Tag/Nacht, Pausen, Doppelstart). Nicht unter `tests/logik/`, weil Änderungen dort die CI auslösen.

### Häufung: automatische Gruppen in Nachtlauf und Tagesroutine (14.11.2026)

Maintainer 14.11.2026 (Wortlaute in `ENTSCHEIDUNGEN.md`, „Director: Priorität steigt mit der Zahl verwandter Einträge“): Zusammenhängende Einträge erkennt ein Automatismus, nicht das Augenmaß. `tests/haeufung.py` liest die offenen Einträge über `tests/board.sh export` (nur Lesen) und verbindet zwei Einträge bei gleichem Bereich (Titelpräfix, Synonyme wie Mail-Toolbar/Mailfenster = Mail) und gemeinsamer Stelle der Oberfläche (feste Begriffsliste mit Synonymen und Gewichten, Bereichsname zählt nicht), gestützt durch Verweise (GitHub-Nummer, Board-id, Bild- und Auswahlnamen); gleiche GitHub-Nummer im Titel verbindet auch über Bereiche; Schritte derselben Reihe zählen nicht. Gruppen transitiv, Zuschlag (n − 1) × 0,5 Nutzenstufen, aufgerundet, Nutzen höchstens 5. Ergebnis: `~/halo-nacht/<datum>-haeufung.md` (Gruppen, Grund je Verbindung) und `.tsv`. Der Director ruft es in Schritt 1a auf, die Tagesroutine vor jeder Plan-Runde (Zeile „Häufung (Skript)“ im Auftrag); beide übernehmen die Gruppen verbindlich, Ergänzungen nur gekennzeichnet mit Grund, bei Fehlschlag eigene Gruppierung mit Vermerk. Kopie neben der Tagesroutine in `~/.config/halo-spaces/` (`mac-mini-setup.sh`), sonst aus dem Checkout. Dieselbe Ausgabe hat seit 20.11.2026 den Abschnitt „Alter (Skript)“ (Alters-Zuschlag +0,5 Nutzenstufe je volle 7 Tage seit Anlage, höchstens +1,5, Anlagedatum aus `board.sh export`) und darunter die drei ältesten machbaren Einträge für den „Alters-Platz“ (Board-Eintrag „Ablauf: Alter der Einträge …“; Werte sind Festlegung des Fable-Agenten). Test: `zsh tests/haeufung_test.zsh`.

### Director: Vorrang gehäufter Nutzer-Bugs, Freigabe Lichtschein 2/3 (13.11.2026)

Maintainer 13.11.2026, „Ja sie Empfehlungen umsetzen“ (Wortlaut und Vorschläge in `ENTSCHEIDUNGEN.md`): Ein von mehreren Nutzern unabhängig gemeldeter gleicher Fehler (`[GitHub #n]`-Einträge mit gemeinsamer Ursache, z. B. #59, #61–#64 nach 3.26.0) und ein Fehler, der ein Bedienelement oder die Anzeige für alle Nutzer einer Plattform blockiert, zählen wie „Mail-Grundfunktion gestört“ (Rahmenregel a, Vorrang); der Director fasst sie im Plan zusammen. Eine Einzelmeldung hat hohen Nutzen, aber keinen Vorrang. „Seitenleiste: Lichtschein und gefärbte Trennlinie (Umsetzung 2/3)“ mit dem Schalter darf der Director einplanen (Prüfung schwebend und Animation, Testpaket /vorab im Bericht ankündigen, Größe selbst beurteilen, bei Zweifel Rückfrage).

### Director und Designer (ab 14.11.2026)

Maintainer 14.11.2026, Wortlaut in `ENTSCHEIDUNGEN.md`: „designer ist jetzt freigegeben von mir. verbinde den direktor mit dem designer.“ Vorgaben `docs/design-vorgaben.md`, Auftrag `tests/designer-auftrag.md` (beide aus dem Checkout gelesen, keine Kopie in `~/.config/halo-spaces/`). Beschreibung von neon: Der Director erkennt Todo-Einträge mit Designthema (Aussehen oder Platzierung, Vorgaben F13), prüft sie beim Planen vorab (Soll-Zustand, Apple-Vorlage, Maße, kein Widerspruch zu G1–G15, nicht „Wartet auf OK“; Vorgaben 6a) und vermerkt im Plan „Vorab geprüft: ja, Designer“ bzw. was fehlt. Er beauftragt den Designer selbst (mindestens Opus, Kopf „JETZT“ mit Board-id, Vorab-Prüfung und Pfaden der Ergebnisdateien), liest das Ergebnis (`erledigt <Hash>`, `zurück <Grund>`, `vorschau <id> <Link> <Frage>`), erhebt bei Verstoß gegen G1–G15 Einspruch mit Zitat der Regel, lässt einmal überarbeiten und setzt bei bleibendem Streit „Wartet auf OK“ mit Vorschaubildern beider Lösungen. Zeitbudget, Reserve und Rahmenregeln des Directors gelten unverändert.

- **Nachtlauf** (`tests/nachtlauf-auftrag.md` Schritt 1a g und 2a): Unteragent je Eintrag, nacheinander; Ergebnis `~/halo-nacht/<datum>-designer-<id>.erg/.md`. Nachts keine Sofortnachricht: Designfragen stehen im Bericht unter „Rückfragen an den Maintainer“ und damit im Morgenbrief.
- **Tagesroutine** (`tests/tagesroutine-auftrag.md` Abschnitt „Designer“, `tests/tagesroutine.sh`): Plan-Spalte `design`; die Eintragsrunde läuft mit dem Modell für komplexe Einträge, liegt dieses unter Opus, wird der Eintrag heute übersprungen („Designer braucht mindestens Opus“). Ergebnis `vorschau <id> <Link> <Frage>` (Eintrag auf „Wartet auf OK“ mit Notiz) und `entscheidung …` eines Design-Eintrags schickt das Skript sofort als „[handeln]“-Push aufs iPhone (`push … tagesroutine handeln`) und macht mit dem nächsten Eintrag weiter; übrige Entscheidungsfragen weiter gesammelt am Tagesende. Prüfung: `zsh tests/tagesroutine_test.zsh` (Abschnitt „Designer“).

## Paketzweig paket/lichtschein-kachel (ab 14.11.2026)

Paketzweig paket/lichtschein-kachel (Maintainer 14.11.2026: „ja, kein lichtschein ohne neue kacheln“,
ENTSCHEIDUNGEN.md): Einträge zum Lichtschein und zur aktiven Kachel d2h (Board: „Lichtschein …“, „… aktive
Space-Kachel … F4a (Umsetzung 3/3)“) werden auf dem Zweig paket/lichtschein-kachel in einem eigenen Worktree
umgesetzt und committet, nie auf main. Nach main kommt der Zweig erst, wenn der Maintainer es ausdrücklich
freigibt oder Lichtschein und Kachel d2h fertig und beide Prüfungen grün sind und der Director das im Bericht
begründet; dann Merge (kein Rebase) mit Hinweis im Bericht. Bis dahin kein Release mit Lichtschein; Testpakete
für /vorab werden aus dem Zweig gebaut.

## Aufräumen am Ende des Nachtlaufs (ab 14.11.2026)

`tests/aufraeumen.sh` (Kopie in `~/.config/halo-spaces/`, SK_PAARE in `tests/mac-mini-setup.sh`) entfernt
ohne Nachfrage nur Reste mit Risiko null (Maintainer 14.11.2026, Wortlaut und Kriterien in
`ENTSCHEIDUNGEN.md`, Stufe B in `docs/dauerfreigaben.md`): Arbeitskopien von Hilfsagenten unter
`.claude/worktrees/agent-*` (sauber, alle Commits in `main`, nicht gesperrt, niemand arbeitet darin, älter als
6 Stunden; `git worktree remove` ohne `--force`), seit 19.11.2026 ebenso Arbeitskopien der Worker unter
`~/halo-worker/worker-*` samt Zweig (Commits auch per cherry-pick/rebase in `main`, Patch-Vergleich mit `git cherry`;
`repo.conf` zählt, wenn sie der des Repos gleicht; Maintainer 19.11.2026, „1. ja“ auf neons Vorschlag), tote Sperrdateien `~/halo-nacht/*.lock` (Prozess weg, älter
als 1 Stunde) und in `main` enthaltene Zweige `claude/…`, `rest/…`, `pruef/…` (lokal und auf GitHub, ohne
offenen Pull Request, nicht ausgecheckt; `pruef/worker-…` auch per Patch-Vergleich). Alles andere bleibt und steht als „Rest mit Risiko, nichts
angefasst“ im Bericht; der Morgenbrief nennt die Zahl. Aufruf: Claude in Schritt 6a des Auftrags, danach
`aufraeumen_abschluss` in `tests/nachtlauf.sh` als Rückfall (hängt „## Aufgeräumt“ an, falls er fehlt, sonst
nur eine Nachlese). Von Hand: `zsh tests/aufraeumen.sh --trocken` (nur auflisten), `--ohne-zweige` (ohne
Netz). Prüfung: `zsh tests/aufraeumen_test.zsh` (temporäres Repo, kein Eingriff ins echte). Der Wächter für
Pausen (`tests/pausen_check.sh`) durchsucht `.claude/worktrees` und `dist/` nicht mehr.

## Automatische CI-Wiederholung (`tests/ci-wiederholen.sh`, 18.11.2026 – eingeschaltet über den CI-Wächter)

Anlass (Maintainer 18.11.2026): „das problem mit dem flackern kostet uns extrem viel zeit“. Das Skript (ohne Claude, nur `gh`)
wiederholt die fehlgeschlagenen Jobs eines roten Laufs von `test.yml` **einmal** (`gh run rerun --failed`) und schreibt jede
rote Prüfung mit Plattform und Fehlerzeile bzw. Messwert sowie das Ergebnis nach `~/halo-nacht/flackern.log`
(Tabulator-getrennt: Zeit, Ereignis `rot`/`wiederholt`/`flackert`/`bleibt-rot`/`ausgelassen`, Lauf, Versuch, Zweig, Commit, Job,
Prüfung, Text; Stand `~/halo-nacht/flackern.stand`). Ein zweites Rot bleibt rot, die Prüfungen selbst ändert es nicht.
Grenzen: nur Push und Start von Hand (nie `pull_request`), nur der erste Versuch, höchstens 6 Stunden alt, keine Läufe mit
Auswahl von Prüfungen; mehr als 5 rote Prüfungen in einem Job gelten als echter Fehler (keine Wiederholung); rote Jobs auf neon
(`mac`, `windows`) nur zwischen 09:00 und 00:00 (gemeinsame Startgrenze mit dem Zwischen-Release-Wächter, neon 18.11.2026: eine
Wiederholung auf neon dauert bis 50 Minuten, um 01:30 muss neon frei sein) und nicht während Nachtlauf oder Wochenprüfung; Läufe auf `main` erst, wenn der
CI-Wächter sie ausgewertet hat – sein Eintrag „Tests: CI rot …“ entsteht wie bisher aus dem roten Versuch. Geflackert heißt
nicht repariert: der Eintrag bleibt offen, für `main` steht zusätzlich die Zeile `flackert:` im Wächter-Protokoll (Kennzahl
`ci_flackert`). Die Testmarke bleibt unverändert: `release.sh` verlangt einen vollständig grünen Lauf zum Stand; ein Lauf, der in
der Wiederholung grün wird, zählte schon bisher (Wiederholung von Hand). `--lauf <ID>` wiederholt von Hand mit Protokoll (statt
`gh run rerun`), `--trocken` zeigt nur an. Prüfung: `zsh tests/ci_wiederholen_test.zsh`.
**Eingeschaltet** (18.11.2026, Maintainer: „du entscheidest selbstständig“, Wortlaut in `ENTSCHEIDUNGEN.md`): `tests/ci-waechter.sh`
ruft am Ende jedes Durchgangs (alle 15 Minuten, nach seiner eigenen Auswertung, nicht bei Pause, `--lauf` oder `--datei`)
`ci-wiederholen.sh` aus seinem eigenen Ordner auf, bei `--trocken` ebenfalls nur trocken; ein Fehler darin wird nur ins
Wächter-Protokoll geschrieben. Die Kopie in `~/.config/halo-spaces/` legt `tests/mac-mini-setup.sh` mit an (`SK_PAARE`), fehlt
sie, bleibt die Wiederholung aus. Beim Einschalten wurden die damals schon roten Läufe in `flackern.stand` als `fertig`
eingetragen (keine nachträgliche Wiederholung alter Läufe). Der Nachtlauf bekommt keinen eigenen Schritt: tagsüber übernimmt der
Wächter, nachts lässt das Skript neon-Jobs ohnehin aus (Linux-Jobs aus der Nacht wiederholt es, solange der Lauf höchstens 6
Stunden alt ist).
**Zweites Flackern in 7 Tagen** (neon 18.11.2026: „sofort Hinweis an neon, nicht erst im Wochentakt“): wird eine Prüfung (gleicher
Name, gleich auf welcher Plattform) in der Wiederholung grün und hat sie in `flackern.log` schon eine Zeile `flackert` aus einem
anderen Lauf der letzten 7 Tage, schreibt das Skript die Zeile `zweimal` und meldet einmal je Lauf an die Sitzung neon (`an_neon`
aus `tests/lauf-hilfen.zsh`, ab „[flackern] …“, je Prüfung eine Zeile mit den früheren Läufen); neon legt den Board-Eintrag an.
Nur wenn neon nicht erreichbar ist, einmal `push()` aufs iPhone. Der Zwischen-Release-Wächter wiederholt über dasselbe Skript
(`ci-wiederholen.sh --lauf`, Start und Auswertung), seine Wiederholungen stehen also ebenfalls in `flackern.log`.

## Leitstand-Zubringer (`tests/leitstand-status.zsh`, ab 19.11.2026)

neon-Auftrag #44 (Maintainer 18.11.2026, Takt „Alle 5 Minuten“): LaunchAgent `at.halo-spaces.leitstand` (alle 5 Minuten,
`tests/mac-mini-setup.sh`) schreibt `~/halo-nacht/leitstand/status.json` (Agenten, Nachtlauf/Tagesroutine, Release-Schätzung,
Kontingent, Schalter, Board in Arbeit/als Nächstes/Zahlen, wartende Issues, offene Bilder, 15 neueste CI-Läufe) und legt sie als
jeweils einzigen Commit (force-push) ins **private** Repo `sruf79/halo-status` (Sichtbarkeit wird vor und nach jedem Push geprüft;
nicht privat = kein Push). Kein Claude außer `tests/kontingent.sh`, und das nur, wenn `kontingent.json` älter als 15 Minuten ist;
Board, Issues und Release höchstens alle 15 Minuten (ein jüngerer Zwischenspeicher von `board.sh` zählt mit). Fehlt eine Quelle,
steht das Feld auf `null`. „Als Nächstes“ kommt aus der neuesten Plandatei des Directors (`<datum>-plan.md` bzw.
`<datum>-tagesroutine-plan[-n].tsv`), nur Einträge mit Status Todo. Protokoll `~/halo-nacht/leitstand/leitstand.log`; Probe ohne
Push: `zsh tests/leitstand-status.zsh --ohne-push`; Logik-Prüfung `zsh tests/leitstand_status_test.zsh`.

Verlauf (Wunsch der Dashboard-Sitzung, 19.11.2026): im selben Commit liegt `verlauf.json` mit Punkten
`{"t","woche","fuenf","soll","bugs","features","in_arbeit","ci_wartend","ci_laufend","agenten"}` (je Punkt eine Zeile, keine
Titel, nicht messbar = `null`; `agenten` zählt arbeitende Läufe, Designer und Worker, ohne Wächter, CI-Runner und Sitzungen). Höchstens alle
30 Minuten ein neuer Punkt, nur die letzten 7 Tage (höchstens 336). Die Historie führt neon lokal in
`~/halo-nacht/leitstand-verlauf.json` (nie aus dem Repo gelesen); ist sie defekt, beginnt sie neu. Alle Werte stammen aus den
Feldern von `status.json`, also keine zusätzlichen Abfragen.

Arbeitet oder wartet (Maintainer 19.11.2026 „ja“): Tagesroutine und Nachtlauf zählen nur als arbeitend, solange eine Claude-Runde
läuft (Nachfahre `claude -p …` ihres Prozesses; die Kontingent-Messung `claude -p ok --model haiku` zählt nicht). Jeder Eintrag in
`agenten` hat `zustand` und `grund`: `arbeitet` (Läufe mit Runde, Designer, Worker), `wartet` (Lauf ohne Runde; `grund` kurz aus
der letzten Protokollzeile, z. B. „Drossel Stufe 3, wartet bis zur vollen Stunde (15:00)“, Pause, Fenster; `eintrag` und `modell`
dann `null`) oder `läuft` (Wächter, CI-Runner, Sitzungen). `laeufe.*.aktiv` bleibt „Skript läuft“, neu `laeufe.*.runde` (true/false).
`verlauf.json` `agenten` zählt nur `arbeitet`. Feld `weiter_um` (Maintainer 19.11.2026 „ja, bitte neon um das feld“) in jedem
Eintrag von `agenten` und in `laeufe.*`: frühester Weiterlauf eines wartenden Laufs in UTC, nur aus der Protokollzeile, nach der
er selbst wartet („Pause bis <ISO>“ aus `pausen.txt`, „Limit – Pause 30 Minuten“ = Zeile + 30 Min., Uhrzeit nach „nächster
Versuch“/„warte bis“/„nächste Planung“/„vor dem Beginn“, Wiener Zeit, vor der Zeile = Folgetag); sonst und wenn er nicht wartet `null`.

48 Stunden (Maintainer 19.11.2026: „ob wir mehr einträge erledigen in 48 stunden als hinzugekommen sind“): `board.zahlen.neu_48h`
(Anlagezeit `createdAt`) und `board.zahlen.erledigt_48h` (Zeit der Statusänderung auf Done, bei archivierten Einträgen ohne Done
die Zeit des Archivierens) aus `quellen/board48.json`: sichtbare Einträge über die Projektliste (GraphQL), archivierte über ihre
id aus den `archiv.md`-Zeilen der letzten 3 Tage (`nodes`), weil die Projektliste archivierte nicht liefert; ohne `archiv.md`-Zeile
archivierte Einträge fehlen. `rueckmeldungen.issues_neu_48h`/`issues_geschlossen_48h` aus `quellen/issues48.json` (Issues ohne
Pull Requests, in 3 Tagen geändert, höchstens 200, voll = `null`), `issues_offen` aus `issues.json` (100 = `null`). Beide Abfragen
höchstens alle 15 Minuten; nicht lesbar = `null`; nicht in `verlauf.json`.

Commits (Maintainer 19.11.2026: „bei commits könnten wir vergleichen die letzten 7 tags vs. die 7 tage davor“): Feld `commits` =
`{"letzte_7t","davor_7t","letzte_48h","davor_48h"}`, Commits auf `origin/main` nach Commit-Datum (`git rev-list --count
--since --until`) aus einem eigenen Klon ohne Dateiinhalte `~/halo-nacht/leitstand/git` (fetch höchstens alle 15 Minuten, der
Haupt-Checkout bleibt unberührt), zwischengespeichert in `quellen/commits.json`; fetch gescheitert oder älter als 1 Stunde = `null`.

Release-Schätzung (Maintainer 19.11.2026: „ja, bestell die bessere release-schätzung bei neon“): `release_eta` =
`{"zeit","grund","sicherheit","kandidat","haelt_auf"}`, `sicherheit` „gemessen“ (alle Dauern gemessen), „geschätzt“ (ein Faustwert
dabei) oder „offen“ (`zeit` null). Übliche Dauern = Median der letzten (höchstens 7) grünen Läufe ab 5 Minuten aus `ci.json` (jetzt
40 Läufe, das Feld `ci` zeigt weiter 15) und `ci-main.json` (30): Prüfzweig-Push, main-Push, Windows (von Hand auf main); unter 3
Läufen Faustwert 60/50/30 Minuten; Abschluss (release-unter-tage.sh, release.sh, publish.sh) fest 10 Minuten. Zwischen-Release läuft:
Phase aus den main-Läufen seit seinem Start. Volldampf 09:00–22:30: Hindernisse Pause `zwischen-release`/`alle`, CI auf main rot
(`zeit` null, `haelt_auf`); fälliger Stand mit frischer Marke `zwischen-faellig.txt` = Ende der laufenden main-/Windows-Läufe +
Push-Lauf + Windows + Abschluss (`haelt_auf` aus der letzten „belegt:“-Zeile des Wächters); sonst laufende oder wartende
Prüfzweig-Läufe, deren Stand die Bedingung des Wächters erfüllt (Thunderbird-Commits über origin/main ≥ 3, bei 5-Stunden-Fenster ab
85 % ≥ 1, mischbar, ohne „nicht nach main“, nicht gesperrt, kein Diagnose-/Probezweig; gerechnet wie in `zwischen-schleife.zsh` im
eigenen Klon, je Stand einmal in `quellen/tb-zahlen.tsv`) = Ende des Prüfzweig-Laufs (frühestens nach den laufenden main-Läufen) +
Kette, der früheste zählt; keiner → „kein Kandidat unterwegs“. 01:30–09:00 im Volldampf: Push-Sperre. Sonst Nachtlauf: 01:30 +
Median der Veröffentlichungen der letzten Nächte (Versions-Tags zwischen 01:30 und 09:00, `quellen/releases.txt`), unter 3 Nächten
3 Stunden; Pause `nachtlauf` hält auf. Rot-Zähler und Drossel halten ein Zwischen-Release nicht auf und zählen nicht.

Zuletzt erledigt (Maintainer 19.11.2026: „nicht nur die aktuellen und geplanten tasks sondern auch die letzten paar tasks welche
erledigt sind“): Feld `zuletzt` = höchstens 8 Ereignisse der letzten 24 Stunden, neueste zuerst, je
`{"zeit","art","was","ergebnis","einzel"}`; Arten `eintrag` (Done bzw. archiviert laut `board48.json`, Titel aus `board.json` bzw.
`archiv.md`, Hash aus `archiv.md`), `runde` (Tagesroutine: „Runde beendet“ mit Ergebnisdatei `.erg` und Eintrag aus
`-tagesroutine-erledigt.txt`; Nachtlauf: „Runde n beendet“), `lauf` (Nachtlauf „Arbeit beendet …“/„Ende“, Tagesroutine „Kontingent
Ende“), `worker` („Worker … beendet“ im Protokoll des Auslastungswächters), `release` (Versions-Tags aus `releases.txt`). Keine
CI-Läufe, keine neue Abfrage; fehlt eine Quelle, fehlt nur diese Art; nichts = `[]`.

Titel (Maintainer 19.11.2026: „wenn weniger abstand wäre müsste man den text nicht abkürzen“): `ci[].titel`, `zuletzt[].was`,
`board.in_arbeit/naechste[].titel`, `rueckmeldungen.issues_warten[].titel`, `agenten[].eintrag` und `laeufe.*.eintrag` sind die
erste Zeile, bis 200 Zeichen ungekürzt, darüber mit „…“; `schritt` und `notiz` bleiben bei 160. GitHub kürzt `displayTitle` bei etwa 70
Zeichen, daher kommt der CI-Titel aus dem Commit-Betreff im eigenen Klon (`quellen/betreffe.tsv`), sonst aus `displayTitle`.

Kontingent-Drossel (19.11.2026, `drossel_stufe` in `tests/lauf-hilfen.zsh`; Maintainer: „bitte neon, die drossel-stufe in
status.json mitzuliefern“): Feld `drossel` = `{"stufe","text","grund","seit","max_worker"}` (Stufe 0–3, 0 = keine Drossel; Wirkung,
Grund, Beginn der Stufe in UTC; `max_worker` 0 ab Stufe 1, sonst `null`), gelesen aus `~/halo-nacht/drossel-stufe.txt`, nach der
Wächter und Tagesroutine handeln (nicht neu gerechnet; Zeile 1 „<Stufe> <d in Punkten> <ISO> <seit> [offen]“, Zeile 2 Wirkung,
Zeile 3 Grund; „offen“ = zuletzt Fail-open, dann Stufe 0); älter als 2 Stunden oder unlesbar = `null`. Jeder neue Punkt in `verlauf.json` trägt `drossel` = Stufe (`null` wenn
unlesbar); ältere Punkte ohne das Feld bleiben gültig.

Agenten (Nachbesserung 19.11.2026): je Lauf und Wächter genau ein Eintrag – zählt nur der Prozess aus der Sperrdatei
(`lauf.lock`, `tagesroutine.lock`, `auslastung-schleife.lock`, `zwischen-schleife.lock`), sonst jeder passende ohne
Zeitgeber-Muster (die 4-Stunden-Zeitgeber `sleep 14400` der Worker heißen wie die Schleife). Worker einzeln als `worker` mit
Zweig im Namen, eine Designer-Runde als eigener Agent. Feld `eintrag` (Maintainer 18.11.2026: „Anzahl gleichzeitiger agents
sieht man nicht und auch nicht woran diese arbeiten“): Titel aus dem Kopf der Tagesroutine-Runde (ps kodiert ihn nach vis(3),
der Zubringer dekodiert), sonst aus `~/halo-nacht/in-arbeit.tsv`: `tests/board.sh status <id> arbeit` (auch `in_progress`)
schreibt dort Zeit, id, Titel, PID-Kette des Aufrufers, Zweig und Ordner; jeder andere Status, `archiv` und eine Notiz
„wartet auf Push“ räumen die Zeile; zugeordnet wird über die PID-Kette (Lauf bzw. Worker-PID), beim Worker ersatzweise
über Zweig oder Arbeitskopie; Zeilen älter als 24 Stunden zählen nicht. Schritt-Texte ohne Sitzungs-IDs. `ci_main` kommt
aus einer eigenen Abfrage der fünf neuesten main-Läufe (abgebrochene zählen nicht), nicht nur aus den 15 neuesten Läufen.

GitHub-Limit (Wunsch der Dashboard-Sitzung, 19.11.2026): je Lauf einmal `gh api rate_limit` (zählt selbst nicht gegen das
Limit), Feld `github_limit` = `{"rest":{"limit","verbraucht","rest","reset"},"graphql":{…}}` aus `resources.core` bzw.
`resources.graphql` (`verbraucht` = Limit − verbleibend, `rest` = verbleibend, `reset` ISO UTC); nicht lesbar = `null` (kein
alter Wert). Jeder neue Punkt in `verlauf.json` trägt zusätzlich `gh_rest` und `gh_graphql` (verbraucht in Prozent, eine
Dezimale, sonst `null`); ältere Punkte ohne die beiden Felder bleiben gültig.

- **Wächter nach einem Neustart** (Maintainer 20.11.2026: „Ich brauche einen automatismus für die beiden wächter damit diese automatisch nach einem reboot gestartet werden“): LaunchAgent `at.halo-spaces.volldampf-waechter` (`~/Library/LaunchAgents/`, `AbandonProcessGroup`, beim Anmelden und alle 10 Minuten) ruft `zsh tests/volldampf.sh sicher` auf: ist die Volldampf-Regelzeile aktiv, werden fehlende Auslastungs- und Zwischen-Release-Wächter gestartet (Protokoll `~/Library/Logs/halo-volldampf-waechter.log`), sonst geschieht nichts. Nach einem Mac-Neustart also nichts von Hand tun.
