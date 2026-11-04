# AGENTS.md

Hinweise für KI-Agenten (Claude Code, Codex, …), die an halo.spaces arbeiten.
Für Nutzer siehe `README.md`, für den Store `store/README.md`.

## Worum es geht

halo.spaces gibt Thunderbird (153+, also ab der aktuellen ESR) unter macOS einen ruhigen Look im Stil von
Apple Mail, Kalender und Kontakte. Es ist **ein** Paket (`.xpi`): Design (CSS),
eigene Symbole und eine Experiment-Erweiterung für alles, was CSS allein nicht
kann. Ziel ist macOS; Windows/Linux laufen mit, sind aber nicht der Schwerpunkt.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `chrome/userChrome.css` | Design für Mail, Menüs, Dialoge (~6700 Zeilen) |
| `chrome/spaces.css` | Kalender, Aufgaben, Adressbuch, Chat, Einstellungen |
| `chrome/merge_spaces.py` | fügt `spaces.css` als markierten Block in `userChrome.css` ein |
| `extension/manifest.json` | Version, Add-on-ID `mail-cards@sebastian.local`, `update_url` |
| `extension/api/implementation.js` | Experiment-API `mailCards` – die eigentliche Logik (~7500 Zeilen) |
| `extension/api/schema.json` | Schema der Experiment-API |
| `extension/background.js` | ruft nur `browser.mailCards.start()` auf |
| `extension/*.css` | zusätzliche Stilblätter der Erweiterung (`parts.css`, `noscroll.css`, `plaintext.css`, `print.css`, `icon-vars.css`) |
| `extension/icons/` | Apple-artige Ersatzsymbole |
| `extension/about/`, `extension/options/` | Fenster „Hilfe → halo.spaces“ und Einstellungsseite |
| `tests/halo_test.py` | automatischer Test per Marionette in frischem Profil |
| `tests/testserver.py` | lokaler IMAP-/SMTP-Testserver (nur 127.0.0.1, erfundene Daten) für die Prüfungen mit Testkonto |
| `tests/ui_tour.py` | Rundgang: Bilder aller Oberflächen (Design-Durchsicht) |
| `tests/store_shots.py` | Bilder für README und Store aus frischem Testprofil (erfundene englische Mails, Kontakte mit gezeichneten Bildern, Termine) |
| `tests/beta.sh` | gleicher Test mit Thunderbird Beta |
| `tests/mac-mini-setup.sh`, `tests/mac-runner-hook.sh`, `tests/MAC-MINI.md` | Mac mini als Testrechner: Prüfen/Einrichten, Wächter für den GitHub-Runner, Anleitung |
| `tests/nachtlauf.sh`, `tests/nachtlauf-auftrag.md` | nächtlicher Arbeitslauf auf neon (Liste abarbeiten, CI abwarten, veröffentlichen, Bericht aufs iPhone), `tests/MAC-MINI.md` Abschnitt 13 |
| `tests/ci-waechter.sh`, `tests/ci-warten.sh` | rote CI-Läufe ins Board und aufs iPhone (alle 15 Min.); auf den CI-Lauf eines Commits warten, Abschnitt 14 |
| `tests/wochenpruefung.sh`, `tests/wochenpruefung-auftrag.md` | wöchentliche Auswertung der Läufe mit Kennzahlen und Vorschlägen, Abschnitt 15 |
| `tests/lauf-hilfen.zsh` | gemeinsame Hilfen dieser Läufe (Protokoll, Push aufs iPhone, „belegt?“) |
| `tests/win-vm-setup.ps1` | Windows-Seite der Test-VM (Energie, Sperre, Thunderbird, Python), aufgerufen von `mac-mini-setup.sh` |
| `store/` | Texte, Screenshots und Upload-Skript für addons.thunderbird.net (Upload ausgesetzt, siehe `store/README.md`) |
| `updates.json` | Update-Manifest, das Thunderbird von GitHub abfragt |

## Offizielle Thunderbird-Doku

Nicht ins Repo kopieren – bei Bedarf die einzelne Seite abrufen:

- **Index für Agenten:** <https://developer.thunderbird.net/llms.txt>; jede Seite
  dort gibt es als Markdown, wenn man `.md` an die URL hängt.
  `llms-full.txt` enthält alles (~600 KB) – nur im Notfall.
- **API-Referenz (Manifest V2, wie unser Paket):**
  <https://webextension-api.thunderbird.net/en/mv2/> – vor neuer Logik in
  `implementation.js` prüfen, ob es eine normale MailExtension-API gibt.
- **Experiments:** `add-ons/mailextensions/experiments.md`
- **Umstellungshinweise je Version:** `add-ons/updating/…` (z. B.
  `updates-for-thunderbird-140.md`) – vor dem Anheben von `store/max-version` lesen.
- **Schemas:** GitHub `thunderbird/webext-schemas`.

## Erzeugte Dateien – nicht von Hand bearbeiten

- **`extension/theme.css`** wird von `build.sh` aus `chrome/userChrome.css` kopiert (gitignored).
- **Der Bereiche-Block in `chrome/userChrome.css`** (zwischen
  `/* ==== Bereiche: … ==== */` und `/* ==== Ende Bereiche ==== */`) wird bei
  jedem Build aus `chrome/spaces.css` überschrieben. Änderungen an Kalender,
  Aufgaben, Adressbuch, Chat oder Einstellungen gehören in `spaces.css`.
- `dist/`, `*.xpi`, `tests/shots/` sind Build-/Testausgaben.
- `updates.json` und die Version in `manifest.json` setzt `release.sh` – nicht manuell ändern.

## Bauen und testen

```bash
./build.sh                                   # → dist/halo-spaces-<version>.xpi und …-atn.xpi
python3 tests/halo_test.py                   # baut vorher selbst, testet hell
python3 tests/halo_test.py --dark            # dunkel
python3 tests/halo_test.py --xpi dist/….xpi --shots /tmp/shots --keep
```

- Der Test legt ein leeres, temporäres Profil an (keine Konten, keine echten
  Daten), installiert das Paket und prüft per Marionette (Port 2839). Ausgabe:
  eine Zeile `OK`/`FEHLER` je Prüfung, Exitcode 0 nur bei Erfolg.
- Thunderbird muss unter `/Applications/Thunderbird.app` liegen (sonst `--tb` oder
  Umgebungsvariable `HALO_TB`, gilt auch für `release.sh` und `update_test.py`).
- Testfenster, die macOS verdeckt, pausieren Animationen – Animationsprüfungen
  überspringen diesen Fall bewusst.
- CI (`.github/workflows/test.yml`) läuft unter Linux mit xvfb gegen Release,
  Beta und ESR; Linux-spezifische Abweichungen der Toolbar sind dort Warnungen.
  Der ESR-Job (Mindestversion) muss grün sein wie die übrigen.
- Mindestversion (`strict_min_version`) ist die aktuelle ESR (153). Ältere
  Versionen bekommen keine Updates mehr; vor dem Anheben auf eine neue ESR
  einen Volltest mit ihr (`--tb`, Thunderbird ESR aus download.mozilla.org).
- `tests/update_test.py` stellt das Update von der letzten Version nach
  (Einstellungen, Toolbar, Begrüßung, userChrome.css); mit `--github` über das
  veröffentlichte `updates.json`. Vor einem Release laufen lassen.
- Nach UI-Änderungen: passende Prüfung in `run_checks()` ergänzen, besonders
  an Stellen, an denen es schon Rückschritte gab.
- **Warten auf Bedingungen statt auf feste Zeiten** (Entscheidung des
  Maintainers vom 3.11.2026): neue Prüfungen nutzen die Hilfen aus `PRELUDE`
  – `bis(() => …, "was", ms)` für ein Fertig-Zeichen (Element da, Termine
  geladen, Mail dargestellt, Fenster offen; bricht bei Zeitüberschreitung mit
  Meldung ab), `ruhig(ms)` nach einer Bedienung (wartet auf Leerlauf, höchstens
  `ms`), `stabil(fn)` für „Position steht still“. Feste Pausen (`wait`) nur,
  wo bewusst Zeit vergehen soll (Doppelklick-Abstand, „bleibt offen“,
  Animationsbilder) – mit Kommentar. Bei Prüfungen auf Abwesenheit („keine
  Linie“) zuerst auf die fertig aufgebaute Ansicht warten. Am Ende eines Laufs
  stehen Gesamtdauer und die langsamsten Prüfungen.

Zum Ausprobieren im echten Profil: `./install.sh` (Thunderbird vorher beenden).
Das betrifft das echte Profil des Nutzers – nur auf ausdrücklichen Wunsch.

## neon erreichen – gilt für JEDE Sitzung

Jede Sitzung, egal in welcher Umgebung (Cloud, Desktop-App, CLI auf dem
Laptop, iPhone, Cowork, Claude Tag/Slack, geplante Aufgaben, Unteragenten
über ihre Hauptsitzung), kann der dauerhaften Sitzung **`neon`** auf dem
Mac mini Aufträge geben (Entscheidung des Maintainers vom 4.11.2026). Alles,
was den Mac braucht – Testläufe, Screenshots, `gh project …`, Board-Status,
Release –, geht so an neon. Reihenfolge, bis einer klappt:

1. `ListAgents`, dann `SendMessage` an `neon`.
2. `list_sessions` (`mine: true`), Sitzung mit Titel `neon` suchen, dann
   `send_message` mit ihrer ID (Stand 4.11.2026
   `session_01BK9gbfo3oZh8yxoakmG4CD`; nach einem Neustart kann sie sich
   ändern – immer über die Liste prüfen).
3. Lehnt `send_message` mit einem `content_digest` ab
   (`confirm_repository_trust`), diese Freigabe sofort anfragen – die
   Claude-App fragt den Maintainer selbst – und danach erneut senden.
4. Fehlen die Werkzeuge, erst per `ToolSearch` laden (`SendMessage`,
   `ListAgents`, `mcp__claude-code-remote__list_sessions`,
   `…__send_message`, `…__confirm_repository_trust`).
5. Auf dem Laptop zusätzlich SSH über Tailscale (`tests/MAC-MINI.md`).

Nie „neon nicht erreichbar“ melden, ohne alle passenden Wege versucht zu
haben; dann dem Maintainer sagen, welche Wege mit welcher Meldung
gescheitert sind. Ergebnisse von neon abwarten und weitergeben, nie selbst
erfinden. Sitzungen auf neon selbst sind neon – dort direkt arbeiten.

## Testrechner (Mac mini)

Ein Mac mini übernimmt die Tests rund um die Uhr (Anleitung: `tests/MAC-MINI.md`):
eigener Benutzer `neosky.cat` (Administrator) ohne echte Mails mit automatischer Anmeldung, erreichbar
nur über Tailscale (keine Portfreigabe), Claude Code per SSH aus der Desktop-App
und per Remote Control aus Cloud-Sitzungen (Abschnitt „Cloud-Sessions“).

- `tests/mac-mini-setup.sh --check` prüft den Rechner (Ruhezustand, Thunderbird,
  Python, gh, Bildschirm, Rechte, Anmeldung, Tailscale, SSH, Runner, Remote Control, Windows-VM) und ändert
  nichts; ohne `--check` richtet es ein, was ohne Passwort geht, und macht einen
  Probelauf.
- Marionette-Ports: 2839 Standard, 2845 CI-Jobs `mac` und `windows`, ab 2850 für Läufe von Hand
  und parallele Sitzungen (`--port`).
- Job `mac` in `.github/workflows/test.yml` (self-hosted, Label `halo-mac`) läuft
  nur bei Push auf `main` und von Hand – nie bei `pull_request`, weil das Repo
  öffentlich ist. Die `if:`-Bedingung nicht lockern; auf dem Mac weist zusätzlich
  `tests/mac-runner-hook.sh` alles andere ab.
- Jeder Push auf `main` belegt neon mit den Jobs `mac` und `windows` rund 60 Minuten. Solange er
  läuft (Prozess `Runner.Worker`), keine eigenen Testläufe starten – zwei
  Testfenster nehmen sich gegenseitig den Fokus.
- Ausnahme: Ein Push, der nur den Release-Commit enthält (`updates.json` und
  die Versionszeile in `manifest.json`), startet keine Tests – der Job
  `changes` in `test.yml` erkennt das, alle Testjobs werden übersprungen.
  Diese Prüfung nicht lockern; jede andere Änderung testet wie gewohnt.
- **Gesammelt pushen:** je Eintrag committen, aber erst am Ende eines
  zusammenhängenden Arbeitsblocks (Phase) pushen – vorher nur die Prüfungen,
  die die geänderte Stelle betreffen (`--only`, hell; dunkel zusätzlich, wenn
  Farben oder Design betroffen sind), kein Volllauf (Entscheidung des
  Maintainers vom 3.11.2026). Den Volllauf übernimmt die CI (Linux mit Beta,
  `mac` hell und dunkel, `windows`), deren Ergebnis danach prüfen. Früher pushen
  nur, wenn etwas davon abhängt (z. B. Test im echten Profil).
- **Nicht Eiliges nimmt der Nachtlauf mit:** Sitzungen auf neon außerhalb
  des Nachtlaufs committen Fertiges, das nicht sofort auf GitHub muss
  (Abläufe, Skripte, Prüfungen, Doku, kleine Korrekturen), auf `main` in
  `~/halo-spaces` und pushen nicht; der nächste Nachtlauf pusht diese Commits
  zusammen mit seinen eigenen in einer CI-Runde (Entscheidung des Maintainers
  vom 4.11.2026). Sofort pushen nur, wenn etwas davon abhängt (Release, Fix
  für Nutzer, Stand wird anderswo gebraucht). Der Nachtlauf nimmt zu Beginn
  ohne Rückfrage alles Offene mit: diese Commits und auch ungespeicherte
  Änderungen, an denen seit über einer Stunde keine Sitzung mehr arbeitet
  (prüfen, committen; Rotes oder Halbfertiges auf einen Zweig `rest/<datum>`),
  gleicht mit GitHub ab und arbeitet erst dann die Aufgabenliste ab.
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
  sonst kein Release (Entscheidung des Maintainers vom 3.11.2026). Bericht in
  `~/halo-berichte/` mit den CI-Läufen, Kurzfassung aufs iPhone. Er lässt aus,
  wenn schon etwas läuft oder eine andere Claude-Sitzung in der letzten Stunde
  am Repo gearbeitet hat. Pausieren mit `touch ~/halo-nacht/PAUSE`. Details
  `tests/MAC-MINI.md` Abschnitt 13.
- **CI-Wächter:** alle 15 Minuten trägt `tests/ci-waechter.sh` (nur `gh`,
  kein Claude) für rote CI-Läufe auf `main` je gescheiterter Prüfung einen
  Bug ins Board ein (`Tests: CI rot – <Job>: <Prüfung>`, offenen Eintrag zur
  selben Prüfung ergänzt er) und meldet es aufs iPhone; Läufe während Nachtlauf
  oder Wochenprüfung übernehmen diese selbst. `tests/MAC-MINI.md` Abschnitt 14.
- **Wochenprüfung:** sonntags 08:00 (wartet bis 09:15 auf den Nachtlauf) wertet `tests/wochenpruefung.sh` die
  letzten 7 Tage aus (CI, Nachtläufe, Berichte, Board; Kennzahlen in
  `~/halo-aufgaben/wochen-kennzahlen.json`), behebt kleine Dinge an Prüfungen
  selbst und legt Ablaufänderungen nur als „Wartet auf OK“ an. Bericht
  `~/halo-berichte/<datum>-wochenpruefung.md`. `tests/MAC-MINI.md` Abschnitt 15.
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
    Runner und Wächter, `concurrency: halo-mac`), vorerst nur hell, Port 2845,
    Screenshots als Artefakt `test-windows`.
- Zwischendurch nur betroffene Prüfungen: `python3 tests/halo_test.py --port 2851
  --only "<Teil des Prüfungsnamens>"` (1–2 Minuten). Neue Prüfungen müssen auch
  unter Linux (CI, xvfb) und mit der Beta grün sein. Die Beta läuft nur noch
  unter Linux in der CI, nicht mehr auf dem Mac (`tests/beta.sh` bleibt für
  Läufe von Hand).

## Release (selbstständig auf neon)

```bash
./release.sh 3.1.0              # Version, update_url, Tests hell/dunkel, updates.json, Testmarke
./publish.sh 3.1.0 notes.md     # Sperre prüfen, commit, push, GitHub-Release, Hash- und Update-Prüfung, Bericht
```

**Wann:** Nach einem Lauf, der Bugs/Features abgearbeitet hat, oder nach
größeren Änderungen veröffentlicht der Agent selbst, ohne Rückfrage – auch
unbeaufsichtigt nachts (Entscheidung des Maintainers vom 2.11.2026: schlechte
Releases werden mit einem neuen Update nach vorn korrigiert, Thunderbird stuft
nicht zurück). Ablauf: Versionshinweise im `README.md` schreiben (eigener
Commit „README: Versionshinweise x.y.z“), Notizen für den GitHub-Release als
Datei (englisch, gleicher Inhalt), `./release.sh x.y.z`, bei grünen Tests
direkt `./publish.sh x.y.z notes.md`. Version: Patch für Korrekturen, Minor
für neue Funktionen. Kleine Einzelkorrekturen (Abstände, Farben, Tests) nur
committen, kein Release. Veröffentlicht wird **nur auf neon**, nie vom Laptop
oder aus Cloud-Sessions (dort neon beauftragen).

**Einzige Bedingung: grüne Tests.** `release.sh` schreibt nur dann die Marke
`dist/release-<version>.ok` (Version, Hash des Pakets, gelaufene Tests), wenn
hell und dunkel grün waren – oder die CI denselben Stand vollständig
grün getestet hat (Linux mit Beta, `mac`, `windows`; dann werden die Tests
übersprungen, solange seitdem nur `*.md`, `release.sh`, `publish.sh`,
`store/` oder `.github/workflows/` geändert wurden; `FORCE_TESTS=1` testet trotzdem). Bei einem
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

## Konventionen

- **Im Zweifel wie Apple:** Ist bei Design oder Verhalten etwas unklar, die
  entsprechende Apple-App nachahmen (Mail, Kontakte, Kalender) – Aussehen,
  Platzierung, Vorgaben und Bedienung – statt eigene Lösungen zu erfinden.
- **Optionen nur in sehr seltenen Fällen:** halo.spaces ist ein Design, kein
  Baukasten. Eine Einstellung gibt es grundsätzlich nur dort, wo auch die
  Apple-App eine anbietet; Wünsche nach „Thunderbird wie vorher“ (originale
  Menüleiste, Tabs) werden abgelehnt – der Weg dorthin ist das Entfernen
  von halo.spaces (Entscheidung des Maintainers vom 4.11.2026).
- **Sprache:** Code-Kommentare, Commit-Nachrichten und Skriptausgaben auf
  Deutsch; `README.md` und Store-Texte auf Englisch (Store zusätzlich `listing-de.md`).
- **Commit-Nachrichten:** ein Satz, Bereich vorneweg (`Mailkopf: …`,
  `Today-Pane: …`, `Tests: …`), beschreibt sichtbares Verhalten, mehrere
  Änderungen mit `;` getrennt.
- **CSS:** eigene Variablen mit Präfix `--mt-` (Farben, Radien, `--mt-hairline`),
  Werte für Hell und Dunkel; Akzent über `AccentColor` vom System. Keine
  sichtbaren Scrollbalken. Maße und Abstände orientieren sich an Apple Mail.
- **Oberflächentexte:** in `implementation.js` mit englischem Schlüssel; die
  deutsche Übersetzung steht in der Tabelle `DE` am Dateianfang – neue Texte
  dort ergänzen.
- **Einstellungen:** Prefs unter `extensions.mailcards.*` (der alte Name
  „mail-cards“ bleibt aus Kompatibilitätsgründen, auch in der Add-on-ID).
- **Store-Regeln:** kein `innerHTML` mit Markup (stattdessen DOM-API bzw.
  `DOMParser`), keine Emojis/4-Byte-Zeichen in Store-Texten.
- Debug-Ausgaben nur bei `extensions.mailcards.debug = true`.

## Aufgabenliste

Bugs und Wünsche führt der Maintainer in einem privaten GitHub-Project
„halo.spaces Aufgaben“ (Konto `sruf79`, Felder Typ = Feature/Bug und Status).
Lokal direkt über `gh project …` (siehe unten); in Cloud-Sessions immer über
die Sitzung `neon` (Abschnitt „Cloud-Sessions“). Auf dem Testrechner lädt ein lokaler
SessionStart-Hook die offenen Einträge in jede Sitzung.

- Die Liste ist die Vorlage für die Arbeit: zu Beginn offene Einträge
  berücksichtigen und passende Aufgaben nennen.
- **Reihenfolge beim Abarbeiten:** zuerst alle offenen Einträge nach Bereich
  (Titelpräfix) gruppieren und auf Zusammenhänge prüfen – Doppelte
  zusammenlegen; Bugs, die ein Feature ohnehin behebt, an dieses Feature
  hängen (Notiz in beiden Einträgen). Dann **Bereich für Bereich**
  abarbeiten (Entscheidung des Maintainers vom 4.11.2026): innerhalb eines
  Bereichs erst die Bugs, dann die Features, jeweils kleine vor großen (von
  Reihen n/m nur der nächste Schritt); erst danach der nächste Bereich.
  Bereiche mit Bugs kommen vor Bereichen mit nur Features. Ausnahme: Ein
  Feature, das einen Bug mitbehebt, wird zusammen mit ihm erledigt.
  Zusammenhänge und Zusammenlegungen im Gespräch bzw. Bericht nennen.
- Neue Bugs/Wünsche aus dem Gespräch sofort und ohne Rückfrage dort als
  Entwurf anlegen (Typ setzen, Status Todo); Screenshots liegen in
  `~/halo-aufgaben/bilder/` (der Maintainer schickt sie mit `halobild <name>`,
  siehe `tests/MAC-MINI.md` Abschnitt 10, und nennt im Gespräch nur den Namen).
  Ursache klären und Lösungsidee in den Eintrag
  schreiben ist erwünscht – aber nicht gleich umsetzen und auch nicht
  anbieten; umgesetzt wird nur, wenn der Maintainer einen Eintrag zum
  Abarbeiten nennt. Gehört der Punkt zu einem offenen Eintrag, diesen
  ergänzen statt einen neuen anzulegen.
- Bei Arbeitsbeginn Status In Progress; nach dem Commit Status Done mit
  Commit-Hash als Notiz, dann archivieren (gepusht wird gesammelt, siehe
  „Testrechner“). Teilweise Erledigtes bleibt
  In Progress mit Notiz, was fehlt.
- Inhalte der Liste nie öffentlich machen: keine Verweise in Commits,
  README, Store-Texten oder öffentlichen Issues.

- Board: <https://github.com/users/sruf79/projects/1> (Nummer `1`, Besitzer
  `sruf79`). Die Einträge sind Entwürfe im Board (Draft Issues), keine
  Issues im Repo.
- Titel auf Deutsch im Commit-Stil: `Bereich: kurze Beschreibung`
  (z. B. `Kalender: …`, `Mailliste: …`), Details in den Text.
- Lokal: Zugriff über `gh` mit Scope `project` (auf neon per Homebrew, siehe
  `tests/MAC-MINI.md` Abschnitt 3; `mac-mini-setup.sh --check` prüft die Anmeldung).

```bash
gh project item-list 1 --owner sruf79 --limit 200 --format json      # lesen
gh project item-create 1 --owner sruf79 --title "Bereich: …" --body "…" --format json   # neu, liefert die id
gh project item-edit --project-id PVT_kwHODEPpks4BoBQw --id <id> \
  --field-id <Feld> --single-select-option-id <Option>                 # Typ/Status setzen
```

| Feld | Feld-ID | Optionen |
|---|---|---|
| Typ | `PVTSSF_lAHODEPpks4BoBQwzhmjN8Y` | Feature `39bb4253`, Bug `ff678ae2` |
| Status | `PVTSSF_lAHODEPpks4BoBQwzhmjN5E` | Todo `f75ad846`, In Progress `47fc9ee4`, Wartet auf OK `2327eecc`, Done `98236657` |

### Cloud-Sessions

In Cloud-Sessions ist die GraphQL-API gesperrt, `gh project …` geht dort
nicht – auch nicht mit Token. **Alles am Board – lesen, neu anlegen,
ergänzen, Status ändern, archivieren – geht aus Cloud-Sessions immer über
die Sitzung `neon`** (Entscheidung des Maintainers vom 4.11.2026; Weg dorthin:
Abschnitt „neon erreichen“). Dort läuft `gh project …` wie lokal, und neon
prüft vor dem Anlegen, ob ein offener Eintrag ergänzt werden sollte. Im
Auftrag nennen, was anzulegen oder zu ändern ist (Titel, Text, Typ, Status
bzw. Eintrag und neuer Status) und was zurückgemeldet werden soll (z. B. die
id); bis zur Antwort nichts als erledigt melden.

Nur wenn neon auf keinem Weg erreichbar ist: neue Einträge notfalls über den
Workflow anlegen (läuft auf GitHub, Token im Secret `HALO_SPACES_TASKS_TOKEN`)
und das dem Maintainer sagen; Lesen, Ergänzen und Status ändern erledigt dann
der Maintainer im Board.

```bash
gh workflow run add-task.yml -R sruf79/halo-spaces \
  -f title="Bereich: …" -f body="…" -f type=<bug|feature> -f status=Todo
gh run list -R sruf79/halo-spaces -w add-task.yml -L 1   # Lauf erfolgreich?
```

Das Repo ist öffentlich: Der Workflow schreibt Titel und Text bewusst nicht
ins Log – das beim Ändern beibehalten.

**neon aus der Cloud steuern:** Cloud-Sessions erreichen neon nicht per SSH
(kein Tailscale im Container), sondern über die Remote-Control-Sitzung, die
dort als LaunchAgent dauerhaft läuft (`tests/MAC-MINI.md` Abschnitt 12).
`ListAgents` zeigt sie (Name `neon`), `SendMessage` an `neon` übergibt eine
Aufgabe; die Antwort kommt als eigene Nachricht zurück. Alles, was den Mac
braucht – Testläufe (hell/dunkel, Beta, `--vm`), Screenshots, `gh project …`,
Board-Status –, so an neon geben und deren Ergebnis weitergeben, nie
selbst Ergebnisse erfinden. Auftrag vollständig formulieren (Zweig bzw.
Commit, Befehl, Port ab 2850, was zurückgemeldet werden soll); die Regeln
aus „Testrechner“ gelten dort unverändert. Erreichbarkeit und Ablauf, wenn
neon nicht in `ListAgents` steht: Abschnitt „neon erreichen“.

**Änderungen direkt nach `main`** (Entscheidung des Maintainers vom
4.11.2026): Cloud-Sessions arbeiten auf ihrem zugewiesenen Zweig, bringen
fertige Arbeit aber ohne Rückfrage selbst nach `main` – kein Pull Request,
kein Merge durch den Maintainer. Ablauf am Ende eines Arbeitsblocks:
`git fetch origin main`, auf `origin/main` rebasen, `git push origin
HEAD:main`, den Zweig auf denselben Stand bringen. Dabei:

- Gesammelt pushen wie unter „Testrechner“: je Eintrag committen, einmal am
  Ende pushen – jeder Push mit Codeänderung belegt neon rund 60 Minuten
  (reine `*.md`-Änderungen nicht).
- Vorher die betroffenen Prüfungen über neon laufen lassen (`--only`, Zweig
  nennen), wenn neon erreichbar und frei ist; sonst ohne und das im Gespräch
  sagen. Den Volllauf macht die CI, Rot meldet der CI-Wächter.
- Nicht zwischen 01:30 und 07:00 Wiener Zeit pushen (Nachtlauf wartet auf die
  CI genau seines Commits; ein weiterer Push in derselben `halo-mac`-Warteschlange
  kann dessen Lauf verdrängen) – dann bis danach warten bzw. es dem
  Maintainer sagen.
- Kein Release aus der Cloud (siehe „Release“); den Board-Status über neon
  oder den Maintainer pflegen.

## GitHub-Issues und Pull Requests von Nutzern

Die Kommunikation mit Nutzern auf GitHub übernimmt der Agent selbstständig.

- **Bei jedem Arbeitsblock mit Bugs/Features zuerst** offene Issues und Pull
  Requests im Repo prüfen (lokal `gh issue list -R sruf79/halo-spaces`,
  `gh pr list …`; in Cloud-Sessions über die GitHub-MCP-Tools). Neue oder
  geänderte Einträge im Gespräch kurz nennen.
- **Neues Issue:** Screenshots ansehen (in Cloud-Sessions nicht abrufbar –
  dann den Maintainer darum bitten), gegen den aktuellen Stand von `main`
  prüfen, Ursache klären und wie jeden Bug/Wunsch in die Aufgabenliste
  eintragen (im Text „GitHub-Issue #n“ vermerken). Dann antworten und Label
  setzen: `bug` bzw. `enhancement`; `question`, solange eine Rückfrage offen
  ist; `duplicate`/`wontfix` mit Begründung schließen.
- **Status:** Issues bleiben offen, bis der Fix veröffentlicht ist (Nutzer
  bekommen ihn erst mit dem Release). Nach dem Commit kurz antworten, dass es
  behoben ist und mit der nächsten Version kommt; beim Release alle darin
  behobenen Issues mit „Fixed in x.y.z“ schließen (`completed`).
- **Pull Requests:** durchsehen (Konflikte, Überschneidung mit `main`,
  Regeln dieser Datei) und dem Autor antworten. Mergen, schließen oder
  Teile übernehmen nur mit Freigabe des Maintainers; übernommene Teile im
  Commit dem Autor zuschreiben (`Co-Authored-By:`).
- **Forks:** gehören zur Prüfung dazu (Suche `halo-spaces in:name fork:only`;
  Stand eines Forks mit `git fetch <url> main:refs/remotes/<name>/main`
  gegen `main` vergleichen). Brauchbare Verbesserungen dem Autor als Pull
  Request vorschlagen; Probleme (gleiche Add-on-ID, fehlende Lizenzhinweise)
  freundlich ansprechen. Gesprächsfaden mit dem Windows-Fork
  `ahXN00/halo-spaces_win`: Issue #6.
- **Automatisch nachsehen:** Nach jeder eigenen Antwort auf GitHub
  dranbleiben, bis der Faden erledigt ist. Pull Requests abonnieren
  (in Cloud-Sessions `subscribe_pr_activity`; Kommentare, Pushes und Merge
  wecken die Sitzung dann selbst). Issues und Forks melden sich nicht von
  selbst – dafür eine Prüfung einplanen (in Cloud-Sessions `send_later`):
  die erste etwa 1 Stunde nach der letzten Aktivität, danach alle
  4–6 Stunden. Jede Prüfung: neue Issues/PRs, Antworten in offenen Fäden,
  Stand der bekannten Forks; Antworten gleich beantworten. Zusätzliche
  Prüfungen ohne Neues still neu einplanen; nach 3 leeren in Folge aufhören
  und das dem Maintainer einmal kurz sagen (die feste Routine unten läuft
  weiter). Neue Aktivität setzt den Zähler zurück.
  Der Maintainer erfährt im Gespräch nur, was neu ist oder seine
  Entscheidung braucht (Mergen, Code übernehmen, Design-Fragen).
- **Feste Routine:** Die regelmäßige Prüfung läuft auf neon als geplante
  Aufgabe der Claude-Desktop-App „halo.spaces: GitHub-Kommunikation“
  (`halo-github-kommunikation`), täglich 9:00, 14:00 und 19:00 Wiener Zeit,
  ohne Ablauf; jeder Lauf ist eine neue Sitzung mit `gh` (inkl. `gh project`).
  Den Stand zwischen den Läufen (letzte Prüfung, offene Fäden, Fork-Stände,
  was auf eine Entscheidung des Maintainers wartet) hält
  `~/halo-aufgaben/github-komm-stand.md` – lesen vor, aktualisieren nach
  jeder Prüfung, auch bei Antworten aus anderen Sitzungen. Keine zweite
  Routine anlegen; die frühere Cloud-Routine gleichen Namens ist abgeschaltet.
- **Ton und Inhalt:** Englisch, freundlich, knapp, ohne Fachjargon des
  Codes, wo es nicht nötig ist; Rückfragen konkret stellen. Nie auf die
  private Aufgabenliste verweisen, keine Interna (Testrechner, VM, Tokens)
  und keine Zusagen zu Terminen.

## Datenschutz

Screenshots mit echten Mails/Kontakten (`vorschau-*.png`, `reddit/`,
`vorher-nachher/`, `logo-ideen.png`) sind lokal und gitignored – nicht
committen und nicht in README oder Store verwenden. Veröffentlichte
Screenshots stammen aus dem Testprofil oder sind unkenntlich gemacht.
