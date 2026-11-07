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
- Jeder Push auf `main` belegt neon mit den Jobs `mac` und `windows` rund
  35 Minuten, mit Dunkelmodus rund 55 (laut den letzten grünen Läufen: `mac`
  hell ~17, hell und dunkel ~35, `windows` ~19). Beide starten erst nach
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
  ohne Rückfrage alles Offene mit: diese Commits und auch ungespeicherte
  Änderungen, an denen gerade keine Sitzung arbeitet
  (prüfen, committen; Rotes oder Halbfertiges auf einen Zweig `rest/<datum>`),
  gleicht mit GitHub ab und arbeitet erst dann die Aufgabenliste ab.
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
  grüner CI und Release arbeitet er weiter Einträge ab, kein neuer ab 06:30;
  bis 07:30 Fertiges pusht er und wartet die CI ab (grün: Done, kein zweites
  Release; rot: `git revert`), Späteres nimmt der nächste Nachtlauf mit
  (Entscheidung des Maintainers vom 5.11.2026). Bericht in
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
  Nachtlauf und Wochenprüfung, Haiku für `push()`.
- **Bilder-Eingang:** alle 15 Minuten sortiert `tests/bilder-eingang.zsh` (ohne Claude, nur
  `cp`/`mv`, `shasum`, `sips`) Bilder aus `~/halo-aufgaben/eingang/` nach `bilder/` bzw.
  `apple/` ein und legt Indexzeilen an; Claude (Sonnet, `--effort low`) startet nur für
  „unbeschrieben“-Zeilen. Belegt neon nicht; Einzelheiten `tests/MAC-MINI.md` Abschnitt 18.
- **CI-Wächter:** alle 15 Minuten trägt `tests/ci-waechter.sh` (nur `gh`,
  kein Claude) für rote CI-Läufe auf `main` je gescheiterter Prüfung einen
  Bug ins Board ein (`Tests: CI rot – <Job>: <Prüfung>`, offenen Eintrag zur
  selben Prüfung ergänzt er) und meldet es aufs iPhone; Läufe während Nachtlauf
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
  letzten 7 Tage aus (CI, Nachtläufe, Berichte, Board; Kennzahlen in
  `~/halo-aufgaben/wochen-kennzahlen.json`; auch, ob der Nachtlauf früher als
  möglich – vor 04:30 bzw. nach grüner CI vor 06:30 – aufhört, obwohl noch
  machbare Einträge lagen), behebt kleine Dinge an Prüfungen
  selbst und **verbessert die Abläufe selbst** (Entscheidung des Maintainers
  vom 5.11.2026): Änderungen an Nachtlauf, CI-Wächter, Aufträgen, Workflow
  und Release-Skripten, wenn die Zahlen sie klar begründen, höchstens drei je
  Woche, jede mit Kennzahl und Ziel in `~/halo-aufgaben/ablauf-aenderungen.json`;
  wirkt eine Änderung in der Woche darauf nicht, nimmt sie sie mit `git revert`
  zurück. Was einer Entscheidung des Maintainers widerspricht, Zeitpläne,
  LaunchAgents, neue Routinen und Kostensteigerungen bleiben Vorschläge
  („Wartet auf OK“); Release-Sperre, `if:`-Bedingungen der Mac-Jobs und
  Freigaberegeln nie. Bericht
  `~/halo-berichte/<datum>-wochenpruefung.md`. `tests/MAC-MINI.md` Abschnitt 15.
- **Doku-Prüfung:** samstags 08:00 (wartet ebenso bis 09:15 auf den
  Nachtlauf) prüft `tests/wochenpruefung.sh --doku` alle `.md`-Dateien auf
  Widersprüche, Veraltetes, Doppeltes, Unklares und Abweichungen vom Code
  (Kennzahlen in `~/halo-aufgaben/doku-kennzahlen.json`), korrigiert
  eindeutige Fakten selbst und legt echte Widersprüche und Regeländerungen
  nur als „Doku: …“ mit „Wartet auf OK“ an. Bericht
  `~/halo-berichte/<datum>-dokupruefung.md`. `tests/MAC-MINI.md` Abschnitt 16.
- **Design-Rundgang** (Entscheidung des Maintainers vom 5.11.2026):
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
  - CI: Job `windows` in `test.yml` läuft nach `mac` (gleiche Bedingung, gleicher
    Runner und Wächter; ohne `concurrency`-Gruppe, damit GitHub keinen
    wartenden Lauf abbricht – der eine Runner arbeitet die Jobs der Reihe
    nach ab), vorerst nur hell, Port 2845,
    Screenshots als Artefakt `test-windows`.
  - Zum Vergleich läuft daneben Job `windows-github` auf einem Windows-Rechner
    von GitHub (gleichzeitig mit `mac`, belegt neon nicht, noch
    `continue-on-error`): Prüfungen am Bildtakt zählen dort nur als Warnung
    (`HALO_FRAMES_WARN=1`). Nach zwei bis drei gleich zuverlässigen Läufen
    ersetzt er den Job `windows` (Entscheidung des Maintainers vom 4.11.2026).
- Zwischendurch nur betroffene Prüfungen: `python3 tests/halo_test.py --port 2851
  --only "<Teil des Prüfungsnamens>"` (1–2 Minuten). Neue Prüfungen müssen auch
  unter Linux (CI, xvfb) und mit der Beta grün sein. Regelmäßig testet die
  Beta nur noch die CI unter Linux; auf dem Mac (`tests/beta.sh`) und in der
  VM (`--vm --beta`) läuft sie nur noch von Hand.
