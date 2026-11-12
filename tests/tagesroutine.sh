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
#   Abstand > SPAR_MAX → nichts Neues, bis zur vollen Stunde warten und neu entscheiden; 0 < Abstand ≤ SPAR_MAX → Sparmodus (Maintainer
#   12.11.2026): Rate = (100 − Ist − RESERVE_NACHT) / Stunden bis zum Reset (nie negativ); seit START
#   angesparte Punkte (Rate × Stunden − heute im Sparmodus verbraucht) müssen die geschätzten Kosten je
#   Eintrag decken (SPAR_KOSTEN_JE_EINTRAG, ab 3 Messungen deren Mittel), sonst bis zur vollen Stunde
#   warten; nur SPAR_MODELL, nur Einträge, die es sicher schafft, höchstens SPAR_MAX_EINTRAEGE_TAG je Tag
#   bis 3 gemessen sind; Messungen in ~/halo-nacht/tagesroutine-spar.tsv (HALO_SPAR_DATEI).
#   < −WEIT_DARUNTER → alle mit Opus (Fable nur nach Regel); sonst komplexe Opus, Routine Sonnet.
#   5-Stunden-Fenster ≥ FUENF_STUNDEN_MAX → nichts Neues bis zum Fensterende, höchstens bis zur vollen
#   Stunde (Pause über pausen.txt), dann neu entscheiden. Jedes Warten ohne Claude, nur bis LETZTER_BEGINN
#   (danach beginnt kein Eintrag mehr; Maintainer 12.11.2026: warten statt enden, höchstens bis 21:00).
# Tageslimit MAX_COMMITS_TAG zählt nur Commits dieses Laufs: Autorzeit innerhalb einer eigenen Claude-Runde
#   (übersteht Rebase und Amend, fremde Commits außerhalb der Runden zählen nicht). Probe:
#   HALO_RUNDEN_ZEIT="<von> <bis>;…" (Unix-Sekunden) tagesroutine.sh --zaehlen [<Repo>]
# Schwellen: ~/.config/halo-spaces/tagesroutine.conf (HALO_TAGESROUTINE_CONF), sonst die neben dem Skript.
# Zum Proben: HALO_JETZT=<ISO-Zeit mit Zone> ersetzt die Uhr; HALO_KONTINGENT_WOCHE / HALO_KONTINGENT_5H
# (Prozent) ersetzen kontingent.sh, HALO_KONTINGENT_5H_ENDE=<ISO-Zeit> das Ende des 5-Stunden-Fensters.
# Bericht: ~/halo-berichte/<datum>-tagesroutine.md (immer, auch bei „nichts Neues“). Pausieren: nur über
# ~/halo-nacht/pausen.txt (pause_setzen tagesroutine <bis> <Grund>, tests/lauf-hilfen.zsh).
emulate -L zsh
setopt extendedglob
export TZ=Europe/Vienna

TROCKEN= ZAEHLEN=
[[ $1 == --trocken ]] && { TROCKEN=1; shift }
[[ $1 == --zaehlen ]] && { ZAEHLEN=1; shift }
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
  WEIT_DARUNTER 8  IM_SOLL 3
  SPAR_MAX 10  RESERVE_NACHT 15  SPAR_MAX_EINTRAEGE_TAG 1  SPAR_KOSTEN_JE_EINTRAG 1.0  SPAR_MODELL haiku
  FUENF_STUNDEN_MAX 80  PAUSE_OHNE_ENDE 60
  MODELL_STARK opus  MODELL_ROUTINE sonnet  MODELL_FABLE fable  FABLE_5H_MAX 50  FABLE_JE_LAUF 1
  MAX_COMMITS_TAG 20 BELEGT_WARTEN 60
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
SPAR_DATEI=${HALO_SPAR_DATEI:-$DIR/tagesroutine-spar.tsv}   # Messungen des Sparmodus (eine Zeile je Runde)
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
h5max, fmax = zahl("K_FUENF_STUNDEN_MAX", 80), zahl("K_FABLE_5H_MAX", 50)
stark, routine = e["K_MODELL_STARK"], e["K_MODELL_ROUTINE"]
spar_max, reserve = zahl("K_SPAR_MAX", 10), zahl("K_RESERVE_NACHT", 15)
spar_tag, kosten0 = zahl("K_SPAR_MAX_EINTRAEGE_TAG", 1), zahl("K_SPAR_KOSTEN_JE_EINTRAG", 1.0)
spar_m = e.get("K_SPAR_MODELL") or "haiku"
def spar_rate(ist, std_bis_reset, reserve):
    """Punkte je Stunde: (Rest − Reserve) / Stunden bis zum Reset, nie negativ"""
    if std_bis_reset <= 0: return 0.0
    return max(0.0, (100 - ist - reserve) / std_bis_reset)
# Sparmodus-Messungen (Tabulator: Datum Zeit Item Modell vor nach Kosten Minuten Ergebnis), nur lesen
zeilen = []
try:
    with open(e.get("K_SPAR_DATEI", ""), encoding="utf-8") as f:
        zeilen = [t for t in (z.rstrip("\n").split("\t") for z in f if z.strip() and not z.startswith("#")) if len(t) >= 9]
except OSError:
    pass
def fl(x):
    try: return float(x)
    except ValueError: return None
heute_z = [t for t in zeilen if t[0] == jetzt.strftime("%Y-%m-%d")]
eintraege = sum(1 for t in heute_z if t[8] != "nichts_passend")
verbraucht = sum(max(0.0, fl(t[6]) or 0.0) for t in heute_z)
gemessen = [fl(t[6]) for t in zeilen if t[8] == "erledigt" and fl(t[6]) is not None]
# Zeitfenster
tage = {int(x) for x in e["K_WOCHENTAGE"].split()}
def heute(s):
    h, m = hm(s); return jetzt.replace(hour=h, minute=m, second=0, microsecond=0)
fenster = jetzt.isoweekday() in tage and heute(e["K_START"]) <= jetzt < heute(e["K_ENDE"])
neu_zeit = fenster and jetzt < heute(e["K_LETZTER_BEGINN"])
volle = (jetzt + dt.timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)   # nächste volle Stunde
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
    if a > spar_max:
        # Maintainer 12.11.2026 („die risikoärmere variante bitte“): nicht enden, sondern ohne Claude bis zur
        # vollen Stunde warten und neu entscheiden (die Sollkurve steigt, der Abstand sinkt)
        aus.update(STUFE="deutlich darüber (> %g)" % spar_max, ENTSCHEIDUNG="warten", M_KOMPLEX="-", M_ROUTINE="-",
                   WARTEN_BIS=volle.isoformat(timespec="minutes"),
                   GRUND="Woche %.1f Punkte über dem Soll – nichts Neues, nächster Versuch %s" % (a, volle.strftime("%H:%M")))
    elif a > 0:
        # Sparmodus (Maintainer 12.11.2026): Restkontingent abzüglich Reserve auf die Stunden bis zum Reset
        # verteilen; seit Tagesbeginn (START) angespart, minus heute im Sparmodus verbraucht
        std_rest = (naechster.astimezone(UTC) - ju).total_seconds() / 3600
        rest, rate = 100 - woche, spar_rate(woche, std_rest, reserve)
        seit = max(0.0, (jetzt - heute(e["K_START"])).total_seconds() / 3600)
        angespart = rate * seit - verbraucht
        kosten, quelle = (sum(gemessen) / len(gemessen), "Mittel aus %d Messungen" % len(gemessen)) \
            if len(gemessen) >= 3 else (kosten0, "Standard, %d von 3 gemessen" % len(gemessen))
        grenze = len(gemessen) < 3 and eintraege >= spar_tag
        bis = volle
        aus.update(STUFE="Sparmodus (0 < Abstand ≤ %g)" % spar_max, M_KOMPLEX=spar_m, M_ROUTINE=spar_m,
                   SPAR_RATE="%.2f" % rate, SPAR_REST="%.1f" % rest, SPAR_RESERVE="%g" % reserve,
                   SPAR_STD="%.1f" % std_rest, SPAR_ANGESPART="%.2f" % angespart, SPAR_KOSTEN="%.2f" % kosten,
                   SPAR_KOSTEN_QUELLE=quelle, SPAR_HEUTE="%d" % eintraege,
                   SPAR_GRENZE=("%g" % spar_tag) if len(gemessen) < 3 else "keine (3 gemessen)",
                   SPAR_VERBRAUCHT="%.2f" % verbraucht, SPAR_MODELL=spar_m)
        if rate <= 0:
            aus.update(ENTSCHEIDUNG="nichts", M_KOMPLEX="-", M_ROUTINE="-",
                       GRUND="Sparmodus: Rest %.1f nicht über der Reserve %g – nichts Neues bis zum Reset" % (rest, reserve))
        elif grenze:
            aus.update(ENTSCHEIDUNG="nichts", M_KOMPLEX="-", M_ROUTINE="-",
                       GRUND="Sparmodus: heute %d Eintrag bearbeitet (höchstens %g je Tag, bis 3 gemessen) – nichts Neues bis morgen" % (eintraege, spar_tag))
        elif angespart < kosten:
            aus.update(ENTSCHEIDUNG="spar_warten", SPAR_WARTEN_BIS=bis.isoformat(timespec="minutes"),
                       WARTEN_BIS=bis.isoformat(timespec="minutes"),
                       GRUND="Sparmodus: warte, Rate %.2f Punkte/h, angespart %.2f von %.2f Punkten – nächster Versuch %s" % (
                           rate, angespart, kosten, bis.strftime("%H:%M")))
        else:
            aus.update(ENTSCHEIDUNG="spar",
                       GRUND="Sparmodus: angespart %.2f ≥ Kosten %.2f – ein Eintrag mit %s" % (angespart, kosten, spar_m))
    elif a < -weit:
        aus.update(STUFE="weit darunter (< -%g)" % weit, ENTSCHEIDUNG="neu", M_KOMPLEX=stark, M_ROUTINE=stark,
                   GRUND="weit unter dem Soll – aufholen")
        if not math.isnan(h5) and h5 < fmax:
            aus["FABLE"] = "ja"
    else:
        aus.update(STUFE=("im Soll (±%g)" % band) if abs(a) <= band else "darunter", ENTSCHEIDUNG="neu",
                   M_KOMPLEX=stark, M_ROUTINE=routine, GRUND="im Soll" if abs(a) <= band else "unter dem Soll")
    # zweite Bremse: 5-Stunden-Fenster. Warten (Pause über pausen.txt) bis zum Fensterende, höchstens bis
    # zur nächsten vollen Stunde, dann neu entscheiden (Maintainer 12.11.2026)
    if not math.isnan(h5) and h5 >= h5max:
        ende = e.get("K_5H_ENDE", "")
        try:
            fe = dt.datetime.fromisoformat(ende).astimezone(W)
        except ValueError:
            fe = jetzt + dt.timedelta(minutes=zahl("K_PAUSE_OHNE_ENDE", 60))
        bis = max(jetzt + dt.timedelta(minutes=1), min(fe, volle))
        aus.update(ENTSCHEIDUNG="warten", M_KOMPLEX="-", M_ROUTINE="-", FABLE="nein",
                   PAUSE_BIS=bis.isoformat(timespec="minutes"), WARTEN_BIS=bis.isoformat(timespec="minutes"),
                   GRUND="5-Stunden-Fenster %.0f %% ≥ %g %% – nichts Neues, Fensterende %s%s, nächster Versuch %s" % (
                       h5, h5max, fe.strftime("%H:%M"), "" if ende else " (unbekannt, %g Min.)" % zahl("K_PAUSE_OHNE_ENDE", 60),
                       bis.strftime("%H:%M")))
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
    K_WEIT_DARUNTER=$KONF[WEIT_DARUNTER] K_IM_SOLL=$KONF[IM_SOLL] K_FUENF_STUNDEN_MAX=$KONF[FUENF_STUNDEN_MAX] \
    K_SPAR_MAX=$KONF[SPAR_MAX] K_RESERVE_NACHT=$KONF[RESERVE_NACHT] K_SPAR_MAX_EINTRAEGE_TAG=$KONF[SPAR_MAX_EINTRAEGE_TAG] \
    K_SPAR_KOSTEN_JE_EINTRAG=$KONF[SPAR_KOSTEN_JE_EINTRAG] K_SPAR_MODELL=$KONF[SPAR_MODELL] K_SPAR_DATEI=$SPAR_DATEI \
    K_PAUSE_OHNE_ENDE=$KONF[PAUSE_OHNE_ENDE] K_FABLE_5H_MAX=$KONF[FABLE_5H_MAX] \
    K_MODELL_STARK=$KONF[MODELL_STARK] K_MODELL_ROUTINE=$KONF[MODELL_ROUTINE] \
    python3 -I -c $ENTSCHEID_PY)
  [[ -n $E[SOLL] ]]
}
entscheidung_text() {
  case $E[ENTSCHEIDUNG] in
    neu)        print -r -- "neu beginnen" ;;
    spar)       print -r -- "Sparmodus: ein Eintrag mit $E[SPAR_MODELL]" ;;
    spar_warten) print -r -- "Sparmodus: warten" ;;
    warten)     print -r -- "warten bis ${${E[WARTEN_BIS]}[12,16]}" ;;
    *)          print -r -- "nichts Neues" ;;
  esac
}
kontingent_zeile() {   # eine Zeile für Protokoll und Bericht
  print -r -- "Woche ${K_WOCHE:-?} % (Soll $E[SOLL] %, Abstand $E[ABSTAND] Punkte, $E[STUFE]), 5 Stunden ${K_5H:-?} %${K_5H_ENDE:+ bis ${K_5H_ENDE[12,16]}}${K_FABLE:+, Fable $K_FABLE} → $(entscheidung_text)${E[SPAR_RATE]:+; $(spar_zeile)}"
}
spar_zeile() {   # Messzeile des Sparmodus (Auftrag 12.11.2026)
  print -r -- "Sparmodus: Rate $E[SPAR_RATE] Punkte/h, Rest $E[SPAR_REST], Reserve $E[SPAR_RESERVE] (noch $E[SPAR_STD] h bis zum Reset; angespart $E[SPAR_ANGESPART], Kosten je Eintrag $E[SPAR_KOSTEN] ($E[SPAR_KOSTEN_QUELLE]), heute $E[SPAR_HEUTE] Einträge, Grenze $E[SPAR_GRENZE])"
}

# Commits dieses Laufs: auf main, Autorzeit (%at) innerhalb einer eigenen Runde (RUNDEN_ZEIT: „<von> <bis>“).
# Früher START_KOPF..main: nach einem Rebase von main (12.11.2026, 10:29) war START_KOPF kein Vorfahr mehr,
# alle neu geschriebenen Commits zählten mit („8 Commits heute erreicht“, ohne eigenen Commit).
typeset -a RUNDEN_ZEIT
eigene_commits() {
  (( $#RUNDEN_ZEIT )) || return 0
  local at z iv
  git -C $REPO log -n 500 main --format='%at %h %s' 2>/dev/null | while read -r at z; do
    for iv in $RUNDEN_ZEIT; do
      (( at >= ${iv%% *} && at <= ${iv##* } )) && { print -r -- "- ${z[1,198]}"; break }
    done
  done
}
eigene_commits_zahl() { eigene_commits | grep -c . }
if [[ -n $ZAEHLEN ]]; then
  RUNDEN_ZEIT=(${(s:;:)HALO_RUNDEN_ZEIT})
  print "Eigene Commits: $(eigene_commits_zahl)"; eigene_commits
  exit 0
fi

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
  [[ -n $E[SPAR_RATE] ]] && print -r -- "Sparen:       $(spar_zeile); Modell $E[SPAR_MODELL]; Messungen $SPAR_DATEI"
  print "Entscheidung: $(entscheidung_text) – $E[GRUND]"
  if [[ -n $E[PAUSE_BIS] ]]; then
    print "Pause:        würde in ${HALO_PAUSEN_DATEI:-~/halo-nacht/pausen.txt} schreiben (Trockenlauf: NICHT geschrieben):"
    print "              tagesroutine $E[PAUSE_BIS] 5-Stunden-Fenster ${K_5H} % ≥ $KONF[FUENF_STUNDEN_MAX] %, keine neuen Einträge"
  fi
  if g=$(pause_aktiv tagesroutine); then print "Pause aktiv:  $g"; else print "Pause aktiv:  nein"; fi
  if [[ $E[FENSTER] != ja ]]; then
    print "Würde:        nichts tun (außerhalb des Zeitfensters), kein Bericht"
  elif [[ $E[ENTSCHEIDUNG] == nichts ]]; then
    print "Würde:        Bericht „nichts Neues“, Lauf beenden"
  elif [[ $E[ENTSCHEIDUNG] == (warten|spar_warten) ]]; then
    print "Würde:        kein Claude, ${E[PAUSE_BIS]:+Pause schreiben, }warten bis ${${E[WARTEN_BIS]}[12,16]} (höchstens bis $KONF[LETZTER_BEGINN], sonst Lauf beenden), dann Kontingent neu lesen und neu entscheiden"
  elif [[ $E[ENTSCHEIDUNG] == spar ]]; then
    print "Würde:        eine Sparmodus-Runde mit claude -p --model $E[SPAR_MODELL] (kein Plan-Lauf): Einstufung, höchstens ein passender Eintrag,"
    print "              Messung vor/nach in $SPAR_DATEI; Fertiges ohne Force auf pruef/tagesroutine-${E[TAG]//-/}"
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
ENDGRUND= ERLEDIGT=0 ZURUECK=0 ENTSCHEIDUNG_NOETIG=0 FABLE_LAEUFE=0 N=0 SPAR_MESSUNG=
typeset -a MODELLE_GENUTZT ABSCHNITTE

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
    print -r -- "- Anfang: ${K_ANFANG:-nicht gelesen}"
    print -r -- "- Ende: ${K_ENDE:-nicht gelesen}"
    print -r -- "- Fable-Wochenzähler: ${K_FABLE:-nicht im rate_limit_event (kontingent.sh); get_usage der Leitstelle}"
    print -r -- "- Fable-Läufe heute: $FABLE_LAEUFE"
    [[ -n $SPAR_MESSUNG ]] && print -r -- "- Sparmodus-Runden heute:" && print -r -- "$SPAR_MESSUNG"
    print
    print "## Modelle"
    print
    (( $#MODELLE_GENUTZT )) && print -rl -- "- "${^MODELLE_GENUTZT} || print -r -- "- keine Claude-Runde"
    for f in $ABSCHNITTE; do [[ -s $f ]] && { print; cat $f }; done
    print
    print "## Commits heute (nicht gepusht, der Nachtlauf nimmt sie mit)"
    print
    eigene_commits | grep . || print -r -- "- keine"
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
  local sid=$(uuidgen | tr A-Z a-z) t0=$(date +%s)
  log "Runde mit $1, Sitzung $sid"
  ( while (( $(date +%s) < HART )); do sleep 60; done; pkill -f -- "--session-id $sid" ) &
  WACHE=$!
  claude -p --model $1 --session-id $sid --permission-mode auto "$2" > $3 2>&1
  local rc=$?
  RUNDEN_ZEIT+=("$t0 $(date +%s)")   # für eigene_commits (Tageslimit, Bericht)
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
  if (( $(eigene_commits_zahl) >= KONF[MAX_COMMITS_TAG] )); then
    ENDGRUND="$KONF[MAX_COMMITS_TAG] eigene Commits heute erreicht"; break   # Ende, kein Warten
  fi
  # Kontingent vor jedem neuen Eintrag
  entscheiden; log "Kontingent: $(kontingent_zeile)"
  # --- Kontingentgrenzen (über dem Soll > SPAR_MAX, 5-Stunden-Fenster, Sparmodus noch nicht angespart):
  # ohne Claude warten (bis zur vollen Stunde bzw. zum Fensterende), dann neu entscheiden; nur bis LETZTER_BEGINN ---
  if [[ $E[ENTSCHEIDUNG] == (warten|spar_warten) ]]; then
    log "$E[GRUND]${E[SPAR_RATE]:+; $(spar_zeile)}"
    bis=$(python3 -I -c 'import sys,datetime as d;print(int(d.datetime.fromisoformat(sys.argv[1]).timestamp()))' $E[WARTEN_BIS])
    [[ -n $bis ]] || { ENDGRUND="$E[GRUND] (Wartezeit nicht lesbar)"; break }
    (( bis >= LETZTER )) && { ENDGRUND="$E[GRUND] (nach $KONF[LETZTER_BEGINN], heute kein Versuch mehr)"; break }
    if [[ -n $E[PAUSE_BIS] ]]; then
      pause_setzen tagesroutine $E[PAUSE_BIS] "5-Stunden-Fenster ${K_5H} % ≥ $KONF[FUENF_STUNDEN_MAX] %, keine neuen Einträge" 2>>$LOG
      log "Pause bis $E[PAUSE_BIS] (pausen.txt)"
    fi
    while (( $(date +%s) < bis )); do sleep 120; done
    continue
  fi
  if [[ $E[ENTSCHEIDUNG] == nichts ]]; then ENDGRUND=$E[GRUND]; break; fi
  # --- Sparmodus: genau eine Runde mit dem niedrigsten Modell (Einstufung, höchstens ein Eintrag) ---
  if [[ $E[ENTSCHEIDUNG] == spar ]]; then
    N=$((N + 1)) ERG=$DIR/$TAG-tagesroutine-$N.erg
    SZ=$(spar_zeile) VOR=$K_WOCHE T0=$(date +%s)
    ABSCHNITTE+=($DIR/$TAG-tagesroutine-$N.md)
    MODELLE_GENUTZT+=("Sparmodus-Runde $N: $E[SPAR_MODELL]")
    log "$SZ – Runde mit $E[SPAR_MODELL]"
    runde $E[SPAR_MODELL] "$(kopf)

JETZT: Sparmodus-Runde (Abschnitt „Sparmodus“ des Auftrags). Modell dieser Runde: $E[SPAR_MODELL] (niedrigstes Modell). $SZ.
Heute schon bearbeitet (nicht noch einmal nehmen): $(cut -f1 $DIR/$TAG-tagesroutine-erledigt.txt 2>/dev/null | tr '\n' ' ').
Ergebnisdatei: $ERG (Zeile 1 Ergebnis, Zeile 2 „eintrag <Item-ID> <Titel>“, siehe Auftrag). Berichtsabschnitt: $DIR/$TAG-tagesroutine-$N.md." \
      $DIR/$TAG-tagesroutine-$N.txt
    rc=$?
    DAUER=$(( ($(date +%s) - T0 + 59) / 60 ))
    kontingent_lesen || K_WOCHE=
    NACH=$K_WOCHE
    if [[ -n $VOR && -n $NACH ]] && (( NACH >= VOR )); then KOSTEN=$(printf '%.1f' $(( NACH - VOR ))); else KOSTEN=-; fi
    ERGZ=$(head -1 $ERG 2>/dev/null); ERGW=${${ERGZ%% *}:-zurück}
    EZ=$(sed -n '2s/^eintrag[[:space:]]*//p' $ERG 2>/dev/null); EID=${EZ%%[[:space:]]*}
    [[ $ERGW == (erledigt|zurück|entscheidung|nichts_passend) ]] || ERGW=zurück
    print -r -- "$TAG	$(date +%H:%M)	${EID:--}	$E[SPAR_MODELL]	${VOR:--}	${NACH:--}	$KOSTEN	$DAUER	$ERGW" >> $SPAR_DATEI
    SPAR_MESSUNG+="${SPAR_MESSUNG:+
}  - Runde $N: $ERGW${EZ:+ ($EZ)}, Modell $E[SPAR_MODELL], Woche vor ${VOR:-?} % / nach ${NACH:-?} % (Kosten $KOSTEN Punkte), Dauer $DAUER Min.; $SZ"
    log "Sparmodus-Runde $N: $ERGW, Woche ${VOR:-?} → ${NACH:-?} %, $DAUER Min."
    [[ -n $EID ]] && print -r -- "$EID	$ERGZ" >> $DIR/$TAG-tagesroutine-erledigt.txt
    case $ERGW in
      erledigt)       ERLEDIGT=$((ERLEDIGT + 1)); pruef_pushen ;;
      entscheidung)   ENTSCHEIDUNG_NOETIG=$((ENTSCHEIDUNG_NOETIG + 1)) ;;
      nichts_passend) ENDGRUND="Sparmodus: nichts Passendes für $E[SPAR_MODELL]"; break ;;
      *)              ZURUECK=$((ZURUECK + 1)) ;;
    esac
    (( rc == 9 )) && { ENDGRUND="Limit erreicht"; break }
    continue      # Tagesgrenze und Kontingent prüft die nächste Entscheidung
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
