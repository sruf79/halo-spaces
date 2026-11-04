# Gemeinsame Hilfen der Läufe auf neon (tests/MAC-MINI.md Abschnitte 13–15):
# nachtlauf.sh, ci-waechter.sh und wochenpruefung.sh laden diese Datei mit
# `source`. Wie die Skripte wird sie nach ~/.config/halo-spaces/ kopiert.
# Erwartet $LOG (Protokolldatei) und für belegt() $REPO.

zeit() { date '+%F %T' }
log() { print -r -- "$(zeit) $*" >> $LOG }

# eine Zeile aufs iPhone: eine kurze Claude-Sitzung gibt sie per SendMessage an
# die Sitzung mit Remote Control weiter, die sie als Push-Meldung zustellt
push() {
  local text=$1 out
  # Text über stdin: --allowedTools nimmt sonst den Auftrag als weiteres Werkzeug
  out=$(print -r -- "Aufgabe ohne Rückfrage: Lade bei Bedarf mit ToolSearch die Werkzeuge ListAgents und SendMessage. Schicke dann mit SendMessage an die Sitzung, deren Name „comm.github.routine“ ist (aus ListAgents), genau diese eine Nachricht und sonst nichts:
PUSH: $text
Antworte danach nur mit „gesendet“ oder „nicht gesendet: <Grund>“." \
    | claude -p --model haiku --permission-mode auto --allowedTools ListAgents SendMessage ToolSearch 2>&1)
  log "Push: $out"
}

# arbeitet gerade eine andere Claude-Sitzung am Repo? Jede Sitzung schreibt ihr
# Gespräch nach ~/.claude/projects/<Ordner>/<id>.jsonl. Sie arbeitet, solange
# ihre Runde nicht beendet ist: der letzte Eintrag ist eine neue Eingabe, ein
# Werkzeugaufruf oder dessen Ergebnis – nicht die Schlussantwort („end_turn“).
# Wer fertig ist und nur auf eine Antwort wartet, zählt nicht. Eine Runde, in
# der seit 2 Stunden nichts mehr geschrieben wurde (auch nicht von ihren
# Unteragenten), gilt als hängengeblieben und zählt ebenfalls nicht.
# Nicht mitgezählt: Sitzungen der eigenen Läufe (ID im Protokoll unter
# ~/halo-nacht) und Sitzungen, deren letzte Eingabe eine Push-Meldung war (die
# kurzen Zustell-Sitzungen von push() und die Empfangssitzung mit Remote Control).
sitzung_arbeitet() {
  tail -n 300 $1 | python3 -c '
import sys, json
letzte = None
for z in sys.stdin:
    try:
        d = json.loads(z)
    except ValueError:
        continue
    if d.get("type") in ("user", "assistant"):
        letzte = d
if letzte is None:
    sys.exit(1)
m = letzte.get("message") or {}
sys.exit(1 if letzte["type"] == "assistant" and m.get("stop_reason") != "tool_use" else 0)
'
}
aktive_sitzung() {
  local f id letzte neu
  for f in $HOME/.claude/projects/${HOME//[\/.]/-}-halo*/*.jsonl(N.); do
    neu=($f(N.mh-2) ${f:r}/**/*.jsonl(N.mh-2))
    (( $#neu )) || continue
    id=${f:t:r}
    grep -qs -- "Sitzung $id" $HOME/halo-nacht/*.log(N) && continue
    letzte=$(grep '"role":"user","content":"' $f | tail -n 1)
    [[ $letzte == *'"content":"Aufgabe ohne Rückfrage: Lade bei Bedarf'* ]] && continue
    [[ $letzte == *'\">\nPUSH: '* ]] && continue
    sitzung_arbeitet $f || continue
    print $id
    return 0
  done
  return 1
}

# läuft schon etwas, das den Mac braucht? Gibt den Grund aus (Rückgabe 0 = belegt)
belegt() {
  local s
  s=$(aktive_sitzung) && { print "Claude-Sitzung ${s[1,8]} arbeitet gerade am Repo"; return 0 }
  pgrep -f Runner.Worker >/dev/null && { print "CI-Lauf auf dem GitHub-Runner"; return 0 }
  pgrep -f "tests/(halo_test|ui_tour|update_test|store_shots)\.py" >/dev/null && { print "Testlauf (halo_test.py o. ä.)"; return 0 }
  pgrep -f -- "-marionette" >/dev/null && { print "Thunderbird mit Marionette"; return 0 }
  local p
  for p in 2839 2845 {2850..2869}; do
    lsof -nP -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1 && { print "Marionette-Port $p belegt"; return 0 }
  done
  [[ -e $HOME/halo-vm/lauf.lock ]] && kill -0 $(cut -d' ' -f1 $HOME/halo-vm/lauf.lock) 2>/dev/null \
    && { print "Lauf in der Windows-VM"; return 0 }
  pgrep -f "release\.sh|publish\.sh" >/dev/null && { print "release.sh/publish.sh läuft"; return 0 }
  # der Nachtlauf (REST_MITNEHMEN=1) übernimmt liegengebliebene Änderungen selbst –
  # ob noch jemand daran arbeitet, sagt schon aktive_sitzung()
  [[ -z $REST_MITNEHMEN && -n $(git -C $REPO status --porcelain --untracked-files=no 2>/dev/null) ]] \
    && { print "ungespeicherte Änderungen in $REPO (eine andere Sitzung arbeitet)"; return 0 }
  return 1
}
