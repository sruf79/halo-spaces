# Notfallplan (Plan B)

Gilt für jede Sitzung und jede Routine von halo.spaces. Kopie außerhalb des Repos: `~/NOTFALL.md` auf neon und auf dem Laptop (für den Fall, dass das Repo selbst betroffen ist). Wird diese Datei geändert, beide Kopien gleich mitziehen. Adressen, Hostnamen und Zugänge stehen hier bewusst nicht; Wege zu neon: `tests/MAC-MINI.md` Abschnitte 4, 7 und 12.

Eingeführt mit der Ablauf-Analyse vom 8.11.2026 (Stufe 0, vom Maintainer freigegeben), bevor Abläufe umgebaut werden.

## 1. Wann gilt der Notfall?

**Störung – kein Notfall, normaler Weg:** ein roter Nachtlauf, ein roter CI-Lauf, eine nicht zugestellte Nachricht, ein einzelner Bug.

**Totalausfall – mindestens eins davon:**

1. Der Nachtlauf ist zwei Nächte in Folge nicht gelaufen oder ohne Bericht abgebrochen, ohne Grund in `~/halo-nacht/uebersprungen.log`.
2. `neon` und `neon-board` sind auf allen Wegen aus `AGENTS.md` „neon erreichen“ länger als 4 Stunden nicht erreichbar, oder der GitHub-Runner mit Label `halo-mac` ist auf GitHub offline.
3. Der Release-Weg ist kaputt: `publish.sh` meldet „FEHLER“ bei Hash oder `updates.json`, oder `release.sh` verweigert die Marke wegen eines Fehlers im Ablauf (nicht wegen eines roten Tests).
4. Schwerer Fehler bei Nutzern (Datenverlust, Thunderbird nach Update unbenutzbar, Datenschutzleck), und der normale Weg schafft die Korrektur nicht binnen 12 Stunden.
5. Nach einer Ablauf-Änderung: Routinen starten nicht mehr (LaunchAgents nicht geladen), der CI-Wächter schreibt länger als 1 Stunde nichts in sein Log, oder eine Rolle verliert ein Recht, das sie braucht (z. B. der Nachtlauf kann nicht mehr veröffentlichen).

## 2. Was tun, wer einen Totalausfall bemerkt

- **Einmal melden** aufs iPhone: „NOTFALL: <Grund>“ (Sitzungen über den üblichen Weg, Routinen über `push`).
- **Sonst nichts ändern**, bis der Maintainer entscheidet. Keine Reparaturversuche an Abläufen, kein Zurücksetzen, kein Release.
- Einzige Ausnahme: richtet ein laufender Ablauf weiter Schaden an, darf jede Sitzung auf neon `~/.config/halo-spaces/notfall.sh stopp` ausführen. Das hält nur an und ändert nichts.

## 3. Sicherung des Ist-Zustands

Vor jeder Stufe der Ablauf-Änderungen legt `notfall.sh sichern <name>` einen Sicherungspunkt an: den ersten unter dem Namen `vor-optimierung`, danach je Stufe `stufe-<n>-vor`.

| Was | Wo |
|---|---|
| Git-Stand | Tag `<name>` im Repo auf neon (auf GitHub nur außerhalb der Push-Sperre) |
| `~/.config/halo-spaces/` | Archiv `~/halo-sicherung/<name>-<datum>.tar.gz` auf neon |
| LaunchAgents `~/Library/LaunchAgents/at.halo-spaces.*` und die Liste aus `launchctl list` | dasselbe Archiv |
| `~/.claude/settings.json` | dasselbe Archiv |
| `~/halo-board/.claude/` | dasselbe Archiv |
| `~/halo-aufgaben/` | dasselbe Archiv |
| `~/.claude/scheduled-tasks/halo-github-kommunikation/`, Repo-`.claude/settings.local.json` | dasselbe Archiv |

Neben jedem Archiv liegt eine Prüfsummendatei. **Die Archive enthalten Zugangsdaten und echte Bilder: Sie bleiben auf neon, kommen nie ins Repo und werden nie hochgeladen.**

## 4. Notschalter `notfall.sh`

Ablage `~/.config/halo-spaces/notfall.sh` (läuft auch, wenn das Repo kaputt ist), Kopie `tests/notfall.sh`. Jeder Befehl kennt `--trocken` (zeigt nur an), schreibt ins Protokoll `~/halo-nacht/notfall.log` und schickt eine Push-Nachricht (außer `status`).

| Befehl | Wirkung |
|---|---|
| `status` | zeigt geladene LaunchAgents, aktive Pausen je Routine, laufende Routinen und Claude-Läufe, ob die CI auf neon läuft, den letzten Nachtlauf-Bericht und die letzte Sicherung. Ändert nichts |
| `stopp [--hart] <Grund>` | pausiert alle Routinen über `~/halo-nacht/pausen.txt` (Zeile `alle`, Ablauf in 7 Tagen); laufende Läufe dürfen fertig werden. `--hart`: beendet zusätzlich laufende Routinen und entlädt alle `at.halo-spaces.*` außer `remote-control` und `neon-board`. Der Runner läuft weiter (CI für Fixes) |
| `weiter` | entfernt die NOTFALL-Zeilen aus `pausen.txt` und lädt die LaunchAgents wieder, die `stopp --hart` entladen hat (vermerkt in `~/halo-nacht/notfall-entladen.txt`); vorher schon entladene bleiben aus |
| `sichern <name>` | Sicherungspunkt nach Abschnitt 3 |
| `zurueck <name> [--mit-aufgaben]` | erst `stopp --hart`, dann Einstellungen, Skripte und LaunchAgents aus dem Archiv zurück. `~/halo-aufgaben` (laufender Zustand) nur mit `--mit-aufgaben`. Danach zeigt es die Ablauf-Commits seit dem Tag an. Die werden nicht automatisch zurückgesetzt, sondern von Hand mit `git revert` zurückgenommen (vorwärts, wie alle Korrekturen) |

Die Desktop-App-Aufgabe „GitHub-Kommunikation“ hält der Notschalter nur an, wenn sie die Pausen-Datei beachtet. Im Zweifel in der App auf neon pausieren.

## 5. Handbetrieb

**neon läuft, Routinen gestoppt:**
- Der Maintainer arbeitet in einer Sitzung direkt auf neon.
- Fixes wie gewohnt, Release mit `release.sh` und `publish.sh`.
- GitHub-Antworten von Hand, Board über `board.sh`.
- Zur Erinnerung, wörtlich aus `docs/release.md`: `release.sh` und `publish.sh` laufen **nur auf neon**, nie auf dem Laptop oder in Cloud-Sessions. Einzige Bedingung sind grüne Tests: `release.sh` schreibt nur dann die Marke `dist/release-<version>.ok`, `publish.sh` veröffentlicht ohne passende Marke nicht, die Sperre nicht umgehen. Zwischen `release.sh` und `publish.sh` nicht neu bauen. `updates.json` und die Version in `manifest.json` setzt `release.sh`, nicht von Hand. Nach `publish.sh` zeigt der Bericht in `~/halo-berichte/` den Hash- und Update-Prüfstand.

**neon ganz aus:**
- Board aus Cloud-Sitzungen: Einträge nur anlegen, über den Workflow `add-task.yml` (Notweg, siehe `docs/board.md`).
- GitHub-Nutzern kurz antworten, ohne Termine.
- Der Laptop ist kein Release-Rechner (siehe oben). Er schickt Befehle über SSH an neon (`tests/MAC-MINI.md` Abschnitte 4 und 7); ist neon nicht erreichbar, bleibt es bei Commits auf `main`, die der nächste Nachtlauf auf neon testet und veröffentlicht.
- **Notfall-Release ohne neon:** nur bei Abschnitt 1 Punkt 4 (schwerer Fehler bei Nutzern, neon nicht rechtzeitig verfügbar), über den Workflow `.github/workflows/notfall-release.yml` (nur von Hand startbar: `workflow_dispatch` mit Version, englischen Versionshinweisen und dem Wort `NOTFALL`). Üblicher Ablauf: Fehler mit `git revert` auf `main` zurücknehmen, Workflow starten; er baut das Paket einmal, testet es auf GitHub (Linux Release und ESR vollständig, bei Farben auch dunkel; statisch; macOS nur als Rauchtest mit höchstens 10 Minuten je Schritt, Job 20) und schreibt nur bei Grün die Marke; der Job „veroeffentlichen“ (Environment `notfall-release`) prüft die Sperre wie `publish.sh` und läuft erst nach der Freigabe des Maintainers. **Den Notfall-Release startet und gibt nur der Maintainer von Hand frei, nie eine Sitzung.** Bei Rot gibt es kein Release, keine Ausnahme.
- Sonst gilt: Ursache in einem Issue-Kommentar benennen und neon wiederherstellen (Strom, Netz, Tailscale, Anmeldung).

**Kontingent erschöpft:** Routinen warten von selbst. Release nur von Hand auf neon. Nur Korrekturen schwerer Fehler (Abschnitt 1, Punkt 4).

**Wiederanlauf:**
1. `notfall.sh status`
2. Ursache und Verlauf in `~/halo-berichte/<datum>-notfall.md`
3. Kommt neon nach einem Notfall-Release zurück: zuerst `git fetch`, das lokale `main` auf `origin/main` rebasen und offene, nicht gepushte Nachtlauf-Commits klären (die Version ist schon vergeben, `release.sh` würde sonst eine alte `updates.json` fortschreiben); erst danach die Routinen wieder starten
4. `notfall.sh weiter`
5. die nächste Nacht beobachten
6. Nach einem Notfall-Release auf neon nachholen: README-Versionshinweise, Issues „Fixed in x.y.z“ schließen, Bericht nach `~/halo-berichte`

**Probe vom 9.11.2026 (Version 99.0.0, nicht freigegeben):** Linux Release lief mit 386 von 389 Prüfungen OK; die drei Fehler kamen daher, dass der Test die erwartete Version aus dem Checkout (3.23.1) statt aus dem Paket las und dass die erfundene „neuere“ Version 99.0.0 der Update-Prüfungen der Probeversion glich (jetzt behoben). Der volle Test auf dem GitHub-Mac lieferte 34 Layout-Fehler und hing nach rund 22 Minuten; deshalb läuft macOS im Notfall-Weg nur als Rauchtest (Begründung: Notfall-Release ist in der Regel ein `git revert` auf einen schon vollständig getesteten Stand, die Layout-Prüfungen sind auf neon abgestimmt). Die Regel „Release nur mit grünen Tests“ gilt unverändert: ohne Marke kein Release. **Offener Punkt:** zweite Probe mit Version 3.23.2 (startet der Maintainer), dazu das Environment `notfall-release` mit „Required reviewers“ und den Branch-Schutz von `main` prüfen (der Push des Release-Commits).

## 6. Rücknahme je Stufe der Ablauf-Änderungen

Jede Stufe beginnt mit `notfall.sh sichern stufe-<n>-vor` und endet mit einer grünen Probe-Nacht. Erst danach folgt die nächste Stufe.

| Stufe | Inhalt | Auslöser für die Rücknahme |
|---|---|---|
| 0 | Notfallplan, Sicherung, Notschalter | – (nur Text, Skript, Archiv) |
| 1 | Rechte und Rollen (GitHub-Aufgabe, Nachtlauf) | Nachtlauf kann nicht pushen oder veröffentlichen; GitHub-Aufgabe antwortet nicht mehr |
| 2 | Notfall-Weg ohne neon (Workflows) | Workflow löst ungewollt aus oder schreibt Inhalte ins Log |
| 3 | Modelle, Vorprüfungen | erledigte Einträge je Nacht unter der Hälfte des Mittels; GitHub-Antworten bleiben aus |
| 4 | CI und CI-Wächter | Release blockiert durch neue Bedingung; Rot wird nicht mehr gemeldet |
| 5 | `AGENTS.md`, Skills, Hooks | `tests/doku_kern_check.sh` rot; ein Hook blockiert den Nachtlauf |

Rücknahme: `notfall.sh zurueck stufe-<n>-vor`, dann `git revert` der Commits dieser Stufe, Bericht wie beim Wiederanlauf.

## 7. Zeitfenster-Hook (noch nicht aktiv)

Der vorbereitete Hook `tests/zeitfenster-hook.sh` (Push-Sperre 00:00–09:00, keine Testläufe bei laufender CI; Einzelheiten
`docs/testrechner.md`) ist nicht in `~/.claude/settings.json` eingetragen. Sobald er aktiv ist: Er läuft fail open (jeder Fehler
lässt durch), Ausnahme für Routinen über `HALO_LAUF`, bewusster Schalter für den Maintainer ist die Datei
`~/halo-nacht/SPERRE_AUS`. Blockiert er etwas Falsches, diese Datei anlegen und danach den Eintrag aus `~/.claude/settings.json`
entfernen (Rücknahme Stufe 5).
