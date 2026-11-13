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

## C. Immer der Maintainer (nur mit seinem Satz direkt in neon)

Regeln in `AGENTS.md`; neue oder geänderte LaunchAgents; `settings.json` und Hooks (Zeitfenster-Hook,
Hook gegen erzeugte Dateien); Auslöser in `test.yml`; Release-Regeln und Hotfix; Notfall und
Notfall-Release (nur von Hand durch ihn, `docs/notfall.md`); Push-Sperre; Datenschutz; Zitate von ihm an
neon oder neon-board; Design (nach Vergleich mit der Vorlage); strittige Entscheidungen zu
Nutzer-Anfragen; Löschen oder Archivieren von Sitzungen und Dauerprozessen.

## D. Ausdrücklich nie automatisch

Veröffentlichen mit abgeschwächten oder ausgesetzten Prüfungen; Aufheben der Windows- oder
Linux-Pflicht; Freigabe fremder Pull Requests.

## Nicht Teil der Freigabe

- **M30** (automatisches `/clear` bei neon, wenn neon leer ist): nicht umgesetzt. Es gilt weiter die
  Entscheidung vom 6.11.2026 („Kein täglicher Neustart von neon, /clear von Hand“ in
  `ENTSCHEIDUNGEN.md`): `/bereit`, dann führt der Maintainer `/clear` aus.
- Unklar, ob ein Fall in A/B oder C gehört: wie C behandeln (Board-Eintrag „Ablauf: …“, „Wartet auf OK“).
