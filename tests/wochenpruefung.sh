#!/bin/zsh
# Wöchentliche Prüfung der Läufe auf neon (tests/MAC-MINI.md, Abschnitt 15):
# Claude Code wertet sonntags die letzten 7 Tage aus (CI-Läufe, Nachtläufe,
# Berichte, Board), schreibt Kennzahlen und einen Bericht, korrigiert kleine
# Dinge an Prüfungen selbst und legt Vorschläge zum Ablauf als „Wartet auf OK“
# ins Board. Auftrag: tests/wochenpruefung-auftrag.md. Gestartet vom LaunchAgent
# at.halo-spaces.wochenpruefung sonntags um 08:00; die Datei wird wie
# nachtlauf.sh nach ~/.config/halo-spaces/ kopiert.
#   wochenpruefung.sh [--trocken] <Repo-Ordner>
#   --trocken    nur auswerten und Bericht schreiben: nichts committen, kein
#                Board, keine Kennzahlen-Datei
# Schreibt immer einen Bericht nach ~/halo-berichte/<datum>-wochenpruefung.md
# und schickt dessen Zeile „Kurz: …“ aufs iPhone.
# Pausieren: touch ~/halo-nacht/PAUSE-WOCHE (rm zum Fortsetzen).
emulate -L zsh
setopt extendedglob

TROCKEN=
[[ $1 == --trocken ]] && { TROCKEN=1; shift }
REPO=${1:-$HOME/halo-spaces}
# LaunchAgents lesen ~/.zprofile nicht: claude, gh und python3 ergänzen
path=(~/.local/bin /opt/homebrew/bin /usr/local/bin /Library/Frameworks/Python.framework/Versions/Current/bin $path)
DIR=$HOME/halo-nacht
BERICHTE=$HOME/halo-berichte
TAG=$(date +%F)
mkdir -p $DIR $BERICHTE
LOG=$DIR/$TAG-woche.log
BERICHT=$BERICHTE/$TAG-wochenpruefung.md
FERTIG=$DIR/$TAG-woche.fertig
LOCK=$DIR/woche.lock
START=$(date +%s)
ENDE=$(( START + 6 * 3600 ))            # nach 6 Stunden nicht mehr fortsetzen
HART=$(( START + 7 * 3600 ))            # nach 7 Stunden wird claude beendet
# zeit, log, push (Zeile aufs iPhone) und belegt: gemeinsam mit den anderen Läufen
source ${0:A:h}/lauf-hilfen.zsh

bericht_kurz() {
  local z=$(grep -m1 '^Kurz:' $BERICHT 2>/dev/null | sed 's/^Kurz: *//')
  [[ -z $z ]] && z=$(grep -m1 '^# ' $BERICHT 2>/dev/null | sed 's/^# *//')
  print -r -- $z
}

notbericht() {
  local titel=$1 grund=$2
  {
    print "# halo.spaces Wochenprüfung $TAG – $titel"
    print
    print "Kurz: Wochenprüfung $titel${grund:+ – $grund}"
    print
    print "$(zeit), $(hostname -s)"
    if [[ -n $3 ]]; then
      print
      print "## Ende des Protokolls ($LOG)"
      print
      print '```'
      tail -30 $LOG
      print '```'
    fi
  } > $BERICHT
}

if [[ -e $DIR/PAUSE-WOCHE ]]; then
  log "pausiert (~/halo-nacht/PAUSE-WOCHE)"
  notbericht "pausiert" "~/halo-nacht/PAUSE-WOCHE vorhanden, nichts gemacht"
  push "Wochenprüfung $TAG: pausiert (~/halo-nacht/PAUSE-WOCHE)"
  exit 0
fi

if [[ -e $LOCK ]] && kill -0 $(<$LOCK) 2>/dev/null; then
  log "eigener Lauf (PID $(<$LOCK)) läuft noch – ausgelassen"
  exit 0
fi
print $$ > $LOCK
trap 'rm -f $LOCK' EXIT

# Um 08:00 kann der Nachtlauf noch laufen (hart beendet um 09:00): auf ihn bis
# 09:15 warten, auf einen CI-Lauf bis zu 90 Minuten, auf alles andere nicht.
# Der Trockenlauf testet nichts und darf neben allem laufen.
belegt_woche() {
  [[ -e $DIR/lauf.lock ]] && kill -0 $(<$DIR/lauf.lock) 2>/dev/null && { print "Nachtlauf"; return 0 }
  belegt
}
if [[ -z $TROCKEN ]]; then
  NACHT_BIS=$(date -j -v9H -v15M -v0S +%s) CI_WARTE=0
  while GRUND=$(belegt_woche); do
    if [[ $GRUND == Nachtlauf ]]; then
      (( $(date +%s) < NACHT_BIS )) || break
    elif [[ $GRUND == CI-* ]]; then
      (( CI_WARTE++ < 18 )) || break
    else
      break
    fi
    log "warte: $GRUND"
    sleep 300
  done
  if GRUND=$(belegt_woche); then
    log "ausgelassen: $GRUND"
    notbericht "ausgelassen" "$GRUND"
    push "Wochenprüfung $TAG ausgelassen: $GRUND"
    exit 0
  fi
fi

cd $REPO
SID=$(uuidgen | tr A-Z a-z)
log "Start, Sitzung $SID${TROCKEN:+ (trocken)}"
if [[ -n $TROCKEN ]]; then
  MODUS="TROCKENLAUF: Nur auswerten und den Bericht schreiben. Nichts ändern: keine Dateien im Repo, keine Commits, kein Push, keine Board-Einträge oder Statusänderungen, keine Testläufe, ~/halo-aufgaben/wochen-kennzahlen.json nicht schreiben (nur lesen). Was du ändern bzw. eintragen würdest, steht im Bericht unter „Würde ändern“. Überschrift des Berichts mit „(Probelauf)“."
else
  MODUS="Normaler Lauf: Freigaben wie im Auftrag."
fi
AUFTRAG="Heute: $TAG. Bericht: $BERICHT. Fertig-Datei: $FERTIG. Protokoll: $LOG.
$MODUS

$(<$REPO/tests/wochenpruefung-auftrag.md)"
( while (( $(date +%s) < HART )); do sleep 60; done; pkill -f -- "--session-id $SID|--resume $SID" ) &
WACHE=$!
trap 'rm -f $LOCK; kill $WACHE 2>/dev/null' EXIT

rm -f $FERTIG
RUNDE=0 LEER=0
PROMPT=$AUFTRAG
ARGS=(--session-id $SID)
while true; do
  RUNDE=$((RUNDE + 1))
  OUT=$DIR/$TAG-woche-runde$RUNDE.txt
  claude -p "${ARGS[@]}" --permission-mode auto "$PROMPT" > $OUT 2>&1
  RC=$?
  log "Runde $RUNDE beendet (Exitcode $RC): $(tail -c 300 $OUT | tr '\n' ' ')"
  [[ -e $FERTIG ]] && break
  (( $(date +%s) >= ENDE )) && { log "Zeitgrenze erreicht – nicht mehr fortsetzen"; break }
  ARGS=(--resume $SID)
  if grep -qiE "usage limit|hit your limit|limit reached|resets (at )?[0-9]|rate limit|overloaded" $OUT; then
    log "Limit – Pause 30 Minuten"
    sleep 1800
    PROMPT="Weiter nach der Limit-Pause: mach dort weiter, wo du warst (Auftrag oben). Am Ende Bericht und Fertig-Datei."
  else
    LEER=$((LEER + 1))
    (( LEER > 2 )) && break
    PROMPT="Du hast aufgehört, aber $FERTIG fehlt. Wenn noch etwas offen ist, weitermachen; sonst jetzt Bericht nach $BERICHT schreiben (Vorgabe im Auftrag) und $FERTIG anlegen."
  fi
done

if [[ ! -s $BERICHT ]] || (( $(stat -f %m $BERICHT) < START )); then
  notbericht "ohne Abschluss" "Claude hat keinen Bericht geschrieben (Runden: $RUNDE, letzter Exitcode $RC)" mit-details
fi
log "Ende"
push "Wochenprüfung $TAG${TROCKEN:+ (Probelauf)}: $(bericht_kurz) – Bericht ~/halo-berichte/$TAG-wochenpruefung.md"
exit 0
