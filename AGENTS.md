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
| `chrome/userChrome.css` | Design für Mail, Menüs, Dialoge (~15.000 Zeilen) |
| `chrome/spaces.css` | Kalender, Aufgaben, Adressbuch, Chat, Einstellungen |
| `chrome/merge_spaces.py` | fügt `spaces.css` als markierten Block in `userChrome.css` ein |
| `extension/manifest.json` | Version, Add-on-ID `mail-cards@sebastian.local`, `update_url` |
| `extension/api/implementation.js` | Experiment-API `mailCards` – die eigentliche Logik (~25.000 Zeilen) |
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
| `tests/logik/` | schnelle Logik-Tests ohne Thunderbird (Node, `node --test tests/logik/*.test.mjs`, Sekunden): `lader.mjs` lädt `implementation.js` mit Attrappen für Thunderbirds Grundobjekte und reicht die Namen aus `OFFEN` heraus |
| `tests/adressen.py`, `tests/addon_lint.py` | Prüfungen ohne Thunderbird (CI-Job `statisch`): nur erlaubte Adressen im Netz (Datenschutz, Erlaubt-Liste im Skript); Mozillas Add-on-Prüfung (addons-linter) |
| `tests/testserver.py` | lokaler IMAP-/SMTP-Testserver (nur 127.0.0.1, erfundene Daten) für die Prüfungen mit Testkonto |
| `tests/ui_tour.py` | Rundgang: Bilder aller Oberflächen (Design-Durchsicht), mit `--messung` (`tests/tour-messung.js`) auch Messwerte je Oberfläche |
| `tests/rundgang-woche.sh`, `tests/rundgang-auftrag.md`, `tests/rundgang_vergleich.py` | wöchentlicher Design-Rundgang: Aufnahme, Vergleich mit der Vorwoche, Ausreißer ins Board, `tests/MAC-MINI.md` Abschnitt 17 |
| `tests/store_shots.py` | Bilder für README und Store aus frischem Testprofil (erfundene englische Mails, Kontakte mit gezeichneten Bildern, Termine) |
| `tests/beta.sh` | gleicher Test mit Thunderbird Beta |
| `tests/mac-mini-setup.sh`, `tests/mac-runner-hook.sh`, `tests/MAC-MINI.md` | Mac mini als Testrechner: Prüfen/Einrichten, Wächter für den GitHub-Runner, Anleitung |
| `tests/nachtlauf.sh`, `tests/nachtlauf-auftrag.md` | nächtlicher Arbeitslauf auf neon (Liste abarbeiten, CI abwarten, veröffentlichen, Bericht aufs iPhone), `tests/MAC-MINI.md` Abschnitt 13 |
| `tests/ci-waechter.sh`, `tests/ci-warten.sh`, `tests/ci-noetig.sh` | rote CI-Läufe ins Board, ohne Meldung aufs iPhone (alle 15 Min., Entscheidung vom 7.11.2026); auf den CI-Lauf eines Commits warten, Abschnitt 14; braucht eine Änderung überhaupt CI (nur Thunderbird-Dateien) |
| `tests/wochenpruefung.sh`, `tests/wochenpruefung-auftrag.md` | wöchentliche Auswertung der Läufe mit Kennzahlen und Vorschlägen, Abschnitt 15 |
| `tests/dokupruefung-auftrag.md` | wöchentliche Prüfung aller `.md`-Dateien (`wochenpruefung.sh --doku`), Abschnitt 16 |
| `tests/farben-betroffen.sh` | betrifft eine Änderung Farben? Nur dann testet CI-Job `mac` bzw. `release.sh` auch dunkel |
| `tests/board.sh`, `tests/kurz.sh`, `tests/neon-stand.sh`, `tests/neon-hook.sh` | neon schlank halten: knapper Board-Zugriff; Befehl mit Kurzfassung statt voller Ausgabe; offene Aufträge als Datei; SessionStart-Hook, der sie nach dem Verdichten wieder lädt (Abschnitt „neon erreichen“) |
| `tests/token-bilanz.py` | Token-Bilanz der Claude-Sitzungen auf neon aus den Protokollen (nur Lesen, kein Claude-Aufruf, kein Netz) |
| `tests/lauf-hilfen.zsh` | gemeinsame Hilfen dieser Läufe (Protokoll, Push aufs iPhone, „belegt?“) |
| `tests/vorpruefung.zsh`, `tests/github-vorpruefung.sh`, `tests/issue-abgleich.sh` | Vorprüfungen ohne Claude: Nachtlauf, Rundgang und Doku-Prüfung starten Claude nur bei Arbeit, ebenso die GitHub-Kommunikation (`tests/MAC-MINI.md` Abschnitte 13, 16, 17, 17a); behobene Issues ohne Antwort weckt sie auch (`docs/github-komm.md` „Status“) |
| `tests/win-vm-setup.ps1`, `tests/win-display.ps1` | Windows-Seite der Test-VM (Energie, Sperre, Thunderbird, Python), aufgerufen von `mac-mini-setup.sh`; Bildschirmgröße der VM vor jedem Testlauf |
| `tests/mac-remote-control.sh` | hält auf neon die Remote-Control-Sitzungen `neon` und `neon-board` offen (zwei LaunchAgents, `tests/MAC-MINI.md` Abschnitt 12) |
| `tests/neon-neustart.sh` | Vorlage für einen täglichen Neustart von `neon`, **nicht aktiv** (siehe `docs/neon-sitzung.md`) |
| `ENTSCHEIDUNGEN.md` | Wortlaute der Entscheidungen des Maintainers (Datum, Herkunft); `AGENTS.md` nennt nur Datum und Verweis; bei Bedarf lesen, nicht automatisch geladen |
| `docs/neon-sitzung.md` | Arbeitsweise der Sitzungen `neon` und `neon-board` (Aufträge in `neon-stand.md`, Modelle, `/bereit`, Antworten); `tests/neon-hook.sh` weist darauf hin |
| `docs/github-komm.md` | GitHub-Kommunikation mit Nutzern (Issues, Pull Requests, Forks, Routine); Kern in `AGENTS.md` |
| `docs/board.md` | Board-Einzelheiten: Feld-IDs, `gh`-Befehle, Cloud-Weg, Bilder, Apple-Vorlagen, Bilder-Erinnerung; Pflichtregeln in `AGENTS.md` |
| `docs/testrechner.md` | Testrechner-Einzelheiten: Mac-mini-Prüfung, CI-Laufzeiten, Dunkelmodus, Nachtlauf, CI-Wächter, Wochen-/Doku-Prüfung, Rundgang, Windows-VM, Modelle der Routinen; Sperren in `AGENTS.md` |
| `tests/sitzung-finden.zsh` | `sitzung_finden`/`sitzung_merken`: lokale Sitzung auch bei abweichendem Namen finden (Teil von `lauf-hilfen.zsh`, Sitzungs-IDs in `~/halo-aufgaben/sitzungen.json`) |
| `tests/pausen_test.zsh`, `tests/pausen_check.sh` | Pausen-Logik (`~/halo-nacht/pausen.txt`, `pause_start`): Einzelfälle ohne Claude; Wächter gegen Reste alter Pausen-Dateien, läuft in der Doku-Prüfung |
| `tests/doku_kern_check.sh` | Wächter: harte Sperren und Pflichtbegriffe stehen in `AGENTS.md`, keine `@`-Importe; läuft in der Doku-Prüfung (`wochenpruefung.sh --doku`) |
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
  Daneben prüft der Job `statisch` ohne Thunderbird die Logik-Tests
  (`tests/logik/`; neue reine Funktionen dort mit abdecken, auch ohne neon
  lauffähig), die Adressen im Netz
  (`tests/adressen.py` – eine neue Adresse braucht dort einen Eintrag mit
  Zweck, Datenschutzhinweise in `store/privacy-en.md` mitprüfen) und das
  Paket mit Mozillas Add-on-Prüfung (`tests/addon_lint.py`, nur Fehler machen
  rot; erwartet ist der Hinweis auf die Experiment-API).
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
was den Mac braucht – Testläufe, Screenshots, Release –, geht so an neon;
Board und Bilder an `neon-board` (unten). Reihenfolge, bis einer klappt:

1. `ListAgents`, dann `SendMessage` an `neon` (die Remote-Control-Sitzung,
   die dort als LaunchAgent dauerhaft läuft, `tests/MAC-MINI.md` Abschnitt 12).
2. `list_sessions` (`mine: true`), Sitzung mit Titel `neon` suchen, dann
   `send_message` mit ihrer ID. Keine feste ID verwenden: nach einem Neustart
   von neon (`docs/neon-sitzung.md`) kann sich die ID ändern (Stand 6.11.2026
   `session_01BK9gbfo3oZh8yxoakmG4CD`, bei den bisherigen Neustarts gleich
   geblieben) – immer über `ListAgents` bzw. die Liste suchen.
3. Lehnt `send_message` mit einem `content_digest` ab
   (`confirm_repository_trust`), diese Freigabe sofort anfragen – die
   Claude-App fragt den Maintainer selbst – und danach erneut senden.
4. Fehlen die Werkzeuge, erst per `ToolSearch` laden (`SendMessage`,
   `ListAgents`, `mcp__claude-code-remote__list_sessions`,
   `…__send_message`, `…__confirm_repository_trust`).
5. Auf dem Laptop zusätzlich SSH über Tailscale (`tests/MAC-MINI.md`
   Abschnitte 4 und 7).

**Board und Bilder an `neon-board`** (Entscheidung des Maintainers vom 6.11.2026, Wortlaut in `ENTSCHEIDUNGEN.md`): Eine zweite
dauerhafte Remote-Control-Sitzung **`neon-board`** auf demselben Mac bedient
nur die Aufgabenliste (lesen, anlegen, ergänzen, Status, archivieren,
Doppelte prüfen) und speichert Bilder und Apple-Vorlagen
(`~/halo-aufgaben/bilder/`, `~/halo-aufgaben/apple/` mit `index.md`,
`bilder-offen.md`) – nie Tests, Builds, Thunderbird, Pushes oder Releases.
So erreichen Cloud-, Laptop- und iPhone-Sitzungen das Board auch, während
neon testet. Board-, Bild- und Vorlagen-Aufträge gehen zuerst an
`neon-board` (gleiche Wege 1–4 wie oben, Name bzw. Titel `neon-board`),
nur wenn sie auf keinem Weg antwortet an `neon`. Alles, was den Mac sonst
braucht (Tests, Screenshots, Release, Dateien außerhalb von
`~/halo-aufgaben`), geht weiter an `neon`. Läufe, die lokal auf neon
mit `gh` arbeiten (Nachtlauf, CI-Wächter, Wochen-/Doku-Prüfung, Rundgang,
GitHub-Kommunikation), bleiben, wie sie sind (Deutung in `ENTSCHEIDUNGEN.md`). `neon-board` arbeitet in
`~/halo-board` (Rolle in der dort erzeugten `CLAUDE.md`), hat eine eigene
Auftragsliste `~/halo-aufgaben/board-stand.md` und zählt für Nachtlauf,
Rundgang und Wochenprüfung nie als „belegt“. Einrichtung
`tests/MAC-MINI.md` Abschnitt 12.

**Sitzung nicht unter ihrem Namen gefunden?** Reihenfolge: Name in `ListAgents` → ähnlicher Name
(Teilstring, gleicher Arbeitsordner) → `list_sessions` nach Titel → zuletzt bekannte Sitzungs-ID
(`~/halo-aufgaben/sitzungen.json`); Einzelheiten und Skripthilfe `sitzung_finden`:
`docs/neon-sitzung.md`. Erst danach „nicht erreichbar“ melden.

Nie „neon nicht erreichbar“ melden, ohne alle passenden Wege versucht zu
haben; dann dem Maintainer sagen, welche Wege mit welcher Meldung
gescheitert sind. Ergebnisse von neon abwarten und weitergeben, nie selbst
erfinden. Sitzungen auf neon selbst sind neon – dort direkt arbeiten.

**Abgelehnte Antwort an eine Sitzung** (Entscheidung des Maintainers vom 7.11.2026, Wortlaut in `ENTSCHEIDUNGEN.md`):
wird eine Nachricht abgelehnt (z. B. `send_message` mit Sitzungs-ID: `elevated_session_untrusted_device`), sucht die
Sitzung selbstständig einen anderen Weg (`SendMessage` an den Namen aus `ListAgents`, Titel über `list_sessions`,
zuletzt bekannte ID, Reihenfolge wie unter „Sitzung nicht unter ihrem Namen gefunden?“), bis einer klappt; findet sie
keinen, meldet sie das mit den Fehlermeldungen zurück. Lehnt eine Sitzung die Anfrage einer anderen Sitzung
ab (auch teilweise, z. B. von der Berechtigungsprüfung gestoppt), schickt sie dieser Sitzung sofort jede Antwort
mit Grund als Rückmeldung (Entscheidung des Maintainers vom 7.11.2026).

**Antworten von neon:** neon antwortet per `SendMessage` an den Namen der Sitzung; es erscheint
als neue Nachricht, `send_message` aus neon scheitert. neon merkt sich die Sitzungs-ID und sucht
den aktuellen Titel erst beim Antworten; Auftraggeber geben ihrer Sitzung einen festen Titel
(Einzelheiten, Modus „Auto“: `docs/neon-sitzung.md`).

**neon schlank halten:** Alle Sitzungen teilen sich neons Kontext; was dort ankommt, verdrängt
anderes (Entscheidung des Maintainers vom 6.11.2026, Wortlaut in `ENTSCHEIDUNGEN.md`).

*Aufträge an neon (alle anderen Sitzungen):* Der Weg bleibt derselbe (oben).
- Nur, was den Mac braucht: Tests, Screenshots, Release, Dateien unter
  `~/halo-…`. Board und Bilder speichern gehen an `neon-board` (oben),
  `neon` nur als Ausweichweg. Code, Git-Verlauf, Issues, Pull
  Requests und CI-Läufe (`actions_list`, `get_job_logs`) liest jede Sitzung
  selbst.
- Eine Nachricht je Auftrag, vollständig: was, Zweig bzw. Commit, Port ab
  2850, was zurückkommen soll und in welcher Form („nur OK/FEHLER-Zeilen“,
  „nur die id“). Keine Rückfragen nach dem Stand, kein „danke“ – neon meldet
  sich von selbst.
- Board gezielt fragen („offene Einträge mit Titel `Kalender:`“), nicht die
  ganze Liste.
- Kennzeichen für das Modell, mit dem neon den Auftrag erledigt (siehe
  `docs/neon-sitzung.md`): `[opus]` erzwingt Opus (Code, Fehlersuche,
  Design, Analysen), `[sonnet]` erzwingt Sonnet (Routine); ohne Kennzeichen
  stuft neon selbst ein, im Zweifel Opus.
- Längere Aufträge bestätigt neon mit einer Nummer („#12 angenommen“), das
  Ergebnis kommt später als eigene Nachricht. Wer nachfragt, nennt die
  Nummer.

*Arbeitsweise von neon selbst* (Aufträge in `neon-stand.md`, Unteragenten, `tests/kurz.sh`,
Modelle Sonnet/Opus – im Zweifel Opus –, `/bereit`, `/clear` von Hand statt täglichem Neustart):
`docs/neon-sitzung.md`; die Sitzungen `neon` und `neon-board` lesen sie, der SessionStart-Hook
`tests/neon-hook.sh` weist darauf hin.

## Testrechner (Mac mini)

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
- Jeder Push auf `main` mit Thunderbird-Änderung belegt neon mit der CI (`mac`, `windows`) rund 50 Minuten,
  mit Dunkelmodus rund 70. Solange sie läuft (Prozess `Runner.Worker`), keine eigenen Testläufe
  starten – zwei Testfenster nehmen sich gegenseitig den Fokus. Änderungen an `.md`, `.claude/`,
  Abläufen auf neon und Release-Skripten brauchen keinen CI-Lauf (Entscheidung vom 6.11.2026,
  `ENTSCHEIDUNGEN.md`; Liste in `tests/ci-noetig.sh`).
- **Gesammelt pushen:** je Eintrag committen, erst am Ende eines Arbeitsblocks pushen; vorher nur die
  betroffenen Prüfungen (`python3 tests/halo_test.py --port 2851 --only "<Teil des Namens>"`, hell;
  dunkel nur bei Farben), kein Volllauf – den macht die CI, ihr Ergebnis danach prüfen.
- **Nicht Eiliges nimmt der Nachtlauf mit:** Sitzungen auf neon außerhalb des Nachtlaufs committen
  Fertiges, das nicht sofort auf GitHub muss, auf `main` in `~/halo-spaces` und pushen nicht; sofort
  pushen nur, wenn etwas davon abhängt (Release, Fix für Nutzer).
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
  Rotes aus seinen CI-Läufen trägt er selbst ins Board ein; lief in 24 Stunden keine vollständige
  Runde und pusht er nichts CI-Auslösendes, startet er nach seiner Arbeit (bis 04:30) selbst eine
  mit `ziel=alle` – die einzige erlaubte von Hand gestartete Runde während des Nachtlaufs, sie zählt
  als vollständig (Entscheidung vom 7.11.2026, `tests/ci-runde.zsh`, `docs/testrechner.md`). Zeigt ein
  späterer vollständiger Lauf derselben Nacht auf einem anderen Commit die rote Prüfung im selben Job
  grün, gilt sie als repariert: kein Eintrag (nur Zeile im Bericht), ein offener geht mit Notiz auf
  Done; grün auf demselben Commit heißt „flackert“ und zählt nicht (Entscheidung vom 7.11.2026,
  gilt auch für das Nachholen durch den CI-Wächter). Die übrigen
  Routinen (CI-Wächter, Wochenprüfung, Doku-Prüfung, Rundgang) und die Windows-VM stehen in
  `docs/testrechner.md`; Windows-Abweichungen wie Linux behandeln.

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
5.11.2026). Tagsüber (außerhalb des Nachtlaufs) veröffentlicht eine
Sitzung nur, was Nutzer gerade spüren (Fix für einen gemeldeten oder
spürbaren Bug); alles andere geht ins Release des Nachtlaufs (Entscheidung
des Maintainers vom 5.11.2026). Ablauf: Versionshinweise im `README.md` schreiben (eigener
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
übersprungen, solange seitdem nichts geändert wurde, was Thunderbird direkt
betrifft (`tests/ci-noetig.sh`, siehe „CI nur für Thunderbird“); `FORCE_TESTS=1` testet trotzdem). Bei einem
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

- **Zeit:** Zeitangaben gegenüber dem Maintainer immer in Wiener Zeit (nicht UTC); Zeitstempel in Logs, Dateien und auf GitHub dürfen UTC bleiben, werden aber beim Berichten umgerechnet (Entscheidung vom 7.11.2026).
- **Im Zweifel wie Apple:** Ist bei Design oder Verhalten etwas unklar, die
  entsprechende Apple-App nachahmen (Mail, Kontakte, Kalender) – Aussehen,
  Platzierung, Vorgaben und Bedienung – statt eigene Lösungen zu erfinden.
  Vorlagen dafür: siehe „Apple-Vorlagen“ unter „Aufgabenliste“.
- **Optionen nur in sehr seltenen Fällen:** halo.spaces ist ein Design, kein
  Baukasten. Eine Einstellung gibt es grundsätzlich nur dort, wo auch die
  Apple-App eine anbietet; Wünsche nach „Thunderbird wie vorher“ (originale
  Menüleiste, Tabs) werden abgelehnt – der Weg dorthin ist das Entfernen
  von halo.spaces (Entscheidung des Maintainers vom 4.11.2026).
- **Sprache:** Code-Kommentare, Commit-Nachrichten und Skriptausgaben auf
  Deutsch; `README.md` und Store-Texte auf Englisch (Store zusätzlich `listing-de.md`).
- **Commit-Nachrichten:** ein Satz, Bereich vorneweg (`Mailkopf: …`,
  `Today-Pane: …`, `Tests: …`), beschreibt sichtbares Verhalten, mehrere
  Änderungen mit `;` getrennt. Behebt er ein GitHub-Issue, endet er auf
  „(GitHub #n)“, ein Teil-Fix auf „(GitHub #n, teilweise)“ (wird nie
  geschlossen); `publish.sh` schließt damit beim Release (`docs/github-komm.md`
  „Status“, Entscheidung des Maintainers vom 7.11.2026).
- **CSS:** eigene Variablen mit Präfix `--mt-` (Farben, Radien, `--mt-hairline`),
  Werte für Hell und Dunkel; Akzent über `AccentColor` vom System. Keine
  sichtbaren Scrollbalken. Maße und Abstände orientieren sich an Apple Mail.
  Formen (Entscheidung des Maintainers vom 5.11.2026): Knöpfe und
  Suchfelder als Kapsel wie bei Apple; übrige Eingabefelder mit kleinem
  Radius und Haarlinie. Suchfelder haben keinen Hover-Zustand: Weder
  das Feld noch die Lupe ändert beim Überfahren Farbe oder Form, die
  Lupe bekommt keine eigene Fläche bzw. Umrandung innerhalb der Kapsel
  (anders als Symbol-Knöpfe in Kapseln); erst der Fokus (Klick ins
  Feld) zeigt den blauen Fokusring.
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
die Sitzung `neon-board`, ersatzweise `neon` (Abschnitt „Cloud-Sessions“). Das Board wird nicht
automatisch geladen: erst zu Beginn eines Laufs (nach Schritt 1 der Reihenfolge unten) gezielt abrufen
(`tests/board.sh liste [Muster]` bzw. über `neon-board`). Der SessionStart-Hook auf neon lädt nur die
offenen Aufträge aus `neon-stand.md`.

- Die Liste ist die Vorlage für die Arbeit: offene Einträge berücksichtigen
  und passende Aufgaben nennen – in der Reihenfolge unten.
- **Reihenfolge eines Laufs** (Entscheidung des Maintainers vom 4.11.2026,
  abends; gilt für jede Sitzung, die die Liste abarbeitet, 5.11.2026):
  1. neue bzw. nicht gepushte Commits durchsehen (Regeln dieser
  Datei, offensichtliche Fehler), 2. erst dann die Aufgabenliste laden und
  offene GitHub-Issues/Pull Requests prüfen (siehe „GitHub-Issues und Pull Requests von Nutzern“, `docs/github-komm.md`), 3. Bugs,
  4. einfache Features, 5. zuletzt Reihen (n/m) – Einzelheiten unter
  „Reihenfolge beim Abarbeiten“ (der Nachtlauf-Auftrag wiederholt sie für
  den Lauf; bei Änderungen beide Stellen anpassen).
- **Wer die Liste abarbeitet** (Entscheidung des Maintainers vom 5.11.2026):
  Der Nachtlauf immer von sich aus. Jede andere Sitzung nur, wenn der
  Maintainer sie dazu auffordert (ganze Liste oder einzelne Einträge) – dann
  in der Reihenfolge oben, ohne weitere Rückfrage je Eintrag. Tagsüber dürfen
  so Bugs und Features umgesetzt werden: je Eintrag committen, gepusht wird
  gesammelt am Ende eines Arbeitsblocks (siehe „Testrechner“), veröffentlicht
  nur Dringendes (siehe „Release“) – Entscheidung des Maintainers vom 5.11.2026.
- **Regeländerungen wöchentlich bündeln** (Entscheidung des Maintainers vom
  5.11.2026): Ideen für Abläufe und Regeln dieser Datei sammelt jede Sitzung
  als Eintrag „Ablauf: …“ mit Status „Wartet auf OK“, statt sie gleich
  umzusetzen. Der Maintainer entscheidet sonntags mit der Wochenprüfung; die
  freigegebenen werden dann in einem Commit übernommen. Ausnahme: Sicherheit
  und Datenschutz (sofort). Eine Entscheidung, die der Maintainer im Gespräch
  ausdrücklich trifft, gilt wie bisher gleich.
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
- Neue Bugs/Wünsche aus dem Gespräch sofort und ohne Rückfrage als Entwurf anlegen (Typ setzen,
  Status Todo; ein Zitat des Maintainers darin erst nach seiner Zustimmung, siehe „Zitate erst
  nach Zustimmung“). Ursache klären und Lösungsidee in den Eintrag schreiben ist erwünscht, aber nicht
  mitten in der laufenden Aufgabe nebenbei umsetzen und nicht anbieten; umgesetzt wird er wie jeder
  Eintrag über die Liste („Wer die Liste abarbeitet“). Gehört der Punkt zu einem offenen Eintrag,
  diesen ergänzen. Jeder Screenshot, den der Maintainer ins Gespräch legt, geht automatisch an `neon-board`
  (ersatzweise `neon`) und wird dort mit sprechendem Namen gespeichert (7.11.2026); Screenshots von Apple-Apps zusätzlich als Vorlage; Bilder nie über das Repo
  (echte Mails). **Bildübergabe aus Cloud-/Laptop-/iPhone-Sitzungen (Entscheidung des Maintainers vom 7.11.2026):** Bild als eigene Datei
  neben einer minimalen privaten `Artifact`-Seite (`files`), Nachricht an `neon-board` mit Link, Dateiname, SHA-256 und
  Zielname; `neon-board` liest mit `action: "read"` und `path` (rund 150 statt 60.000 Tokens); nie als data:-URI in der
  Seite, nie als base64 in der Nachricht. Qualitätsprüfung, Namen, Einzelheiten: `docs/board.md`.
- **Bilder-Erinnerung** (Entscheidung des Maintainers vom 5.11.2026): Jede von Hand gestartete Sitzung
  zwischen 08:00 und 22:00 (Wiener Zeit) nennt in ihrer ersten Antwort die offenen Bilder aus
  `~/halo-aufgaben/bilder-offen.md` (Cloud/Laptop: bei `neon-board` erfragen); nie in automatischen
  Läufen. Einzelheiten: `docs/board.md`.
- Bei Arbeitsbeginn Status In Progress; nach dem Commit Notiz mit
  Commit-Hash („committet, wartet auf Push/CI“), Status bleibt In Progress
  (gepusht wird gesammelt, siehe „Testrechner“). Erst wenn der Commit auf
  `main` ist und die CI dazu grün war: Status Done, dann archivieren. Das
  übernimmt, wer pusht und die CI prüft (Nachtlauf, Cloud-Session über
  `neon-board`, ersatzweise `neon`).
  Wird ein Commit bei roter CI zurückgenommen (`git revert`), bleibt der
  Eintrag offen mit Notiz zum Grund. Teilweise Erledigtes bleibt
  In Progress mit Notiz, was fehlt.
- **Höchstens drei Einträge in Arbeit je Sitzung** (Entscheidung des
  Maintainers vom 5.11.2026): gleichzeitig In Progress, an denen gerade
  gearbeitet wird; Einträge mit Notiz „committet, wartet auf Push/CI“ zählen
  nicht mit. Am Ende eines Laufs bzw. einer Sitzung geht, woran nicht mehr
  gearbeitet wird und was nicht committet ist, mit Notiz zum Stand zurück
  auf Todo.
- **Entscheidungen des Maintainers wörtlich** (Entscheidung des
  Maintainers vom 5.11.2026, gilt sofort; der Wortlaut jeder Entscheidung
  steht in `ENTSCHEIDUNGEN.md`, neue Entscheidungen dort eintragen): Jede Sitzung schickt eine
  Entscheidung des Maintainers – nach seiner Zustimmung (siehe nächster
  Punkt) – an `neon-board` (ersatzweise `neon`) bzw. trägt sie selbst ein –
  mit seinem Wortlaut als Zitat und der Herkunft (Sitzung/Titel, Datum),
  keine Umschreibung. Board-Notizen zu Entscheidungen enthalten dieses Zitat
  unverändert. Ein späterer Vermerk darf eine Entscheidung nur ändern oder
  aufheben, wenn er ein neues Zitat des Maintainers mitbringt; sonst
  Rückfrage beim Maintainer. Wer Stände aus dem Board weitergibt (an
  Sitzungen oder den Maintainer), zitiert die Notiz statt sie
  zusammenzufassen; eigene Deutungen als solche kennzeichnen.
- **Zitate erst nach Zustimmung, Konzeptrunden ohne neon** (Entscheidung
  des Maintainers vom 6.11.2026, Sitzung halo-spaces-72, Wortlaut in `ENTSCHEIDUNGEN.md`):
  Während einer Konzeptrunde (Vorschaubilder, Varianten, Zwischenmeinungen)
  geht nichts an neon oder neon-board. Ein Zitat des Maintainers – auch für neue Einträge
  und Entscheidungen – übermittelt eine Sitzung erst, wenn er zugestimmt
  hat (z. B. „ja, so an neon“); dann einmal, wörtlich, mit dem Ergebnis.
  Abfragen von Informationen bei neon bzw. neon-board (Board lesen, Code-Stand, Messungen)
  gehen weiter ohne Rückfrage. Die Bildübergabe (oben) bleibt automatisch.
- Inhalte der Liste nie öffentlich machen: keine Verweise in Commits,
  README, Store-Texten oder öffentlichen Issues.

- Board: <https://github.com/users/sruf79/projects/1> (Nummer `1`, Besitzer `sruf79`), Einträge sind
  Entwürfe; Feld-IDs, `gh project …`-Befehle, Titelform und Zugang aus Cloud-Sitzungen (nur über
  `neon-board`, ersatzweise `neon`; Notweg Workflow `add-task.yml`): `docs/board.md`. Das Repo ist
  öffentlich: den Workflow nie so ändern, dass er Titel oder Text ins Log schreibt.

### Cloud-Sessions

In Cloud-Sessions geht `gh project …` nicht (GraphQL gesperrt): **Alles am Board – lesen, neu anlegen,
ergänzen, Status ändern, archivieren – geht aus Cloud-Sessions immer über die Sitzung `neon-board`,
ersatzweise `neon`** (Entscheidung des Maintainers vom 4.11.2026, Wortlaut in `ENTSCHEIDUNGEN.md`,
Weg: „neon erreichen“). Im Auftrag nennen, was anzulegen oder zu ändern ist und was zurückgemeldet
werden soll; bis zur Antwort nichts als erledigt melden. Entscheidungen des Maintainers mit Wortlaut
und Herkunft schicken. Notweg ohne neon-board und neon und Einzelheiten: `docs/board.md`.

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
HEAD:main`; den eigenen Zweig `claude/…` stehen lassen – der Nachtlauf
löscht Zweige `claude/…` ohne eigene Commits über `main` hinaus und ohne
offenen Pull Request (Entscheidung des Maintainers vom 7.11.2026, ersetzt
das Löschen durch die Sitzung vom 5.11.2026). Dabei:

- Gesammelt pushen wie unter „Testrechner“ (je Eintrag committen, einmal am
  Ende pushen).
- Vorher die betroffenen Prüfungen über neon laufen lassen (`--only`, Zweig
  nennen), wenn neon erreichbar und frei ist; sonst ohne und das im Gespräch
  sagen. Den Volllauf macht die CI, Rot meldet der CI-Wächter.
- Push-Sperre 01:30–09:00 und ab 00:00 kein Push mit Codeänderung: wie
  unter „Testrechner“.
- Release: siehe „Release“ (nur auf neon); den Board-Status über
  `neon-board` (ersatzweise `neon`) oder den Maintainer pflegen.

## GitHub-Issues und Pull Requests von Nutzern

Die Kommunikation mit Nutzern auf GitHub übernimmt der Agent selbstständig; **Ablauf, Labels,
Forks, Nachsehen und die feste Routine: `docs/github-komm.md` (vor jeder Bearbeitung lesen).**

- Bei jedem Arbeitsblock mit Bugs/Features offene Issues und Pull Requests prüfen (Schritt 2 der
  „Reihenfolge eines Laufs“), neue oder geänderte kurz nennen. Fix auf `main` mit grüner CI: dem
  Nutzer antworten (GitHub-Routine, Liste aus `tests/issue-abgleich.sh`), das Issue erst beim
  Release mit „Fixed in x.y.z“ schließen (`publish.sh`).
- Pull Requests mergen, schließen oder Teile übernehmen nur mit Freigabe des Maintainers.
- Ton und Inhalt: Englisch, freundlich, knapp; nie auf die private Aufgabenliste verweisen, keine
  Interna (Testrechner, VM, Tokens), keine Zusagen zu Terminen.

## Datenschutz

Screenshots mit echten Mails/Kontakten (`vorschau-*.png`, `reddit/`,
`vorher-nachher/`, `logo-ideen.png`) sind lokal und gitignored – nicht
committen und nicht in README oder Store verwenden. Veröffentlichte
Screenshots stammen aus dem Testprofil oder sind unkenntlich gemacht.
