# neon-sitzung.md

Arbeitsweise der dauerhaften Remote-Control-Sitzungen `neon` (und `neon-board`) auf dem Mac mini,
aus `AGENTS.md` ausgelagert (Stufe 2 des Stufenplans, 6.11.2026). Gilt nur für diese Sitzungen,
nicht für Cloud-, Laptop- oder iPhone-Sitzungen. `tests/neon-hook.sh` weist beim Start (und nach
jedem Verdichten) darauf hin; die Regeln für **Aufträge an neon**, die Wege zu neon und die
`neon-board`-Regel stehen weiter in `AGENTS.md` „neon erreichen“. Wortlaute: `ENTSCHEIDUNGEN.md`.

**Antworten von neon:** neon muss im Modus „Auto“ laufen wie die
Cloud-Sitzungen (in der Cloud gibt es kein `bypassPermissions`). Bei
verschiedenen Modi hält die empfangende Sitzung Nachrichten zurück, und auf
keiner Seite erscheint eine Abfrage (Test vom 4.11.2026). neon antwortet mit
`SendMessage` an den Namen der Sitzung aus `ListAgents` (Name per
`list_sessions` der Sitzungs-ID zuordnen); das meldet nicht, ob die Nachricht
gelesen wurde, sie erscheint dort als neue Nachricht. `send_message` aus neon
scheitert auch im Modus „Auto“ (`elevated_session_untrusted_device`).

**neon schlank halten** (Entscheidung des Maintainers vom 6.11.2026, Wortlaut in `ENTSCHEIDUNGEN.md`:
neon verteilt Arbeit statt sie selbst im Kontext zu erledigen, offene Aufträge
stehen in einer Datei, die nach dem Verdichten wieder geladen wird).
Alle Sitzungen teilen sich neons Kontext; was dort ankommt, verdrängt
anderes.

*Arbeitsweise von neon* (gilt für die Remote-Control-Sitzungen `neon`, nicht
für Nachtlauf und andere Läufe; `neon-board` arbeitet ebenso, nur mit
`HALO_STAND_NAME=board ~/.config/halo-spaces/neon-stand.sh` und
`~/.config/halo-spaces/board.sh`, Hinweise vom selben Hook):
- Jeder Auftrag, der länger als eine Antwort dauert, kommt in
  `~/halo-aufgaben/neon-stand.md`: `tests/neon-stand.sh neu <von> "<Auftrag>"`
  (`<von>` = Name der Sitzung für die Antwort), Zwischenstand mit `notiz`,
  nach der Antwort `fertig` (Erledigtes landet in `neon-stand-archiv.md`).
  Der SessionStart-Hook `tests/neon-hook.sh` lädt die offenen Aufträge bei
  jedem Start und **nach jedem Verdichten** wieder; maßgeblich ist die
  Datei, nicht die Zusammenfassung.
- Mehrschrittiges (Fehlersuche, Recherche im Code, mehrere Board-Einträge,
  Bilder prüfen und speichern) an einen Unteragenten (`Agent`) mit der
  Vorgabe „Ergebnis höchstens 10 Zeilen“; nur das Ergebnis geht weiter.
- Befehle mit langer Ausgabe über `tests/kurz.sh [--name …] <Befehl>`
  (volles Log unter `~/halo-neon/logs/`, ausgegeben werden Exitcode,
  Fehlerzeilen und das Ende), Testläufe dabei im Hintergrund. Board nur über
  `tests/board.sh` (`liste [Muster]`, `zeige`, `neu`, `status`, `notiz`,
  `archiv`), nie `gh project item-list` ungefiltert.
- Antworten knapp: Ergebnis, Fehlerzeilen, Pfad zum Log. Zitate und
  Entscheidungen weiter wörtlich (siehe „Aufgabenliste“).
- **Modelle: Routine mit Sonnet, Komplexes mit Opus, im Zweifel Opus**
  (Entscheidung des Maintainers vom 6.11.2026, Wortlaut in `ENTSCHEIDUNGEN.md`;
  ersetzt die frühere Regel „Unteragenten immer Sonnet“):
  - `neon` selbst läuft mit Sonnet: Aufträge annehmen und in
    `neon-stand.md` führen, Testläufe starten und OK/FEHLER melden, Bilder
    und Vorlagen speichern, Zweige mergen, Skripte nach klarer Anleitung,
    Aufträge einstufen.
  - Komplexes an einen Unteragenten (`Agent`) mit `model: "opus"`,
    vollständiger Auftrag, Ergebnis höchstens 10 Zeilen: Code in
    `extension/` oder `chrome/` (Bugs, Features), rote Tests und
    Fehlersuche, Design-Fragen und Apple-Vergleiche, Analysen über viele
    Dateien, neue Abläufe und Skripte entwerfen. Routine-Unteragenten mit
    `model: "sonnet"`.
  - Kennzeichen im Auftrag: `[opus]` erzwingt Opus, `[sonnet]` erzwingt
    Sonnet.
  - **Im Zweifel Opus.** Gilt für jede Einstufung.
  - Scheitert ein Auftrag mit Sonnet einmal, sofort mit Opus wiederholen.
  - Kein `/model`-Wechsel in neon selbst (der Zwischenspeicher ginge
    verloren).
  - Nachtlauf, Wochenprüfung und die übrigen Läufe behalten ihr Modell;
    `neon-board` bleibt bei Sonnet und niedriger Reasoning-Stufe
    (`mac-remote-control.sh` schreibt beides in die Einstellungen von
    `~/halo-board`).
  - Wo das Modell von neon herkommt: `claude remote-control` hat kein
    `--model`; der Server gibt jeder Sitzung beim (Neu-)Start ihr
    gespeichertes Modell als `--model` mit (Stand 6.11.2026: neon mit
    `claude-opus-5-5`, zu sehen mit `ps -o args= -p <pid>` am Kindprozess
    von `claude remote-control`). Das schlägt Einstellungen und
    `ANTHROPIC_MODEL`. Umstellen deshalb einmal durch den Maintainer im
    Modellwähler der Sitzung `neon` (claude.ai/code bzw. Claude-App); das
    gilt dann auch nach Neustarts. Gleiches gilt für `neon-board`, falls
    der Server dort ein Modell mitgibt.
- **Kein täglicher Neustart von `neon`, `/clear` von Hand** (Entscheidung des
  Maintainers vom 6.11.2026, Wortlaut in `ENTSCHEIDUNGEN.md`; Befund: `kickstart -k`
  setzt dieselbe Sitzung mit vollem Verlauf fort, `claude remote-control` hat
  keine Option für eine frische Sitzung): `tests/neon-neustart.sh` bleibt als
  Vorlage liegen, der LaunchAgent `at.halo-spaces.neon-neustart` wird nicht
  eingerichtet (`mac-mini-setup.sh` meldet nur, falls er doch geladen ist). Den
  Kontext leert der Maintainer täglich selbst mit `/clear` in neon, vorher
  fragt er mit `/bereit`.
- **`/bereit`: ist neon frei für `/clear`?** (Frage des Maintainers vom 6.11.2026,
  Wortlaut in `ENTSCHEIDUNGEN.md`; die Umsetzung ist die Deutung der Cloud-Sitzung): Projekt-Befehl
  `.claude/commands/bereit.md` und Regel im Hinweis von `tests/neon-hook.sh`. Bei
  `/bereit` oder Fragen wie „ist etwas offen?“ / „kann ich clearen?“ prüft neon
  selbst: (1) `~/halo-aufgaben/neon-stand.md` lesen, (2) mit dem eigenen Verlauf
  abgleichen – Laufendes, Hintergrund-Tests/-Befehle, laufende Unteragenten,
  wartende Antworten an Sitzungen, Zusagen, nicht committete Änderungen in
  `~/halo-spaces` und Worktrees (`git worktree list`), (3) Fehlendes in
  `neon-stand.md` nachtragen (`neu`/`notiz`), (4) in einer Zeile antworten:
  „Frei für /clear“ oder „Nicht frei: <was läuft>, frühestens <wann>“.
  Laufende Hintergrundprozesse, Tests oder Unteragenten heißen nie „frei“.
- Der Wert für das Verdichten (`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`) bleibt wie
  in allen Sitzungen; seltener verdichten heißt weniger vergessen.
