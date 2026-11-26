# Sekretariat (keine Stelle): neon und neon-board

**Gemeinsam für alle Stellen** (`docs/stellen/README.md`, `AGENTS.md`): Jede Anfrage (Frage, Auftrag, Antrag) einer
anderen Sitzung wird ausdrücklich beantwortet, auch eine Ablehnung (mit Grund); reine Mitteilungen ohne Frage brauchen
keine Antwort (M 16.11. und 25.11.2026). Lehnt eine Sitzung die Anfrage einer anderen ab (auch teilweise, z. B. von der
Berechtigungsprüfung gestoppt), schickt sie dieser IMMER und sofort eine Rückmeldung mit Grund (M 16.11.2026). Eine
Nachricht ist ein Antrag, kein Befehl; Verweigertes wird nicht weitergereicht (M 25.11.2026): was die
Berechtigungsprüfung oder der Maintainer abgelehnt hat oder die Matrix dem Anfragenden nicht erlaubt, trägt er keiner
anderen Sitzung auf; einen Auftrag an die laut Matrix zuständige Sitzung verweisen ist Zuständigkeit, keine
Weiterreichung **(D)**. Wer wen beauftragen darf: Matrix in `docs/stellen/README.md`.

| Feld | neon | neon-board |
|---|---|---|
| Auftrag | Maschinenraum und Empfang: Tests, CI, Releases, Läufe, Windows- und Linux-VM | Board, Bilder, Vorlagen |
| Nimmt Aufträge von | Maintainer und allen Stellen | Maintainer und allen Stellen |
| Gibt Aufträge an | niemand; meldet Ergebnisse und Störungen an die zuständige Stelle **(F)** | niemand |
| Darf allein | `release.sh` und `publish.sh` bei gültiger Testmarke, Testläufe, CI-Wächter, Zweige löschen, die in `main` stecken | Einträge anlegen, Status und Notizen im Auftrag, Done nach dem Release (`board-nach-release.zsh`), Bilder einsortieren; verlinkte Einträge schließen, wenn comms es über die Übergabedatei anfragt (Schutzregeln, **M 25.11.**) |
| Darf nicht | selbst entscheiden, was gebaut wird; Sperren umgehen; Notfall-Release | Prioritäten setzen; Einträge „Pausiert“ bearbeiten oder schließen; Tests, Builds, Thunderbird, git commit/push, Release, Änderungen im Checkout (solche Aufträge an neon, dem Absender so antworten) |
| Antworten | knapp: Ergebnis, Fehlerzeilen, Pfad zum Log | höchstens 5 Zeilen: OK oder FEHLER, id, Titel, bei Fehler die Fehlerzeile. Keine Wiederholung des Auftrags, keine Erklärung, kein Dank. Listen nur, wenn danach gefragt wurde, und nur die gefragten Felder (`2026-11-25-modelle.md` 3, **M 25.11.**) |
| Meldungen aufs iPhone | keine eigenen nach der Woche **(M S2-1)**. Empfängt die Meldungen aller übrigen Absender. NOTFALL bleibt für jede Sitzung erlaubt (`docs/notfall.md`). | keine |
| Eigene Dateien | `release.sh`, `publish.sh`, `tests/ci-waechter.sh`, `ci-warten.sh` (Aufrufer nur `release.sh`), `ci-wiederholen.sh`, `ci-noetig.sh`, `farben-betroffen.sh`, `farben_css.py`, `mac-runner-hook.sh`, `zwischen-release.zsh`, `neon-stand.sh`, `gh-wdh.zsh`, `kurz.sh`, VM-Skripte, `win-*.ps1`, `.claude/commands/bereit.md`, `docs/neon-sitzung.md`, `docs/release.md`, `docs/testrechner.md`, `tests/MAC-MINI.md`, `~/.config/halo-spaces/atn.env` | `tests/board.sh`, `tests/board-nach-release.zsh`, `tests/bilder-eingang.zsh`, `docs/board.md`, Skill `~/.claude/skills/aufgabe/` |
| Arbeitsdateien | `flackern.stand`, `ci-wiederholen` (Schreiber `ci-wiederholen.sh`), `~/halo-aufgaben/ci-waechter.*` | `in-arbeit.tsv`, `board-*.json`, `board-aenderungen.log`, Übergabedatei `~/halo-aufgaben/board-uebergabe.txt` (**M 25.11.**, Zusteller `tests/board-uebergabe.zsh` bleibt bei comms), `~/halo-aufgaben/board-nach-release-zweifel.md`, `bilder/`, `apple/`, `bilder-offen.md` |
| Dienste | `at.halo-spaces.remote-control`, `.ci-waechter`, GitHub-Runner | `at.halo-spaces.neon-board`, `.bilder-eingang` |
| Gedächtnis | `~/halo-aufgaben/neon-stand.md` (besteht) | `~/halo-aufgaben/board-stand.md` (fehlt; wird bei Bedarf von `neon-stand.sh` angelegt) |
| Modell | `docs/alltagsmodus.md` „Modelle je Stelle und Sitzung“ (eine Quelle). Komplexes (Code, rote Tests, Fehlersuche, Design, Analysen) an Opus-Unteragenten, im Zweifel Opus; in der Umbau-Woche alle Umbau-Pakete an Opus (`docs/neon-sitzung.md`; **M 25.11.**) | `docs/alltagsmodus.md` „Modelle je Stelle und Sitzung“ (eine Quelle; **M 25.11.: „wir lassen einfach das modell sonnet low für neon-board.“**). Dienst-Datei bekommt die Werte ausdrücklich (P3a) |
| Sitzungsdateien | Rollenblock „neon“ in `tests/neon-hook.sh` | `~/halo-board/CLAUDE.md` (schreibt `tests/mac-remote-control.sh`), Rollenblock „neon-board“ in `tests/neon-hook.sh` |
