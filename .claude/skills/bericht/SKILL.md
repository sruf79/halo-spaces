---
name: bericht
description: Öffnet den Tagesbericht von neon (Nachtlauf, Morgenbrief, Vorschau der Tagesroutine) als private Seite in dieser Sitzung. Benutzen, wenn der Maintainer den Bericht, Morgenbericht, Morgenbrief oder Nachtbericht sehen will, auch mit /bericht oder /bericht <datum>.
---

# Tagesbericht als Seite öffnen

Der Maintainer will den Bericht in der Sitzung öffnen, nie nur einen Pfad bekommen (15.11.2026: „schicke nie den pfad zu
(nacht, morgen) berichten, der nützt mir in dieser session nichts. ich möchte stattdessen immer den bericht hier am laptop
in dieser session öffnen können“). Der Bericht liegt auf neon unter `~/halo-berichte/<datum>-bericht.md` (schreibt
`tests/morgenbrief.sh` täglich um 08:30).

1. **Datum:** ohne Angabe heute (Wiener Zeit); `/bericht <datum>` nimmt das Datum (`2026-11-14`, `14.11.`, `gestern`).
   Sitzung nicht auf neon: den Auftrag als eine Nachricht an `neon` geben (AGENTS.md „neon erreichen“) und den Link,
   den neon zurückschickt, weitergeben.
2. **Quelle:** `~/halo-berichte/<datum>-bericht.md`. Fehlt sie (Tage vor dem 16.11.2026 oder vor 08:30), nacheinander
   `<datum>-morgenbrief.md` und `<datum>-nachtlauf.md` nehmen und in der Antwort sagen, welche es ist. Gibt es nichts,
   in einem Satz sagen, dass für das Datum kein Bericht vorliegt.
3. **Seite bauen:** `python3 -I tests/bericht-html.py <quelle> <scratchpad>/bericht-<datum>.html` (aus `~/halo-spaces`,
   sonst `~/.config/halo-spaces/bericht-html.py`). Die Seite nicht von Hand ändern; Überschriften, Tabellen, Listen
   und die aufklappbaren `<details>`-Blöcke bleiben erhalten, Hell/Dunkel folgt dem Gerät.
4. **Veröffentlichen:** mit dem Werkzeug `Artifact` (privat, `file_path` = die HTML-Datei, `icon: "report"`, beim ersten
   Mal je Datum; Titel „Bericht <TT.MM.JJJJ>“ steht schon im `<title>`, `description` ein Satz wie „Tagesbericht von
   neon: Nacht, Entscheidungen, Vorschau“). Für jeden Tag eine eigene Datei, damit ältere Seiten bleiben.
   Nicht freigeben oder teilen; der Bericht enthält interne Angaben (Board, Hashes).
5. **Antwort:** den Link und die Kurzfassung (die Zeilen unter „Kurzfassung“) in höchstens 10 Zeilen, einfache Worte.
   Nie nur einen Pfad nennen, keine Pfade zu Berichten in der Antwort.
