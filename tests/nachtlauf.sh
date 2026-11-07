#!/bin/zsh
# Nächtlicher Arbeitslauf auf neon (tests/MAC-MINI.md, Abschnitt 13): Claude Code
# arbeitet offene Einträge der Aufgabenliste ab und veröffentlicht am Ende nach
# AGENTS.md: pushen, CI abwarten (tests/ci-warten.sh), bei Grün release.sh und
# publish.sh. Gestartet vom LaunchAgent
# at.halo-spaces.nachtlauf jede Nacht um 01:30; die Datei wird nach
# ~/.config/halo-spaces/ kopiert, nicht aus dem Checkout benutzt (der Lauf
# ändert den Checkout).
#   nachtlauf.sh <Repo-Ordner>
#   nachtlauf.sh --push-test <Text>     nur eine Testnachricht aufs iPhone
# Schreibt immer einen Bericht nach ~/halo-berichte/<datum>-nachtlauf.md – auch
# wenn ausgelassen, pausiert, nichts zu tun oder die Tests rot – und schickt
# eine Zeile davon aufs iPhone (Push der Claude-App über die Sitzung
# „github.comm.routine“, die Remote Control hat).
# Pausieren: touch ~/halo-nacht/PAUSE (rm zum Fortsetzen) oder mit Ablaufzeit in
# ~/halo-nacht/pausen.txt (pause_setzen in tests/lauf-hilfen.zsh).
# HALO_NACHT_AB=JJJJ-MM-TT: vorher kein Lauf (Standard 2026-11-04).
emulate -L zsh
setopt extendedglob

PUSH_TEST=
[[ $1 == --push-test ]] && { PUSH_TEST=$2; set -- }
REPO=${1:-$HOME/halo-spaces}
# Falscher oder fehlender Repo-Ordner (z. B. eine Option, die diese Version
# nicht kennt): sofort abbrechen statt ohne Auftrag weiterzulaufen
if [[ ! -d $REPO/.git || ! -f $REPO/tests/nachtlauf-auftrag.md ]]; then
  print -u2 "FEHLER: kein halo.spaces-Checkout unter „$REPO“ (Aufruf: ${0:t} [--push-test <Text>] [<Repo-Ordner>]) – abgebrochen"
  exit 2
fi
# LaunchAgents lesen ~/.zprofile nicht: claude, gh und python3 ergänzen
path=(~/.local/bin /opt/homebrew/bin /usr/local/bin /Library/Frameworks/Python.framework/Versions/Current/bin $path)
DIR=$HOME/halo-nacht
BERICHTE=$HOME/halo-berichte
AB=${HALO_NACHT_AB:-2026-11-04}
TAG=$(date +%F)
mkdir -p $DIR $BERICHTE
LOG=$DIR/$TAG.log
BERICHT=$BERICHTE/$TAG-nachtlauf.md
FERTIG=$DIR/$TAG.fertig
LOCK=$DIR/lauf.lock
START=$(date +%s)
ENDE=$(date -j -v8H -v0M -v0S +%s)       # nach 08:00 nicht mehr fortsetzen
HART=$(date -j -v9H -v0M -v0S +%s)       # um 09:00 wird claude beendet
# zeit, log, push (Zeile aufs iPhone) und belegt: gemeinsam mit den anderen Läufen
source ${0:A:h}/lauf-hilfen.zsh
# Vorprüfung ohne Claude: nachtlauf_arbeit(), uebersprungen()
source ${0:A:h}/vorpruefung.zsh
# ungespeicherte Reste im Checkout sind kein Grund auszulassen: der Auftrag nimmt sie mit
REST_MITNEHMEN=1

bericht_kurz() {
  # erste Zeile „Kurz: …“ des Berichts, sonst seine Überschrift
  local z=$(grep -m1 '^Kurz:' $BERICHT 2>/dev/null | sed 's/^Kurz: *//')
  [[ -z $z ]] && z=$(grep -m1 '^# ' $BERICHT 2>/dev/null | sed 's/^# *//')
  print -r -- $z
}

if [[ -n $PUSH_TEST ]]; then
  push $PUSH_TEST
  tail -1 $LOG
  exit 0
fi

# vor dem ersten erlaubten Tag: gar nichts tun (auch kein Bericht)
if [[ $TAG < $AB ]]; then
  log "vor $AB – kein Lauf"
  exit 0
fi

# Bericht ohne Claude (ausgelassen, pausiert, Claude nicht fertig geworden)
notbericht() {
  local titel=$1 grund=$2
  {
    print "# halo.spaces Nachtlauf $TAG – $titel"
    print
    print "Kurz: $titel${grund:+ – $grund}"
    print
    print "$(zeit), $(hostname -s)"
    if [[ -n $3 ]]; then
      print
      print "## Commits dieser Nacht"
      print
      git -C $REPO log --since="@$START" --format='- %h %s' 2>/dev/null | cut -c1-200
      print
      print "## CI-Läufe dieser Nacht"
      print
      gh run list -R sruf79/halo-spaces -w test.yml -b main -L 10 \
        --json databaseId,createdAt,status,conclusion,headSha \
        --jq ".[] | select((.createdAt | fromdate) >= $START) | \"- \(.databaseId) \(.headSha[:7]): \(.status) \(.conclusion)\"" 2>/dev/null
      print
      print "## Release"
      print
      ls -t $BERICHTE/$TAG-halo.spaces-*.md(N) 2>/dev/null | sed 's/^/- Bericht: /'
      ls -t $REPO/dist/release-*.ok(N) 2>/dev/null | head -1 | sed 's/^/- letzte Testmarke: /'
      print
      print "## Ende des Protokolls ($LOG)"
      print
      print '```'
      tail -40 $LOG
      print '```'
    fi
  } > $BERICHT
}

# --- Pause ---
if [[ -e $DIR/PAUSE ]]; then
  log "pausiert (~/halo-nacht/PAUSE)"
  notbericht "pausiert" "~/halo-nacht/PAUSE vorhanden, nichts gemacht"
  push "Nachtlauf $TAG: pausiert (~/halo-nacht/PAUSE)"
  pausen_aufraeumen
  exit 0
fi
# Pause mit Ablaufzeit (~/halo-nacht/pausen.txt, tests/lauf-hilfen.zsh); abgelaufene Zeilen
# räumt der Nachtlauf an seinem Ende auf, auch hier bei einer Pause
if PAUSE_GRUND=$(pause_aktiv nachtlauf); then
  log "pausiert $PAUSE_GRUND"
  uebersprungen nachtlauf "pausiert $PAUSE_GRUND"
  notbericht "pausiert" "Pause $PAUSE_GRUND, nichts gemacht"
  pausen_aufraeumen
  exit 0
fi

# --- eigener Lauf schon aktiv? ---
if [[ -e $LOCK ]] && kill -0 $(<$LOCK) 2>/dev/null; then
  log "eigener Lauf (PID $(<$LOCK)) läuft noch – ausgelassen"
  exit 0                                  # der laufende schreibt seinen Bericht selbst
fi
print $$ > $LOCK
trap 'rm -f $LOCK; pausen_aufraeumen' EXIT

# --- läuft schon etwas anderes? Der Lauf des Maintainers geht immer vor (belegt) ---
# ein CI-Lauf dauert knapp eine Stunde – darauf bis zu 90 Minuten warten, auf alles andere nicht
for i in {1..18}; do
  GRUND=$(belegt) || break
  [[ $GRUND == CI-* ]] || break
  log "warte: $GRUND"
  sleep 300
done
if GRUND=$(belegt); then
  log "ausgelassen: $GRUND"
  notbericht "ausgelassen" "$GRUND"
  push "Nachtlauf $TAG ausgelassen: $GRUND"
  exit 0
fi

# --- Thunderbird aktuell halten: die CI-Runde der Nacht testet dann mit der neuen Version ---
TB_INFO=$(thunderbird_aktualisieren)
log "$TB_INFO"

# --- Claude nur starten, wenn es etwas zu tun gibt (Entscheidung des Maintainers
# vom 6.11.2026, Sitzung global.design.comparison, Wortlaut: „ja, punkt 2 und 3
# umsetzen.“): Vorprüfung ohne Claude, bei „nichts zu tun“ Bericht und Protokollzeile,
# kein Push aufs iPhone. ~/halo-nacht/IMMER erzwingt den Lauf. ---
if GRUND=$(nachtlauf_arbeit); then
  log "Vorprüfung: Arbeit da – $GRUND"
else
  uebersprungen nachtlauf "$GRUND"
  notbericht "übersprungen" "nichts zu tun: $GRUND"
  exit 0
fi

# --- Arbeit: claude -p, bei Limit nach 30 Minuten fortsetzen ---
cd $REPO || exit 2
SID=$(uuidgen | tr A-Z a-z)
log "Start, Sitzung $SID"
AUFTRAG="Heute: $TAG. Bericht: $BERICHT. Fertig-Datei: $FERTIG. Protokoll: $LOG.
Thunderbird auf neon vor dem Lauf: $TB_INFO

$(<$REPO/tests/nachtlauf-auftrag.md)"
# Sicherheitsnetz: um 09:00 hart beenden
( while (( $(date +%s) < HART )); do sleep 60; done; pkill -f -- "--session-id $SID|--resume $SID" ) &
WACHE=$!
trap 'rm -f $LOCK; kill $WACHE 2>/dev/null; pausen_aufraeumen' EXIT

RUNDE=0 LEER=0
PROMPT=$AUFTRAG
ARGS=(--session-id $SID)
while true; do
  RUNDE=$((RUNDE + 1))
  OUT=$DIR/$TAG-runde$RUNDE.txt
  claude -p "${ARGS[@]}" --permission-mode auto "$PROMPT" > $OUT 2>&1
  RC=$?
  log "Runde $RUNDE beendet (Exitcode $RC): $(tail -c 300 $OUT | tr '\n' ' ')"
  [[ -e $FERTIG ]] && break
  (( $(date +%s) >= ENDE )) && { log "08:00 erreicht – nicht mehr fortsetzen"; break }
  ARGS=(--resume $SID)
  if grep -qiE "usage limit|hit your limit|limit reached|resets (at )?[0-9]|rate limit|overloaded" $OUT; then
    log "Limit – Pause 30 Minuten"
    sleep 1800
    PROMPT="Weiter nach der Limit-Pause: mach dort weiter, wo du warst (Auftrag oben). Zeitgrenzen beachten, am Ende Bericht und Fertig-Datei."
  else
    # ohne Fertig-Datei beendet: höchstens zweimal nachfragen
    LEER=$((LEER + 1))
    (( LEER > 2 )) && break
    PROMPT="Du hast aufgehört, aber $FERTIG fehlt. Wenn noch etwas offen ist, weitermachen; sonst jetzt Bericht nach $BERICHT schreiben (Vorgabe im Auftrag) und $FERTIG anlegen."
  fi
done

# --- Bericht sicherstellen und aufs iPhone ---
if [[ ! -s $BERICHT ]] || (( $(stat -f %m $BERICHT) < START )); then
  notbericht "ohne Abschluss" "Claude hat keinen Bericht geschrieben (Runden: $RUNDE, letzter Exitcode $RC)" mit-details
fi
log "Ende"
push "Nachtlauf $TAG: $(bericht_kurz) – Bericht ~/halo-berichte/$TAG-nachtlauf.md"
exit 0
