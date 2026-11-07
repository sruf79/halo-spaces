# Gemeinsame Hilfen der Läufe auf neon (tests/MAC-MINI.md Abschnitte 13–16):
# nachtlauf.sh, ci-waechter.sh und wochenpruefung.sh (auch als Doku-Prüfung
# mit --doku) laden diese Datei mit
# `source`. Wie die Skripte wird sie nach ~/.config/halo-spaces/ kopiert.
# Erwartet $LOG (Protokolldatei) und für belegt() $REPO.

zeit() { date '+%F %T' }
log() { print -r -- "$(zeit) $*" >> $LOG }

# eine Zeile aufs iPhone: eine kurze Claude-Sitzung gibt sie per SendMessage an
# die Sitzung mit Remote Control weiter, die sie als Push-Meldung zustellt.
# Scheitert die Zustellung (Sitzung nicht gefunden, Claude nicht erreichbar,
# Antwort nicht „gesendet“), steht „PUSH-FEHLER <Routine> <Grund>“ im Protokoll
# des Laufs und in ~/halo-nacht/uebersprungen.log (Wochenprüfung zählt sie);
# kein zweiter Versuch, kein weiterer Claude-Aufruf. push <Text> [<Routine>]:
# Routine standardmäßig der Name des aufrufenden Skripts.
push() {
  local text=$1 routine=${2:-${ZSH_ARGZERO:t:r}} out grund
  local fehlerlog=${HALO_UEBERSPRUNGEN_LOG:-$HOME/halo-nacht/uebersprungen.log}
  # Text über stdin: --allowedTools nimmt sonst den Auftrag als weiteres Werkzeug
  out=$(print -r -- "Aufgabe ohne Rückfrage: Lade bei Bedarf mit ToolSearch die Werkzeuge ListAgents und SendMessage. Schicke dann mit SendMessage an die Sitzung, deren Name „github.comm.routine“ ist (aus ListAgents), genau diese eine Nachricht und sonst nichts:
PUSH: $text
Antworte danach nur mit „gesendet“ oder „nicht gesendet: <Grund>“." \
    | claude -p --model haiku --permission-mode auto --allowedTools ListAgents SendMessage ToolSearch 2>&1)
  log "Push: $out"
  if [[ ${out:l} != gesendet* ]]; then
    grund=${${out#nicht gesendet:}//$'\n'/ }
    grund=${grund# }
    print -r -- "$(zeit) PUSH-FEHLER $routine ${grund[1,200]:-keine Antwort}" >> $fehlerlog
    log "PUSH-FEHLER $routine ${grund[1,200]:-keine Antwort}"
  fi
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
# kurzen Zustell-Sitzungen von push() und die Empfangssitzung mit Remote Control)
# sowie die Sitzung neon-board (nur Board und Bilder, Arbeitsordner ~/halo-board
# bzw. HALO_BOARD_DIR): Sie fasst weder Repo noch Thunderbird an und darf
# Nachtlauf, Rundgang und Wochenprüfung nie als „belegt“ aufhalten. Ihr
# Projektordner ~/.claude/projects/…-halo-board passt sonst auf das Muster -halo*.
# Die 2 Stunden zählen ab dem Zeitstempel des letzten echten Eintrags, nicht ab
# der Dateizeit: /compact schreibt die Datei neu, ohne dass die Runde weitergeht.
# sitzung_arbeitet <datei> [frisch] – „frisch“: ein Unteragent schrieb zuletzt
sitzung_arbeitet() {
  tail -n 300 $1 | FRISCH=${2:-} python3 -c '
import sys, json, os
from datetime import datetime, timezone
letzte = None
for z in sys.stdin:
    try:
        d = json.loads(z)
    except ValueError:
        continue
    # Ausgaben von Befehlen wie /compact sind keine neue Eingabe
    c = (d.get("message") or {}).get("content")
    if d.get("isMeta") or d.get("isCompactSummary") or (isinstance(c, str) and c.lstrip().startswith(("<local-command", "<command-name>"))):
        continue
    if d.get("type") in ("user", "assistant"):
        letzte = d
if letzte is None:
    sys.exit(1)
m = letzte.get("message") or {}
if letzte["type"] == "assistant" and m.get("stop_reason") != "tool_use":
    sys.exit(1)
try:
    alt = datetime.now(timezone.utc) - datetime.fromisoformat(letzte["timestamp"].replace("Z", "+00:00"))
except (KeyError, ValueError):
    sys.exit(0)
sys.exit(1 if alt.total_seconds() > 7200 and not os.environ.get("FRISCH") else 0)
'
}
aktive_sitzung() {
  local f id letzte neu unter board=${${HALO_BOARD_DIR:-$HOME/halo-board}//[\/.]/-}
  for f in $HOME/.claude/projects/${HOME//[\/.]/-}-halo*/*.jsonl(N.); do
    [[ ${f:h:t} == $board ]] && continue
    unter=(${f:r}/**/*.jsonl(N.mh-2))
    neu=($f(N.mh-2) $unter)
    (( $#neu )) || continue
    id=${f:t:r}
    grep -qs -- "Sitzung $id" $HOME/halo-nacht/*.log(N) && continue
    letzte=$(grep '"role":"user","content":"' $f | tail -n 1)
    [[ $letzte == *'"content":"Aufgabe ohne Rückfrage: Lade bei Bedarf'* ]] && continue
    [[ $letzte == *'\">\nPUSH: '* ]] && continue
    sitzung_arbeitet $f ${unter:+frisch} || continue
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

# Thunderbird unter /Applications auf die aktuelle Version von Mozilla bringen
# (Nachtlauf, vor der Arbeit). Wie thunderbird_installieren() in
# mac-mini-setup.sh nur von Mozilla signierte Programme; die alte App wird erst
# ersetzt, wenn die neue vollständig kopiert ist. Gibt eine Zeile für Protokoll
# und Bericht aus; Rückgabe 0 = aktuell oder aktualisiert.
TB_APP=/Applications/Thunderbird.app
MOZILLA_TEAM=43AQ936H96
thunderbird_aktualisieren() {
  local alt neu tmp rc=1
  autoload -Uz is-at-least
  alt=$(defaults read $TB_APP/Contents/Info.plist CFBundleShortVersionString 2>/dev/null)
  neu=$(curl -sSf -m 20 https://product-details.mozilla.org/1.0/thunderbird_versions.json 2>/dev/null |
        sed -n 's/.*"LATEST_THUNDERBIRD_VERSION": *"\([^"]*\)".*/\1/p')
  [[ -z $neu ]] && { print "Thunderbird ${alt:-fehlt}: aktuelle Version nicht abrufbar, nichts geändert"; return 1 }
  [[ -n $alt ]] && is-at-least $neu $alt && { print "Thunderbird $alt ist aktuell"; return 0 }
  pgrep -f "$TB_APP/Contents/MacOS/thunderbird" >/dev/null && { print "Thunderbird $alt läuft gerade – nicht auf $neu aktualisiert"; return 1 }
  # Ersetzen geht nur, wenn die App diesem Benutzer gehört (sonst „Permission denied“)
  [[ -e $TB_APP && ! -O $TB_APP ]] && {
    print "Thunderbird $alt gehört $(stat -f %Su $TB_APP), nicht $USER – nicht auf $neu aktualisiert (einmal: sudo chown -R $USER $TB_APP)"; return 1 }
  tmp=$(mktemp -d) || return 1
  if curl -sSfL -m 900 -o $tmp/tb.dmg "https://download.mozilla.org/?product=thunderbird-latest-SSL&os=osx&lang=en-US" &&
     mkdir $tmp/mnt && hdiutil attach -nobrowse -readonly -quiet -mountpoint $tmp/mnt $tmp/tb.dmg; then
    if codesign --verify --deep --strict $tmp/mnt/Thunderbird.app &&
       [[ $(codesign -dv $tmp/mnt/Thunderbird.app 2>&1 | sed -n 's/^TeamIdentifier=//p') == $MOZILLA_TEAM ]] &&
       ditto $tmp/mnt/Thunderbird.app $tmp/neu.app; then
      rc=0
    fi
    hdiutil detach -quiet $tmp/mnt
  fi
  if (( rc == 0 )); then
    { [[ ! -e $TB_APP ]] || mv $TB_APP $tmp/alt.app } && mv $tmp/neu.app $TB_APP || {
      rc=1; [[ -e $TB_APP ]] || mv $tmp/alt.app $TB_APP 2>/dev/null }
  fi
  rm -rf $tmp
  if (( rc == 0 )); then
    print "Thunderbird von ${alt:-fehlt} auf $(defaults read $TB_APP/Contents/Info.plist CFBundleShortVersionString) aktualisiert"
  else
    print "Thunderbird ${alt:-fehlt}: Aktualisieren auf $neu gescheitert (Download oder Signatur), nichts geändert"
  fi
  return $rc
}
