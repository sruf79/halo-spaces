# neon sichern und ersetzen

Stand 12.11.2026. Wenn der Mac mini neon ausfällt (Hardware, Diebstahl, Wasserschaden), soll das Projekt
schnell weiterlaufen. Nicht erprobt: Die Zeiten sind Schätzungen, ein Probelauf steht aus.

## 1. Sicherung (eingerichtet 12.11.2026)

- Time Machine auf die externe Platte „neon.backup“, stündlich. Sichert den ganzen Rechner, darunter
  `~/.claude` (Anmeldung, Hooks, Gedächtnis), `~/.config/halo-spaces`, `~/halo-*`, die Anmeldedaten von
  `gh` und Tailscale, die Runner-Konfiguration.
- Platte verschlüsseln (Schloss am Ziel in Systemeinstellungen → Time Machine): Anmeldedaten und Screenshots
  mit echten Mails liegen darauf.
- Die Windows-VM (Parallels) nach Möglichkeit ausschließen (Time Machine → Optionen) und neu aufsetzen
  (`tests/MAC-MINI.md` Abschnitt 11); eine große, ständig geänderte Datei sichert Time Machine schlecht.
- Nach dem ersten Backup einen Wiederherstellungstest machen (eine unwichtige Datei aus `~/halo-berichte`).
- Was auf GitHub liegt (Code, Verlauf, Issues, Board, Releases, `updates.json`), braucht keine Sicherung.
  Nicht gepushte lokale Commits liegen nur auf neon: Der Nachtlauf pusht täglich (01:30).

## 2. Ersatz mit Time-Machine-Sicherung (schnellster Weg)

1. Neuen Mac mini beziehen, beim ersten Start über den Migrationsassistenten „von Time Machine“
   wiederherstellen (gleicher Benutzername wie bisher).
2. `tests/mac-mini-setup.sh --check` im Testbenutzer ausführen: jede `OFFEN`-Zeile nennt den Befehl bzw.
   die Stelle in den Systemeinstellungen. Rechte (Bildschirmaufnahme, Bedienungshilfen für `halo-zsh`),
   automatische Anmeldung, Ruhezustand und Fernzugriff müssen meist neu bestätigt werden.
3. Anmeldungen prüfen: Tailscale, `gh auth status`, Claude Code; Runner mit `cd ~/actions-runner &&
   ./svc.sh status` (bei neuem Gerät neu registrieren, `tests/MAC-MINI.md` Abschnitt 8).
4. LaunchAgents prüfen (`~/.config/halo-spaces/notfall.sh status`); Nachtlauf, CI-Wächter und Routinen laden
   nur nach Freigabe des Maintainers.
5. Windows-VM neu aufsetzen (Abschnitt 11), erst dann Windows-Prüfungen und Release auf neon.

## 3. Ersatz ohne Sicherung (langsamer Weg)

1. Repo klonen, `tests/MAC-MINI.md` von Abschnitt 1 an durchgehen, `tests/mac-mini-setup.sh` ausführen.
2. Aus Gedächtnis und Doku neu: Anmeldungen, Hooks (`~/.claude/settings.json`), LaunchAgents, Konfiguration
   (`~/.config/halo-spaces/*.conf`), Runner, VM. Verloren sind: Berichte, Bilder-Eingang, nicht gepushte Commits,
   Gedächtnis-Dateien, Stand der GitHub-Kommunikation.

## 4. Bis neon wieder läuft

- Entwickeln geht auf jedem Gerät mit dem Klon (Laptop-Hook für Tests und Builds vorher aufheben).
- Prüfzweige `pruef/<name>` laufen weiter auf GitHub (Linux, statisch); Mac- und Windows-CI fehlen.
- Releases: `release.sh` und `publish.sh` laufen nur auf neon; bis dahin nur Notfall-Release von Hand
  (`docs/notfall.md`, startet nur der Maintainer).

## 5. Grobe Zeiten (Schätzung, nicht gemessen)

| Schritt | mit Sicherung | ohne Sicherung |
|---|---|---|
| Entwickeln am Laptop | sofort | sofort |
| Test- und CI-Betrieb auf neuem Mini | einige Stunden | ein bis zwei Tage |
| Windows-VM und Windows-CI | ein bis mehrere Tage (VM neu) | ein bis mehrere Tage |

## 6. Zu klären

- Liegt die Windows-VM auf dem Systemlaufwerk oder woanders (Systemlaufwerk belegt nur etwa 13 GB)?
- Zweites Ziel außer Haus für `~/halo-aufgaben`, `~/halo-berichte`, `~/.config/halo-spaces` (verschlüsselt)?
- Wiederherstellungstest durchführen und hier mit Datum eintragen.
