#!/bin/sh
# SessionStart-Hook (.claude/settings.json) für neon: bei Start, Fortsetzen und
# nach jedem Verdichten des Kontexts kommen die Arbeitsweise und die offenen
# Aufträge (tests/neon-stand.sh) wieder in die Sitzung (AGENTS.md
# „Arbeitsweise von neon“). Läuft in jeder Sitzung, gibt aber nur in neon
# etwas aus: HALO_NEON gesetzt (tests/mac-remote-control.sh) oder – falls die
# Variable nicht ankommt – auf macOS unter einem „claude remote-control“.
# Die zweite Sitzung neon-board (nur Board und Bilder) bekommt eigene, kurze
# Hinweise: HALO_NEON=board, „--name neon-board“ am übergeordneten
# remote-control oder Arbeitsordner ~/halo-board (dort trägt
# tests/mac-remote-control.sh diesen Hook aus ~/.config/halo-spaces/ ein).
# POSIX-sh, damit es in Cloud-Sitzungen ohne zsh still endet.

neon=${HALO_NEON:-}
if [ -z "$neon" ] && [ "$(uname)" = Darwin ]; then
  pid=$PPID i=0
  while [ "$i" -lt 8 ] && [ -n "$pid" ] && [ "$pid" -gt 1 ] 2>/dev/null; do
    case $(ps -o args= -p "$pid" 2>/dev/null) in
      *claude*remote-control*--name\ neon-board*) neon=board; break ;;
      *claude*remote-control*) neon=1; break ;;
    esac
    pid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
    i=$((i + 1))
  done
fi
[ -n "$neon" ] || exit 0
# Arbeitsordner von neon-board gilt immer als neon-board
board_dir=${HALO_BOARD_DIR:-$HOME/halo-board}
case ${CLAUDE_PROJECT_DIR:-$(pwd)} in "$board_dir"|"$board_dir"/*) neon=board ;; esac

quelle=$(sed -n 's/.*"source" *: *"\([a-z]*\)".*/\1/p' 2>/dev/null | head -1)
dir=${HALO_NEON_STAND:-$HOME/halo-aufgaben}

if [ "$neon" = board ]; then
  stand=$dir/board-stand.md
  if [ "$quelle" = compact ]; then
    echo "neon-board: Der Kontext wurde eben verdichtet. Maßgeblich für offene Aufträge ist die Liste unten, nicht die Zusammenfassung."
  fi
  cat <<'EOF'
neon-board – nur Board und Bilder (CLAUDE.md in ~/halo-board, AGENTS.md „neon erreichen“):
- Board nur über ~/.config/halo-spaces/board.sh (liste [Muster], zeige, neu, status, notiz, archiv); vor „neu“ Doppelte prüfen und lieber ergänzen.
- Bilder und Apple-Vorlagen unverändert nach ~/halo-aufgaben/bilder bzw. ~/halo-aufgaben/apple (+ index.md), SHA-256 und Qualität prüfen, bilder-offen.md pflegen.
- Nie Tests, Builds, Thunderbird, git commit/push, Release – solche Aufträge an die Sitzung neon verweisen.
- Längere Aufträge: HALO_STAND_NAME=board ~/.config/halo-spaces/neon-stand.sh neu|notiz|fertig. Antworten knapp per SendMessage.
EOF
else
  stand=$dir/neon-stand.md
  if [ "$quelle" = compact ]; then
    echo "neon: Der Kontext wurde eben verdichtet. Maßgeblich für offene Aufträge ist die Liste unten, nicht die Zusammenfassung."
  fi
  cat <<'EOF'
neon – Arbeitsweise (AGENTS.md „Arbeitsweise von neon“):
- Aufträge, die länger als eine Antwort dauern: tests/neon-stand.sh neu <von> "<Auftrag>", Stand mit notiz, nach der Antwort an <von> fertig.
- Mehrschrittiges (Recherche, mehrere Board-Einträge, Bilder, Fehlersuche) an einen Unteragenten (Agent) mit „höchstens 10 Zeilen Ergebnis“.
- Befehle mit langer Ausgabe nur über tests/kurz.sh (Tests im Hintergrund), Board nur über tests/board.sh – nie ganze Listen oder Logs in den Kontext.
- Antworten an andere Sitzungen knapp: Ergebnis, Fehlerzeilen, Pfad zum Log.
- Board und Bilder gehören in erster Linie zu neon-board; kommen sie trotzdem hier an (Fallback), erledigen.
- Modelle: neon selbst Sonnet (Routine: Aufträge, Testläufe, Bilder, Mergen, Skripte nach Anleitung, Einstufen). Komplexes (Code in extension/ oder chrome/, rote Tests, Fehlersuche, Design/Apple-Vergleiche, Analysen über viele Dateien, neue Abläufe) an Agent mit model "opus", Ergebnis höchstens 10 Zeilen; Routine-Unteragenten model "sonnet". [opus]/[sonnet] im Auftrag erzwingt. Im Zweifel Opus. Mit Sonnet einmal gescheitert: sofort mit Opus wiederholen. Kein /model-Wechsel in neon.
EOF
fi
echo "Offene Aufträge:"
if [ -f "$stand" ] && grep -q '^- #' "$stand"; then grep '^- #' "$stand"; else echo "keine"; fi
exit 0
