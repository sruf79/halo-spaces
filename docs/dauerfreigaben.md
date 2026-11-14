# Dauerfreigaben

Was neon, die Routinen (Nachtlauf, Tagesroutine, Morgenbrief, Wochen- und Doku-Prüfung) und die
GitHub-Aufgabe ohne Rückfrage tun dürfen. Der Maintainer kümmert sich um Design und die einmalige
Festlegung der Abläufe; alles andere läuft ohne ihn. Freigegeben vom Maintainer am 11.11.2026
(Auftrag an neon nach dem Entwurf vom 10.11.; der Wortlaut steht, sobald übermittelt, in
`ENTSCHEIDUNGEN.md`). Die Stufen ersetzen keine Regel aus `AGENTS.md`: Push-Sperre, Release-Sperre,
Zeitfenster und Datenschutz gelten weiter. Neons Berechtigungsprüfung bleibt eine eigene
Schutzschicht; lehnt sie etwas ab, wird es nicht umgangen, sondern gemeldet.

## A. Immer ohne Rückfrage

Lesen und Auswerten; lokale Commits auf `main`; Zweige `pruef/…` und `rest/…`; Sicherungen
(`tests/notfall.sh sichern`); Board-Einträge zu von Nutzern gemeldeten Bugs und zu eigenen Bugs des
Maintainers; Korrekturen an eigenen Skripten und Doku ohne Regeländerung; Reparatur flackernder
Prüfungen (nie abschwächen); Zusammenlegen von Doppelten; Status und Notizen im Board; Antworten an
Nutzer in GitHub nach `docs/github-komm.md`.

## B. neon entscheidet allein und meldet im Morgenbrief

Reihenfolge der Liste (komplexe zuerst; im Nachtlauf der Director-Plan nach Nutzen je Aufwand, `tests/nachtlauf-auftrag.md` Schritt 1a), Modellwahl nach Sollkurve und 5-Stunden-Fenster, Zurücksetzen
eines Eintrags mit Notiz, Aufteilen großer Einträge in Schritte (`n/m`), Lauf der Tagesroutine,
Kontingent-Schwellen innerhalb von `~/.config/halo-spaces/tagesroutine.conf`.

**PRs zum Schließen eintragen** (Maintainer 14.11.2026, „ja bitte“, Wortlaut in `ENTSCHEIDUNGEN.md`): Der
Director trägt einen PR selbst in `tests/pr-freigaben.txt` ein (Issue-Feld `director`, „Nachweis: <Hashes>,
Release <x.y.z>“), nur wenn (1) der Inhalt nachweislich in `main` ist (Commit-Vergleich, kein nicht
übernommener Fremdcode), (2) der Fix in einem Release steht bzw. mit dem laufenden kommt und (3) `publish.sh`
dem Autor mit „Fixed in x.y.z“ dankt; geschlossen wird nur durch `publish.sh`, nie per `gh` und nie gemergt.
Bericht: „PRs zum Schließen eingetragen: #n (Nachweis …)“. Abgelehnt, unklar oder Inhalt nicht in `main`:
bleibt beim Maintainer (Vorschlag im Bericht).

**LaunchAgents laden und neu starten** (Maintainer 13.11.2026, „Ja“ auf neons Vorschlag): neon darf die
Zeitplan-Agenten (Tagesroutine, Nachtlauf, Morgenbrief, Wochenprüfung, Doku-Prüfung, Rundgang,
CI-Wächter, Bilder-Eingang, GitHub-Wächter) mit `launchctl bootout`/`bootstrap` laden und neu starten,
damit eine freigegebene Änderung wirkt. Bedingungen: kein Lauf aktiv (`pgrep` und Sperrdateien), neue
plist vorher mit `plutil -lint` geprüft und gelesen, der Nachtlauf nicht zwischen 00:00 und 09:00, jede
Änderung steht im Bericht oder im Morgenbrief. Ausgenommen bleiben die drei Fernsteuerungs-Agenten
(`remote-control`, `neon-board`, `github-comm`): ein Neustart beendet die Sitzung selbst, dort nennt neon
dem Maintainer Befehl und Zeitpunkt. Neons Berechtigungsprüfung bleibt eigene Schutzschicht (lehnt sie ab,
wird es gemeldet, nicht umgangen).

**Aufräumen unbenötigter Reste mit Risiko null** (Maintainer 14.11.2026, Wortlaut in `ENTSCHEIDUNGEN.md`):
am Ende des Nachtlaufs (Auftrag Schritt 6a, Rückfall in `tests/nachtlauf.sh`), ohne Nachfrage. Was entfernt
wird, legen allein die Kriterien in `tests/aufraeumen.sh` fest (Arbeitskopien der Hilfsagenten ohne
Ungespeichertes und ohne eigene Commits, tote Sperrdateien in `~/halo-nacht`, in `main` enthaltene Zweige
`claude/…`, `rest/…`, `pruef/…`); alles andere bleibt und steht als „Rest mit Risiko“ im Bericht und im
Morgenbrief. Sitzungen und Dauerprozesse berührt das nicht (bleibt Stufe C).

## C. Immer der Maintainer (nur mit seinem Satz direkt in neon)

Regeln in `AGENTS.md`; neue oder inhaltlich geänderte LaunchAgents (Zeitpläne, Programmaufruf; nur auf ausdrücklichen Wunsch des Maintainers im Gespräch, das Laden danach siehe B), Neustart der drei Fernsteuerungs-Agenten; `settings.json` und Hooks (Zeitfenster-Hook,
Hook gegen erzeugte Dateien); Auslöser in `test.yml`; Release-Regeln und Hotfix; Notfall und
Notfall-Release (nur von Hand durch ihn, `docs/notfall.md`); Push-Sperre; Datenschutz; Zitate von ihm an
neon oder neon-board; Design (nach Vergleich mit der Vorlage); strittige Entscheidungen zu
Nutzer-Anfragen; Löschen oder Archivieren von Sitzungen und Dauerprozessen.

## D. Ausdrücklich nie automatisch

Veröffentlichen mit abgeschwächten oder ausgesetzten Prüfungen; Aufheben der Windows- oder
Linux-Pflicht; Freigabe fremder Pull Requests (Mergen; Schließen nur wie unter B).

## Nicht Teil der Freigabe

- **M30** (automatisches `/clear` bei neon, wenn neon leer ist): nicht umgesetzt. Es gilt weiter die
  Entscheidung vom 6.11.2026 („Kein täglicher Neustart von neon, /clear von Hand“ in
  `ENTSCHEIDUNGEN.md`): `/bereit`, dann führt der Maintainer `/clear` aus.
- Unklar, ob ein Fall in A/B oder C gehört: wie C behandeln (Board-Eintrag „Ablauf: …“, „Wartet auf OK“).
