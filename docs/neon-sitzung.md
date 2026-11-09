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
`SendMessage` an den Namen der Sitzung aus `ListAgents`; das meldet nicht, ob
die Nachricht gelesen wurde, sie erscheint dort als neue Nachricht.
`send_message` aus neon scheitert auch im Modus „Auto“
(`elevated_session_untrusted_device`, zuletzt geprüft 6.11.2026).
Cloud-Sitzungen ändern ihren Titel oft mitten im Gespräch (6.11.2026: zweimal
in einer Stunde), die Sitzungs-ID bleibt. Darum merkt sich neon die
**Sitzungs-ID** (`from-session` der Nachricht) und ermittelt den Namen erst
beim Antworten: `get_session` mit der ID → aktueller Titel → in `ListAgents`
suchen → `SendMessage` an diesen Namen (bei gleichen Namen mit dem `[ref]`
aus derselben Liste). Kommt der Auftrag ohne `from-session` (Sitzung auf
diesem Mac), gilt der Name aus `from-name`. Auftraggeber sollen ihrer Sitzung
einen festen Titel geben (z. B. `global.run`, `global.bugs`) und ihn im
Auftrag nicht wechseln.

**Sitzung nicht unter ihrem Namen gefunden** (Anweisung des Maintainers vom 7.11.2026; Anlass:
`neon-board` hieß in `ListAgents` `halo-board-de`, `comm.github.routine` statt `github.comm.routine`).
Namen in `ListAgents` sind der lokale Sitzungsname, nicht der Titel in claude.ai. Reihenfolge:
1. Name in `ListAgents`; 2. ähnlicher Name: Teilstring bzw. alle Wörter des Namens (`board`, `neon`,
`routine`), oder die Sitzung mit gleichem Arbeitsordner (`~/.claude/sessions/<pid>.json`, Feld `cwd`;
die Board-Sitzung arbeitet in `~/halo-board`); 3. `list_sessions` (`mine: true`) nach Titel, ID merken;
4. zuletzt bekannte Sitzung aus `~/halo-aufgaben/sitzungen.json` (Rolle → Name, ID, Zeit; `push()`
trägt jede erfolgreiche Zustellung ein). Die Skripte auf neon lösen den Namen ohne Claude mit
`sitzung_finden <Name>` (`tests/sitzung-finden.zsh`, geladen von `lauf-hilfen.zsh`) auf: gleicher Name,
sonst alle Wörter enthalten, für `neon-board` der Arbeitsordner; `push()` ruft Claude nur bei einem
Treffer auf und schreibt sonst `PUSH-FEHLER` (Empfangssitzung: `HALO_PUSH_SITZUNG`,
Standard `github.comm.routine`). Zusätzlich setzt `mac-remote-control.sh` den lokalen Namen fest
(`CLAUDE_CODE_SESSION_NAME`, `tests/MAC-MINI.md` Abschnitt 12); die Suche bleibt als Netz.

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
  (`<von>` = Sitzungs-ID `session_…` des Auftraggebers, bei Sitzungen auf diesem Mac ihr Name; Name erst beim Antworten ermitteln, siehe oben), Zwischenstand mit `notiz`,
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
- **Keine festen Kennungen, nur Namen** (wiederholt 9.11.2026, Regel in `docs/github-komm.md`): Sitzungen
  immer über ihren Namen aus `ListAgents` ansprechen; Kennungen in eckigen Klammern und Sitzungs-IDs nie
  fest in Aufträge, Dateien oder Notizen schreiben (ausgenommen der Notfallweg über
  `~/halo-aufgaben/sitzungen.json`).
- **Modelle: Routine mit Sonnet, Komplexes mit Opus, im Zweifel Opus**
  (Entscheidung des Maintainers vom 6.11.2026, Wortlaut in `ENTSCHEIDUNGEN.md`;
  ersetzt die frühere Regel „Unteragenten immer Sonnet“):
  - `neon` selbst läuft mit Sonnet (Reasoning-Stufe medium; `neon-board` und
    `github.comm.routine` Sonnet low): Aufträge annehmen und in
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
    gespeichertes Modell als `--model` mit (neon läuft Sonnet medium, Opus
    nur über Unteragenten mit `[opus]`; zu sehen mit `ps -o args= -p <pid>`
    am Kindprozess von `claude remote-control`). Das schlägt Einstellungen und
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

## Vollständiger Wortlaut aus `AGENTS.md` (Stand 9.11.2026, vor der Kürzung)

Bei der Kürzung von `AGENTS.md` (9.11.2026, Ablauf-Analyse Stufe 5) unverändert hierher verschoben; nur die Überschriften stehen eine Ebene tiefer. Verweise wie „oben“, „unten“ oder „dieser Datei“ meinen das damalige `AGENTS.md`. Die Kurzfassung für jede Sitzung steht im Kern `AGENTS.md`; Wortlaute der Entscheidungen: `ENTSCHEIDUNGEN.md`.

### neon erreichen – gilt für JEDE Sitzung

Jede Sitzung, egal in welcher Umgebung (Cloud, Desktop-App, CLI auf dem
Laptop, iPhone, Cowork, Claude Tag/Slack, geplante Aufgaben, Unteragenten
über ihre Hauptsitzung), kann der dauerhaften Sitzung **`neon`** auf dem
Mac mini Aufträge geben (Entscheidung des Maintainers vom 4.11.2026). Alles,
was den Mac braucht – Testläufe, Screenshots, Release –, geht so an neon;
Board und Bilder an `neon-board` (unten). Reihenfolge, bis einer klappt:

1. `ListAgents`, dann `SendMessage` an `neon` (die Remote-Control-Sitzung,
   die dort als LaunchAgent dauerhaft läuft, `tests/MAC-MINI.md` Abschnitt 12).
2. `list_sessions` (`mine: true`), Sitzung mit Titel `neon` suchen, dann
   `send_message` mit ihrer ID. Keine feste ID verwenden: nach einem Neustart
   von neon (`docs/neon-sitzung.md`) kann sich die ID ändern – immer über
   `ListAgents` bzw. die Liste suchen, nur Namen verwenden.
3. Lehnt `send_message` mit einem `content_digest` ab
   (`confirm_repository_trust`), diese Freigabe sofort anfragen – die
   Claude-App fragt den Maintainer selbst – und danach erneut senden.
4. Fehlen die Werkzeuge, erst per `ToolSearch` laden (`SendMessage`,
   `ListAgents`, `mcp__claude-code-remote__list_sessions`,
   `…__send_message`, `…__confirm_repository_trust`).
5. Auf dem Laptop zusätzlich SSH über Tailscale (`tests/MAC-MINI.md`
   Abschnitte 4 und 7).

**Board und Bilder an `neon-board`** (Entscheidung des Maintainers vom 6.11.2026, Wortlaut in `ENTSCHEIDUNGEN.md`): Eine zweite
dauerhafte Remote-Control-Sitzung **`neon-board`** auf demselben Mac bedient
nur die Aufgabenliste (lesen, anlegen, ergänzen, Status, archivieren,
Doppelte prüfen) und speichert Bilder und Apple-Vorlagen
(`~/halo-aufgaben/bilder/`, `~/halo-aufgaben/apple/` mit `index.md`,
`bilder-offen.md`) – nie Tests, Builds, Thunderbird, Pushes oder Releases.
So erreichen Cloud-, Laptop- und iPhone-Sitzungen das Board auch, während
neon testet. Board-, Bild- und Vorlagen-Aufträge gehen zuerst an
`neon-board` (gleiche Wege 1–4 wie oben, Name bzw. Titel `neon-board`),
nur wenn sie auf keinem Weg antwortet an `neon`. Alles, was den Mac sonst
braucht (Tests, Screenshots, Release, Dateien außerhalb von
`~/halo-aufgaben`), geht weiter an `neon`. Läufe, die lokal auf neon
mit `gh` arbeiten (Nachtlauf, CI-Wächter, Wochen-/Doku-Prüfung, Rundgang,
GitHub-Kommunikation), bleiben, wie sie sind (Deutung in `ENTSCHEIDUNGEN.md`). `neon-board` arbeitet in
`~/halo-board` (Rolle in der dort erzeugten `CLAUDE.md`), hat eine eigene
Auftragsliste `~/halo-aufgaben/board-stand.md` und zählt für Nachtlauf,
Rundgang und Wochenprüfung nie als „belegt“. Einrichtung
`tests/MAC-MINI.md` Abschnitt 12.

**Sitzung nicht unter ihrem Namen gefunden?** Reihenfolge: Name in `ListAgents` → ähnlicher Name
(Teilstring, gleicher Arbeitsordner) → `list_sessions` nach Titel → zuletzt bekannte Sitzungs-ID
(`~/halo-aufgaben/sitzungen.json`); Einzelheiten und Skripthilfe `sitzung_finden`:
`docs/neon-sitzung.md`. Erst danach „nicht erreichbar“ melden.

Nie „neon nicht erreichbar“ melden, ohne alle passenden Wege versucht zu
haben; dann dem Maintainer sagen, welche Wege mit welcher Meldung
gescheitert sind. Ergebnisse von neon abwarten und weitergeben, nie selbst
erfinden. Sitzungen auf neon selbst sind neon – dort direkt arbeiten.

**Abgelehnte Antwort an eine Sitzung** (Entscheidung des Maintainers vom 7.11.2026, Wortlaut in `ENTSCHEIDUNGEN.md`):
wird eine Nachricht abgelehnt (z. B. `send_message` mit Sitzungs-ID: `elevated_session_untrusted_device`), sucht die
Sitzung selbstständig einen anderen Weg (`SendMessage` an den Namen aus `ListAgents`, Titel über `list_sessions`,
zuletzt bekannte ID, Reihenfolge wie unter „Sitzung nicht unter ihrem Namen gefunden?“), bis einer klappt; findet sie
keinen, meldet sie das mit den Fehlermeldungen zurück. Lehnt eine Sitzung die Anfrage einer anderen Sitzung
ab (auch teilweise, z. B. von der Berechtigungsprüfung gestoppt), schickt sie dieser Sitzung sofort jede Antwort
mit Grund als Rückmeldung (Entscheidung des Maintainers vom 7.11.2026).

**Antworten von neon:** neon antwortet per `SendMessage` an den Namen der Sitzung; es erscheint
als neue Nachricht, `send_message` aus neon scheitert. neon merkt sich die Sitzungs-ID und sucht
den aktuellen Titel erst beim Antworten; Auftraggeber geben ihrer Sitzung einen festen Titel
(Einzelheiten, Modus „Auto“: `docs/neon-sitzung.md`).

**neon schlank halten:** Alle Sitzungen teilen sich neons Kontext; was dort ankommt, verdrängt
anderes (Entscheidung des Maintainers vom 6.11.2026, Wortlaut in `ENTSCHEIDUNGEN.md`).

*Aufträge an neon (alle anderen Sitzungen):* Der Weg bleibt derselbe (oben).
- Nur, was den Mac braucht: Tests, Screenshots, Release, Dateien unter
  `~/halo-…`. Board und Bilder speichern gehen an `neon-board` (oben),
  `neon` nur als Ausweichweg. Code, Git-Verlauf, Issues, Pull
  Requests und CI-Läufe (`actions_list`, `get_job_logs`) liest jede Sitzung
  selbst.
- Eine Nachricht je Auftrag, vollständig: was, Zweig bzw. Commit, Port ab
  2850, was zurückkommen soll und in welcher Form („nur OK/FEHLER-Zeilen“,
  „nur die id“). Keine Rückfragen nach dem Stand, kein „danke“ – neon meldet
  sich von selbst.
- Board gezielt fragen („offene Einträge mit Titel `Kalender:`“), nicht die
  ganze Liste.
- Kennzeichen für das Modell, mit dem neon den Auftrag erledigt (siehe
  `docs/neon-sitzung.md`): `[opus]` erzwingt Opus (Code, Fehlersuche,
  Design, Analysen), `[sonnet]` erzwingt Sonnet (Routine); ohne Kennzeichen
  stuft neon selbst ein, im Zweifel Opus.
- Längere Aufträge bestätigt neon mit einer Nummer („#12 angenommen“), das
  Ergebnis kommt später als eigene Nachricht. Wer nachfragt, nennt die
  Nummer.

*Arbeitsweise von neon selbst* (Aufträge in `neon-stand.md`, Unteragenten, `tests/kurz.sh`,
Modelle Sonnet/Opus – im Zweifel Opus –, `/bereit`, `/clear` von Hand statt täglichem Neustart):
`docs/neon-sitzung.md`; die Sitzungen `neon` und `neon-board` lesen sie, der SessionStart-Hook
`tests/neon-hook.sh` weist darauf hin.

#### neon aus der Cloud steuern (aus „Cloud-Sessions“)

**neon aus der Cloud steuern:** über die Remote-Control-Sitzung `neon`
(kein SSH, kein Tailscale im Container) – Wege und Ablauf unter „neon
erreichen“. Auftrag vollständig formulieren (Zweig bzw. Commit, Befehl, Port
ab 2850, was zurückgemeldet werden soll); die Regeln aus „Testrechner“
gelten dort unverändert.
