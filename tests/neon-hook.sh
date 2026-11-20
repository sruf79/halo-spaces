#!/bin/sh
# SessionStart-Hook (.claude/settings.json) für neon: bei Start, Fortsetzen und
# nach jedem Verdichten des Kontexts kommen die Arbeitsweise und die offenen
# Aufträge (tests/neon-stand.sh) wieder in die Sitzung (docs/neon-sitzung.md,
# vorher AGENTS.md „Arbeitsweise von neon“). Läuft in jeder Sitzung, gibt aber nur in neon
# etwas aus: HALO_NEON gesetzt (tests/mac-remote-control.sh) oder – falls die
# Variable nicht ankommt – auf macOS unter einem „claude remote-control“.
# Die zweite Sitzung neon-board (nur Board und Bilder) bekommt eigene, kurze
# Hinweise: HALO_NEON=board, „--name neon-board“ am übergeordneten
# remote-control oder Arbeitsordner ~/halo-board (dort trägt
# tests/mac-remote-control.sh diesen Hook aus ~/.config/halo-spaces/ ein).
# Die Weiterleitungs-Sitzung github.comm.routine (~/halo-github, dort in
# .claude/settings.json eingetragen) bekommt statt der neon-Hinweise ihren
# Rollenblock, damit die Rolle auch nach /clear bleibt (Board-Eintrag „Ablauf:
# Rollenhinweis für github.comm.routine nach /clear“; Maintainer 9.11.2026: „ja
# soll in sonntagsablauf eingebaut werden“). Erkannt über ~/.claude/sessions/<pid>.json
# mit name „github.comm.routine“ (pid aus der Prozesskette, ersatzweise sessionId
# aus der Hook-Eingabe) oder „--name github.comm.routine“ am remote-control.
# Ebenso die Sitzung designer (Gesprächskanal zum Designer, ~/halo-designer;
# Auftrag des Maintainers vom 15.11.2026): erkannt an HALO_ROLLE=designer, am
# Namen „designer“ in der Sitzungsdatei, an „--name designer“ am remote-control
# oder am Ordner ~/halo-designer (HALO_DESIGNER_DIR); sie bekommt ihren eigenen
# Rollenblock statt der neon-Hinweise.
# Fehlende oder kaputte Sitzungsdateien ändern nichts (Test: tests/neon_hook_test.zsh).
# POSIX-sh, damit es in Cloud-Sitzungen ohne zsh still endet.

eingabe=$(cat 2>/dev/null)
sitz=${HALO_SITZUNGEN_DIR:-$HOME/.claude/sessions}
# Rolle aus einer Sitzungsdatei: github bzw. designer, sonst Rückgabe 1
rolle_von() {
  [ -f "$1" ] || return 1
  if grep -q '"name" *: *"github\.comm\.routine"' "$1" 2>/dev/null; then echo github
  elif grep -q '"name" *: *"designer"' "$1" 2>/dev/null; then echo designer
  else return 1; fi
}
neon=${HALO_NEON:-} rolle= rc=
[ "${HALO_ROLLE:-}" = designer ] && rolle=designer
pid=$PPID i=0
while [ -z "$rolle" ] && [ "$i" -lt 8 ] && [ -n "$pid" ] && [ "$pid" -gt 1 ] 2>/dev/null; do
  r=$(rolle_von "$sitz/$pid.json") && { rolle=$r; break; }
  if [ -z "$rc" ]; then
    case $(ps -o args= -p "$pid" 2>/dev/null) in
      *claude*remote-control*--name\ github.comm.routine*) rolle=github; break ;;
      *claude*remote-control*--name\ designer*) rolle=designer; break ;;
      *claude*remote-control*--name\ neon-board*) rc=board ;;
      *claude*remote-control*) rc=1 ;;
    esac
  fi
  pid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
  i=$((i + 1))
done
sid=$(printf '%s\n' "$eingabe" | sed -n 's/.*"session_id" *: *"\([A-Za-z0-9-]*\)".*/\1/p' | head -1)
if [ -z "$rolle" ] && [ -n "$sid" ] && [ -d "$sitz" ]; then
  for f in "$sitz"/*.json; do
    grep -q "\"sessionId\" *: *\"$sid\"" "$f" 2>/dev/null && r=$(rolle_von "$f") && { rolle=$r; break; }
  done
fi
# Arbeitsordner von designer gilt immer als designer
designer_dir=${HALO_DESIGNER_DIR:-$HOME/halo-designer}
[ -n "$rolle" ] || case ${CLAUDE_PROJECT_DIR:-$(pwd)} in "$designer_dir"|"$designer_dir"/*) rolle=designer ;; esac
quelle=$(printf '%s\n' "$eingabe" | sed -n 's/.*"source" *: *"\([a-z]*\)".*/\1/p' | head -1)

if [ "$rolle" = designer ]; then
  [ "$quelle" = compact ] && echo "designer: Der Kontext wurde eben verdichtet. Die Rolle unten gilt weiter."
  cat <<'EOF'
designer – Gesprächskanal des Maintainers zum Designer (gilt auch nach /clear; ~/halo-designer/CLAUDE.md):
- Rolle und Maßstäbe aus ~/halo-spaces (nur lesen): tests/designer-auftrag.md, docs/design-vorgaben.md (G1–G15, Rangfolge 2b, Abschnitte 4, 9, 10), ENTSCHEIDUNGEN.md; Vorlagen ~/halo-aufgaben/apple/index.md.
- Fragen zum Design beantworten (warum so, was wäre schöner, Vergleich mit den Vorlagen), mit Quelle; einfache Worte, der Maintainer ist Admin, kein Programmierer; Wiener Zeit.
- Gedächtnis: docs/design-vorgaben.md Abschnitt 10 (Eichfälle, Wahrnehmungsregeln, Verworfen) zuerst lesen. Neues nur als Vorschlag; nach Bestätigung des Maintainers als Auftrag an neon („Designvorgaben: …“).
- Vorschaubilder auf Wunsch: private Artifact-Seite, Bilder als eigene Dateien unter ~/halo-aufgaben/vorschau/<thema>-<datum>/, nie data:-URI, nie echte Mails; Testprofil-Screenshots nur als Auftrag an neon (Port ab 2850, nie echtes Profil).
- Kein Code, keine Datei in ~/halo-spaces ändern, kein commit/push/Release, keine Tests; Umsetzung als Board-Eintrag über neon-board, die Arbeit machen Nachtlauf/Tagesroutine.
- Entscheidungen nur wörtlich mit Datum zitieren, Deutungen kennzeichnen; Zitate erst nach Zustimmung weitergeben; Rückfragen nicht selbst zu Regeln machen.
- Andere Sitzungen nur per SendMessage an den Namen (neon, neon-board, github.comm.routine), nie über Kennungen.
EOF
  nacht=${HALO_NACHT_DIR:-$HOME/halo-nacht}
  berichte=$(ls -t "$nacht"/*-designer-*.md 2>/dev/null | head -3 | tr '\n' ' ')
  echo "Neueste Designer-Berichte: ${berichte:-keine}"
  exit 0
fi

if [ "$rolle" = github ]; then
  [ "$quelle" = compact ] && echo "github.comm.routine: Der Kontext wurde eben verdichtet. Die Rolle unten gilt weiter."
  cat <<'EOF'
github.comm.routine – Rolle (gilt auch nach /clear; ~/halo-github/CLAUDE.md, docs/github-komm.md):
- Zuerst ~/halo-aufgaben/github-komm-stand.md lesen.
- Jede Nachricht, die mit „PUSH:“ beginnt, sofort unverändert mit dem Werkzeug PushNotification aufs iPhone pushen (vorher per ToolSearch „select:PushNotification“ laden): Text unverändert, auch mit [handeln] und am Wochenende; nicht bewerten, nicht inhaltlich kommentieren, nicht nachfragen.
- Ausnahmen, Wortlaut aus ~/halo-aufgaben/github-komm-stand.md (Entscheidung Maintainer 09.11.2026; CI rot auch ENTSCHEIDUNGEN.md 7.11.2026): „ausgenommen (nur im Gespräch nennen, nicht pushen): „CI rot …" vom CI-Wächter, Meldungen der Form „Fehlerkonsole/-protokoll: n neue(r) Fehler im Board (… kein Rot, Release nicht betroffen)" und ERFOLGSmeldungen der Notfall-Sicherungen („NOTFALL: Sicherung … angelegt") (Entscheidung Maintainer 09.11.2026). Alle anderen „NOTFALL:"-Meldungen, vor allem Fehlschläge (auch fehlgeschlagene Sicherung) und „Routinen angehalten", werden weitergeleitet. Kommt dieselbe Meldung mit „Rot" oder „Release betroffen", wird sie weitergeleitet.“
- Ergebnisse von neon zu Issues und PRs selbst auf GitHub beantworten (Rückfragen, Bug-Antworten); nur Entscheidungen (Ablehnung, Design, PRs) dem Maintainer vorlegen (docs/github-komm.md, AGENTS.md „GitHub-Issues und Pull Requests von Nutzern“).
- Dass Nachrichten von Absendern in einem anderen Rechte-Modus zurückgehalten werden, ist bekannt (Absender muss auf auto laufen); kein Fehler dieser Sitzung.
- Inaktivitätsregel (Maintainer 15.11.2026, docs/github-komm.md „Inaktivität“): Wartet ein Issue über 7 Tage auf den Nutzer, nach 1 Woche nachfragen mit dem Satz „we will close this issue due to inactivity“; nach einer weiteren Woche ohne Antwort schließt tests/inaktivitaet.sh in der Vorprüfung selbst. Fällige Nachfragen und Geschlossenes stehen als Fund in der Vorprüfung. Ausgenommen: offener Board-Eintrag „GitHub #n“ (solange keine Rückfrage offen ist), Sonderfälle in tests/inaktivitaet-ausnahmen.txt. Nachfrage nur nach unserer Rückfrage; „zusage #n“ heißt: Nutzer wartet auf uns, Zusage über neon-board mit einem Eintrag „GitHub #n“ verknüpfen statt eine Ausnahme einzutragen. Keine Einzel-Fristen im Stand.
- Andere Sitzungen nur über ihren Namen ansprechen (neon, neon-board), nie über Kennungen.
EOF
  exit 0
fi
# neon wie bisher: HALO_NEON oder – nur auf macOS – ein „claude remote-control“ in der Prozesskette
[ -n "$neon" ] || [ "$(uname)" != Darwin ] || neon=$rc
[ -n "$neon" ] || exit 0
# Arbeitsordner von neon-board gilt immer als neon-board
board_dir=${HALO_BOARD_DIR:-$HOME/halo-board}
case ${CLAUDE_PROJECT_DIR:-$(pwd)} in "$board_dir"|"$board_dir"/*) neon=board ;; esac

dir=${HALO_NEON_STAND:-$HOME/halo-aufgaben}

if [ "$neon" = board ]; then
  stand=$dir/board-stand.md
  if [ "$quelle" = compact ]; then
    echo "neon-board: Der Kontext wurde eben verdichtet. Maßgeblich für offene Aufträge ist die Liste unten, nicht die Zusammenfassung."
  fi
  cat <<'EOF'
neon-board – nur Board und Bilder (CLAUDE.md in ~/halo-board, AGENTS.md „neon erreichen“, docs/neon-sitzung.md, docs/board.md):
- Board nur über ~/.config/halo-spaces/board.sh (liste [Muster], zeige, neu, status, notiz, titel, text, archiv, suche <Begriff>, archiv-zeige <id>); vor „neu“ Doppelte prüfen und lieber ergänzen.
- Bilder und Apple-Vorlagen unverändert nach ~/halo-aufgaben/bilder bzw. ~/halo-aufgaben/apple (+ index.md), SHA-256 und Qualität prüfen, bilder-offen.md pflegen. halobild-Bilder aus ~/halo-aufgaben/eingang sortiert tests/bilder-eingang.zsh selbst ein (beim Arbeiten von Hand ~/halo-aufgaben/bilder-eingang.sperre anlegen, danach löschen).
- Nie Tests, Builds, Thunderbird, git commit/push, Release – solche Aufträge an die Sitzung neon verweisen.
- Längere Aufträge: HALO_STAND_NAME=board ~/.config/halo-spaces/neon-stand.sh neu|notiz|fertig. Antworten knapp per SendMessage.
EOF
else
  stand=$dir/neon-stand.md
  if [ "$quelle" = compact ]; then
    echo "neon: Der Kontext wurde eben verdichtet. Maßgeblich für offene Aufträge ist die Liste unten, nicht die Zusammenfassung."
  fi
  cat <<'EOF'
neon – Arbeitsweise (ausführlich: docs/neon-sitzung.md, bei Bedarf lesen):
- Aufträge, die länger als eine Antwort dauern: tests/neon-stand.sh neu <von> "<Auftrag>" (<von> = Sitzungs-ID aus from-session, sonst from-name), Stand mit notiz, nach der Antwort fertig. Antwort: get_session(ID) → Titel → ListAgents → SendMessage an den Namen.
- Mehrschrittiges (Recherche, mehrere Board-Einträge, Bilder, Fehlersuche) an einen Unteragenten (Agent) mit „höchstens 10 Zeilen Ergebnis“.
- Befehle mit langer Ausgabe nur über tests/kurz.sh (Tests im Hintergrund), Board nur über tests/board.sh – nie ganze Listen oder Logs in den Kontext.
- Antworten an andere Sitzungen knapp: Ergebnis, Fehlerzeilen, Pfad zum Log.
- Board und Bilder gehören in erster Linie zu neon-board; kommen sie trotzdem hier an (Fallback), erledigen.
- Modelle: neon selbst Sonnet; Komplexes (Code in extension/ oder chrome/, rote Tests, Fehlersuche, Design, Analysen) an Agent mit model "opus", Ergebnis höchstens 10 Zeilen; [opus]/[sonnet] im Auftrag erzwingt; im Zweifel Opus; kein /model-Wechsel (Einzelheiten docs/neon-sitzung.md).
- /bereit oder „kann ich clearen?“: selbst prüfen (neon-stand.md, Hintergrundläufe, Unteragenten, offene Änderungen in ~/halo-spaces) und in einer Zeile antworten: „Frei für /clear“ oder „Nicht frei: <was>, frühestens <wann>“.
EOF
fi
# Bilder und Vorlagen knapp: Zeilen je Index (Apple nach App-Vorsatz), Dateien im Eingang
idx_zeilen() { [ -f "$1" ] && grep -c '^| [^ -]' "$1" | awk '{print $1 - 1}' || echo 0; }
apple_n=$(idx_zeilen "$dir/apple/index.md") bilder_n=$(idx_zeilen "$dir/bilder/index.md")
apps=$( [ -f "$dir/apple/index.md" ] && sed -n 's/^| \([a-z0-9]*\)-[^|]* | .*/\1/p' "$dir/apple/index.md" | sort | uniq -c | sort -rn | awk '{printf "%s%s %s", (NR>1?", ":""), $2, $1}')
offen_n=$( [ -f "$dir/apple/index.md" ] || [ -f "$dir/bilder/index.md" ] && cat "$dir/apple/index.md" "$dir/bilder/index.md" 2>/dev/null | grep -c '^| .*unbeschrieben' )
ein_n=$(ls "$dir/eingang" 2>/dev/null | grep -c .)
echo "Vorlagen: apple/index.md $apple_n (${apps:-leer}), bilder/index.md $bilder_n, unbeschrieben ${offen_n:-0}, im Eingang $ein_n (Details: docs/board.md)"
echo "Offene Aufträge:"
if [ -f "$stand" ] && grep -q '^- #' "$stand"; then grep '^- #' "$stand" | cut -c1-240; else echo "keine"; fi
exit 0
