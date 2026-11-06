# github-komm.md

Kommunikation mit Nutzern auf GitHub (Issues, Pull Requests, Forks), aus `AGENTS.md`
ausgelagert (Stufe 3 des Stufenplans, 6.11.2026). Wer ein Issue bzw. einen Pull Request bearbeitet,
liest diese Datei vorher; die Routine „halo.spaces: GitHub-Kommunikation“ (geplante Aufgabe der
Desktop-App auf neon) liest sie ebenfalls. Die Kernregeln stehen in `AGENTS.md`
Desktop-App auf neon) liest sie ebenfalls. Die Kernregeln stehen in `AGENTS.md`
„GitHub-Issues und Pull Requests von Nutzern“.


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
  erreichen die Datei nicht und lassen sie über neon ergänzen). Erster Schritt
  der Aufgabe ist `~/.config/halo-spaces/github-vorpruefung.sh` (bei „NICHTS NEU“
  endet sie sofort, siehe „Claude nur bei Arbeit“ in `docs/testrechner.md`, Umstellung
  durch den Maintainer `tests/MAC-MINI.md` Abschnitt 17a). Keine zweite
  Routine anlegen; die frühere Cloud-Routine gleichen Namens ist abgeschaltet.
- **Ton und Inhalt:** Englisch, freundlich, knapp, ohne Fachjargon des
  Codes, wo es nicht nötig ist; Rückfragen konkret stellen. Nie auf die
  private Aufgabenliste verweisen, keine Interna (Testrechner, VM, Tokens)
  und keine Zusagen zu Terminen.
