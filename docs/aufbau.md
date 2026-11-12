# aufbau.md

Aufbau des Repos, offizielle Thunderbird-Doku, erzeugte Dateien und Konventionen in voller Länge, aus `AGENTS.md` ausgelagert (9.11.2026). Bei Bedarf lesen.

## Vollständiger Wortlaut aus `AGENTS.md` (Stand 9.11.2026, vor der Kürzung)

Bei der Kürzung von `AGENTS.md` (9.11.2026, Ablauf-Analyse Stufe 5) unverändert hierher verschoben; nur die Überschriften stehen eine Ebene tiefer. Verweise wie „oben“, „unten“ oder „dieser Datei“ meinen das damalige `AGENTS.md`. Die Kurzfassung für jede Sitzung steht im Kern `AGENTS.md`; Wortlaute der Entscheidungen: `ENTSCHEIDUNGEN.md`.

### Aufbau

| Pfad | Inhalt |
|---|---|
| `chrome/userChrome.css` | Design für Mail, Menüs, Dialoge (~15.000 Zeilen) |
| `chrome/spaces.css` | Kalender, Aufgaben, Adressbuch, Chat, Einstellungen |
| `chrome/merge_spaces.py` | fügt `spaces.css` als markierten Block in `userChrome.css` ein |
| `extension/manifest.json` | Version, Add-on-ID `mail-cards@sebastian.local`, `update_url` |
| `extension/api/implementation.js` | Experiment-API `mailCards` – die eigentliche Logik (~22.400 Zeilen); lädt ihre Teile aus `extension/api/` mit `loadPart()` (bisher `texte.js`: Oberflächentexte `DE`, `FR`, `ES`, `IT`; `mail.js`: Mail-Zusätze wie Senden rückgängig, Später senden, Erinnern; `bereiche.js`: Bereiche und Hinweise wie Danke sagen, Wetter, Reihenfolge der Bereiche, fünfter Bereich, Update-Hinweis) |
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
| `tests/logik/` | schnelle Logik-Tests ohne Thunderbird (Node, `node --test tests/logik/*.test.mjs`, Sekunden): `lader.mjs` lädt `implementation.js` mit Attrappen für Thunderbirds Grundobjekte und reicht die Namen aus `OFFEN` heraus; `bekannt.mjs`: offene Bugs als `bekannterFehler(…)`, grün solange der Fehler besteht, rot sobald er behoben ist (in `halo_test.py`: `check(…, bekannt=True)`) |
| `tests/adressen.py`, `tests/addon_lint.py` | Prüfungen ohne Thunderbird (CI-Job `statisch`): nur erlaubte Adressen im Netz (Datenschutz, Erlaubt-Liste im Skript); Mozillas Add-on-Prüfung (addons-linter) |
| `tests/testserver.py` | lokaler IMAP-/SMTP-Testserver (nur 127.0.0.1, erfundene Daten) für die Prüfungen mit Testkonto |
| `tests/ui_tour.py` | Rundgang: Bilder aller Oberflächen (Design-Durchsicht), mit `--messung` (`tests/tour-messung.js`) auch Messwerte je Oberfläche |
| `tests/rundgang-woche.sh`, `tests/rundgang-auftrag.md`, `tests/rundgang_vergleich.py` | wöchentlicher Design-Rundgang: Aufnahme, Vergleich mit der Vorwoche, Ausreißer ins Board, `tests/MAC-MINI.md` Abschnitt 17 |
| `tests/store_shots.py` | Bilder für README und Store aus frischem Testprofil (erfundene englische Mails, Kontakte mit gezeichneten Bildern, Termine) |
| `tests/beta.sh` | gleicher Test mit Thunderbird Beta |
| `tests/mac-mini-setup.sh`, `tests/mac-runner-hook.sh`, `tests/MAC-MINI.md` | Mac mini als Testrechner: Prüfen/Einrichten, Wächter für den GitHub-Runner, Anleitung |
| `tests/nachtlauf.sh`, `tests/nachtlauf-auftrag.md` | nächtlicher Arbeitslauf auf neon (Liste abarbeiten, CI abwarten, veröffentlichen, Bericht aufs iPhone), `tests/MAC-MINI.md` Abschnitt 13 |
| `tests/ci-waechter.sh`, `tests/ci-warten.sh`, `tests/ci-noetig.sh` | rote CI-Läufe ins Board, ohne Meldung aufs iPhone (alle 15 Min., Entscheidung vom 7.11.2026); auf den CI-Lauf eines Commits warten, Abschnitt 14; braucht eine Änderung überhaupt CI (nur Thunderbird-Dateien) |
| `tests/wochenpruefung.sh`, `tests/wochenpruefung-auftrag.md` | wöchentliche Auswertung der Läufe (ISO-Wochen, feste Kennzahlenliste) mit höchstens drei Empfehlungen als Board-Einträge „Ablauf: …“, ändert Abläufe nicht selbst, Abschnitt 15 |
| `tests/dokupruefung-auftrag.md` | wöchentliche Prüfung aller `.md`-Dateien (`wochenpruefung.sh --doku`), Abschnitt 16 |
| `tests/farben-betroffen.sh` | betrifft eine Änderung Farben? Nur dann testet CI-Job `mac` bzw. `release.sh` auch dunkel |
| `tests/board.sh`, `tests/kurz.sh`, `tests/neon-stand.sh`, `tests/neon-hook.sh` | neon schlank halten: knapper Board-Zugriff; Befehl mit Kurzfassung statt voller Ausgabe; offene Aufträge als Datei; SessionStart-Hook, der sie nach dem Verdichten wieder lädt (Abschnitt „neon erreichen“) |
| `tests/bilder-eingang.zsh`, `tests/bilder_eingang_test.zsh` | Bilder-Eingang: sortiert `~/halo-aufgaben/eingang/` alle 15 Min. ohne Claude nach `bilder/` bzw. `apple/` und indiziert (Claude nur zum Beschreiben), `tests/MAC-MINI.md` Abschnitt 18; Prüfung ohne Claude, läuft in der Doku-Prüfung |
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
| `docs/neon-ersetzen.md` | neon sichern (Time Machine) und bei Ausfall ersetzen: Reihenfolge, Zeiten (Schätzung), offene Punkte |
| `docs/testrechner.md` | Testrechner-Einzelheiten: Mac-mini-Prüfung, CI-Laufzeiten, Dunkelmodus, Nachtlauf, CI-Wächter, Wochen-/Doku-Prüfung, Rundgang, Windows-VM, Modelle der Routinen; Sperren in `AGENTS.md` |
| `docs/dauerfreigaben.md` | Stufen A bis D: was neon und die Routinen ohne Rückfrage tun dürfen, was nur der Maintainer entscheidet |
| `docs/umbau.md` | Umbau der Abläufe (November 2026): Maßnahmen M01–M31, Messplan 6.12.2026, Rücknahme je Stufe |
| `tests/sitzung-finden.zsh` | `sitzung_finden`/`sitzung_merken`: lokale Sitzung auch bei abweichendem Namen finden (Teil von `lauf-hilfen.zsh`, Sitzungs-IDs in `~/halo-aufgaben/sitzungen.json`) |
| `tests/pausen_test.zsh`, `tests/pausen_check.sh` | Pausen-Logik (`~/halo-nacht/pausen.txt`, `pause_start`): Einzelfälle ohne Claude; Wächter gegen Reste alter Pausen-Dateien, läuft in der Doku-Prüfung |
| `tests/doku_kern_check.sh` | Wächter: harte Sperren und Pflichtbegriffe stehen in `AGENTS.md`, keine `@`-Importe; läuft in der Doku-Prüfung (`wochenpruefung.sh --doku`) |
| `store/` | Texte, Screenshots und Upload-Skript für addons.thunderbird.net (Upload ausgesetzt, siehe `store/README.md`) |
| `updates.json` | Update-Manifest, das Thunderbird von GitHub abfragt |

### Offizielle Thunderbird-Doku

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

### Erzeugte Dateien – nicht von Hand bearbeiten

- **`extension/theme.css`** wird von `build.sh` aus `chrome/userChrome.css` kopiert (gitignored).
- **Der Bereiche-Block in `chrome/userChrome.css`** (zwischen
  `/* ==== Bereiche: … ==== */` und `/* ==== Ende Bereiche ==== */`) wird bei
  jedem Build aus `chrome/spaces.css` überschrieben. Änderungen an Kalender,
  Aufgaben, Adressbuch, Chat oder Einstellungen gehören in `spaces.css`.
- `dist/`, `*.xpi`, `tests/shots/` sind Build-/Testausgaben.
- `updates.json` und die Version in `manifest.json` setzt `release.sh` – nicht manuell ändern.

### Konventionen

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
  deutsche Übersetzung steht in der Tabelle `DE` in `extension/api/texte.js` –
  neue Texte dort ergänzen.
- **Einstellungen:** Prefs unter `extensions.mailcards.*` (der alte Name
  „mail-cards“ bleibt aus Kompatibilitätsgründen, auch in der Add-on-ID).
- **Store-Regeln:** kein `innerHTML` mit Markup (stattdessen DOM-API bzw.
  `DOMParser`), keine Emojis/4-Byte-Zeichen in Store-Texten.
- Debug-Ausgaben nur bei `extensions.mailcards.debug = true`.
