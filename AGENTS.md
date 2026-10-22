# AGENTS.md

Hinweise für KI-Agenten (Claude Code, Codex, …), die an halo.spaces arbeiten.
Für Nutzer siehe `README.md`, für den Store `store/README.md`.

## Worum es geht

halo.spaces gibt Thunderbird (128+) unter macOS einen ruhigen Look im Stil von
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
| `extension/*.css` | zusätzliche Stilblätter der Erweiterung (`parts.css`, `noscroll.css`, `plaintext.css`, `icon-vars.css`) |
| `extension/icons/` | Apple-artige Ersatzsymbole |
| `extension/about/`, `extension/options/` | Fenster „Hilfe → halo.spaces…“ und Einstellungsseite |
| `tests/halo_test.py` | automatischer Test per Marionette in frischem Profil |
| `tests/beta.sh` | gleicher Test mit Thunderbird Beta |
| `tests/mac-mini-setup.sh`, `tests/mac-runner-hook.sh`, `tests/MAC-MINI.md` | Mac mini als Testrechner: Prüfen/Einrichten, Wächter für den GitHub-Runner, Anleitung |
| `store/` | Texte, Screenshots und Upload-Skript für addons.thunderbird.net |
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
- Thunderbird muss unter `/Applications/Thunderbird.app` liegen (sonst `--tb`).
- Testfenster, die macOS verdeckt, pausieren Animationen – Animationsprüfungen
  überspringen diesen Fall bewusst.
- CI (`.github/workflows/test.yml`) läuft unter Linux mit xvfb gegen Release
  und Beta; Linux-spezifische Abweichungen der Toolbar sind dort Warnungen.
- Nach UI-Änderungen: passende Prüfung in `run_checks()` ergänzen, besonders
  an Stellen, an denen es schon Rückschritte gab.

Zum Ausprobieren im echten Profil: `./install.sh` (Thunderbird vorher beenden).
Das betrifft das echte Profil des Nutzers – nur auf ausdrücklichen Wunsch.

## Testrechner (Mac mini)

Ein Mac mini übernimmt die Tests rund um die Uhr (Anleitung: `tests/MAC-MINI.md`):
eigener Standardbenutzer ohne echte Mails mit automatischer Anmeldung, erreichbar
nur über Tailscale (keine Portfreigabe), Claude Code per SSH aus der Desktop-App.

- `tests/mac-mini-setup.sh --check` prüft den Rechner (Ruhezustand, Thunderbird,
  Python, Bildschirm, Rechte, Anmeldung, Tailscale, SSH, Runner) und ändert
  nichts; ohne `--check` richtet es ein, was ohne Passwort geht, und macht einen
  Probelauf.
- Marionette-Ports: 2839 Standard, 2845 CI-Job `mac`, ab 2850 für Läufe von Hand
  und parallele Sitzungen (`--port`).
- Job `mac` in `.github/workflows/test.yml` (self-hosted, Label `halo-mac`) läuft
  nur bei Push auf `main` und von Hand – nie bei `pull_request`, weil das Repo
  öffentlich ist. Die `if:`-Bedingung nicht lockern; auf dem Mac weist zusätzlich
  `tests/mac-runner-hook.sh` alles andere ab.

## Release (nur auf ausdrücklichen Wunsch)

```bash
./release.sh 3.1.0              # Version, update_url, Tests hell/dunkel + Beta, updates.json
./publish.sh 3.1.0 notes.md     # commit, push, GitHub-Release, Hash-Prüfung, ggf. ATN-Upload
```

`publish.sh` committet **alles** (`git add -A`), pusht und veröffentlicht –
nie ohne Freigabe ausführen. Zwischen `release.sh` und `publish.sh` darf nicht
neu gebaut werden, sonst passt der Hash in `updates.json` nicht mehr und
Thunderbird lehnt das Update ab. Vor einem Release die Versionshinweise im
`README.md` aktualisieren (eigener Commit „README: Versionshinweise x.y.z“).
`store/max-version` mit neuen Thunderbird-Versionen anheben (nach Test).

## Konventionen

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
Lokal direkt über `gh project …` (siehe unten); in Cloud-Sessions über den
Workflow `add-task.yml` (Abschnitt „Cloud-Sessions“). Auf dem Testrechner lädt ein lokaler
SessionStart-Hook die offenen Einträge in jede Sitzung.

- Die Liste ist die Vorlage für die Arbeit: zu Beginn offene Einträge
  berücksichtigen und passende Aufgaben nennen.
- Nur Bugs/Wünsche eintragen, die der Maintainer ausdrücklich als solche
  meldet oder eintragen lässt – dann sofort und ohne Rückfrage als
  Entwurf anlegen (Typ setzen, Status Todo). Laute Überlegungen, Ideen
  und Fragen im Gespräch sind keine Einträge; im Zweifel nichts anlegen
  (höchstens fragen). Einträge lassen sich aus Cloud-Sessions nicht
  wieder löschen. Screenshots liegen in
  `~/halo-aufgaben/bilder/` (der Maintainer schickt sie mit `halobild <name>`,
  siehe `tests/MAC-MINI.md` Abschnitt 10, und nennt im Gespräch nur den Namen).
  Ursache klären und Lösungsidee in den Eintrag
  schreiben ist erwünscht – aber nicht gleich umsetzen und auch nicht
  anbieten; umgesetzt wird nur, wenn der Maintainer einen Eintrag zum
  Abarbeiten nennt. Gehört der Punkt zu einem offenen Eintrag, diesen
  ergänzen statt einen neuen anzulegen.
- Bei Arbeitsbeginn Status In Progress; nach Commit und Push Status Done
  mit Commit-Hash als Notiz, dann archivieren. Teilweise Erledigtes bleibt
  In Progress mit Notiz, was fehlt.
- Inhalte der Liste nie öffentlich machen: keine Verweise in Commits,
  README, Store-Texten oder öffentlichen Issues.

- Board: <https://github.com/users/sruf79/projects/1> (Nummer `1`, Besitzer
  `sruf79`). Die Einträge sind Entwürfe im Board (Draft Issues), keine
  Issues im Repo.
- Titel auf Deutsch im Commit-Stil: `Bereich: kurze Beschreibung`
  (z. B. `Kalender: …`, `Mailliste: …`), Details in den Text.
- Lokal: Zugriff über `gh` mit Scope `project`.

```bash
gh project item-list 1 --owner sruf79 --limit 200 --format json      # lesen
gh project item-create 1 --owner sruf79 --title "Bereich: …" --body "…" --format json   # neu, liefert die id
gh project item-edit --project-id PVT_kwHODEPpks4BoBQw --id <id> \
  --field-id <Feld> --single-select-option-id <Option>                 # Typ/Status setzen
```

| Feld | Feld-ID | Optionen |
|---|---|---|
| Typ | `PVTSSF_lAHODEPpks4BoBQwzhmjN8Y` | Feature `39bb4253`, Bug `ff678ae2` |
| Status | `PVTSSF_lAHODEPpks4BoBQwzhmjN5E` | Todo `f75ad846`, In Progress `47fc9ee4`, Done `98236657` |

### Cloud-Sessions

In Cloud-Sessions ist die GraphQL-API gesperrt, `gh project …` geht dort
nicht – auch nicht mit Token. Neue Einträge stattdessen über den Workflow
anlegen (läuft auf GitHub, Token im Secret `HALO_SPACES_TASKS_TOKEN`):

```bash
gh workflow run add-task.yml -R sruf79/halo-spaces \
  -f title="Bereich: …" -f body="…" -f type=<bug|feature> -f status=Todo
gh run list -R sruf79/halo-spaces -w add-task.yml -L 1   # Lauf erfolgreich?
```

Lesen und Status ändern gehen in Cloud-Sessions nicht; das erledigt der
Maintainer im Board. Das Repo ist öffentlich: Der Workflow schreibt Titel
und Text bewusst nicht ins Log – das beim Ändern beibehalten.

## Datenschutz

Screenshots mit echten Mails/Kontakten (`vorschau-*.png`, `reddit/`,
`vorher-nachher/`, `logo-ideen.png`) sind lokal und gitignored – nicht
committen und nicht in README oder Store verwenden. Veröffentlichte
Screenshots stammen aus dem Testprofil oder sind unkenntlich gemacht.
