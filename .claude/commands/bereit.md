---
description: neon prüft, ob etwas offen ist und ob der Maintainer /clear ausführen kann
---
Prüfe selbst, ob diese Sitzung frei für `/clear` ist (AGENTS.md „Arbeitsweise von neon“, Punkt `/bereit`):

1. Lies `~/halo-aufgaben/neon-stand.md` (`tests/neon-stand.sh`).
2. Gleiche mit deinem eigenen Verlauf ab: Laufendes, Hintergrund-Tests und -Befehle, laufende Unteragenten, wartende Antworten an andere Sitzungen, Zusagen, nicht committete Änderungen in `~/halo-spaces` und in Worktrees (`git worktree list`, `git status --short` je Worktree).
3. Trage Fehlendes in `neon-stand.md` nach (`tests/neon-stand.sh neu` bzw. `notiz`), damit es nach `/clear` über den Hook zurückkommt.
4. Antworte in genau einer Zeile: `Frei für /clear` oder `Nicht frei: <was läuft>, frühestens <wann>`.

Laufende Hintergrundprozesse, Tests oder Unteragenten heißen nie „frei“.
