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

# arbeitet gerade eine andere Claude-Sitzung am Repo? Jede aktive Sitzung schreibt
# laufend in ihr Gespräch (~/.claude/projects/<Ordner>/<id>.jsonl) – auch wenn sie
# gerade nachdenkt oder auf eine Antwort wartet und kein Test läuft. Gibt die ID
# der Sitzung aus, deren Gespräch sich in den letzten 60 Minuten geändert hat.
# Nicht mitgezählt: Sitzungen der eigenen Läufe (ID im Protokoll unter
# ~/halo-nacht) und Sitzungen, deren letzte Eingabe eine Push-Meldung war (die
# kurzen Zustell-Sitzungen von push() und die Empfangssitzung mit Remote Control).
aktive_sitzung() {
  local f id letzte
  for f in $HOME/.claude/projects/${HOME//[\/.]/-}-halo*/*.jsonl(N.mm-60); do
    id=${f:t:r}
    grep -qs -- "Sitzung $id" $HOME/halo-nacht/*.log(N) && continue
    letzte=$(grep '"role":"user","content":"' $f | tail -n 1)
    [[ $letzte == *'"content":"Aufgabe ohne Rückfrage: Lade bei Bedarf'* ]] && continue
    [[ $letzte == *'\">\nPUSH: '* ]] && continue
    print $id
    return 0
  done
  return 1
}

# läuft schon etwas, das den Mac braucht? Gibt den Grund aus (Rückgabe 0 = belegt)
belegt() {
  local s
  s=$(aktive_sitzung) && { print "Claude-Sitzung ${s[1,8]} hat in der letzten Stunde am Repo gearbeitet"; return 0 }
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
  [[ -n $(git -C $REPO status --porcelain --untracked-files=no 2>/dev/null) ]] \
    && { print "ungespeicherte Änderungen in $REPO (eine andere Sitzung arbeitet)"; return 0 }
  return 1
}
