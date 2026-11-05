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
| `chrome/userChrome.css` | Design für Mail, Menüs, Dialoge (~14.000 Zeilen) |
| `chrome/spaces.css` | Kalender, Aufgaben, Adressbuch, Chat, Einstellungen |
| `chrome/merge_spaces.py` | fügt `spaces.css` als markierten Block in `userChrome.css` ein |
| `extension/manifest.json` | Version, Add-on-ID `mail-cards@sebastian.local`, `update_url` |
| `extension/api/implementation.js` | Experiment-API `mailCards` – die eigentliche Logik (~22.000 Zeilen) |
| `extension/api/schema.json` | Schema der Experiment-API |
| `extension/background.js` | startet die Experiment-API (`browser.mailCards.start()`) und meldet bereitliegende Updates (`updateReady`); geladen über `extension/background.html` |
| `extension/*.css` | zusätzliche Stilblätter der Erweiterung (`parts.css`, `noscroll.css`, `plaintext.css`, `print.css`, `icon-vars.css`, `compose-body.css`, `dialog-box.css`, `event-description.css`, `solid-menus.css`, `taskdesc.css`, `unread-tint.css`) |
| `extension/icons/` | Apple-artige Ersatzsymbole |
| `extension/about/`, `extension/options/` | Fenster „Hilfe → halo.spaces“ und Einstellungsseite |
| `build.sh`, `release.sh`, `publish.sh`, `install.sh` | Paket bauen; Release vorbereiten (Tests, Testmarke) und veröffentlichen; ins echte Profil installieren (nur auf Wunsch) |
| `extension/vendor/pst/`, `tools/pst-bundle/` | mitgelieferte PST-Bibliothek (Import von Outlook-Datendateien) und wie sie gebündelt wird |
| `icons/` | Skripte, die die Symbole und `icon-vars.css` erzeugen |
| `screenshots/` | Bilder für das README (aus dem Testprofil) |
| `tests/halo_test.py` | automatischer Test per Marionette in frischem Profil (`--perf` mit `tests/perf.js`: Geschwindigkeitsmessung) |
| `tests/update_test.py` | stellt das Update von einer älteren Version nach (siehe „Bauen und testen“) |
| `tests/testserver.py` | lokaler IMAP-/SMTP-Testserver (nur 127.0.0.1, erfundene Daten) für die Prüfungen mit Testkonto |
| `tests/ui_tour.py` | Rundgang: Bilder aller Oberflächen (Design-Durchsicht) |
| `tests/store_shots.py` | Bilder für README und Store aus frischem Testprofil (erfundene englische Mails, Kontakte mit gezeichneten Bildern, Termine) |
| `tests/beta.sh` | gleicher Test mit Thunderbird Beta |
| `tests/mac-mini-setup.sh`, `tests/mac-runner-hook.sh`, `tests/MAC-MINI.md` | Mac mini als Testrechner: Prüfen/Einrichten, Wächter für den GitHub-Runner, Anleitung |
| `tests/nachtlauf.sh`, `tests/nachtlauf-auftrag.md` | nächtlicher Arbeitslauf auf neon (Liste abarbeiten, CI abwarten, veröffentlichen, Bericht aufs iPhone), `tests/MAC-MINI.md` Abschnitt 13 |
| `tests/ci-waechter.sh`, `tests/ci-warten.sh` | rote CI-Läufe ins Board und aufs iPhone (alle 15 Min.); auf den CI-Lauf eines Commits warten, Abschnitt 14 |
| `tests/wochenpruefung.sh`, `tests/wochenpruefung-auftrag.md` | wöchentliche Auswertung der Läufe mit Kennzahlen und Vorschlägen, Abschnitt 15 |
| `tests/dokupruefung-auftrag.md` | wöchentliche Prüfung aller `.md`-Dateien (`wochenpruefung.sh --doku`), Abschnitt 16 |
| `tests/farben-betroffen.sh` | betrifft eine Änderung Farben? Nur dann testet CI-Job `mac` bzw. `release.sh` auch dunkel |
| `tests/lauf-hilfen.zsh` | gemeinsame Hilfen dieser Läufe (Protokoll, Push aufs iPhone, „belegt?“) |
| `tests/win-vm-setup.ps1`, `tests/win-display.ps1` | Windows-Seite der Test-VM (Energie, Sperre, Thunderbird, Python), aufgerufen von `mac-mini-setup.sh`; Bildschirmgröße der VM vor jedem Testlauf |
| `tests/mac-remote-control.sh` | hält auf neon die Remote-Control-Sitzung offen (LaunchAgent, `tests/MAC-MINI.md` Abschnitt 12) |
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
  Der ESR-Job muss grün sein wie die übrigen. Er testet die neueste ESR
  (`esr-latest`), nicht zwingend die Mindestversion: Nach Erscheinen einer
  neuen ESR prüft er bis zum Anheben von `strict_min_version` die
  Mindestversion nicht mehr.
- **CI gezielt von Hand** (Fehlersuche ohne volle Runde): `gh workflow run
  test.yml -R sruf79/halo-spaces -f only="<Teil des Prüfungsnamens>" -f
  ziel=<alle|linux|linux-release|linux-beta|linux-esr|mac|windows>`. Nur
  Linux belegt neon nicht. Ein gezielter Lauf (Schritt „Gezielter Lauf“ im
  Job `changes`) zählt nicht als vollständig grün für `release.sh`, der
  CI-Wächter trägt ihn nicht ein, `ci-warten.sh` wartet nur auf Läufe aus
  einem Push. `mac`/`windows` gezielt nicht während des Nachtlaufs starten –
  sie warten auf demselben Runner und verlängern seine CI-Runde.
- Mindestversion (`strict_min_version`) ist die aktuelle ESR (153). Ältere
  Versionen bekommen keine Updates mehr; vor dem Anheben auf eine neue ESR
  einen Volltest mit ihr (`--tb`, Thunderbird ESR aus download.mozilla.org).
- `tests/update_test.py` stellt das Update von einer älteren Version nach
  (Standard: das letzte veröffentlichte Release, andere mit `--from`)
  (Einstellungen, Toolbar, Begrüßung, userChrome.css); mit `--github` über das
  veröffentlichte `updates.json`. `release.sh` lässt ihn vor der Marke selbst
  laufen (auch wenn die CI die übrigen Prüfungen übernommen hat; aus nur mit
  `NO_UPDATE_TEST=1`), rot heißt kein Release.
- Nach UI-Änderungen: passende Prüfung in `run_checks()` ergänzen, besonders
  an Stellen, an denen es schon Rückschritte gab.
- **Fehlerkonsole** (Entscheidung des Maintainers vom 5.11.2026): Konsolenfehler
  halten kein Release auf, wenn die Prüfungen grün sind. `halo_test.py`
  schreibt die Fehlerkonsole ab dem Start des Laufs mit (ihr Puffer hält nur
  250 Meldungen) und merkt sich zu jeder Meldung die laufende Prüfung. Am
  Ende steht je Fehler aus halo.spaces (bzw. Thunderbird-Meldung, die auf
  einen Eingriff von uns deutet, z. B. GitHub #38) eine Zeile `KONSOLE  …`;
  die Prüfung „Fehlerkonsole …“ bleibt dabei OK (nur Warnung), auch mit
  `--only` (dann nur für die gelaufenen Prüfungen). `update_test.py` meldet
  ebenso nach dem Start der neuen Version. Der CI-Wächter trägt jede Zeile
  als Bug „Tests: Fehlerkonsole – …“ ins Board, und dieser wird wie jeder Bug
  abgearbeitet. Löst eine Prüfung absichtlich einen Fehler in halo.spaces
  aus (kein Netz, kaputte Daten, ersetzte Funktion), meldet sie ihn mit
  `erwartet(/Muster/)` an (gilt nur für diese Prüfung). Die Prüfung nicht zu
  einem Fehlschlag machen und keine Liste „bekannter“ Fehler anlegen.
  Ebenso das Fehlerprotokoll der Erweiterung (`mail-cards-debug.log`, Fehler,
  die unser Code selbst abfängt): Prüfung „Fehlerprotokoll …“ nur Warnung, je
  Meldung eine Zeile `PROTOKOLL  …`, Bug „Tests: Fehlerprotokoll – …“.
  Meldungen werden ohne wechselnde Teile (Profil, Temp-Pfade, Kennung der
  Erweiterung) verglichen; Zeilen aus dem Update-Test trägt `release.sh` über
  `ci-waechter.sh --datei` ein. Solche Bugs erst auf Done, wenn der CI-Lauf
  zum Fix mit denselben Jobs (bei „dunkel“ auch dunkel) die Meldung nicht
  mehr nennt (`ci-warten.sh`) – grüne CI allein beweist es nicht.
  Die Wochenprüfung (sonntags) prüft diesen Ablauf an den Zahlen der Woche
  und sieht sich den Code nur an, wenn er sich geändert hat.
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

1. `ListAgents`, dann `SendMessage` an `neon` (die Remote-Control-Sitzung,
   die dort als LaunchAgent dauerhaft läuft, `tests/MAC-MINI.md` Abschnitt 12).
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
5. Auf dem Laptop zusätzlich SSH über Tailscale (`tests/MAC-MINI.md`
   Abschnitte 4 und 7).

Nie „neon nicht erreichbar“ melden, ohne alle passenden Wege versucht zu
haben; dann dem Maintainer sagen, welche Wege mit welcher Meldung
gescheitert sind. Ergebnisse von neon abwarten und weitergeben, nie selbst
erfinden. Sitzungen auf neon selbst sind neon – dort direkt arbeiten.

**Antworten von neon:** neon muss im Modus „Auto“ laufen wie die
Cloud-Sitzungen (in der Cloud gibt es kein `bypassPermissions`). Bei
verschiedenen Modi hält die empfangende Sitzung Nachrichten zurück, und auf
keiner Seite erscheint eine Abfrage (Test vom 4.11.2026). neon antwortet mit
`SendMessage` an den Namen der Sitzung aus `ListAgents` (Name per
`list_sessions` der Sitzungs-ID zuordnen); das meldet nicht, ob die Nachricht
gelesen wurde, sie erscheint dort als neue Nachricht. `send_message` aus neon
scheitert auch im Modus „Auto“ (`elevated_session_untrusted_device`).

## Testrechner (Mac mini)

Ein Mac mini übernimmt die Tests rund um die Uhr (Anleitung: `tests/MAC-MINI.md`):
eigener Benutzer `neosky.cat` (Administrator) ohne echte Mails mit automatischer Anmeldung, erreichbar
nur über Tailscale (keine Portfreigabe), Claude Code per SSH aus der Desktop-App
und per Remote Control aus Cloud-Sitzungen (Einrichtung `tests/MAC-MINI.md`
Abschnitt 12, Bedienung Abschnitt „Cloud-Sessions“ unten).

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
- Jeder Push auf `main` belegt neon mit den Jobs `mac` und `windows` rund
  35 Minuten, mit Dunkelmodus rund 55 (laut den letzten grünen Läufen: `mac`
  hell ~17, hell und dunkel ~35, `windows` ~19; Linux parallel ~17). Solange er
  läuft (Prozess `Runner.Worker`), keine eigenen Testläufe starten – zwei
  Testfenster nehmen sich gegenseitig den Fokus.
- Ausnahmen ohne Tests: Ein Push, der nur `*.md`, `store/` oder `LICENSE`
  ändert, startet `test.yml` gar nicht (`paths-ignore`). Ein Push, der nur den
  Release-Commit enthält (`updates.json` und die Versionszeile in
  `manifest.json`, dazu ggf. Texte, `store/`, `release.sh`, `publish.sh`),
  erkennt der Job `changes`, alle Testjobs werden übersprungen.
  Diese Prüfungen nicht lockern; jede andere Änderung testet wie gewohnt.
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
  den Nachtlauf auslassen lässt (siehe „Nachtlauf“ unten): ab 00:30 keinen
  Push mit Codeänderung mehr (die CI dazu muss bis 01:30 durch sein), keine
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
  CI-Runde der Nacht damit testet. Pausieren mit `touch ~/halo-nacht/PAUSE`. Details
  `tests/MAC-MINI.md` Abschnitt 13.
- **CI-Wächter:** alle 15 Minuten trägt `tests/ci-waechter.sh` (nur `gh`,
  kein Claude) für rote CI-Läufe auf `main` je gescheiterter Prüfung einen
  Bug ins Board ein (`Tests: CI rot – <Job>: <Prüfung>`, offenen Eintrag zur
  selben Prüfung ergänzt er) und meldet es aufs iPhone; Läufe während Nachtlauf
  oder Wochenprüfung übernehmen diese selbst. Zeilen `KONSOLE  …` trägt er für
  jeden Lauf als Bug `Tests: Fehlerkonsole – …` ein, Zeilen `PROTOKOLL  …` als
  `Tests: Fehlerprotokoll – …` (kein Rot). `tests/MAC-MINI.md` Abschnitt 14.
- **Wochenprüfung:** sonntags 08:00 (wartet bis 09:15 auf den Nachtlauf) wertet `tests/wochenpruefung.sh` die
  letzten 7 Tage aus (CI, Nachtläufe, Berichte, Board; Kennzahlen in
  `~/halo-aufgaben/wochen-kennzahlen.json`; auch, ob der Nachtlauf früher als
  möglich – vor 04:30 bzw. nach grüner CI vor 06:30 – aufhört, obwohl noch
  machbare Einträge lagen), behebt kleine Dinge an Prüfungen
  selbst und legt Ablaufänderungen nur als „Wartet auf OK“ an. Bericht
  `~/halo-berichte/<datum>-wochenpruefung.md`. `tests/MAC-MINI.md` Abschnitt 15.
- **Doku-Prüfung:** samstags 08:00 (wartet ebenso bis 09:15 auf den
  Nachtlauf) prüft `tests/wochenpruefung.sh --doku` alle `.md`-Dateien auf
  Widersprüche, Veraltetes, Doppeltes, Unklares und Abweichungen vom Code
  (Kennzahlen in `~/halo-aufgaben/doku-kennzahlen.json`), korrigiert
  eindeutige Fakten selbst und legt echte Widersprüche und Regeländerungen
  nur als „Doku: …“ mit „Wartet auf OK“ an. Bericht
  `~/halo-berichte/<datum>-dokupruefung.md`. `tests/MAC-MINI.md` Abschnitt 16.
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

## Release (selbstständig auf neon)

```bash
./release.sh 3.1.0              # Version, update_url, Tests hell (dunkel bei Farben), updates.json, Testmarke
./publish.sh 3.1.0 notes.md     # Sperre prüfen, commit, push, GitHub-Release, Hash- und Update-Prüfung, Bericht
```

**Wann:** Jede Sitzung darf ohne Rückfrage veröffentlichen – auch
unbeaufsichtigt nachts (Entscheidung des Maintainers vom 2.11.2026: schlechte
Releases werden mit einem neuen Update nach vorn korrigiert, Thunderbird stuft
nicht zurück). Sie entscheidet selbst, ob ihre Änderungen groß genug für ein
eigenes Release sind (z. B. ein Bug, den Nutzer spüren, oder eine neue
Funktion). Wenn nicht, bleibt es beim Commit: Der nächste Nachtlauf
veröffentlicht alle noch nicht veröffentlichten Bugs und Features
automatisch, sobald die CI dazu grün ist (Entscheidung des Maintainers vom
5.11.2026). Ablauf: Versionshinweise im `README.md` schreiben (eigener
Commit „README: Versionshinweise x.y.z“), Notizen für den GitHub-Release als
Datei (englisch, gleicher Inhalt), `./release.sh x.y.z`, bei grünen Tests
direkt `./publish.sh x.y.z notes.md`. Version: Patch für Korrekturen, Minor
für neue Funktionen. Kleine Einzelkorrekturen (Abstände, Farben, Tests)
lohnen meist kein eigenes Release. `release.sh` und `publish.sh` laufen
**nur auf neon**, nie auf dem Laptop oder in Cloud-Sessions – die
beauftragen dafür neon (nach dem Push).

**Einzige Bedingung: grüne Tests.** `release.sh` schreibt nur dann die Marke
`dist/release-<version>.ok` (Version, Hash des Pakets, gelaufene Tests, ob
dunkel lief), wenn hell (und ggf. dunkel) grün waren – oder die CI denselben Stand vollständig
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
SessionStart-Hook die offenen Einträge in jede Sitzung; sie liegen dann schon
vor, werden aber erst nach Schritt 1 der Reihenfolge unten ausgewertet.

- Die Liste ist die Vorlage für die Arbeit: offene Einträge berücksichtigen
  und passende Aufgaben nennen – in der Reihenfolge unten.
- **Reihenfolge eines Laufs** (Entscheidung des Maintainers vom 4.11.2026,
  abends; gilt für jede Sitzung, die die Liste abarbeitet, 5.11.2026):
  1. neue bzw. nicht gepushte Commits durchsehen (Regeln dieser
  Datei, offensichtliche Fehler), 2. erst dann die Aufgabenliste laden und
  offene GitHub-Issues/Pull Requests prüfen (siehe „GitHub-Issues“), 3. Bugs,
  4. einfache Features, 5. zuletzt Reihen (n/m) – Einzelheiten unter
  „Reihenfolge beim Abarbeiten“ (der Nachtlauf-Auftrag wiederholt sie für
  den Lauf; bei Änderungen beide Stellen anpassen).
- **Wer die Liste abarbeitet** (Entscheidung des Maintainers vom 5.11.2026):
  Der Nachtlauf immer von sich aus. Jede andere Sitzung nur, wenn der
  Maintainer sie dazu auffordert (ganze Liste oder einzelne Einträge) – dann
  in der Reihenfolge oben, ohne weitere Rückfrage je Eintrag.
- **Reihenfolge beim Abarbeiten:** zuerst alle offenen Einträge nach Bereich
  (Titelpräfix) gruppieren und auf Zusammenhänge prüfen – Doppelte
  zusammenlegen; Bugs, die ein Feature ohnehin behebt, an dieses Feature
  hängen (Notiz in beiden Einträgen). Dann **erst alle Bugs,
  danach einfache Features, zuletzt Reihen** (Bugs fixen ist in jedem Lauf
  wichtiger als neue Features): jeweils Bereich für Bereich, kleine vor
  großen; die nächste Stufe erst, wenn in der vorigen nichts Machbares übrig
  ist; von Reihen n/m nur der nächste Schritt – steht er auf Todo und der
  vorige ist Done, ohne weitere Nennung durch den Maintainer (nur „Wartet auf
  OK“ hält an; Klarstellung vom 5.11.2026, ältere Eintragstexte mit „erst
  nach Nennung“ gelten nicht mehr). Ausnahme: Ein Feature, das
  einen Bug vermutlich mitbehebt, wird zusammen mit ihm erledigt.
  Zusammenhänge und Zusammenlegungen im Gespräch bzw. Bericht nennen.
- Neue Bugs/Wünsche aus dem Gespräch sofort und ohne Rückfrage dort als
  Entwurf anlegen (Typ setzen, Status Todo); Screenshots liegen in
  `~/halo-aufgaben/bilder/` (der Maintainer schickt sie mit `halobild <name>`,
  siehe `tests/MAC-MINI.md` Abschnitt 10, und nennt im Gespräch nur den Namen).
  Jedes Bild, das der Maintainer einer Sitzung direkt ins Gespräch legt und
  das für einen Bug oder ein Feature im Board gebraucht wird, übermittelt
  die Sitzung automatisch und ohne Rückfrage an neon (Entscheidung des
  Maintainers vom 5.11.2026). Sitzungen auf neon speichern es selbst unter
  `~/halo-aufgaben/bilder/`. Alle anderen (Cloud, Laptop, iPhone, …): als
  data:-URIs in eine private Artifact-Seite (`Artifact`, nicht freigeben;
  Originaldatei unverändert, nicht verkleinern oder umkodieren – die Seite
  fasst bis 16 MB, größere Bilder als Assets mit `asset: true`, bis 15 MB je Datei),
  neon liest sie mit `Artifact` (`action: "read"`, nicht WebFetch), speichert
  sie mit SHA-256-Prüfung unter `~/halo-aufgaben/bilder/` und vermerkt die
  Dateinamen im Eintrag. Nie über das Repo – die Bilder zeigen echte Mails.
  Bildqualität: keine feste Mindestgröße (auch kleine Ausschnitte sind in
  Ordnung); maßgeblich ist, ob die für den Eintrag entscheidenden Details
  (Schrift, Linien, Farben, Abstände) klar erkennbar sind. Das prüft die
  empfangende Sitzung sofort und sagt dem Maintainer gleich im Gespräch,
  was nicht erkennbar ist (mit Pixelgröße), und bittet um eine bessere
  Aufnahme, am besten per `halobild` (die Claude-App verkleinert Bilder
  beim Hochladen teils). neon prüft nach dem Speichern ebenso, meldet ein
  zu schwaches Bild an die Sitzung zurück (die es weitergibt) und vermerkt
  im Eintrag „Bild unzureichend: …“.
  Ursache klären und Lösungsidee in den Eintrag
  schreiben ist erwünscht – aber nicht mitten in der laufenden Aufgabe
  nebenbei umsetzen und auch nicht anbieten; umgesetzt wird er wie jeder
  Eintrag über die Liste (siehe „Wer die Liste abarbeitet“). Gehört der Punkt zu einem offenen Eintrag, diesen
  ergänzen statt einen neuen anzulegen.
- Bei Arbeitsbeginn Status In Progress; nach dem Commit Notiz mit
  Commit-Hash („committet, wartet auf Push/CI“), Status bleibt In Progress
  (gepusht wird gesammelt, siehe „Testrechner“). Erst wenn der Commit auf
  `main` ist und die CI dazu grün war: Status Done, dann archivieren. Das
  übernimmt, wer pusht und die CI prüft (Nachtlauf, Cloud-Session über neon).
  Wird ein Commit bei roter CI zurückgenommen (`git revert`), bleibt der
  Eintrag offen mit Notiz zum Grund. Teilweise Erledigtes bleibt
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

In Cloud-Sessions geht `gh` nur für die Suche – den Workflow dort mit dem
GitHub-Werkzeug `actions_run_trigger` starten (Workflow `add-task.yml`,
Eingaben `title`, `body`, `type` = `bug`/`feature`, `status` = `Todo`) und
mit `actions_list` prüfen, ob der Lauf erfolgreich war. Lokal geht es auch so:

```bash
gh workflow run add-task.yml -R sruf79/halo-spaces \
  -f title="Bereich: …" -f body="…" -f type=<bug|feature> -f status=Todo
gh run list -R sruf79/halo-spaces -w add-task.yml -L 1   # Lauf erfolgreich?
```

Das Repo ist öffentlich: Der Workflow schreibt Titel und Text bewusst nicht
ins Log – das beim Ändern beibehalten.

**neon aus der Cloud steuern:** über die Remote-Control-Sitzung `neon`
(kein SSH, kein Tailscale im Container) – Wege und Ablauf unter „neon
erreichen“. Auftrag vollständig formulieren (Zweig bzw. Commit, Befehl, Port
ab 2850, was zurückgemeldet werden soll); die Regeln aus „Testrechner“
gelten dort unverändert.

**Änderungen direkt nach `main`** (Entscheidung des Maintainers vom
4.11.2026): Cloud-Sessions arbeiten auf ihrem zugewiesenen Zweig, bringen
fertige Arbeit aber ohne Rückfrage selbst nach `main` – kein Pull Request,
kein Merge durch den Maintainer. Ablauf am Ende eines Arbeitsblocks:
`git fetch origin main`, auf `origin/main` rebasen, `git push origin
HEAD:main`, danach den eigenen Zweig `claude/…` auf GitHub löschen
(`git push origin --delete <zweig>`), damit neben `main` keine Reste
liegen bleiben (Entscheidung des Maintainers vom 5.11.2026). Dabei:

- Gesammelt pushen wie unter „Testrechner“ (je Eintrag committen, einmal am
  Ende pushen).
- Vorher die betroffenen Prüfungen über neon laufen lassen (`--only`, Zweig
  nennen), wenn neon erreichbar und frei ist; sonst ohne und das im Gespräch
  sagen. Den Volllauf macht die CI, Rot meldet der CI-Wächter.
- Push-Sperre 01:30–09:00 und ab 00:30 kein Push mit Codeänderung: wie
  unter „Testrechner“.
- Release: siehe „Release“ (nur auf neon); den Board-Status über neon oder
  den Maintainer pflegen.

## GitHub-Issues und Pull Requests von Nutzern

Die Kommunikation mit Nutzern auf GitHub übernimmt der Agent selbstständig.

- **Bei jedem Arbeitsblock mit Bugs/Features** offene Issues und Pull
  Requests im Repo prüfen – zusammen mit dem Laden der Aufgabenliste, also
  nach der Durchsicht der Commits (Schritt 2 der „Reihenfolge eines Laufs“;
  lokal `gh issue list -R sruf79/halo-spaces`,
  `gh pr list …`; in Cloud-Sessions über die GitHub-MCP-Tools). Neue oder
  geänderte Einträge im Gespräch kurz nennen.
- **Neues Issue:** Screenshots ansehen (in Cloud-Sessions nicht abrufbar –
  dann den Maintainer darum bitten), gegen den aktuellen Stand von `main`
  prüfen, Ursache klären und wie jeden Bug/Wunsch in die Aufgabenliste
  eintragen (im Text „GitHub-Issue #n“ vermerken). Dann antworten und Label
  setzen: `bug` bzw. `enhancement`; `question`, solange eine Rückfrage offen
  ist; `duplicate`/`wontfix` mit Begründung schließen.
- **Status:** Issues bleiben offen, bis der Fix veröffentlicht ist (Nutzer
  bekommen ihn erst mit dem Release). Wenn der Fix auf `main` ist und die CI
  dazu grün war, kurz antworten, dass es behoben ist und mit der nächsten
  Version kommt; beim Release alle darin
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
  jeder Prüfung, auch bei Antworten aus anderen Sitzungen (Cloud-Sessions
  erreichen die Datei nicht und lassen sie über neon ergänzen). Keine zweite
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
