Umbau-Woche, Tag 1: Einträge auf „In Progress“ sortieren (Nachtlauf Di 24.11.2026 ab 01:30).
Gilt nur, wenn die Zeile „Umbau-Woche: …“ oben „Tag 1: heute sortieren“ nennt bzw. `zsh tests/umbau-woche.sh faellig`
mit Exitcode 0 endet; sonst diesen Teil überspringen.

Grundlage, Wortlaut des Maintainers (ENTSCHEIDUNGEN.md, Freigabe Umbau-Woche 20.11.2026): „Am ersten Tag sortiert der
Nachtlauf alle Einträge auf In Progress: committet und CI grün → Done; committet und wartet auf Push oder CI → bleibt In
Progress und wird abgeschlossen; angefangen, aber nicht fertig → „Pausiert“ mit Notiz zum Stand.“
Sammelfrage S0 (22.11.2026, „mit allen empfehlungen einverstanden“), Teil c: P4- und Umbau-Einträge bleiben auf
„In Progress“, dazu Einträge mit Commit auf einem Prüfzweig bei grünen Tests.

Entschieden nach der Fable-Prüfung vom 22.11.2026 (Deutung der beiden Wortlaute, von neon übernommen):
- Von Nutzern gemeldete Bugs (Typ Bug mit „GitHub #n“) auf „In Progress“ laufen weiter, mit oder ohne Commit; nie
  „Pausiert“ (Liste N).
- Bugs des Maintainers ohne „GitHub #n“ zählen nicht als Nutzer-Bug, außer bei Absturz, Datenverlust oder einem
  ausdrücklichen Wunsch des Maintainers.
- „zur Abnahme“ bleibt „In Progress“, auch mit grüner CI, weder Done noch Pausiert; geschlossen wird erst nach
  „abgenommen“ (Abnahme-Lauf nach dem Release, docs/release.md).
- Neue Einträge „Tests: flackert“ und „Tests: CI rot“ sind P4 und bleiben „In Progress“ (Liste D).
- Design-Bugs von Nutzern: entschieden, S1 (Maintainer 23.11.2026: „Ich folge deinen Empfehlungen“; Deutung von neon: von Nutzern gemeldete Darstellungsfehler dürfen in der Umbau-Woche über den Designer behoben werden; ENTSCHEIDUNGEN.md „Umbau-Woche: S1 und Zweige der Tagesroutine“).
  Sortieren wie die übrigen Nutzer-Bugs (oben); umgesetzt werden sie nur über den Designer.

Wann: nach Schritt 0 (a bis c), vor Schritt 1. In dieser Nacht nichts an eigenen Skripten und Abläufen bauen.

1. Zählung vorher: `HALO_BOARD_ZWISCHEN_S=0 zsh tests/board.sh liste > ~/halo-nacht/<datum>-umbau-vorher.txt`, Zahl je
   Status (Todo, In Progress, Wartet auf OK, Pausiert) in den Bericht.
2. Vorsortieren (liest Board, Git und grüne CI-Läufe, schreibt nichts):
   `zsh tests/umbau-woche.sh sortieren > ~/halo-nacht/<datum>-umbau-listen.tsv`. Spalten: Liste, id, Kürzel, Hash, Grund,
   Titel. Endet die Zeile „# Zählung: … Summe …“ auf „FEHLER“ oder fehlt sie: nichts schreiben, im Bericht melden, Tag 1
   endet hier (neon sortiert ab 09:00).
3. Schreiben, in dieser Reihenfolge (Abfragelimit von GitHub: Liste A zuerst; `board.sh` wartet selbst und führt eine
   Warteschlange, nie selbst wiederholen):
   - Liste A (committet, Commit in main, CI grün): `zsh tests/board.sh status <id> done <Hash>` (archiviert mit).
   - Liste B (committet, wartet auf Push oder CI, oder Commit auf grünem Prüfzweig): Status bleibt. Notiz
     `zsh tests/board.sh notiz <id> "Umbau-Woche Tag 1 (<datum>): bleibt In Progress und wird abgeschlossen – <Grund aus der Liste>"`.
     Commit in main mit offener CI schließt Schritt 4 b nach grüner CI. Commit nur auf einem Prüfzweig: in Schritt 5
     dieser Nacht nach main übernehmen wie Worker-Commits (cherry-pick, betroffene Prüfungen mit --only hell grün);
     gelingt das nicht, bleibt der Eintrag mit Notiz auf „In Progress“, der Zweig bleibt stehen.
   - Liste C (kein Commit in den Notizen: angefangen, nicht fertig): erst
     `zsh tests/board.sh notiz <id> "Umbau-Woche Tag 1 (<datum>): Pausiert – angefangen, nicht fertig. Stand: <ein Satz aus den Notizen>."`,
     dann `zsh tests/board.sh status <id> pausiert`.
   - Liste D (P4 und Umbau, S0 c), Liste N (von Nutzern gemeldeter Bug, Typ Bug mit „GitHub #n“, mit oder ohne Commit,
     nicht als fertig belegt), Liste W (frischer Vermerk „In Arbeit: worker-…“ unter 5 Stunden): nicht anfassen, nur
     zählen. Nutzer-Bugs kommen nie auf „Pausiert“, auch nicht als Teil oder mit Offenem: der Wortlaut
     „Weiter laufen von Nutzern gemeldete Bugs, die Nutzer spüren“ (Freigabe 20.11.2026) geht dem allgemeinen
     „angefangen, aber nicht fertig → Pausiert“ vor. Fertig belegte Nutzer-Bugs stehen in A bzw. B und werden dort abgeschlossen.
   - Liste U (nicht eindeutig belegt): einzeln lesen (`zsh tests/board.sh zeige <id>`, `git branch -a --contains <Hash>`,
     `gh run list`). Nur wenn der Fall danach eindeutig auf eine Regel des Wortlauts passt, wie A, B oder C behandeln:
     Reihe (n/m), „Teil“, „Schritt“ oder Offenes mit Commit heißt „angefangen, nicht fertig“, also Pausiert mit Notiz
     (nie bei einem Nutzer-Bug, siehe Liste N), die Hash und Zweig nennt (der Commit geht nicht verloren); Reihen nie Done. „zur Abnahme“: immer
     nicht anfassen (feste Regel oben). Nicht eindeutig (z. B. „Entscheidung fehlt“, CI rot ohne belegte Ursache): nicht anfassen, im Bericht unter „Offen (Tag 1)“ mit Grund nennen.
4. Nie: Einträge auf „Pausiert“, „Todo“ oder „Wartet auf OK“ anfassen; einen pausierten Eintrag bearbeiten oder schließen
   (nie schließen, auch nicht als Done); Einträge anlegen; Titel oder Text ersetzen.
5. Zählung nachher wie in 1. In Progress vorher = In Progress nachher + auf Done gesetzte + auf Pausiert gesetzte;
   Todo und Wartet auf OK unverändert; Pausiert nachher = Pausiert vorher + auf Pausiert gesetzte. Weicht etwas ab:
   nichts zurückschreiben und nichts nachbessern (neue Einträge, z. B. vom CI-Wächter, lassen die Zählung abweichen,
   ohne dass Tag 1 etwas falsch gemacht hat; Done ist zudem archiviert), nur die Abweichung mit den betroffenen ids im
   Bericht melden und Tag 1 hier beenden (kein Schritt 6, keine Marke; neon klärt ab 09:00).
6. `zsh tests/board.sh nachtragen` (Rest der Warteschlange in den Bericht), dann
   `zsh tests/umbau-woche.sh sortiert <Bericht>` (Marke: Tag 1 erledigt, kein zweites Sortieren).
7. Bericht, Abschnitt „Umbau-Woche Tag 1“: Zahl je Liste (A, B, C, D, N, W, U und wie U aufgelöst wurde), Zählung
   vorher und nachher, Rest der Warteschlange, offene Fälle. Danach weiter mit Schritt 1 unter den Regeln der Umbau-Woche.
