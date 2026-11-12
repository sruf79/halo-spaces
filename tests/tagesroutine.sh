#!/bin/zsh
export HALO_LAUF=tagesroutine
# Tagesroutine auf neon (Auftrag stufe-6, 10.11.2026): Mo–Fr ab 09:00 arbeitet Claude Code die
# Aufgabenliste ab, bis spätestens 21:00. Gestartet vom LaunchAgent at.halo-spaces.tagesroutine
# (Interpreter /bin/zsh: keine Bildschirmprüfungen mit Maus); die Datei wird wie nachtlauf.sh nach
# ~/.config/halo-spaces/ kopiert, nicht aus dem Checkout benutzt.
#   tagesroutine.sh [<Repo-Ordner>]
#   tagesroutine.sh --trocken [<Repo>]   nur Sollkurve, Modellwahl und Entscheidung zeigen: kein Claude,
#                                        keine Pause, kein Push, kein Board, nichts geschrieben
# Regeln (Auftrag): je Eintrag committen, nie nach main pushen – es pusht nur der Nachtlauf. Fertiges
# schiebt das Skript (nicht Claude) ohne Force auf den Prüfzweig pruef/tagesroutine-<datum> (nur Linux
# und statisch auf GitHub, belegt neon nicht) und löscht ihn am Ende des Tages. Nichts veröffentlichen.
# Kontingent vor jedem neuen Eintrag (tests/kontingent.sh), Sollkurve statt Tagesanteil:
#   Soll = Stunden seit dem Reset (Di 00:00 UTC, Wiener Zeit 01:00 im Winter, 02:00 im Sommer) / 168 × 100 %, Abstand = Ist − Soll.
#   Abstand > NICHTS_NEUES_UEBER → nichts Neues; > NUR_SONNET_UEBER → nur Sonnet;
#   < −WEIT_DARUNTER → alle mit Opus (Fable nur nach Regel); sonst komplexe Opus, Routine Sonnet.
#   5-Stunden-Fenster ≥ FUENF_STUNDEN_MAX → nichts Neues bis zum Fensterende (Pause über pausen.txt).
# Schwellen: ~/.config/halo-spaces/tagesroutine.conf (HALO_TAGESROUTINE_CONF), sonst die neben dem Skript.
# Zum Proben: HALO_JETZT=<ISO-Zeit mit Zone> ersetzt die Uhr; HALO_KONTINGENT_WOCHE / HALO_KONTINGENT_5H
# (Prozent) ersetzen kontingent.sh, HALO_KONTINGENT_5H_ENDE=<ISO-Zeit> das Ende des 5-Stunden-Fensters.
# Bericht: ~/halo-berichte/<datum>-tagesroutine.md (immer, auch bei „nichts Neues“). Pausieren: nur über
# ~/halo-nacht/pausen.txt (pause_setzen tagesroutine <bis> <Grund>, tests/lauf-hilfen.zsh).
emulate -L zsh
setopt extendedglob
export TZ=Europe/Vienna

TROCKEN=
[[ $1 == --trocken ]] && { TROCKEN=1; shift }
REPO=${1:-$HOME/halo-spaces}
HIER=${0:A:h}
if [[ ! -d $REPO/.git ]]; then
  print -u2 "FEHLER: kein halo.spaces-Checkout unter „$REPO“ (Aufruf: ${0:t} [--trocken] [<Repo-Ordner>]) – abgebrochen"
  exit 2
fi
# LaunchAgents lesen ~/.zprofile nicht: claude, gh und python3 ergänzen
path=(~/.local/bin /opt/homebrew/bin /usr/local/bin /Library/Frameworks/Python.framework/Versions/Current/bin $path)

# --- Schwellen: Standard, dann tagesroutine.conf ---
typeset -A KONF
KONF=(
  WOCHENTAGE "1 2 3 4 5"  START 09:00  LETZTER_BEGINN 19:30  ENDE 21:00
  RESET_WOCHENTAG 2  RESET_ZEIT 00:00
  WEIT_DARUNTER 8  IM_SOLL 3  NUR_SONNET_UEBER 0  NICHTS_NEUES_UEBER 2
  FUENF_STUNDEN_MAX 80  PAUSE_OHNE_ENDE 60
  MODELL_STARK opus  MODELL_ROUTINE sonnet  MODELL_FABLE fable  FABLE_5H_MAX 50  FABLE_JE_LAUF 1
  MAX_COMMITS_TAG 8  BELEGT_WARTEN 60
)
KONF_DATEI=${HALO_TAGESROUTINE_CONF:-$HOME/.config/halo-spaces/tagesroutine.conf}
[[ -r $KONF_DATEI ]] || KONF_DATEI=$HIER/tagesroutine.conf
conf_laden() {   # nur SCHLÜSSEL=Wert, kein Code wird ausgeführt
  local z k v
  [[ -r $KONF_DATEI ]] || { KONF_DATEI="(keine, Standardwerte)"; return 0 }
  while IFS= read -r z; do
    z=${z%%\#*}; z=${z##[[:space:]]##}; z=${z%%[[:space:]]##}
    [[ $z == (#b)([A-Z0-9_]##)=(*) ]] || continue
    k=$match[1] v=$match[2]
    (( ${+KONF[$k]} )) || { print -u2 "tagesroutine.conf: unbekannter Schlüssel $k – übergangen"; continue }
    KONF[$k]=$v
  done < $KONF_DATEI
}
conf_laden

# zeit, log, push, belegt, pause_*: gemeinsam mit den anderen Läufen
HILFEN=$HIER/lauf-hilfen.zsh
[[ -r $HILFEN ]] || HILFEN=$REPO/tests/lauf-hilfen.zsh
source $HILFEN
# „tagesroutine“ ist (noch) nicht in PAUSEN_ROUTINEN von lauf-hilfen.zsh: hier ergänzen, sonst gelten
# Pausenzeilen „tagesroutine …“ als unlesbar (beim Einschalten in lauf-hilfen.zsh nachtragen)
(( ${PAUSEN_ROUTINEN[(Ie)tagesroutine]} )) || PAUSEN_ROUTINEN+=(tagesroutine)
export HALO_ROUTINEN="$PAUSEN_ROUTINEN"

DIR=$HOME/halo-nacht
BERICHTE=$HOME/halo-berichte
KONT_JSON=$DIR/kontingent.json
KONT_SKRIPT=$HIER/kontingent.sh
[[ -r $KONT_SKRIPT ]] || KONT_SKRIPT=$REPO/tests/kontingent.sh
AUFTRAG_DATEI=$REPO/tests/tagesroutine-auftrag.md
[[ -r $AUFTRAG_DATEI ]] || AUFTRAG_DATEI=$HIER/tagesroutine-auftrag.md

# --- Sollkurve und Entscheidung (rein rechnerisch, ohne Claude). Eingabe über K_*-Variablen,
# Ausgabe Zeilen SCHLÜSSEL=Wert, die entscheiden() in E[...] übernimmt ---
ENTSCHEID_PY='
import os, math, datetime as dt
from zoneinfo import ZoneInfo
W, UTC, e = ZoneInfo("Europe/Vienna"), dt.timezone.utc, os.environ
def zahl(k, d=float("nan")):
    try: return float(e.get(k, ""))
    except ValueError: return d
def hm(s):
    h, m = s.split(":"); return int(h), int(m)
j = e.get("HALO_JETZT")
jetzt = dt.datetime.fromisoformat(j).astimezone(W) if j else dt.datetime.now(W)
rt = int(e["K_RESET_WOCHENTAG"]); rh, rm = hm(e["K_RESET_ZEIT"])
# letzter Reset: Wochentag rt, Uhrzeit rh:rm in UTC (fest, Sommerzeit ändert ihn nicht; Maintainer 12.11.2026), nicht nach jetzt
ju = jetzt.astimezone(UTC)
d = ju.date() - dt.timedelta(days=(ju.isoweekday() - rt) % 7)
reset = dt.datetime(d.year, d.month, d.day, rh, rm, tzinfo=UTC)
if reset > ju:
    d -= dt.timedelta(days=7); reset = dt.datetime(d.year, d.month, d.day, rh, rm, tzinfo=UTC)
d2 = d + dt.timedelta(days=7); naechster = dt.datetime(d2.year, d2.month, d2.day, rh, rm, tzinfo=UTC).astimezone(W)
reset = reset.astimezone(W)
std = (jetzt.astimezone(UTC) - reset.astimezone(UTC)).total_seconds() / 3600
soll = min(100.0, std / 168 * 100)
woche, h5 = zahl("K_WOCHE"), zahl("K_5H")
weit, band = zahl("K_WEIT_DARUNTER", 8), zahl("K_IM_SOLL", 3)
nur_s, stopp = zahl("K_NUR_SONNET_UEBER", 0), zahl("K_NICHTS_NEUES_UEBER", 2)
h5max, fmax = zahl("K_FUENF_STUNDEN_MAX", 80), zahl("K_FABLE_5H_MAX", 50)
stark, routine = e["K_MODELL_STARK"], e["K_MODELL_ROUTINE"]
# Zeitfenster
tage = {int(x) for x in e["K_WOCHENTAGE"].split()}
def heute(s):
    h, m = hm(s); return jetzt.replace(hour=h, minute=m, second=0, microsecond=0)
fenster = jetzt.isoweekday() in tage and heute(e["K_START"]) <= jetzt < heute(e["K_ENDE"])
neu_zeit = fenster and jetzt < heute(e["K_LETZTER_BEGINN"])
def wt(x): return "MoDiMiDoFrSaSo"[2 * x.isoweekday() - 2:2 * x.isoweekday()] + x.strftime(" %Y-%m-%d %H:%M")
aus = {"JETZT": wt(jetzt), "TAG": jetzt.strftime("%Y-%m-%d"), "RESET": wt(reset), "NAECHSTER": wt(naechster),
       "STUNDEN": "%.1f" % std, "SOLL": "%.1f" % soll, "FENSTER": "ja" if fenster else "nein",
       "NEU_ZEIT": "ja" if neu_zeit else "nein", "PAUSE_BIS": "", "FABLE": "nein"}
if math.isnan(woche):
    aus.update(ABSTAND="?", STUFE="unbekannt", ENTSCHEIDUNG="nichts", M_KOMPLEX="-", M_ROUTINE="-",
               GRUND="Kontingent nicht lesbar – nichts Neues beginnen")
else:
    a = woche - soll
    aus["ABSTAND"] = "%+.1f" % a
    if a > stopp:
        aus.update(STUFE="deutlich darüber (> %g)" % stopp, ENTSCHEIDUNG="nichts", M_KOMPLEX="-", M_ROUTINE="-",
                   GRUND="Woche %.1f Punkte über dem Soll – nichts Neues bis morgen" % a)
    elif a > nur_s:
        aus.update(STUFE="darüber (> %g)" % nur_s, ENTSCHEIDUNG="nur_sonnet", M_KOMPLEX=routine, M_ROUTINE=routine,
                   GRUND="über dem Soll – bremsen")
    elif a < -weit:
        aus.update(STUFE="weit darunter (< -%g)" % weit, ENTSCHEIDUNG="neu", M_KOMPLEX=stark, M_ROUTINE=stark,
                   GRUND="weit unter dem Soll – aufholen")
        if not math.isnan(h5) and h5 < fmax:
            aus["FABLE"] = "ja"
    else:
        aus.update(STUFE=("im Soll (±%g)" % band) if abs(a) <= band else "darunter", ENTSCHEIDUNG="neu",
                   M_KOMPLEX=stark, M_ROUTINE=routine, GRUND="im Soll" if abs(a) <= band else "unter dem Soll")
    # zweite Bremse: 5-Stunden-Fenster
    if not math.isnan(h5) and h5 >= h5max:
        ende = e.get("K_5H_ENDE", "")
        try:
            bis = dt.datetime.fromisoformat(ende).astimezone(W)
        except ValueError:
            bis = jetzt + dt.timedelta(minutes=zahl("K_PAUSE_OHNE_ENDE", 60))
        aus.update(ENTSCHEIDUNG="nichts", M_KOMPLEX="-", M_ROUTINE="-", FABLE="nein",
                   PAUSE_BIS=bis.isoformat(timespec="minutes"),
                   GRUND="5-Stunden-Fenster %.0f %% ≥ %g %% – nichts Neues bis %s%s" % (
                       h5, h5max, bis.strftime("%H:%M"), "" if ende else " (Fensterende unbekannt, %g Min.)" % zahl("K_PAUSE_OHNE_ENDE", 60)))
for k, v in aus.items():
    print("%s=%s" % (k, v))
'

# Kontingent lesen: simuliert (HALO_KONTINGENT_*), im Trockenlauf aus kontingent.json, sonst kontingent.sh.
# Setzt K_WOCHE, K_5H, K_5H_ENDE, K_QUELLE, K_FABLE (Fable-Zähler, falls das rate_limit_event einen hat).
kontingent_lesen() {
  K_WOCHE= K_5H= K_5H_ENDE= K_FABLE= K_QUELLE=
  if [[ -n $HALO_KONTINGENT_WOCHE ]]; then
    K_WOCHE=$HALO_KONTINGENT_WOCHE K_5H=${HALO_KONTINGENT_5H:-0} K_5H_ENDE=${HALO_KONTINGENT_5H_ENDE:-}
    K_QUELLE="simuliert (HALO_KONTINGENT_WOCHE/_5H)"
    return 0
  fi
  local zeile
  if [[ -n $TROCKEN ]]; then
    K_QUELLE="zwischengespeichert ($KONT_JSON, kein Aufruf im Trockenlauf)"
  else
    zeile=$(zsh $KONT_SKRIPT 2>/dev/null)
    K_QUELLE="kontingent.sh: $zeile"
    [[ $zeile == Woche* ]] || return 1
  fi
  # Zahlen und Fensterende aus kontingent.json (schreibt kontingent.sh bei jedem Aufruf)
  local werte
  werte=$(python3 -I -c '
import json, sys, datetime as dt
from zoneinfo import ZoneInfo
d = json.load(open(sys.argv[1]))["info"]; w = d.get("unifiedWindows", {})
wo, h = w.get("seven_day", {}), w.get("five_hour", {})
ende = dt.datetime.fromtimestamp(h["resetsAt"], ZoneInfo("Europe/Vienna")).isoformat(timespec="minutes") if h.get("resetsAt") else ""
fable = [k for k in w if "fable" in k.lower()]
print(round(100 * wo.get("utilization", d.get("utilization", 0))), round(100 * h.get("utilization", 0)), ende or "-",
      ("%s=%d%%" % (fable[0], round(100 * w[fable[0]].get("utilization", 0)))) if fable else "-", d.get("stand", ""))
' $KONT_JSON 2>/dev/null) || return 1
  local t=(${=werte})
  K_WOCHE=$t[1] K_5H=$t[2] K_5H_ENDE=${t[3]:#-} K_FABLE=${t[4]:#-}
  [[ -n $TROCKEN ]] && K_QUELLE+=", Stand $(stat -f '%Sm' -t '%F %H:%M' $KONT_JSON)"
  return 0
}

# Entscheidung berechnen → Feld E (SOLL, ABSTAND, STUFE, ENTSCHEIDUNG, M_KOMPLEX, M_ROUTINE, FABLE, PAUSE_BIS, GRUND …)
typeset -A E
entscheiden() {
  local k v
  E=()
  kontingent_lesen || K_WOCHE=
  while IFS='=' read -r k v; do E[$k]=$v; done < <(
    K_WOCHE=$K_WOCHE K_5H=$K_5H K_5H_ENDE=$K_5H_ENDE \
    K_RESET_WOCHENTAG=$KONF[RESET_WOCHENTAG] K_RESET_ZEIT=$KONF[RESET_ZEIT] K_WOCHENTAGE=$KONF[WOCHENTAGE] \
    K_START=$KONF[START] K_ENDE=$KONF[ENDE] K_LETZTER_BEGINN=$KONF[LETZTER_BEGINN] \
    K_WEIT_DARUNTER=$KONF[WEIT_DARUNTER] K_IM_SOLL=$KONF[IM_SOLL] K_NUR_SONNET_UEBER=$KONF[NUR_SONNET_UEBER] \
    K_NICHTS_NEUES_UEBER=$KONF[NICHTS_NEUES_UEBER] K_FUENF_STUNDEN_MAX=$KONF[FUENF_STUNDEN_MAX] \
    K_PAUSE_OHNE_ENDE=$KONF[PAUSE_OHNE_ENDE] K_FABLE_5H_MAX=$KONF[FABLE_5H_MAX] \
    K_MODELL_STARK=$KONF[MODELL_STARK] K_MODELL_ROUTINE=$KONF[MODELL_ROUTINE] \
    python3 -I -c $ENTSCHEID_PY)
  [[ -n $E[SOLL] ]]
}
entscheidung_text() {
  case $E[ENTSCHEIDUNG] in
    neu)        print -r -- "neu beginnen" ;;
    nur_sonnet) print -r -- "nur Sonnet" ;;
    *)          print -r -- "nichts Neues" ;;
  esac
}
kontingent_zeile() {   # eine Zeile für Protokoll und Bericht
  print -r -- "Woche ${K_WOCHE:-?} % (Soll $E[SOLL] %, Abstand $E[ABSTAND] Punkte, $E[STUFE]), 5 Stunden ${K_5H:-?} %${K_5H_ENDE:+ bis ${K_5H_ENDE[12,16]}}${K_FABLE:+, Fable $K_FABLE} → $(entscheidung_text)"
}

# =================================== Trockenlauf ===================================
if [[ -n $TROCKEN ]]; then
  LOG=/dev/null                         # pause_aktiv & Co. schreiben nichts
  export HALO_PAUSE_TROCKEN=1 HALO_UEBERSPRUNGEN_LOG=/dev/null
  entscheiden || { print -u2 "FEHLER: Entscheidung nicht berechenbar (python3/zoneinfo?)"; exit 1 }
  print "Tagesroutine – Trockenlauf (nichts geschrieben, kein Claude, kein Push)"
  print "Jetzt:        $E[JETZT] (Wiener Zeit${HALO_JETZT:+, HALO_JETZT})"
  print "Schwellen:    $KONF_DATEI"
  print "Zeitfenster:  Tage $KONF[WOCHENTAGE] $KONF[START]–$KONF[ENDE]: $E[FENSTER]; neuer Eintrag (vor $KONF[LETZTER_BEGINN]): $E[NEU_ZEIT]"
  print "Reset:        $E[RESET] → nächster $E[NAECHSTER]; verstrichen $E[STUNDEN] h von 168 h"
  print "Kontingent:   $K_QUELLE"
  print "Soll:         $E[SOLL] %   Ist Woche: ${K_WOCHE:-?} %   Abstand: $E[ABSTAND] Punkte → $E[STUFE]"
  print "5 Stunden:    ${K_5H:-?} % (Grenze $KONF[FUENF_STUNDEN_MAX] %)${K_5H_ENDE:+, Fensterende $K_5H_ENDE}"
  print "Modellwahl:   komplexe Einträge: $E[M_KOMPLEX], Routine: $E[M_ROUTINE]; Fable: $( [[ $E[FABLE] == ja ]] && print "erlaubt ($KONF[MODELL_FABLE], nur nach Opus-Fehlschlag, nacheinander, höchstens $KONF[FABLE_JE_LAUF])" || print nein )"
  print "Entscheidung: $(entscheidung_text) – $E[GRUND]"
  if [[ -n $E[PAUSE_BIS] ]]; then
    print "Pause:        würde in ${HALO_PAUSEN_DATEI:-~/halo-nacht/pausen.txt} schreiben (Trockenlauf: NICHT geschrieben):"
    print "              tagesroutine $E[PAUSE_BIS] 5-Stunden-Fenster ${K_5H} % ≥ $KONF[FUENF_STUNDEN_MAX] %, keine neuen Einträge"
    print "              danach warten bis ${${E[PAUSE_BIS]}[12,16]} (höchstens bis $KONF[LETZTER_BEGINN]), Kontingent neu lesen"
  fi
  if g=$(pause_aktiv tagesroutine); then print "Pause aktiv:  $g"; else print "Pause aktiv:  nein"; fi
  if [[ $E[FENSTER] != ja ]]; then
    print "Würde:        nichts tun (außerhalb des Zeitfensters), kein Bericht"
  elif [[ $E[ENTSCHEIDUNG] == nichts ]]; then
    if [[ -n $E[PAUSE_BIS] ]]; then print "Würde:        Pause schreiben, bis zum Fensterende warten, dann Kontingent neu lesen (Bericht am Ende des Laufs)"
    else print "Würde:        Bericht „nichts Neues“, Lauf beenden"; fi
  else
    print "Würde:        Plan-Runde mit $E[M_KOMPLEX], dann je Eintrag Kontingent prüfen und claude -p --model <komplex: $E[M_KOMPLEX] | Routine: $E[M_ROUTINE]>;"
    print "              Fertiges ohne Force auf pruef/tagesroutine-${E[TAG]//-/}, Zweig am Ende löschen; Bericht ~/halo-berichte/$E[TAG]-tagesroutine.md"
  fi
  exit 0
fi

# =================================== echter Lauf ===================================
mkdir -p $DIR $BERICHTE
HALO_KONTINGENT_WOCHE=0 entscheiden >/dev/null 2>&1 || true   # nur TAG und Zeitfenster, ohne kontingent.sh
TAG=${E[TAG]:-$(date +%F)}
LOG=$DIR/$TAG-tagesroutine.log
BERICHT=$BERICHTE/$TAG-tagesroutine.md
PLAN=$DIR/$TAG-tagesroutine-plan.tsv
LOCK=$DIR/tagesroutine.lock
PRUEF=pruef/tagesroutine-${TAG//-/}
uhr() { date -j -f '%F %H:%M' "$TAG $1" +%s }
LETZTER=$(uhr $KONF[LETZTER_BEGINN])
HART=$(uhr $KONF[ENDE])
ENDGRUND= ERLEDIGT=0 ZURUECK=0 ENTSCHEIDUNG_NOETIG=0 FABLE_LAEUFE=0 N=0
typeset -a MODELLE_GENUTZT ABSCHNITTE
START_KOPF=$(git -C $REPO rev-parse -q --verify main 2>/dev/null)

# Bericht: Kopf + Abschnitte der Runden + Ende; immer geschrieben
bericht_schreiben() {
  local titel=$1 f
  {
    print "# halo.spaces Tagesroutine $TAG – $titel"
    print
    print "Kurz: $titel – $ERLEDIGT erledigt, $ZURUECK zurück auf Todo${ENDGRUND:+, Ende: $ENDGRUND}"
    print
    print "$(zeit), $(hostname -s); Schwellen: $KONF_DATEI"
    print
    print "## Kontingent"
    print
    print "- Anfang: ${K_ANFANG:-nicht gelesen}"
    print "- Ende: ${K_ENDE:-nicht gelesen}"
    print "- Fable-Wochenzähler: ${K_FABLE:-nicht im rate_limit_event (kontingent.sh); get_usage der Leitstelle}"
    print "- Fable-Läufe heute: $FABLE_LAEUFE"
    print
    print "## Modelle"
    print
    (( $#MODELLE_GENUTZT )) && print -rl -- "- "${^MODELLE_GENUTZT} || print "- keine Claude-Runde"
    for f in $ABSCHNITTE; do [[ -s $f ]] && { print; cat $f }; done
    print
    print "## Commits heute (nicht gepusht, der Nachtlauf nimmt sie mit)"
    print
    git -C $REPO log ${START_KOPF:+$START_KOPF..}main --format='- %h %s' 2>/dev/null | cut -c1-200
    print
    print "## Prüfzweig"
    print
    print -r -- "- ${PRUEF_INFO:-nicht benutzt}"
    print
    print "## Ende"
    print
    print -r -- "- ${ENDGRUND:-unbekannt} ($(date +%H:%M))"
  } > $BERICHT
}

if [[ $E[FENSTER] != ja ]]; then
  log "außerhalb des Zeitfensters ($KONF[WOCHENTAGE] $KONF[START]–$KONF[ENDE]) – kein Lauf"
  exit 0
fi
if pause_start tagesroutine; then
  ENDGRUND="Pause $PAUSE_GRUND"; bericht_schreiben "pausiert"; exit 0
fi
if [[ -e $LOCK ]] && kill -0 $(<$LOCK) 2>/dev/null; then
  log "eigener Lauf (PID $(<$LOCK)) läuft noch – ausgelassen"; exit 0
fi
print $$ > $LOCK
WACHE=
trap 'rm -f $LOCK; [[ -n $WACHE ]] && kill $WACHE 2>/dev/null' EXIT

# Nachtlauf noch nicht fertig (endet spätestens 09:00)? Bis 30 Minuten warten.
for i in {1..6}; do
  [[ -e $DIR/lauf.lock ]] && kill -0 $(<$DIR/lauf.lock) 2>/dev/null || break
  log "warte: Nachtlauf läuft noch"; sleep 300
done

# eine Claude-Runde mit Wache bis ENDE; Sitzungs-ID ins Protokoll (aktive_sitzung() übergeht eigene Läufe)
runde() {   # <Modell> <Prompt> <Ausgabe>
  local sid=$(uuidgen | tr A-Z a-z)
  log "Runde mit $1, Sitzung $sid"
  ( while (( $(date +%s) < HART )); do sleep 60; done; pkill -f -- "--session-id $sid" ) &
  WACHE=$!
  claude -p --model $1 --session-id $sid --permission-mode auto "$2" > $3 2>&1
  local rc=$?
  kill $WACHE 2>/dev/null; WACHE=
  log "Runde beendet (Exitcode $rc): $(tail -c 300 $3 | tr '\n' ' ')"
  grep -qiE "usage limit|hit your limit|limit reached|rate limit" $3 && return 9
  return $rc
}
kopf() {
  print -r -- "Heute: $TAG. Protokoll: $LOG. Plan: $PLAN. Jetzt: $(date +%H:%M); kein neuer Eintrag nach $KONF[LETZTER_BEGINN], harte Grenze $KONF[ENDE].
Kontingent (Skript): $(kontingent_zeile)

$(<$AUFTRAG_DATEI)"
}
# Prüfzweig ohne Force: lokaler main-Stand dorthin (nur Fertiges; Claude pusht nie selbst)
PRUEF_INFO= ROT_GEMELDET=
pruef_pushen() {
  if git -C $REPO push -q origin main:refs/heads/$PRUEF 2>>$LOG; then
    PRUEF_INFO="$PRUEF zuletzt $(git -C $REPO rev-parse --short main) ($(date +%H:%M))"
    log "Prüfzweig: $PRUEF_INFO"
  else
    log "Prüfzweig: Push abgelehnt (kein Force) – Stand nicht geprüft"
  fi
}
pruef_rot() {   # gibt „<Lauf-ID> <Commit>“ aus, wenn der letzte abgeschlossene Lauf rot ist
  gh run list -R sruf79/halo-spaces -b $PRUEF -L 1 --json databaseId,headSha,status,conclusion \
    --jq '.[0] | select(.status == "completed" and .conclusion == "failure") | "\(.databaseId) \(.headSha[:7])"' 2>/dev/null
}

# --- Kontingent am Anfang ---
entscheiden; K_ANFANG=$(kontingent_zeile); log "Kontingent Anfang: $K_ANFANG"

# --- Hauptschleife: erst Plan, dann je Eintrag ---
GEPLANT=
while true; do
  if (( $(date +%s) >= LETZTER )); then ENDGRUND="$KONF[LETZTER_BEGINN] erreicht, kein neuer Eintrag"; break; fi
  if g=$(pause_aktiv tagesroutine); then ENDGRUND="Pause $g"; break; fi
  # Mac belegt (CI, Testlauf, andere Sitzung, ungespeicherte Änderungen)? Warten, dann neu versuchen
  w=0
  while GRUND=$(belegt) && (( w < KONF[BELEGT_WARTEN] && $(date +%s) < LETZTER )); do
    log "warte: $GRUND"; sleep 300; w=$((w + 5))
  done
  if GRUND=$(belegt); then log "belegt nach $w Min.: $GRUND – später erneut"; continue; fi
  if (( $(git -C $REPO rev-list --count ${START_KOPF:+$START_KOPF..}main 2>/dev/null || print 0) >= KONF[MAX_COMMITS_TAG] )); then
    ENDGRUND="$KONF[MAX_COMMITS_TAG] Commits heute erreicht"; break
  fi
  # Kontingent vor jedem neuen Eintrag
  entscheiden; log "Kontingent: $(kontingent_zeile)"
  if [[ $E[ENTSCHEIDUNG] == nichts ]]; then
    if [[ -n $E[PAUSE_BIS] ]]; then
      pause_setzen tagesroutine $E[PAUSE_BIS] "5-Stunden-Fenster ${K_5H} % ≥ $KONF[FUENF_STUNDEN_MAX] %, keine neuen Einträge" 2>>$LOG
      log "Pause bis $E[PAUSE_BIS] (pausen.txt)"
      bis=$(python3 -I -c 'import sys,datetime as d;print(int(d.datetime.fromisoformat(sys.argv[1]).timestamp()))' $E[PAUSE_BIS])
      (( bis > LETZTER )) && { ENDGRUND="$E[GRUND] (Fensterende nach $KONF[LETZTER_BEGINN])"; break }
      while (( $(date +%s) < bis )); do sleep 120; done
      continue
    fi
    ENDGRUND=$E[GRUND]; break
  fi

  if [[ -z $GEPLANT ]]; then
    # Plan-Runde: Commits durchsehen, Liste laden, Plan schreiben (komplexe zuerst)
    ABSCHNITTE+=($DIR/$TAG-tagesroutine-plan.md)
    MODELLE_GENUTZT+=("Plan: $E[M_KOMPLEX]")
    runde $E[M_KOMPLEX] "$(kopf)

JETZT: Plan-Runde (Schritte 1–2 des Auftrags). Schreibe den Plan nach $PLAN und den Abschnitt „## Plan“ nach $DIR/$TAG-tagesroutine-plan.md. Keinen Eintrag bearbeiten." \
      $DIR/$TAG-tagesroutine-plan.txt
    rc=$?
    GEPLANT=1
    (( rc == 9 )) && { ENDGRUND="Limit in der Plan-Runde"; break }
    [[ -s $PLAN ]] || { ENDGRUND="kein Plan (keine geeignete Aufgabe oder Plan-Runde gescheitert)"; break }
    continue      # Kontingent vor dem ersten Eintrag erneut prüfen
  fi

  # nächster offener Eintrag aus dem Plan (Spalten: id, komplex|routine, Titel)
  ZEILE=$(grep -v '^#' $PLAN | grep -vFf <(cut -f1 $DIR/$TAG-tagesroutine-erledigt.txt 2>/dev/null; print -- '@@') | head -1)
  [[ -n $ZEILE ]] || { ENDGRUND="Plan abgearbeitet"; break }
  ID=${ZEILE%%$'\t'*} REST=${ZEILE#*$'\t'}; ART=${REST%%$'\t'*} TITEL=${REST#*$'\t'}
  [[ $ART == komplex ]] && MODELL=$E[M_KOMPLEX] || MODELL=$E[M_ROUTINE]
  N=$((N + 1)) ERG=$DIR/$TAG-tagesroutine-$N.erg
  ROT=$(pruef_rot); [[ -n $ROT && $ROT != $ROT_GEMELDET ]] || ROT=
  ABSCHNITTE+=($DIR/$TAG-tagesroutine-$N.md)
  MODELLE_GENUTZT+=("Eintrag $N ($ART): $MODELL – $TITEL")
  runde $MODELL "$(kopf)

JETZT: genau einen Eintrag bearbeiten (Schritt 3 des Auftrags): $ID ($ART) „$TITEL“. Modell dieser Runde: $MODELL.
${ROT:+Zuerst: Prüfzweig $PRUEF ist rot (Lauf ${ROT%% *}, Commit ${ROT##* }) – Ursache beheben oder den Commit mit git revert zurücknehmen (Regel 4).}
Ergebnisdatei: $ERG (eine Zeile, siehe Auftrag). Berichtsabschnitt: $DIR/$TAG-tagesroutine-$N.md." $DIR/$TAG-tagesroutine-$N.txt
  rc=$?
  [[ -n $ROT ]] && ROT_GEMELDET=$ROT
  print -r -- "$ID	$(head -1 $ERG 2>/dev/null)" >> $DIR/$TAG-tagesroutine-erledigt.txt
  case $(head -1 $ERG 2>/dev/null) in
    erledigt*)    ERLEDIGT=$((ERLEDIGT + 1)); pruef_pushen ;;
    entscheidung*) ENTSCHEIDUNG_NOETIG=$((ENTSCHEIDUNG_NOETIG + 1)) ;;
    fable*)
      # Fable-Regel: nur weit unter dem Soll, 5-Stunden-Fenster unter FABLE_5H_MAX, nacheinander, höchstens FABLE_JE_LAUF
      entscheiden
      if [[ $E[FABLE] == ja ]] && (( FABLE_LAEUFE < KONF[FABLE_JE_LAUF] )) && (( $(date +%s) < LETZTER )); then
        FABLE_LAEUFE=$((FABLE_LAEUFE + 1)) N=$((N + 1))
        ABSCHNITTE+=($DIR/$TAG-tagesroutine-$N.md)
        MODELLE_GENUTZT+=("Eintrag $((N - 1)) erneut: $KONF[MODELL_FABLE] (Opus hat ihn nicht gelöst)")
        runde $KONF[MODELL_FABLE] "$(kopf)

JETZT: Fable-Runde (Fable-Regel des Auftrags) für $ID „$TITEL“: Opus hat ihn nicht gelöst, Begründung: $(head -1 $ERG). Vorgeschichte in $DIR/$TAG-tagesroutine-$((N - 1)).md. Ergebnisdatei: $DIR/$TAG-tagesroutine-$N.erg. Berichtsabschnitt: $DIR/$TAG-tagesroutine-$N.md." \
          $DIR/$TAG-tagesroutine-$N.txt
        case $(head -1 $DIR/$TAG-tagesroutine-$N.erg 2>/dev/null) in
          erledigt*) ERLEDIGT=$((ERLEDIGT + 1)); pruef_pushen ;;
          *) ZURUECK=$((ZURUECK + 1)) ;;
        esac
      else
        ZURUECK=$((ZURUECK + 1)); log "Fable nicht erlaubt ($(kontingent_zeile)) – Eintrag bleibt zurück auf Todo"
      fi ;;
    *) ZURUECK=$((ZURUECK + 1)) ;;
  esac
  (( rc == 9 )) && { ENDGRUND="Limit erreicht"; break }
done

# --- Abschluss: Prüfzweig auswerten und löschen, Kontingent, Bericht, eine Zeile aufs iPhone ---
if git -C $REPO ls-remote --exit-code -q origin refs/heads/$PRUEF >/dev/null 2>&1; then
  ST=$(gh run list -R sruf79/halo-spaces -b $PRUEF -L 1 --json databaseId,headSha,status,conclusion \
        --jq '.[0] | "Lauf \(.databaseId) \(.headSha[:7]): \(.status) \(.conclusion)"' 2>/dev/null)
  git -C $REPO push -q origin --delete $PRUEF 2>>$LOG && PRUEF_INFO+="; letzter $ST; Zweig gelöscht" \
    || PRUEF_INFO+="; letzter $ST; Löschen fehlgeschlagen"
fi
entscheiden; K_ENDE=$(kontingent_zeile)
log "Kontingent Ende: $K_ENDE"
log "Ende: $ENDGRUND"
bericht_schreiben "$ERLEDIGT erledigt"
if (( ENTSCHEIDUNG_NOETIG )); then
  push "Tagesroutine $TAG: $ENTSCHEIDUNG_NOETIG Einträge brauchen eine Entscheidung – Bericht ~/halo-berichte/$TAG-tagesroutine.md" tagesroutine handeln
else
  push "Tagesroutine $TAG: $ERLEDIGT erledigt, $ZURUECK zurück, Ende: $ENDGRUND – Bericht ~/halo-berichte/$TAG-tagesroutine.md" tagesroutine
fi
exit 0
