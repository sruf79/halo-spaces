#!/bin/zsh
export HALO_LAUF=rundgang
# Wöchentlicher Design-Rundgang auf neon (tests/MAC-MINI.md, Abschnitt 17;
# Entscheidung des Maintainers vom 5.11.2026): nimmt mit tests/ui_tour.py alle
# Oberflächen auf und misst sie (--messung), vergleicht mit
# tests/rundgang_vergleich.py gegen den häufigsten Wert und den vorigen
# Rundgang und lässt Claude (Auftrag tests/rundgang-auftrag.md) Ausreißer ins
# Board tragen, den Bericht schreiben und die Ergebnisseite aktualisieren.
# Gestartet vom LaunchAgent at.halo-spaces.rundgang samstags 10:00; die Datei
# wird wie die anderen Läufe nach ~/.config/halo-spaces/ kopiert.
#   rundgang-woche.sh [--trocken] [--only <ids>] [<Repo-Ordner>]
#   --trocken    Rundgang und Vergleich, aber kein Claude (kein Board, kein Bericht)
#   --only       nur diese ids (Probelauf von Hand: wartet nur auf CI und
#                Testläufe, nicht auf Sitzungen; Ablage ~/halo-tour/<datum>-probe)
# Der Stand kommt aus origin/main in einem eigenen Checkout (~/halo-tour/stand),
# ~/halo-spaces selbst bleibt unberührt. Ablage ~/halo-tour/<datum>/.
# Pausieren: nur über ~/halo-nacht/pausen.txt (pause_setzen in tests/lauf-hilfen.zsh, mit Ablaufzeit).
emulate -L zsh
setopt extendedglob

TROCKEN= ONLY=
while [[ $1 == --* ]]; do
  case $1 in
    --trocken) TROCKEN=1 ;;
    --only) ONLY=$2; shift ;;
    *) print -u2 "unbekannte Option: $1"; exit 2 ;;
  esac
  shift
done
REPO=${1:-$HOME/halo-spaces}
if [[ ! -d $REPO/.git ]]; then
  print -u2 "FEHLER: kein halo.spaces-Checkout unter „$REPO“ – abgebrochen"
  exit 2
fi
# LaunchAgents lesen ~/.zprofile nicht: claude, gh und python3 ergänzen
path=(~/.local/bin /opt/homebrew/bin /usr/local/bin /Library/Frameworks/Python.framework/Versions/Current/bin $path)
DIR=$HOME/halo-nacht
TOUR=$HOME/halo-tour
STAND=$TOUR/stand
BERICHTE=$HOME/halo-berichte
TAG=$(date +%F)
OUT=$TOUR/$TAG${ONLY:+-probe}
mkdir -p $DIR $TOUR $BERICHTE
LOG=$DIR/$TAG-rundgang.log
BERICHT=$BERICHTE/$TAG-rundgang.md
FERTIG=$DIR/$TAG-rundgang.fertig
LOCK=$DIR/rundgang.lock
KENNZAHLEN=$HOME/halo-aufgaben/rundgang-kennzahlen.json
START=$(date +%s)
SPAETESTENS=$(date -j -v14H -v0M -v0S +%s)   # nach 14:00 nicht mehr anfangen
HART=$(( START + 9 * 3600 ))                  # claude spätestens nach 9 Stunden beenden
PORT_HELL=2853 PORT_DUNKEL=2854
# zeit, log, push (Zeile aufs iPhone) und belegt: gemeinsam mit den anderen Läufen
source ${0:A:h}/lauf-hilfen.zsh
# Vorprüfung ohne Claude: rundgang_auswertung_noetig(), uebersprungen()
source ${0:A:h}/vorpruefung.zsh
# Auswertung mit Sonnet und niedriger Reasoning-Stufe (Entscheidung des Maintainers
# vom 6.11.2026, Sitzung global.design.comparison, Wortlaut: „ja, punkt 2 und 3
# umsetzen.“)
MODELL=(--model sonnet --effort low)

notbericht() {
  {
    print "# halo.spaces Design-Rundgang $TAG – $1"
    print
    print "Kurz: Design-Rundgang $1${2:+ – $2}"
    print
    print "$(zeit), $(hostname -s)"
    print
    print '```'
    tail -30 $LOG 2>/dev/null
    print '```'
  } > $BERICHT
}
# eine Zeile je Lauf in die Kennzahlen (auch ausgelassene), für die Wochenprüfung
kennzahl() {   # <status> [<json-Teil>]
  python3 - $KENNZAHLEN "$TAG" "$1" "$(( ($(date +%s) - START) / 60 ))" "${2:-}" <<'EOF'
import json, os, sys
p, tag, status, minuten, extra = sys.argv[1:]
d = json.load(open(p)) if os.path.exists(p) else []
d = [x for x in d if x.get("datum") != tag]
d.append({"datum": tag, "status": status, "minuten": int(minuten), **json.loads(extra or "{}")})
os.makedirs(os.path.dirname(p), exist_ok=True)
json.dump(d[-60:], open(p, "w"), indent=1, ensure_ascii=False)
EOF
}

# Pause: eine Datei, ~/halo-nacht/pausen.txt (tests/lauf-hilfen.zsh)
if pause_start rundgang; then
  notbericht "pausiert" "Pause $PAUSE_GRUND"
  kennzahl pausiert
  exit 0
fi
if [[ -e $LOCK ]] && kill -0 $(<$LOCK) 2>/dev/null; then
  log "Rundgang: eigener Lauf (PID $(<$LOCK)) läuft noch – ausgelassen"
  exit 0
fi
print $$ > $LOCK
trap 'rm -f $LOCK' EXIT

# Warten, bis neon frei ist: Nachtlauf, Wochen- und Doku-Prüfung, CI,
# Testläufe, andere Sitzungen in einer Runde (belegt() aus lauf-hilfen.zsh).
# Spätester Start 14:00, sonst auslassen.
belegt_rundgang() {
  local l
  for l in lauf:Nachtlauf woche:Wochenprüfung doku:Doku-Prüfung; do
    [[ -e $DIR/${l%%:*}.lock ]] && kill -0 $(<$DIR/${l%%:*}.lock) 2>/dev/null && { print ${l#*:}; return 0 }
  done
  belegt
}
# Probelauf (--only) wird von Hand gestartet: nicht auf Sitzungen warten, nur
# nicht neben CI oder anderen Testläufen
if [[ -n $ONLY ]]; then
  belegt_rundgang() {
    pgrep -f Runner.Worker >/dev/null && { print "CI-Lauf auf dem GitHub-Runner"; return 0 }
    pgrep -f "tests/(halo_test|ui_tour|update_test|store_shots)\.py" >/dev/null && { print "Testlauf"; return 0 }
    return 1
  }
fi
while GRUND=$(belegt_rundgang); do
  if (( $(date +%s) >= SPAETESTENS )); then
    log "Rundgang ausgelassen (14:00 erreicht): $GRUND"
    notbericht "ausgelassen" "bis 14:00 belegt: $GRUND"
    kennzahl ausgelassen "{\"grund\": $(print -r -- $GRUND | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))')}"
    push "Design-Rundgang $TAG ausgelassen: bis 14:00 belegt ($GRUND)"
    exit 0
  fi
  log "Rundgang wartet: $GRUND"
  sleep 300
done

# Darf dieser Prozess den Bildschirm aufnehmen? (ui_tour.py nimmt Popups mit
# screencapture -l auf.) Ergebnis für mac-mini-setup.sh --check festhalten.
BA=$(osascript -l JavaScript -e 'ObjC.import("Cocoa"); ObjC.bindFunction("CGPreflightScreenCaptureAccess", ["bool", []]); function run() { return $.CGPreflightScreenCaptureAccess() ? "ja" : "nein"; }' 2>&1)
print -r -- "$(zeit) $BA (Prozess $(ps -o comm= -p $$), Eltern $(ps -o comm= -p $PPID))" > $TOUR/bildschirmaufnahme.txt
log "Rundgang: Bildschirmaufnahme erlaubt: $BA"
[[ $BA == ja ]] || push "Design-Rundgang $TAG: Bildschirmaufnahme für den LaunchAgent nicht erlaubt ($BA) – Popups fehlen im Rundgang"

# Stand von origin/main in einem eigenen Checkout bauen
log "Rundgang: Start ${TROCKEN:+(trocken) }${ONLY:+nur $ONLY}"
if [[ ! -d $STAND/.git ]]; then
  git clone -q $(git -C $REPO remote get-url origin) $STAND || { log "Klonen gescheitert"; notbericht "gescheitert" "Klonen gescheitert"; kennzahl gescheitert; exit 1 }
fi
# Probelauf: der lokale Stand von $REPO (noch nicht gepushte Commits), sonst origin/main
if [[ -n $ONLY ]]; then QUELLE=($REPO HEAD); else QUELLE=(origin main); fi
git -C $STAND fetch -q $QUELLE && git -C $STAND checkout -q --detach -f FETCH_HEAD && git -C $STAND clean -qfdx -e dist ||
  { log "Stand nicht abrufbar"; notbericht "gescheitert" "git fetch origin main gescheitert"; kennzahl gescheitert; push "Design-Rundgang $TAG gescheitert: Stand nicht abrufbar"; exit 1 }
COMMIT=$(git -C $STAND rev-parse HEAD)
( cd $STAND && ./build.sh ) >> $LOG 2>&1 || { log "build.sh gescheitert"; notbericht "gescheitert" "build.sh gescheitert"; kennzahl gescheitert; push "Design-Rundgang $TAG gescheitert: build.sh"; exit 1 }
XPI=$(ls -t $STAND/dist/halo-spaces-*.xpi(N) | grep -v -- '-atn\.xpi' | head -1)
mkdir -p $OUT
print $COMMIT > $OUT/commit.txt

# Dunkel nur, wenn seit dem letzten Rundgang Farben betroffen sind (wie in der CI);
# beim ersten Rundgang mit Messwerten immer beide
VORHER=
for d in $TOUR/20[0-9][0-9]-[0-9][0-9]-[0-9][0-9](N/On); do
  m=($d/*-messung.json(N))
  [[ $d != $OUT ]] && (( $#m )) && { VORHER=$d; break }
done
SCHEMATA=(hell)
if [[ -z $VORHER || ! -s $VORHER/commit.txt ]]; then
  SCHEMATA=(hell dunkel); log "Rundgang: erster Lauf mit Messwerten – hell und dunkel"
elif FARBEN=$(cd $STAND && tests/farben-betroffen.sh $(<$VORHER/commit.txt) HEAD); then
  SCHEMATA=(hell dunkel); log "Rundgang: $FARBEN"
else
  log "Rundgang: $FARBEN"
fi

declare -A DAUER
for sc in $SCHEMATA; do
  if [[ -z $ONLY ]] && (( $(date +%s) >= SPAETESTENS + 4 * 3600 )); then
    log "Rundgang $sc nicht mehr gestartet (zu spät)"
    continue
  fi
  P=$PORT_HELL A=()
  [[ $sc == dunkel ]] && { P=$PORT_DUNKEL; A=(--dark) }
  t0=$(date +%s)
  log "Rundgang $sc: Start (Port $P, $COMMIT)"
  python3 $STAND/tests/ui_tour.py --xpi $XPI --port $P $A --messung --out $OUT ${ONLY:+--only} ${ONLY:+$ONLY} > $OUT/tour-$sc.log 2>&1
  RC=$?
  DAUER[$sc]=$(( ($(date +%s) - t0) / 60 ))
  log "Rundgang $sc: Ende (Exitcode $RC, ${DAUER[$sc]} min): $(tail -1 $OUT/tour-$sc.log)"
done

python3 $STAND/tests/rundgang_vergleich.py $OUT ${VORHER:+--vorher} ${VORHER:+$VORHER} >> $LOG 2>&1 || log "Vergleich gescheitert"
ZAHLEN=$(python3 -c '
import json, sys
v = json.load(open(sys.argv[1]))
print(json.dumps({"commit": sys.argv[2][:7], "schemata": v["schemata"], "kennzahlen": v["kennzahlen"],
  "neue_original_symbole": len(v["neue_original_symbole"]), "dauer_min": json.loads(sys.argv[3])}))' \
  $OUT/vergleich.json $COMMIT "{$(for k v in ${(kv)DAUER}; do print -n "\"$k\": $v,"; done | sed 's/,$//')}" 2>/dev/null)

# Ältere Läufe nach 8 Wochen ausdünnen: Bilder weg, Mess-, Ergebnis- und Vergleichsdateien bleiben
for d in $TOUR/20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]*(N/m+56); do
  rm -f $d/*.png(N) $d/tour-*.log(N)
  log "Rundgang: Bilder in ${d:t} gelöscht (älter als 8 Wochen)"
done

if [[ -n $TROCKEN || -n $ONLY ]]; then
  log "Rundgang: ohne Claude beendet (${TROCKEN:+trocken}${ONLY:+Probelauf})"
  kennzahl ${ONLY:+probelauf}${TROCKEN:+trocken} "$ZAHLEN"
  exit 0
fi

# Claude nur, wenn der Vergleich mit dem vorigen Rundgang etwas Neues zeigt
# (neue oder geänderte Ausreißer, neu nicht erreichte Oberflächen); sonst Bericht
# und Protokollzeile ohne Claude und ohne Push
if GRUND=$(rundgang_auswertung_noetig $OUT/vergleich.json); then
  log "Rundgang: Auswertung nötig – $GRUND"
else
  log "Rundgang: ohne Claude beendet (übersprungen)"
  uebersprungen rundgang "$GRUND"
  notbericht "übersprungen" "nichts Neues: $GRUND"
  kennzahl uebersprungen "$ZAHLEN"
  exit 0
fi

# Auswertung durch Claude (Auftrag im geprüften Stand, Arbeitsordner ~/halo-spaces
# nur zum Lesen von AGENTS.md; das Board ändert Claude über gh)
SID=$(uuidgen | tr A-Z a-z)
log "Rundgang: Claude, Sitzung $SID"
AUFTRAG="Heute: $TAG. Rundgang-Ordner: $OUT (Vergleich: $OUT/vergleich.md und vergleich.json). Voriger Rundgang: ${VORHER:-keiner}. Stand: $COMMIT. Gelaufen: $SCHEMATA. Bericht: $BERICHT. Fertig-Datei: $FERTIG. Protokoll: $LOG.

$(<$STAND/tests/rundgang-auftrag.md)"
( while (( $(date +%s) < HART )); do sleep 60; done; pkill -f -- "--session-id $SID|--resume $SID" ) &
WACHE=$!
trap 'rm -f $LOCK; kill $WACHE 2>/dev/null' EXIT
rm -f $FERTIG
RUNDE=0 PROMPT=$AUFTRAG ARGS=(--session-id $SID)
while (( RUNDE < 4 )); do
  RUNDE=$((RUNDE + 1))
  OUTF=$DIR/$TAG-rundgang-runde$RUNDE.txt
  ( cd $REPO && claude -p $MODELL "${ARGS[@]}" --permission-mode auto "$PROMPT" ) > $OUTF 2>&1
  RC=$?
  log "Rundgang: Runde $RUNDE beendet (Exitcode $RC): $(tail -c 300 $OUTF | tr '\n' ' ')"
  [[ -e $FERTIG ]] && break
  ARGS=(--resume $SID)
  if grep -qiE "usage limit|hit your limit|limit reached|resets (at )?[0-9]|rate limit|overloaded" $OUTF; then
    log "Limit – Pause 30 Minuten"; sleep 1800
    PROMPT="Weiter nach der Limit-Pause: mach dort weiter, wo du warst (Auftrag oben). Am Ende Bericht und Fertig-Datei."
  else
    PROMPT="Du hast aufgehört, aber $FERTIG fehlt. Wenn noch etwas offen ist, weitermachen; sonst jetzt Bericht nach $BERICHT schreiben und $FERTIG anlegen."
  fi
done
if [[ ! -s $BERICHT ]] || (( $(stat -f %m $BERICHT) < START )); then
  notbericht "ohne Abschluss" "Claude hat keinen Bericht geschrieben (Runden: $RUNDE, letzter Exitcode $RC)"
fi
kennzahl fertig "$ZAHLEN"
KURZ=$(grep -m1 '^Kurz:' $BERICHT | sed 's/^Kurz: *//')
log "Rundgang: Ende"
push "Design-Rundgang $TAG: ${KURZ:-siehe Bericht} – Bericht ~/halo-berichte/$TAG-rundgang.md"
exit 0
