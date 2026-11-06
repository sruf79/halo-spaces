#!/bin/sh
# SessionStart-Hook (.claude/settings.json) für neon: bei Start, Fortsetzen und
# nach jedem Verdichten des Kontexts kommen die Arbeitsweise und die offenen
# Aufträge (tests/neon-stand.sh) wieder in die Sitzung (AGENTS.md
# „Arbeitsweise von neon“). Läuft in jeder Sitzung, gibt aber nur in neon
# etwas aus: HALO_NEON gesetzt (tests/mac-remote-control.sh) oder – falls die
# Variable nicht ankommt – auf macOS unter einem „claude remote-control“.
# POSIX-sh, damit es in Cloud-Sitzungen ohne zsh still endet.

neon=${HALO_NEON:-}
if [ -z "$neon" ] && [ "$(uname)" = Darwin ]; then
  pid=$PPID i=0
  while [ "$i" -lt 8 ] && [ -n "$pid" ] && [ "$pid" -gt 1 ] 2>/dev/null; do
    case $(ps -o args= -p "$pid" 2>/dev/null) in *claude*remote-control*) neon=1; break ;; esac
    pid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
    i=$((i + 1))
  done
fi
[ -n "$neon" ] || exit 0

quelle=$(sed -n 's/.*"source" *: *"\([a-z]*\)".*/\1/p' 2>/dev/null | head -1)
stand=${HALO_NEON_STAND:-$HOME/halo-aufgaben}/neon-stand.md

if [ "$quelle" = compact ]; then
  echo "neon: Der Kontext wurde eben verdichtet. Maßgeblich für offene Aufträge ist die Liste unten, nicht die Zusammenfassung."
fi
cat <<'EOF'
neon – Arbeitsweise (AGENTS.md „Arbeitsweise von neon“):
- Aufträge, die länger als eine Antwort dauern: tests/neon-stand.sh neu <von> "<Auftrag>", Stand mit notiz, nach der Antwort an <von> fertig.
- Mehrschrittiges (Recherche, mehrere Board-Einträge, Bilder, Fehlersuche) an einen Unteragenten (Agent) mit „höchstens 10 Zeilen Ergebnis“.
- Befehle mit langer Ausgabe nur über tests/kurz.sh (Tests im Hintergrund), Board nur über tests/board.sh – nie ganze Listen oder Logs in den Kontext.
- Antworten an andere Sitzungen knapp: Ergebnis, Fehlerzeilen, Pfad zum Log.
EOF
echo "Offene Aufträge:"
if [ -f "$stand" ] && grep -q '^- #' "$stand"; then grep '^- #' "$stand"; else echo "keine"; fi
exit 0
