#!/bin/zsh
# Wöchentliche Prüfung der Läufe auf neon (tests/MAC-MINI.md, Abschnitt 15):
# Claude Code wertet sonntags die letzten 7 Tage aus (CI-Läufe, Nachtläufe,
# Berichte, Board), schreibt Kennzahlen und einen Bericht, korrigiert kleine
# Dinge an Prüfungen und – mit Beleg und Wirkungskontrolle – Abläufe selbst
# und legt nur, was Entscheidungen des Maintainers berührt, als „Wartet auf
# OK“ ins Board. Auftrag: tests/wochenpruefung-auftrag.md. Gestartet vom LaunchAgent
# at.halo-spaces.wochenpruefung sonntags um 08:00; die Datei wird wie
# nachtlauf.sh nach ~/.config/halo-spaces/ kopiert.
# Mit --doku dieselbe Prüfung für alle .md-Dateien (Doku-Prüfung, samstags
# 08:00, LaunchAgent at.halo-spaces.dokupruefung, Auftrag
# tests/dokupruefung-auftrag.md, tests/MAC-MINI.md Abschnitt 16).
#   wochenpruefung.sh [--doku] [--trocken] <Repo-Ordner>
#   --trocken    nur auswerten und Bericht schreiben: nichts committen, kein
#                Board, keine Kennzahlen-Datei
# Schreibt immer einen Bericht nach ~/halo-berichte/<datum>-wochenpruefung.md
# (bzw. -dokupruefung.md) und schickt dessen Zeile „Kurz: …“ aufs iPhone.
# Pausieren: pause_setzen (~/halo-nacht/pausen.txt, Routine wochenpruefung bzw. dokupruefung).
emulate -L zsh
setopt extendedglob

TROCKEN= DOKU=
while [[ $1 == --* ]]; do
  case $1 in
    --trocken) TROCKEN=1 ;;
    --doku) DOKU=1 ;;
    *) print -u2 "unbekannte Option: $1"; exit 2 ;;
  esac
  shift
done
# Namen je Art: Wochenprüfung (Läufe) oder Doku-Prüfung (.md-Dateien)
if [[ -n $DOKU ]]; then
  ART=doku NAME=Doku-Prüfung BERICHT_NAME=dokupruefung PAUSE_ROUTINE=dokupruefung AUFTRAG_DATEI=dokupruefung-auftrag.md
else
  ART=woche NAME=Wochenprüfung BERICHT_NAME=wochenpruefung PAUSE_ROUTINE=wochenpruefung AUFTRAG_DATEI=wochenpruefung-auftrag.md
fi
REPO=${1:-$HOME/halo-spaces}
# Falscher oder fehlender Repo-Ordner (z. B. eine Option, die diese Version
# nicht kennt): sofort abbrechen statt ohne Auftrag weiterzulaufen
if [[ ! -d $REPO/.git || ! -f $REPO/tests/$AUFTRAG_DATEI ]]; then
  print -u2 "FEHLER: kein halo.spaces-Checkout unter „$REPO“ (Aufruf: ${0:t} [--doku] [--trocken] [<Repo-Ordner>]) – abgebrochen"
  exit 2
fi
# LaunchAgents lesen ~/.zprofile nicht: claude, gh und python3 ergänzen
path=(~/.local/bin /opt/homebrew/bin /usr/local/bin /Library/Frameworks/Python.framework/Versions/Current/bin $path)
DIR=$HOME/halo-nacht
BERICHTE=$HOME/halo-berichte
TAG=$(date +%F)
mkdir -p $DIR $BERICHTE
LOG=$DIR/$TAG-$ART.log
BERICHT=$BERICHTE/$TAG-$BERICHT_NAME.md
FERTIG=$DIR/$TAG-$ART.fertig
LOCK=$DIR/$ART.lock
START=$(date +%s)
ENDE=$(( START + 6 * 3600 ))            # nach 6 Stunden nicht mehr fortsetzen
HART=$(( START + 7 * 3600 ))            # nach 7 Stunden wird claude beendet
# zeit, log, push (Zeile aufs iPhone) und belegt: gemeinsam mit den anderen Läufen
source ${0:A:h}/lauf-hilfen.zsh
# Vorprüfung der Doku-Prüfung ohne Claude: doku_geaendert(), uebersprungen()
source ${0:A:h}/vorpruefung.zsh
# Modelle (Entscheidung des Maintainers vom 6.11.2026, Sitzung global.design.comparison,
# Wortlaut: „ja, punkt 2 und 3 umsetzen.“): die Doku-Prüfung mit Sonnet und niedriger
# Reasoning-Stufe, die Wochenprüfung bleibt bei Opus (Standard der Installation)
MODELL=()
[[ -n $DOKU ]] && MODELL=(--model sonnet --effort low)

bericht_kurz() {
  local z=$(grep -m1 '^Kurz:' $BERICHT 2>/dev/null | sed 's/^Kurz: *//')
  [[ -z $z ]] && z=$(grep -m1 '^# ' $BERICHT 2>/dev/null | sed 's/^# *//')
  print -r -- $z
}

notbericht() {
  local titel=$1 grund=$2
  {
    print "# halo.spaces $NAME $TAG – $titel"
    print
    print "Kurz: $NAME $titel${grund:+ – $grund}"
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

# Pause: eine Datei, ~/halo-nacht/pausen.txt (tests/lauf-hilfen.zsh)
if pause_start $PAUSE_ROUTINE; then
  notbericht "pausiert" "Pause $PAUSE_GRUND, nichts gemacht"
  exit 0
fi

if [[ -e $LOCK ]] && kill -0 $(<$LOCK) 2>/dev/null; then
  log "eigener Lauf (PID $(<$LOCK)) läuft noch – ausgelassen"
  exit 0
fi
print $$ > $LOCK
trap 'rm -f $LOCK' EXIT

# Doku-Prüfung: Teilprüfung bei geänderten .md oder geänderten, in einer .md genannten
# Skripten, Vollprüfung am ersten Samstag im Monat bzw. mit ~/halo-nacht/DOKU-VOLL
# (Regeln in vorpruefung.zsh); sonst ohne Claude und ohne Push überspringen
DOKU_HINWEIS=
if [[ -n $DOKU && -z $TROCKEN ]]; then
  # nicht in $(…): doku_geaendert setzt DOKU_VOLL, DOKU_STAND und die Dateilisten, die in einer
  # Unter-Shell verloren gingen (Auftrag lautete immer „Teilprüfung, keine geänderten .md“)
  GRUND_DATEI=$(mktemp)
  doku_geaendert > $GRUND_DATEI; GRUND_RC=$?
  GRUND=$(<$GRUND_DATEI); rm -f $GRUND_DATEI
  if (( GRUND_RC == 0 )); then
    log "Vorprüfung: $GRUND"
    if (( DOKU_VOLL )); then
      DOKU_HINWEIS="Vollprüfung: alle .md-Dateien gründlich prüfen."
      MODELL=(--model sonnet --effort medium)
    else
      DOKU_HINWEIS="Teilprüfung seit der letzten Prüfung (Stand ${DOKU_STAND[1,7]}). Gründlich prüfen: geänderte .md-Dateien (${(j:, :)DOKU_GEAENDERT:-keine})${DOKU_SKRIPTE:+ und die .md, die geänderte Skripte nennen (Skripte: ${(j:, :)DOKU_SKRIPTE}; .md: ${(j:, :)DOKU_BETROFFEN})}. Alle übrigen .md nur auf Widersprüche und Doppeltes zu diesen prüfen, nicht Absatz für Absatz."
    fi
  else
    uebersprungen dokupruefung "$GRUND"
    notbericht "übersprungen" "nichts zu prüfen: $GRUND"
    exit 0
  fi
  # Wächter für den Kern: harte Sperren und Pflichtbegriffe müssen in AGENTS.md stehen, keine
  # @-Importe (tests/doku_kern_check.sh); Rot geht als Hinweis in den Auftrag an Claude
  if KERN=$(zsh $REPO/tests/doku_kern_check.sh $REPO/AGENTS.md 2>&1); then
    log "Wächter AGENTS.md: ${KERN%%$'\n'*}"
  else
    log "Wächter AGENTS.md ROT: ${KERN//$'\n'/ | }"
    DOKU_HINWEIS="$DOKU_HINWEIS WÄCHTER ROT (tests/doku_kern_check.sh): ${KERN//$'\n'/ | } – fehlende Sperren oder Begriffe wiederherstellen (nicht den Wächter lockern); gehört die Regel nicht mehr in den Kern, nur mit Entscheidung des Maintainers (Eintrag „Doku: …“ mit „Wartet auf OK“)."
  fi
  # Pausen: eine Datei (tests/pausen_check.sh: Einzelfälle der Logik, keine Reste alter Pausen-Dateien)
  if PAUSEN=$(zsh $REPO/tests/pausen_check.sh $REPO 2>&1); then
    log "Wächter Pausen: ${PAUSEN%%$'\n'*}"
  else
    log "Wächter Pausen ROT: ${PAUSEN//$'\n'/ | }"
    DOKU_HINWEIS="$DOKU_HINWEIS WÄCHTER ROT (tests/pausen_check.sh): ${PAUSEN//$'\n'/ | } – Pausen-Logik bzw. Doku an die eine Datei ~/halo-nacht/pausen.txt anpassen."
  fi
fi

# Um 08:00 kann der Nachtlauf noch laufen (hart beendet um 09:00): auf ihn bis
# 09:15 warten, auf einen CI-Lauf bis zu 90 Minuten, auf alles andere nicht.
# Der Trockenlauf testet nichts und darf neben allem laufen. Die Doku-Prüfung
# ändert nur .md-Dateien und testet nichts: CI, Testläufe und VM stören sie
# nicht, nur der Nachtlauf, andere Sitzungen am Repo und release/publish.
belegt_woche() {
  [[ -e $DIR/lauf.lock ]] && kill -0 $(<$DIR/lauf.lock) 2>/dev/null && { print "Nachtlauf"; return 0 }
  belegt
}
if [[ -z $TROCKEN ]]; then
  NACHT_BIS=$(date -j -v9H -v15M -v0S +%s) CI_WARTE=0
  while GRUND=$(belegt_woche); do
    if [[ $GRUND == Nachtlauf ]]; then
      (( $(date +%s) < NACHT_BIS )) || break
    elif [[ -n $DOKU && $GRUND == (CI-*|Testlauf*|Thunderbird mit Marionette|Marionette-Port*|Lauf in der Windows-VM) ]]; then
      break
    elif [[ $GRUND == CI-* ]]; then
      (( CI_WARTE++ < 18 )) || break
    else
      break
    fi
    log "warte: $GRUND"
    sleep 300
  done
  if GRUND=$(belegt_woche) && ! [[ -n $DOKU && $GRUND == (CI-*|Testlauf*|Thunderbird mit Marionette|Marionette-Port*|Lauf in der Windows-VM) ]]; then
    log "ausgelassen: $GRUND"
    notbericht "ausgelassen" "$GRUND"
    push "$NAME $TAG ausgelassen: $GRUND"
    exit 0
  fi
fi

cd $REPO || exit 2
SID=$(uuidgen | tr A-Z a-z)
log "Start, Sitzung $SID${TROCKEN:+ (trocken)}"
if [[ -n $TROCKEN ]]; then
  MODUS="TROCKENLAUF: Nur auswerten und den Bericht schreiben. Nichts ändern: keine Dateien im Repo, keine Commits, kein Push, keine Board-Einträge oder Statusänderungen, keine Testläufe, die Kennzahlen-Datei unter ~/halo-aufgaben nicht schreiben (nur lesen). Was du ändern bzw. eintragen würdest, steht im Bericht unter „Würde ändern“. Überschrift des Berichts mit „(Probelauf)“."
else
  MODUS="Normaler Lauf: Freigaben wie im Auftrag."
fi
AUFTRAG="Heute: $TAG. Bericht: $BERICHT. Fertig-Datei: $FERTIG. Protokoll: $LOG.
$MODUS${DOKU_HINWEIS:+
$DOKU_HINWEIS}

$(<$REPO/tests/$AUFTRAG_DATEI)"
( while (( $(date +%s) < HART )); do sleep 60; done; pkill -f -- "--session-id $SID|--resume $SID" ) &
WACHE=$!
trap 'rm -f $LOCK; kill $WACHE 2>/dev/null' EXIT

rm -f $FERTIG
RUNDE=0 LEER=0
PROMPT=$AUFTRAG
ARGS=(--session-id $SID)
while true; do
  RUNDE=$((RUNDE + 1))
  OUT=$DIR/$TAG-$ART-runde$RUNDE.txt
  claude -p $MODELL "${ARGS[@]}" --permission-mode auto "$PROMPT" > $OUT 2>&1
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

# fertige Doku-Prüfung (mit ihren eigenen Commits) merken: nächstes Mal nur, was danach geändert wurde
[[ -n $DOKU && -z $TROCKEN && -e $FERTIG ]] && { doku_stand_merken; rm -f $DOKU_VOLL_DATEI }
if [[ ! -s $BERICHT ]] || (( $(stat -f %m $BERICHT) < START )); then
  notbericht "ohne Abschluss" "Claude hat keinen Bericht geschrieben (Runden: $RUNDE, letzter Exitcode $RC)" mit-details
fi
log "Ende"
push "$NAME $TAG${TROCKEN:+ (Probelauf)}: $(bericht_kurz) – Bericht ~/halo-berichte/$TAG-$BERICHT_NAME.md"
exit 0
