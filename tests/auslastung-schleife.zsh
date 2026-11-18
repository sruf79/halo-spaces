#!/bin/zsh
# Auslastungswächter im Volldampf (Maintainer 17.11.2026, Wortlaute in ENTSCHEIDUNGEN.md: „Warum muss ich immer
# nachfragen und damit manuell nachjustieren? Volldampf sollte automatisch sein und permanent auf maximale
# Produktivität überprüfen.“; „Das gilt für taglauf und nachtlauf solange Volldampf aktiv ist“; Ziel: Woche in
# höchstens 48 Stunden nach dem Reset verbraucht, 5-Stunden-Fenster hoch). Von Hand im Hintergrund starten
# (kein LaunchAgent):
#   nohup zsh ~/halo-spaces/tests/auslastung-schleife.zsh >/dev/null 2>&1 &!
#   zsh tests/auslastung-schleife.zsh --einmal    eine Prüfung (und ggf. ein Worker-Start), dann Ende
#   zsh tests/auslastung-schleife.zsh --trocken   nur zeigen, was jetzt geschähe (kein Claude außer ggf. kontingent.sh,
#                                                 kein Worktree, nichts geschrieben)
# Alle TAKT Minuten (10), Tag und Nacht, solange die Volldampf-Zeile aktiv ist:
#   1. Volldampf aktiv? (kein Fenster: Ende) Pause „auslastung“ in pausen.txt? (dann warten) Volldampf pausiert
#      (Wochenlimit, Maintainer 18.11.2026)? Dann warten, Kontingent höchstens stündlich lesen (PAUSE_KONT_ALTER 60 Min.,
#      sonst kontingent.json der anderen Läufe), freien Reset erkennen (wochen_reset_erkennen); danach geht es von selbst weiter.
#   2. Arbeits-Sitzungen zählen: alle „claude -p --model … --session-id|--resume …“ außer Haiku (Worker, Tagesroutine,
#      Nachtlauf, Zwischen-Release; nicht die interaktiven Remote-Control-Sitzungen). Grenze MAX_WORKER (4, höchstens 8,
#      in auslastung.conf änderbar); nachts gilt dieselbe Grenze (Maintainer 17.11.2026); früher MAX_WORKER − 1, damit
#      Kontingent für den Nachtlauf bleibt. Grenze erreicht: warten, ohne das Kontingent zu messen.
#   3. Kontingent (kontingent.json, wenn jünger als KONT_ALTER Minuten, sonst tests/kontingent.sh). Status nicht
#      „allowed…“: warten. Woche ab VOLLDAMPF_WOCHE_ENDE: Volldampf pausiert (Marke wie in den anderen Läufen), warten.
#   4. Soll aus wochen_soll (lauf-hilfen.zsh): ohne freien Reset Stunden seit dem Reset (Di 00:00 UTC) / SOLL_STUNDEN
#      (48) × 100 %; nach einem freien Reset (Anker) Stunden seit dem Anker / Stunden bis zum nächsten automatischen
#      Reset × 100 % („Soll bis nächster Reset“, Maintainer 18.11.2026). Tags: Woche unter Soll oder
#      5-Stunden-Fenster unter FENSTER_MIN (60 %) → ein Worker; nachts nur, wenn die Woche unter Soll liegt.
#      5-Stunden-Fenster ab FENSTER_STOPP (90 %): kein neuer Worker. Höchstens ein Start je Takt und START_ABSTAND.
#   5. Modell MODELL (opus); fable nur bei Woche mehr als FABLE_ABSTAND (20) Punkte unter Soll, 5-Stunden-Fenster
#      unter FABLE_5H (50 %) und keinem anderen Fable-Lauf.
# Ein Worker: eigener Worktree ~/halo-worker/<name> auf eigenem Zweig pruef/<name> (von origin/main), claude -p mit
# denselben Flags wie die Tagesroutine (--permission-mode auto), ohne HALO_LAUF (der Zeitfenster-Hook gilt für ihn),
# Auftrag tests/auslastung-auftrag.md, Ports 2874–2889 (zwei je Worker-Nummer), höchstens WORKER_MAX_MIN Minuten.
# Der Wächter ändert nie Regeln, Rechte oder Hooks, pusht nie, veröffentlicht nie und fasst den Checkout
# ~/halo-spaces nicht an (nur „git fetch“ und „worktree add“).
# Zum Proben: HALO_JETZT=<ISO-Zeit>, HALO_AS_WOCHE/_5H/_STATUS, HALO_AS_AKTIV, HALO_AS_FABLE, HALO_AS_NACHTLAUF=ja|nein,
# HALO_AS_LETZTER=<Unix-Sekunden des letzten Starts>, HALO_AS_CONF, HALO_PAUSEN_DATEI, HALO_VOLLDAMPF_DATEI/…_BEENDET.
emulate -L zsh
setopt extendedglob
export TZ=Europe/Vienna HALO_LAUF=auslastung
path=(~/.local/bin /opt/homebrew/bin /usr/local/bin /Library/Frameworks/Python.framework/Versions/Current/bin $path)
HIER=${0:A:h}
MAIN=${HALO_REPO_MAIN:-${HIER:h}}
DIR=${HALO_AS_DIR:-$HOME/halo-nacht}
ZUSTAND=$DIR/auslastung
WT_BASIS=${HALO_AS_WT:-$HOME/halo-worker}
MODUS=
[[ $1 == --(einmal|trocken) ]] && MODUS=${1#--}
TAG=$(date +%F)
LOG=$DIR/$TAG-auslastung.log
if [[ $MODUS == trocken ]]; then LOG=/dev/null; export HALO_PAUSE_TROCKEN=1 HALO_UEBERSPRUNGEN_LOG=/dev/null; fi
REPO=$MAIN
source $HIER/lauf-hilfen.zsh

# --- Schwellen: Standard, dann auslastung.conf (jede Prüfung neu gelesen, also im Betrieb änderbar) ---
typeset -A K
konf_lesen() {
  K=(TAKT 10 MAX_WORKER 4 SOLL_STUNDEN 48 FENSTER_MIN 60 FENSTER_STOPP 90 MODELL opus MODELL_FABLE fable
     FABLE_ABSTAND 20 FABLE_5H 50 NACHT_BIS 0900 START_ABSTAND 10 KONT_ALTER 15 PAUSE_KONT_ALTER 60 WORKER_MAX_MIN 240)
  local datei=${HALO_AS_CONF:-$HOME/.config/halo-spaces/auslastung.conf} z k v
  [[ -r $datei ]] && while IFS= read -r z; do
    z=${${z%%\#*}//[[:space:]]/}
    [[ $z == [A-Z_]##=?* ]] || continue
    k=${z%%=*} v=${z#*=}
    (( ${+K[$k]} )) && K[$k]=$v
  done < $datei
  [[ $K[MAX_WORKER] == <-> ]] || K[MAX_WORKER]=4
  (( K[MAX_WORKER] > 8 )) && K[MAX_WORKER]=8      # Grenze 8: Ports 2874–2889, zwei je Worker
  (( K[MAX_WORKER] < 0 )) && K[MAX_WORKER]=0
}

# Arbeits-Sitzungen: claude -p mit Sitzungs-ID, ohne Haiku (kontingent.sh, push() sind kurz)
aktiv_zahl() {
  [[ -n $HALO_AS_AKTIV ]] && { print $HALO_AS_AKTIV; return }
  # Prozesse zählen, nicht Zeilen: der Auftragstext hat Zeilenumbrüche (pgrep -l druckt jede Zeile einzeln; 17.11. zählte das 85 statt 1)
  pgrep -f 'claude -p --model [^ ]+ --(session-id|resume) ' 2>/dev/null | while read -r p; do ps -o command= -p $p 2>/dev/null | head -1; done | grep -vc -- '--model haiku'
}
fable_zahl() {
  [[ -n $HALO_AS_FABLE ]] && { print $HALO_AS_FABLE; return }
  pgrep -f "claude -p --model $K[MODELL_FABLE] --(session-id|resume) " 2>/dev/null | grep -c .
}
nachtlauf_laeuft() {
  [[ -n $HALO_AS_NACHTLAUF ]] && { [[ $HALO_AS_NACHTLAUF == ja ]]; return }
  [[ -e $DIR/lauf.lock ]] && kill -0 $(<$DIR/lauf.lock) 2>/dev/null
}
# „<Woche> <5h> <Status>“
KONT_PY='
import sys, json, os, time
d = json.load(open(sys.argv[1])); i = d["info"]; w = i.get("unifiedWindows", {})
wo, h = w.get("seven_day", {}), w.get("five_hour", {})
stand = time.mktime(time.strptime(d["stand"][:19], "%Y-%m-%dT%H:%M:%S"))
if time.time() - stand > float(sys.argv[2]) * 60: sys.exit(1)
print(round(100 * wo.get("utilization", i.get("utilization", 0))), round(100 * h.get("utilization", 0)), wo.get("status", i.get("status", "?")))
'
kontingent() {   # [<höchstes Alter von kontingent.json in Minuten>]
  if [[ -n $HALO_AS_WOCHE ]]; then print -r -- "$HALO_AS_WOCHE ${HALO_AS_5H:-0} ${HALO_AS_STATUS:-allowed}"; return; fi
  local j=$DIR/kontingent.json
  python3 -I -c $KONT_PY $j ${1:-$K[KONT_ALTER]} 2>/dev/null && return
  zsh $HIER/kontingent.sh >/dev/null 2>&1 || return 1
  python3 -I -c $KONT_PY $j 5 2>/dev/null
}
# „<HHMM Wiener Zeit> <Unix-Sekunden>“ (Soll: wochen_soll aus lauf-hilfen.zsh)
UHR_PY='
import os, datetime as dt
j = os.environ.get("HALO_JETZT")
n = dt.datetime.fromisoformat(j).astimezone() if j else dt.datetime.now().astimezone()
print("%s %d" % (n.strftime("%H%M"), n.timestamp()))
'
letzter_start() {
  [[ -n ${HALO_AS_LETZTER+x} ]] && { print -r -- ${HALO_AS_LETZTER:-0}; return }
  [[ -r $ZUSTAND/letzter-start ]] && print -r -- $(<$ZUSTAND/letzter-start) || print 0
}

# Prüfung: gibt „starten <Modell> <Grund>“, „warten <Grund>“ oder „ende <Grund>“ aus
pruefen() {
  local g s u std soll hm jetzt n f grenze nacht= kw w f5 st a fn vd bezug
  konf_lesen
  volldampf_aktiv >/dev/null; vd=$?
  (( vd == 1 )) && { print -r -- "ende Volldampf nicht aktiv"; return }
  g=$(pause_aktiv auslastung) && { print -r -- "warten Pause $g"; return }
  if (( vd == 2 )); then
    # Wochenlimit erreicht: Volldampf pausiert nur (Maintainer 18.11.2026), bis der freie Reset erkannt ist
    kw=($(kontingent $K[PAUSE_KONT_ALTER])) || { print -r -- "warten Volldampf pausiert (Wochenlimit), Kontingent nicht lesbar"; return }
    wochen_reset_erkennen $kw[1] >/dev/null 2>&1
    volldampf_aktiv >/dev/null || { print -r -- "warten Volldampf pausiert (Wochenlimit erreicht, wartet auf den freien Reset) – Woche $kw[1] %"; return }
  fi
  s=($(wochen_soll $K[SOLL_STUNDEN])) && u=($(python3 -I -c $UHR_PY)) || { print -r -- "warten Uhrzeit nicht lesbar"; return }
  std=$s[1] soll=$s[2] hm=$((10#$u[1])) jetzt=$u[2]
  [[ $s[3] == anker ]] && bezug="bis nächster Reset, ${std} h seit freiem Reset" || bezug="${std} h seit Reset"
  { (( hm < K[NACHT_BIS] )) || nachtlauf_laeuft } && nacht=1
  grenze=$K[MAX_WORKER]   # Maintainer 17.11.2026: „maximale produktivität während des volldampf modus, egal ob untertags oder im nachtlauf“ – nachts keine Absenkung mehr
  n=$(aktiv_zahl)
  (( n >= grenze )) && { print -r -- "warten $n Arbeits-Sitzungen aktiv (Grenze $grenze)"; return }
  (( jetzt - $(letzter_start) < K[START_ABSTAND] * 60 )) && { print -r -- "warten letzter Worker vor weniger als $K[START_ABSTAND] Minuten gestartet"; return }
  kw=($(kontingent)) || { print -r -- "warten Kontingent nicht lesbar"; return }
  w=$kw[1] f5=$kw[2] st=$kw[3]
  [[ -z $HALO_PAUSE_TROCKEN ]] && wochen_reset_erkennen $w >/dev/null 2>&1
  [[ $st == allowed* ]] || { print -r -- "warten Wochenlimit (Status $st, Woche $w %)"; return }
  if (( w >= VOLLDAMPF_WOCHE_ENDE )); then
    [[ -z $HALO_PAUSE_TROCKEN ]] && volldampf_wochenlimit_pruefen $w >/dev/null 2>&1
    print -r -- "warten Wochenlimit erreicht (Woche $w %) – Volldampf pausiert bis zum freien Reset"; return
  fi
  a=$(( w - soll ))
  local lage="Woche $w %, Soll $s[2] % ($bezug), 5 Stunden $f5 %, $n von $grenze aktiv${nacht:+, nachts}"
  (( f5 >= K[FENSTER_STOPP] )) && { print -r -- "warten 5-Stunden-Fenster ab $K[FENSTER_STOPP] % – $lage"; return }
  if (( nacht )); then
    (( a < 0 )) || { print -r -- "warten nachts nur unter dem Soll – $lage"; return }
  else
    (( a < 0 || f5 < K[FENSTER_MIN] )) || { print -r -- "warten im Soll und 5-Stunden-Fenster ab $K[FENSTER_MIN] % – $lage"; return }
  fi
  fn=$(fable_zahl)
  if (( a <= -K[FABLE_ABSTAND] && f5 < K[FABLE_5H] )); then   # Maintainer 17.11.2026: im Volldampf keine Mengengrenze für Fable (kein „nur ein Fable-Lauf“)
    print -r -- "starten $K[MODELL_FABLE] Soll weit verfehlt – $lage"
  else
    print -r -- "starten $K[MODELL] $( (( a < 0 )) && print unter dem Soll || print 5-Stunden-Fenster unter $K[FENSTER_MIN] %) – $lage"
  fi
}

# erste freie Worker-Nummer 1…8 (Zustandsdatei fehlt oder Prozess beendet)
freie_nummer() {
  local i z
  for i in {1..8}; do
    # erstes Wort der Zustandszeile = PID (als Feld lesen: ${$(<…)%% *} zerlegt die Zeile in Wörter, kill -0 bekam
    # alle Wörter und scheiterte immer – jeder Worker bekam bis 17.11.2026 Nummer 1 und dieselben Ports 2874/2875)
    [[ -r $ZUSTAND/worker-$i ]] && z=($(<$ZUSTAND/worker-$i)) && kill -0 $z[1] 2>/dev/null && continue
    print $i; return 0
  done
  return 1
}
# beendete Worker einmal protokollieren
aufraeumen() {
  local f z
  for f in $ZUSTAND/worker-<1-8>(N); do
    z=($(<$f))
    kill -0 $z[1] 2>/dev/null && continue
    log "Worker ${f:t} beendet (Sitzung $z[2], Zweig $z[6]): $(head -1 $z[7] 2>/dev/null || print keine Ergebnisdatei)"
    rm -f $f
  done
}
starte_worker() {   # <Modell> <Grund>
  local m=$1 nr name wt zweig sid p1 p2 erg aus stamp=$(date +%Y%m%d-%H%M)
  nr=$(freie_nummer) || { log "keine freie Worker-Nummer (1–8)"; return 1 }
  name=worker-$stamp-$nr zweig=pruef/worker-$stamp-$nr wt=$WT_BASIS/worker-$stamp-$nr
  p1=$((2874 + 2 * (nr - 1))) p2=$((2875 + 2 * (nr - 1)))
  erg=$DIR/$TAG-worker-$nr-${stamp#*-}.erg aus=$DIR/$TAG-worker-$nr-${stamp#*-}.txt
  git -C $MAIN fetch -q origin main 2>>$LOG || { log "git fetch gescheitert – kein Worker"; return 1 }
  mkdir -p $WT_BASIS $ZUSTAND
  git -C $MAIN worktree add -q -b $zweig $wt origin/main 2>>$LOG || { log "Worktree $wt nicht angelegt – kein Worker"; return 1 }
  cp -p $MAIN/repo.conf $wt/ 2>/dev/null
  sid=$(uuidgen | tr A-Z a-z)
  log "Worker $nr gestartet: $m, Sitzung $sid, Zweig $zweig, Worktree $wt, Ports $p1/$p2 ($2)"
  local kopf="JETZT: Worker $nr des Auslastungswächters, Modell $m, $(date '+%F %H:%M'). Name $name, Zweig $zweig,
Worktree $wt (nur dort arbeiten), Ports $p1 und $p2, Ergebnisdatei $erg, Bericht ~/halo-berichte/$TAG-worker-$nr.md (Abschnitt anhängen).
Lage (Skript): $2
"
  # ohne HALO_LAUF: der Zeitfenster-Hook (Push-Sperre, Tests während der CI) gilt für den Worker
  ( cd $wt && env -u HALO_LAUF HALO_WORKER=$nr claude -p --model $m --session-id $sid --permission-mode auto \
      "$kopf
$(<$HIER/auslastung-auftrag.md)" > $aus 2>&1 ) </dev/null &!
  local pid=$!
  ( sleep $(( K[WORKER_MAX_MIN] * 60 )); pkill -f -- "--session-id $sid" ) </dev/null >/dev/null 2>&1 &!
  print -r -- "$pid $sid $m $(date +%s) $wt $zweig $erg" > $ZUSTAND/worker-$nr
  date +%s > $ZUSTAND/letzter-start
}

if [[ $MODUS == trocken ]]; then
  z=$(pruefen)
  print -r -- "Auslastungswächter – Trockenlauf (kein Worker, kein Worktree, nichts geschrieben)"
  print -r -- "Prüfung:  $z"
  [[ $z == starten* ]] && print -r -- "Würde:    Worker mit ${${z#starten }%% *} starten, Worktree $WT_BASIS/worker-<Zeit>-<Nr>, Zweig pruef/worker-<Zeit>-<Nr>, Ports ab 2874"
  exit 0
fi
mkdir -p $DIR $ZUSTAND
LOCK=$DIR/auslastung-schleife.lock
[[ -e $LOCK ]] && kill -0 $(<$LOCK) 2>/dev/null && { print -u2 "Auslastungswächter läuft schon (PID $(<$LOCK))"; exit 1 }
print $$ > $LOCK
trap 'rm -f $LOCK' EXIT
konf_lesen
log "Auslastungswächter gestartet (Takt $K[TAKT] Min., höchstens $K[MAX_WORKER] Arbeits-Sitzungen, Soll in $K[SOLL_STUNDEN] h bzw. nach freiem Reset bis zum nächsten Reset)"
ALT=
while true; do
  aufraeumen
  z=$(pruefen)
  case $z in
    ende*)    log "Ende: ${z#ende }"; break ;;
    starten*) starte_worker ${${z#starten }%% *} "${z#starten * }"; ALT= ;;
    *)        [[ $z != $ALT ]] && log "${z#warten }"; ALT=$z ;;
  esac
  [[ $MODUS == einmal ]] && break
  sleep $(( K[TAKT] * 60 ))
done
exit 0
