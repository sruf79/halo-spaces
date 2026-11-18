#!/bin/zsh
export HALO_LAUF=morgenbrief
# Morgenbrief auf neon (Auftrag stufe-6 Übergabe Punkt 1, 10.11.2026; geladen 11.11.2026): täglich 08:30
# eine einzige iPhone-Meldung, am Wochenende nur bei Auffälligkeiten ([handeln]), sonst nichts; ohne Sprachmodell zusammengestellt (nur die Zustellung über push() nutzt den
# kurzen Haiku-Aufruf aus lauf-hilfen.zsh). Ersetzt die geplante Laptop-Aufgabe „halo-morgenblock“.
# Seit 15.11.2026 („ja wir sollten nur einen bericht haben …“, ENTSCHEIDUNGEN.md) schreibt es täglich (auch Sa/So)
# den einzigen Tagesbericht ~/halo-berichte/<heute>-bericht.md: Kurzfassung in einfachen Worten (höchstens 10 Zeilen:
# Nacht, Tests, Ja/Nein-Fragen und Punkte für den Maintainer, Vorschau Tagesroutine, Kontingent), darunter die Technik
# als <details>-Blöcke (Nachtlauf-Bericht, alle Briefzeilen, Release/CI/Windows, Aufräumen, Tagesroutine, Vorschau-Liste).
# Vorschau ohne Sprachmodell: offene Einträge aus „board.sh export“ in Regel-Reihenfolge (docs/board.md), dazu
# pausen.txt (Routine tagesroutine) und volldampf.txt; unverbindlich, die Plan-Runde um 09:00 entscheidet.
# Geöffnet wird der Bericht in der Sitzung neon mit /bericht (Seite), die Meldung nennt weder Pfade noch Hashes.
# Gestartet vom LaunchAgent at.halo-spaces.morgenbrief (Interpreter /bin/zsh), die Datei liegt wie
# nachtlauf.sh als Kopie in ~/.config/halo-spaces/.
#   morgenbrief.sh [<Repo-Ordner>]
#   morgenbrief.sh --trocken [<Repo>]   kein Netz (kein gh, kein kontingent.sh), kein echter Push,
#                                       nichts nach ~/halo-berichte oder ~/halo-nacht geschrieben
# Gelesen (seit dem letzten Brief = voriger Werktag 08:30; Sa/So: gestern 08:30):
#   ~/halo-berichte/<heute>-nachtlauf.md (Zeile „Kurz:“, Zeilen „- …“ unter „## Rückfragen an den Maintainer“),
#   ~/halo-nacht/<heute>.fertig, lauf.lock
#   ~/halo-berichte/<Datum>-tagesroutine.md für jeden Tag seit dem letzten Brief bis gestern, auch Sa/So (Zeile „Kurz:“)
#   ~/halo-berichte/<Datum>-halo.spaces-<Version>.md (FEHLER von publish.sh)
#   gh release list, gh run list (test.yml auf main; workflow_dispatch = Windows-Lauf der Nacht)
#   ~/halo-nacht/handeln.log (ohne eigene Zeilen „morgenbrief“), ~/halo-nacht/pausen.txt
#   Kontingent: tests/kontingent.sh; Soll = Stunden seit Reset (Di 00:00 UTC) / 168 × 100 %, nach einem freien Reset
#   „Soll bis nächster Reset“ (wochen_soll, lauf-hilfen.zsh, Maintainer 18.11.2026)
#   tests/board.sh export (Vorschau), ~/halo-nacht/volldampf.txt, ~/.config/halo-spaces/tagesroutine.conf (Schwellen)
# Geschrieben (nur echter Lauf): ~/halo-berichte/<heute>-bericht.md, ~/halo-nacht/<heute>-morgenbrief.log,
#   ~/halo-nacht/kontingent-tage.tsv (eine Zeile je Tag, Grundlage für vergleich-6-12.sh)
# Meldung: erste Zeile „Du musst heute: …“ oder „Nichts nötig“, danach höchstens 2 Zeilen und der Hinweis auf /bericht.
# [handeln], wenn der Maintainer etwas tun muss, sonst [info]. push() macht aus Zeilenumbrüchen
# Leerzeichen; die Zeilen werden darum mit „ / “ verbunden, der Bericht behält sie einzeln.
# Zum Proben (auch ohne --trocken): HALO_JETZT=<ISO-Zeit mit Zone>; HALO_MB_BERICHTE, HALO_MB_NACHT
# (Ordner), HALO_MB_HANDELN (handeln.log zum Lesen), HALO_PAUSEN_DATEI; HALO_KONTINGENT_WOCHE /
# HALO_KONTINGENT_5H (Prozent); HALO_MB_RELEASES und HALO_MB_CI (JSON-Dateien wie `gh release list
# --json tagName,publishedAt` bzw. `gh run list --json databaseId,headSha,status,conclusion,event,createdAt`);
# HALO_MB_WINDOWS=success|failure|cancelled|läuft|keiner (Ergebnis des Jobs „windows“); HALO_MB_BOARD (JSON wie
# `board.sh export`), HALO_VOLLDAMPF_DATEI, HALO_TAGESROUTINE_CONF; HALO_MB_AUSGABE: im Trockenlauf den Bericht dorthin
# schreiben (sonst schreibt der Trockenlauf keinen Bericht).
emulate -L zsh
setopt extendedglob
export TZ=Europe/Vienna

TROCKEN=
[[ $1 == --trocken ]] && { TROCKEN=1; shift }
REPO=${1:-$HOME/halo-spaces}
HIER=${0:A:h}
path=(~/.local/bin /opt/homebrew/bin /usr/local/bin /Library/Frameworks/Python.framework/Versions/Current/bin $path)

BERICHTE=${HALO_MB_BERICHTE:-$HOME/halo-berichte}
NACHT=${HALO_MB_NACHT:-$HOME/halo-nacht}
HANDELN_LESEN=${HALO_MB_HANDELN:-$NACHT/handeln.log}
PAUSEN=${HALO_PAUSEN_DATEI:-$NACHT/pausen.txt}
KONT_SKRIPT=$HIER/kontingent.sh
[[ -r $KONT_SKRIPT ]] || KONT_SKRIPT=$REPO/tests/kontingent.sh
HILFEN=$HIER/lauf-hilfen.zsh
[[ -r $HILFEN ]] || HILFEN=$REPO/tests/lauf-hilfen.zsh
# wie SPAR_MAX der Tagesroutine (über dem Soll um mehr als diese Punkte: nichts Neues; vorher 2 = altes NICHTS_NEUES_UEBER)
KONT_NICHTS_NEUES=$(sed -n 's/^SPAR_MAX=\([0-9]*\).*/\1/p' ${HALO_TAGESROUTINE_CONF:-$HOME/.config/halo-spaces/tagesroutine.conf} 2>/dev/null | head -1)
KONT_NICHTS_NEUES=${KONT_NICHTS_NEUES:-10}
KONT_KNAPP=95            # ab hier und mehr als 24 h bis zum Reset: Entscheidung nötig
REPO_GH=sruf79/halo-spaces

if [[ -n $TROCKEN ]]; then
  LOG=/dev/null
  export HALO_PUSH_TROCKEN=1 HALO_UEBERSPRUNGEN_LOG=/dev/null HALO_PAUSE_TROCKEN=1
  # push() schreibt [handeln] vor der Trocken-Prüfung in handeln.log: im Trockenlauf nie in die echte Datei
  export HALO_HANDELN_LOG=${HALO_MB_HANDELN_SCHREIBEN:-${TMPDIR:-/tmp}/morgenbrief-trocken-handeln.log}
else
  mkdir -p $NACHT $BERICHTE
  LOG=$NACHT/$(date +%F)-morgenbrief.log
fi
source $HILFEN || { print -u2 "FEHLER: $HILFEN nicht lesbar"; exit 2 }
(( ${PAUSEN_ROUTINEN[(Ie)morgenbrief]} )) || PAUSEN_ROUTINEN+=(morgenbrief)
export HALO_ROUTINEN="$PAUSEN_ROUTINEN"

# --- Zeit: heute, Wochentag, letzter Brief, voriger Werktag, Sollkurve ---
typeset -A T
while IFS='=' read -r k v; do T[$k]=$v; done < <(python3 -I -c '
import os, datetime as dt
from zoneinfo import ZoneInfo
W = ZoneInfo("Europe/Vienna"); UTC = dt.timezone.utc
j = os.environ.get("HALO_JETZT")
jetzt = dt.datetime.fromisoformat(j).astimezone(W) if j else dt.datetime.now(W)
d = jetzt.date() - dt.timedelta(days=1)
while d.isoweekday() > 5: d -= dt.timedelta(days=1)
s = jetzt.date() - dt.timedelta(days=1) if jetzt.isoweekday() > 5 else d
seit = dt.datetime(s.year, s.month, s.day, 8, 30, tzinfo=W)
# Reset fest Di 00:00 UTC (Sommerzeit ändert ihn nicht; Maintainer 12.11.2026)
ju = jetzt.astimezone(UTC)
r = ju.date() - dt.timedelta(days=(ju.isoweekday() - 2) % 7)
reset = dt.datetime(r.year, r.month, r.day, 0, 0, tzinfo=UTC)
if reset > ju:
    r -= dt.timedelta(days=7); reset = dt.datetime(r.year, r.month, r.day, 0, 0, tzinfo=UTC)
r2 = r + dt.timedelta(days=7); naechster = dt.datetime(r2.year, r2.month, r2.day, 0, 0, tzinfo=UTC).astimezone(W)
std = (jetzt.astimezone(UTC) - reset.astimezone(UTC)).total_seconds() / 3600
print("JETZT=" + jetzt.isoformat(timespec="minutes")); print("HEUTE=" + jetzt.strftime("%Y-%m-%d"))
print("WT=%d" % jetzt.isoweekday()); print("SEIT=" + seit.isoformat(timespec="minutes"))
print("VORTAG=" + d.isoformat()); print("SOLL=%.1f" % min(100, std / 1.68))
print("BIS_RESET_H=%.0f" % ((naechster - jetzt).total_seconds() / 3600))
print("NAECHSTER=" + naechster.strftime("%d.%m. %H:%M"))
')
[[ -n $T[HEUTE] ]] || { print -u2 "FEHLER: Zeitberechnung (python3/zoneinfo?)"; exit 1 }
# Soll aus dem gemeinsamen Rechenstück (lauf-hilfen.zsh): nach einem freien Reset in dieser Woche „Soll bis nächster
# Reset“ vom Anker bis zum automatischen Reset (Maintainer 18.11.2026), sonst 168 h ab dem Reset wie oben
SOLL_TEXT="Soll"
ws=($(HALO_JETZT=$T[JETZT] wochen_soll 168)) && { T[SOLL]=$ws[2]; [[ $ws[3] == anker ]] && SOLL_TEXT="Soll bis nächster Reset" }
HEUTE=$T[HEUTE]
WOCHENENDE=; (( T[WT] > 5 )) && WOCHENENDE=1   # Sa/So: Meldung nur bei [handeln]
if [[ -z $TROCKEN ]] && g=$(pause_aktiv morgenbrief); then log "ÜBERSPRUNGEN morgenbrief pausiert $g"; exit 0; fi

typeset -a HANDELN INFO      # HANDELN: kurze Gründe für die erste Zeile; INFO: Zeilen danach
typeset -a HANDELN_NEU       # Gründe, die noch nicht in handeln.log stehen (nur die zählen neu)
typeset -a TB_LISTE; RF_ZEILE= NACHT_ZUSTAND= CI_ZEILE=
kurz() { local s=${1//$'\n'/ }; (( ${#s} > ${2:-150} )) && s="${s[1,${2:-150}-1]}…"; print -r -- $s }

# --- 1. handeln.log seit dem letzten Brief (eigene Zeilen „morgenbrief“ zählen nicht) ---
if [[ -r $HANDELN_LESEN ]]; then
  while IFS=$'\t' read -r q t; do
    HANDELN+=("$q: $(kurz $t 160)")
  done < <(SEIT=$T[SEIT] JETZT=$T[JETZT] python3 -I -c '
import os, sys, datetime as dt
from zoneinfo import ZoneInfo
W = ZoneInfo("Europe/Vienna")
seit = dt.datetime.fromisoformat(os.environ["SEIT"]); jetzt = dt.datetime.fromisoformat(os.environ["JETZT"])
for z in open(sys.argv[1], encoding="utf-8", errors="replace"):
    t = z.rstrip("\n").split(" ", 3)
    if len(t) < 4: continue
    try: ts = dt.datetime.fromisoformat(t[0] + "T" + t[1]).replace(tzinfo=W)
    except ValueError: continue
    if seit < ts <= jetzt and t[2] != "morgenbrief":
        print(t[2] + "\t" + t[3])
' $HANDELN_LESEN)
fi

# --- 2. Notfall-Pause aktiv? ---
if g=$(HALO_JETZT=$T[JETZT] HALO_PAUSEN_DATEI=$PAUSEN pause_aktiv nachtlauf 2>/dev/null) && [[ $g == *NOTFALL* ]]; then
  HANDELN+=("Notfall-Pause $(kurz $g 60) – docs/notfall.md, „weiter“ erst nach Klärung")
  HANDELN_NEU+=(notfall)
fi

# --- 3. Nachtlauf ---
NB=$BERICHTE/$HEUTE-nachtlauf.md
if [[ -r $NB ]]; then
  k=$(grep -m1 '^Kurz:' $NB); k=${k#Kurz: }
  INFO+=("Nacht: $(kurz ${k:-Bericht ohne Kurzzeile} 160)")
  # Rückfragen des Directors (tests/nachtlauf-auftrag.md Schritt 1a f, Maintainer 13.11.2026): Zeilen „- …“
  # unter „## Rückfragen an den Maintainer“ bis zur nächsten Überschrift; Einträge stehen auf „Wartet auf OK“
  # (auch nummeriert „1. …“); die Kurzfassung des Berichts macht daraus kurze Ja/Nein-Fragen (BERICHT_PY)
  rf=(${(f)"$(sed -En '/^## Rückfragen an den Maintainer/,/^## /{/^(- |[0-9]+\. )/s/^(- *|[0-9]+\. *)//p;}' $NB 2>/dev/null)"})
  if (( $#rf )); then
    RF_ZEILE="$#rf Rückfrage$( (( $#rf > 1 )) && print n ) des Directors (Einträge auf „Wartet auf OK“): $(kurz ${(j:; :)rf} 400)"
    HANDELN+=("$RF_ZEILE")
    HANDELN_NEU+=(rueckfragen)
  fi
  # Aufräumen am Ende der Nacht (tests/aufraeumen.sh, Maintainer 14.11.2026): stehen gebliebene Reste mit Risiko als Hinweis
  ar=$(grep -a '^Rest mit Risiko, nichts angefasst: ' $NB 2>/dev/null | tail -1); ar=${ar##*: }
  [[ $ar == <-> ]] && (( ar > 0 )) && INFO+=("Aufräumen: $ar Rest$( (( ar > 1 )) && print e ) mit Risiko stehen gelassen (Bericht, Abschnitt Aufgeräumt)")
elif [[ -e $NACHT/lauf.lock ]] && kill -0 $(<$NACHT/lauf.lock) 2>/dev/null; then
  INFO+=("Nacht: läuft noch (Bericht folgt)"); NACHT_ZUSTAND=läuft
else
  NACHT_ZUSTAND=ohne
  g=$(grep -m1 '^Grund:' $NACHT/$HEUTE.fertig 2>/dev/null)
  HANDELN+=("Nachtlauf ohne Bericht${g:+ (${g#Grund: })} – ~/halo-nacht/$HEUTE.log ansehen")
  HANDELN_NEU+=(nachtlauf)
fi

# --- 4. Tagesroutine seit dem letzten Brief (Maintainer 14.11.2026: auch Sa/So) ---
# Alle Tage vom Tag des letzten Briefs bis gestern: Mo also Fr, Sa, So; Di–Fr der Vortag; Sa Fr, So Sa.
for td in ${(f)"$(SEIT=$T[SEIT] HEUTE=$HEUTE python3 -I -c '
import os, datetime as dt
d = dt.date.fromisoformat(os.environ["SEIT"][:10]); h = dt.date.fromisoformat(os.environ["HEUTE"])
while d < h: print(d.isoformat()); d += dt.timedelta(days=1)
')"}; do
  TB=$BERICHTE/$td-tagesroutine.md
  [[ -r $TB ]] || continue   # kein Bericht: Tagesroutine aus oder pausiert, keine Zeile
  TB_LISTE+=($TB)
  k=$(grep -m1 '^Kurz:' $TB); INFO+=("Tag ${td[9,10]}.${td[6,7]}.: $(kurz ${${k#Kurz: }:-ohne Kurzzeile} 120)")
done

# --- 4a. GitHub-Issues wegen Inaktivität geschlossen (tests/inaktivitaet.sh in der GitHub-Routine, Maintainer
# 15.11.2026): Zeilen „<Datum> <Zeit> geschlossen #n …“ aus ~/halo-nacht/inaktivitaet.log seit dem letzten Brief
ina=(${(u)${(f)"$(awk -v s="${T[SEIT][1,10]} ${T[SEIT][12,16]}" -v j="${T[JETZT][1,10]} ${T[JETZT][12,16]}" \
  '$3 == "geschlossen" { z = $1 " " substr($2, 1, 5); if (z > s && z <= j) print $4 }' $NACHT/inaktivitaet.log 2>/dev/null)"}})
(( $#ina )) && INFO+=("GitHub: geschlossen wegen Inaktivität: ${(j:, :)ina}")

# --- 5. Releases seit dem letzten Brief, FEHLER von publish.sh ---
if [[ -n $HALO_MB_RELEASES ]]; then REL_JSON=$(<$HALO_MB_RELEASES)
elif [[ -z $TROCKEN ]]; then REL_JSON=$(gh release list -R $REPO_GH -L 5 --json tagName,publishedAt,isDraft 2>/dev/null)
fi
if [[ -n $REL_JSON ]]; then
  r=$(print -r -- $REL_JSON | SEIT=$T[SEIT] python3 -I -c '
import os, sys, json, datetime as dt
from zoneinfo import ZoneInfo
W = ZoneInfo("Europe/Vienna"); seit = dt.datetime.fromisoformat(os.environ["SEIT"])
l = [x for x in json.load(sys.stdin) if not x.get("isDraft")]
def z(x): return dt.datetime.fromisoformat(x["publishedAt"].replace("Z", "+00:00")).astimezone(W)
neu = [x for x in l if z(x) > seit]
if neu: print("Release: " + ", ".join("%s (%s)" % (x["tagName"], z(x).strftime("%d.%m. %H:%M")) for x in neu))
elif l: print("Release: keins seit %s, zuletzt %s vom %s" % (seit.strftime("%d.%m. %H:%M"), l[0]["tagName"], z(l[0]).strftime("%d.%m.")))
else: print("Release: keine gefunden")
' 2>/dev/null)
  INFO+=("${r:-Release: Liste nicht lesbar}")
else
  INFO+=("Release: nicht geprüft${TROCKEN:+ (trocken)}")
fi
for f in $BERICHTE/{$T[VORTAG],$HEUTE}-halo.spaces-*.md(N); do
  if grep -q 'FEHLER' $f; then
    HANDELN+=("${${f:t:r}#*-*-*-} meldet FEHLER – sonst kein Update für Nutzer")
    HANDELN_NEU+=(release)
  fi
done

# --- 6. CI auf main und Windows-Lauf der Nacht ---
if [[ -n $HALO_MB_CI ]]; then CI_JSON=$(<$HALO_MB_CI)
elif [[ -z $TROCKEN ]]; then
  CI_JSON=$(gh run list -R $REPO_GH -w test.yml -b main -L 20 --json databaseId,headSha,status,conclusion,event,createdAt 2>/dev/null)
fi
WIN=$HALO_MB_WINDOWS
if [[ -n $CI_JSON ]]; then
  c=$(print -r -- $CI_JSON | SEIT=$T[SEIT] python3 -I -c '
import os, sys, json, datetime as dt
seit = dt.datetime.fromisoformat(os.environ["SEIT"])
l = sorted(json.load(sys.stdin), key=lambda x: x["createdAt"], reverse=True)
def z(x): return dt.datetime.fromisoformat(x["createdAt"].replace("Z", "+00:00"))
neu = [x for x in l if z(x) > seit and x["event"] == "push"]
fertig = [x for x in l if x["event"] == "push" and x["status"] == "completed"]
s = "CI main: %d Läufe seit gestern" % len(neu)
if fertig:
    x = fertig[0]; s += ", letzter %s %s" % (x["headSha"][:7], {"success": "grün", "failure": "rot"}.get(x["conclusion"], x["conclusion"]))
print(s)
w = [x for x in l if x["event"] == "workflow_dispatch" and z(x) > seit]
print("WINLAUF=%s" % (w[0]["databaseId"] if w else ""))
' 2>/dev/null)
  CI_ZEILE=${c%%$'\n'*}; INFO+=("$CI_ZEILE")
  WINLAUF=${${c##*WINLAUF=}%%$'\n'*}
  if [[ -z $WIN ]]; then
    if [[ -n $WINLAUF && -z $TROCKEN ]]; then
      WIN=$(gh run view $WINLAUF -R $REPO_GH --json jobs --jq '.jobs[] | select(.name == "windows") | if .status == "completed" then .conclusion else "läuft" end' 2>/dev/null)
    fi
    WIN=${WIN:-keiner}
  fi
else
  INFO+=("CI main: nicht geprüft${TROCKEN:+ (trocken)}")
fi
case $WIN in
  success) INFO+=("Windows: grün") ;;
  failure) INFO+=("Windows: rot – Release wartet, der Nachtlauf repariert") ;;
  läuft)   INFO+=("Windows: läuft noch") ;;
  keiner)  INFO+=("Windows: kein Lauf seit gestern 08:30") ;;
  "")      ;;
  *)       INFO+=("Windows: $WIN") ;;
esac

# --- 7. Kontingent gegen die Sollkurve ---
KW= K5=
if [[ -n $HALO_KONTINGENT_WOCHE ]]; then KW=$HALO_KONTINGENT_WOCHE K5=${HALO_KONTINGENT_5H:-?}
elif [[ -z $TROCKEN ]]; then
  z=$(zsh $KONT_SKRIPT 2>/dev/null)
  [[ $z == (#b)Woche\ ([0-9]##)\ %*5\ Stunden\ ([0-9]##)\ %* ]] && KW=$match[1] K5=$match[2]
  # freien Reset erkennen (kein zusätzlicher Haiku-Aufruf); danach Soll neu (Anker)
  if [[ -n $KW ]] && wochen_reset_erkennen $KW >/dev/null; then
    ws=($(HALO_JETZT=$T[JETZT] wochen_soll 168)) && { T[SOLL]=$ws[2]; [[ $ws[3] == anker ]] && SOLL_TEXT="Soll bis nächster Reset" }
  fi
fi
if [[ -n $KW ]]; then
  ab=$(python3 -I -c 'import sys; print("%+.1f" % (float(sys.argv[1]) - float(sys.argv[2])))' $KW $T[SOLL])
  zeile="Kontingent: Woche $KW % ($SOLL_TEXT $T[SOLL] %, $ab), 5 h $K5 %"
  if (( KW >= KONT_KNAPP && T[BIS_RESET_H] > 24 )); then
    HANDELN+=("Kontingent $KW % bei $T[BIS_RESET_H] h bis Reset: Empfehlung Tagesroutine pausieren (pause_setzen tagesroutine <bis> …)")
    HANDELN_NEU+=(kontingent)
  elif HALO_JETZT=$T[JETZT] volldampf_aktiv >/dev/null 2>&1; then
    :   # Volldampf: Sollkurve und Sparmodus bremsen nicht (die Zeile hieß bis 18.11.2026 trotzdem „nichts Neues“)
  elif (( ${ab%.*} > KONT_NICHTS_NEUES )); then
    zeile+=" – deutlich über Soll, Tagesroutine beginnt nichts Neues (Empfehlung: nichts tun)"
  elif (( ${ab%.*} > 0 )); then
    zeile+=" – über Soll, Tagesroutine im Sparmodus (Empfehlung: nichts tun)"
  fi
  INFO+=("$zeile")
  # Tageswert für die Vier-Wochen-Messung (vergleich-6-12.sh): Datum, Woche %, Soll %, 5 h %
  [[ -z $TROCKEN ]] && print -r -- "$HEUTE	$KW	$T[SOLL]	$K5" >> $NACHT/kontingent-tage.tsv
else
  INFO+=("Kontingent: nicht gelesen${TROCKEN:+ (trocken)}")
fi

# --- 8. Vorschau Tagesroutine: Pause, Volldampf, Schwellen, offene Einträge (ohne Sprachmodell) ---
TR_CONF=${HALO_TAGESROUTINE_CONF:-$HOME/.config/halo-spaces/tagesroutine.conf}
cv() { local w; w=$(grep -m1 "^$1=" $TR_CONF 2>/dev/null); w=${${w#*=}%%[[:space:]]#\#*}; print -r -- ${w:-$2} }
TR_START=$(cv START 09:00); (( T[WT] > 5 )) && TR_START=$(cv START_WOCHENENDE $TR_START)
TR_PAUSE=$(HALO_JETZT=$T[JETZT] HALO_PAUSEN_DATEI=$PAUSEN pause_aktiv tagesroutine 2>/dev/null)
TR_VD=$(HALO_JETZT=$T[JETZT] volldampf_status 2>/dev/null)
BOARD_JSON= BOARD_INFO=
if [[ -n $HALO_MB_BOARD ]]; then BOARD_JSON=$HALO_MB_BOARD
elif [[ -z $TROCKEN ]]; then
  BS=$HIER/board.sh; [[ -r $BS ]] || BS=$REPO/tests/board.sh
  BOARD_JSON=$(mktemp -t morgenbrief-board) && zsh $BS export > $BOARD_JSON 2>/dev/null \
    || { BOARD_INFO="Aufgabenliste nicht lesbar"; rm -f $BOARD_JSON; BOARD_JSON= }
else BOARD_INFO="Aufgabenliste im Trockenlauf nicht gelesen"
fi

# --- Bericht und Meldung (BERICHT_PY: Kurzfassung, <details>-Blöcke, Meldungszeilen) ---
BERICHT_PY='
import os, re, sys, json, datetime as dt
E = os.environ.get
def zeilen(k): return [z for z in (E(k) or "").split("\n") if z.strip()]
HEUTE = dt.date.fromisoformat(E("MB_HEUTE"))
def einfach(s, n=0):
    # Technik heraus: Klammern, Code, Hashes und Lauf-Nummern, Board-ids, Pfade, Fettdruck
    s = (s or "").replace("**", "")
    alt = None
    while alt != s:
        alt = s; s = re.sub(r"\s*\([^()]*\)", "", s)
    s = re.sub(r"`[^`]*`", "", s)
    s = re.sub(r"\b(?=[0-9a-f]*[0-9])[0-9a-f]{7,40}\b", "", s)
    s = re.sub(r"\bPVTI_\w+", "", s)
    s = re.sub(r"(?:~|/Users/|/private/|\.\./)\S*", "", s)
    s = re.sub(r"\s+([,;.:?!])", r"\1", s)
    s = re.sub(r"\s*[–-]\s*(?:siehe\s+|im\s+)?Bericht\s*$", "", s)
    s = re.sub(r"([,;:])(?=[,;.])", "", s)
    s = re.sub(r"\s{2,}", " ", s).strip(" ,;")
    s = s[:1].upper() + s[1:]
    if n and len(s) > n: s = s[:n - 1].rstrip() + "…"
    return s
def frage(z):
    # Rückfrage „<Bereich>: … <Frage>?“ → „<Bereich>: <letzter Satz mit ?>“
    z = re.sub(r"^\s*(?:-|\d+\.)\s*", "", z).replace("**", "")
    bereich = z.split(":", 1)[0].strip() if ":" in z else ""
    saetze = re.split(r"(?<=[.!?])\s+(?=[A-ZÄÖÜ„])", z)
    f = [s for s in saetze if s.rstrip(" )").endswith("?") or "?" in s]
    f = f[-1] if f else z
    f = f[:f.rfind("?") + 1] if "?" in f else f
    if bereich and f.startswith(bereich): f = f[len(bereich):].lstrip(" :")
    f = einfach(f, 180)
    b = einfach(bereich, 40)
    return (b + ": " if b else "") + f
# --- Quellen ---
NB = E("MB_NB") or ""
nb = open(NB, encoding="utf-8", errors="replace").read() if NB and os.path.exists(NB) else ""
def abschnitt(text, titel):
    m = re.search(r"^## " + re.escape(titel) + r"[^\n]*\n(.*?)(?=^## |\Z)", text, re.S | re.M)
    return m.group(1).strip() if m else ""
kurz = (re.search(r"^Kurz:\s*(.*)$", nb, re.M) or [None, ""])[1] if nb else ""
rf_roh = [z for z in abschnitt(nb, "Rückfragen an den Maintainer").split("\n") if re.match(r"\s*(?:-|\d+\.)\s+\S", z)]
fragen = [frage(z) for z in rf_roh]
rf_zeile = E("MB_RF_ZEILE") or ""
sonst = [einfach(re.sub(r"^\w[\w.-]*: ", "", h), 160) for h in zeilen("MB_HANDELN") if h != rf_zeile]
zustand = E("MB_NACHT_ZUSTAND") or ""
if nb: nacht = einfach(kurz, 220) or "Bericht ohne Kurzzeile."
elif zustand == "läuft": nacht = "Der Nachtlauf läuft noch, sein Bericht folgt."
else: nacht = "Der Nachtlauf hat keinen Bericht geschrieben."
if nacht and nacht[-1] not in ".!?…": nacht += "."
# Wunsch des Directors nach einem Release am Tag (Maintainer 15.11.2026: „wenn der fehlgeschlagene release des nachtlaufs
# wichtig genug ist damit es am tag dennoch released wird sollte der wunsch des direktors im morgenbericht stehen damit ich
# es weiss“): Zeile „Release unter Tage: Wunsch ja|nein …“ im Nachtlauf-Bericht; fehlt sie, entfällt der Satz
m = re.search(r"^\W*Release unter Tage:\s*Wunsch (ja|nein)\b[\s:–,;.-]*(.*)$", nb, re.M | re.I)
if m:
    g = einfach(m.group(2), 160).rstrip(".")
    if m.group(1).lower() == "ja":
        nacht += " Der Director wünscht ein Release heute" + (": " + g if g else "") + ". Die Tagesroutine entscheidet um 09:00."
    else:
        nacht += " Der Director wünscht kein Release am Tag" + (": " + g if g else "") + "."
# Tests: was rot ist
ci, win = E("MB_CI") or "", E("MB_WIN") or ""
rot = []
if ci.endswith(" rot"): rot.append("auf main (Linux/Mac)")
if win == "failure": rot.append("unter Windows")
if rot: tests = "Rot " + " und ".join(rot) + " – ohne grüne Tests gibt es kein Release, die Nacht repariert."
elif ci.startswith("CI main: nicht"): tests = "nicht geprüft."
elif win == "läuft": tests = "letzter Lauf grün, Windows läuft noch."
else: tests = "alles grün."
# Kontingent und Tagesroutine-Stufe
kw, soll, k5 = E("MB_KW") or "", E("MB_SOLL") or "", E("MB_K5") or ""
ab = None
if kw:
    ab = float(kw) - float(soll)
    lage = "im Plan" if ab <= float(E("MB_IM_SOLL") or 3) else "über dem Plan"
    if ab < -float(E("MB_IM_SOLL") or 3): lage = "unter dem Plan, es ist Luft"
    kont = "Woche %s %% verbraucht, %s jetzt %.0f %% – %s." % (kw, E("MB_SOLL_TEXT") or "Soll", float(soll), lage)
else:
    kont = "nicht gelesen."
# --- Vorschau Tagesroutine ---
BEREICHE = ["global", "Mail", "Kalender", "Adressbuch", "Aufgaben", "Einstellungen", "Chat", "sonstige"]
def bereich(t):
    p = t.split(":", 1)[0].lower() if ":" in t else t.lower()
    for i, muster in ((1, r"mail|nachricht|konversation|gespräch|verfass|anhäng|posteingang|ordner|konto|import|e-mail|markieren"),
                      (2, r"kalender|termin|today"), (3, r"adressbuch|kontakt"), (4, r"aufgabe"), (5, r"einstellung"), (6, r"chat"),
                      (0, r"global|seitenleiste|sidebar|spaces|dialog|menü|symbol|kapsel|css|fenster|darstellung|statusleiste|windows|design")):
        if re.search(muster, p): return i
    return 7
SCHWER = r"absturz|stürzt|abgestürzt|datenverlust|daten.?verlust|crash|falsche mail|nicht (?:senden|empfangen|abrufen)|gelöscht"
def alter_tage(body):
    ds = []
    for d, m, j in re.findall(r"\b(\d{1,2})\.(\d{1,2})\.(20\d\d)\b", body):
        try: ds.append(dt.date(int(j), int(m), int(d)))
        except ValueError: pass
    for j, m, d in re.findall(r"\b(20\d\d)-(\d\d)-(\d\d)\b", body):
        try: ds.append(dt.date(int(j), int(m), int(d)))
        except ValueError: pass
    ds = [d for d in ds if d <= HEUTE]
    return (HEUTE - min(ds)).days if ds else None
vorschau, liste, hinweis_board = [], [], ""
B = E("MB_BOARD") or ""
try:
    items = json.load(open(B, encoding="utf-8"))["items"] if B else None
except Exception:
    items = None
if items is None:
    hinweis_board = E("MB_BOARD_INFO") or "Aufgabenliste nicht gelesen"
else:
    reihen = {}
    for it in items:
        m = re.search(r"\b(\d+)[a-z]?/(\d+)[a-z]?\b", it.get("title", ""))
        if m and (it.get("status") or "") != "Done":
            k = (it["title"][:m.start()].strip(" –-:"), m.group(2))
            if k not in reihen or int(m.group(1)) < reihen[k][0]: reihen[k] = (int(m.group(1)), it["id"])
    for it in items:
        t, st, body = it.get("title", ""), it.get("status") or "", it.get("body") or ""
        if st not in ("Todo", "In Progress"): continue
        if st == "In Progress" and re.search(r"wartet auf Push/CI", body, re.I): continue
        if re.match(r"\s*(Ablauf|Release)\b", t): continue
        m = re.search(r"\b(\d+)[a-z]?/(\d+)[a-z]?\b", t)
        if m and reihen.get((t[:m.start()].strip(" –-:"), m.group(2)), (0, it["id"]))[1] != it["id"]: continue
        schwer = bool(re.search(SCHWER, t + " " + body, re.I))
        stufe = 2 if m else (0 if (it.get("typ") or "") == "Bug" else 1)
        a = alter_tage(body); b = bereich(t)
        rang = b - (1 if a is not None and a > 7 and b > 0 else 0)
        grund = [BEREICHE[b]] + (["schwer"] if schwer else []) + (["über 7 Tage offen"] if a is not None and a > 7 else []) \
                + (["Bug"] if stufe == 0 else ["Reihe, nächster Schritt"] if stufe == 2 else ["Feature"])
        liste.append(((0 if schwer else 1, stufe, rang, t.lower()), t, ", ".join(grund)))
    liste.sort()
pause, vd = E("MB_PAUSE") or "", E("MB_VOLLDAMPF") or ""
start = E("MB_START") or "09:00"
rot_zuerst = bool(rot) and kurz.lower().startswith("kein release")
if pause:
    heute = "Tagesroutine pausiert %s – sie beginnt heute nichts." % pause.split(" – ")[0]
elif ab is not None and ab > float(E("MB_SPAR_MAX") or 10) and not vd.startswith("Volldampf aktiv"):
    heute = "Tagesroutine beginnt heute nichts Neues (Kontingent deutlich über dem Plan)."
else:
    teil = []
    if vd.startswith("Volldampf aktiv"): teil.append("Volldampf (ohne Sparmodus)")
    elif ab is not None and ab > float(E("MB_IM_SOLL") or 3): teil.append("Sparmodus: höchstens kleine Einträge")
    if k5 and k5.isdigit() and int(k5) >= int(E("MB_5H_MAX") or 80): teil.append("wartet zuerst, bis das 5-Stunden-Fenster frei ist")
    was = (["zuerst die rote Prüfung der Nacht"] if rot_zuerst else []) + [einfach(x[1], 70) for x in liste[:3 - rot_zuerst]]
    if was:
        rest = len(liste) - (3 - rot_zuerst)
        heute = "ab %s: %s%s" % (start, "; ".join(was), " (+%d weitere)" % rest if rest > 0 else "")
    elif items is None:
        heute = "ab %s (%s)" % (start, hinweis_board)
    else:
        heute = "ab %s: nichts Passendes offen" % start
    if teil: heute += " – " + ", ".join(teil)
    heute += "."
heute = heute[:1].upper() + heute[1:]
# --- Bericht ---
t = HEUTE.strftime("%d.%m.%Y")
WT = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"][HEUTE.weekday()]
aufgaben = ["Ja/Nein: " + f for f in fragen] + ["Zu tun: " + s for s in sonst]
ueber = len(aufgaben) - 5
kf = ["- **Nacht:** " + nacht, "- **Tests:** " + tests]
if aufgaben:
    kf.append("- **Heute von dir (%d):**" % len(aufgaben))
    kf += ["  %d. %s" % (i + 1, a) for i, a in enumerate(aufgaben[:5 if ueber <= 0 else 4])]
    if ueber > 0: kf.append("  5. … und %d weitere, siehe Details." % (ueber + 1))
else:
    kf.append("- **Heute von dir:** nichts nötig.")
kf.append("- **Tagesroutine heute (Vorschau, unverbindlich):** " + heute)
kf.append("- **Kontingent:** " + kont)
B_ = ["# Bericht %s (%s)" % (t, WT), "", "## Kurzfassung", ""] + kf + ["", "## Details", ""]
def block(titel, inhalt):
    if not inhalt.strip(): return
    B_.extend(["<details><summary>%s</summary>" % titel, "", inhalt.strip(), "", "</details>", ""])
def tiefer(md):
    return re.sub(r"^(#{1,4}) ", lambda m: "#" * min(6, len(m.group(1)) + 2) + " ", md, flags=re.M)
if nb: block("Nachtlauf: ausführlicher Bericht", tiefer(nb))
else: block("Nachtlauf", "- " + nacht)
block("Morgenbrief: alle Zeilen", "\n".join("- " + z for z in zeilen("MB_HANDELN") + zeilen("MB_INFO")))
block("Release, CI und Windows", "\n".join("- " + z for z in zeilen("MB_INFO") if re.match(r"(Release|CI main|Windows):", z)))
ar = abschnitt(nb, "Aufgeräumt")
if ar: block("Aufräumen der Nacht", ar)
for p in zeilen("MB_TB"):
    try: tb = open(p, encoding="utf-8", errors="replace").read()
    except OSError: continue
    d = os.path.basename(p)[:10]
    block("Tagesroutine %s.%s." % (d[8:10], d[5:7]), tiefer(tb))
v = ["Unverbindlich: die erste Plan-Runde der Tagesroutine um %s entscheidet. Ändert der Maintainer den Ablauf von Hand " % start
     + "(Pause, Volldampf, Anweisung im Gespräch), gilt das.", "",
     "- Pause: " + (pause or "keine"), "- Volldampf: " + (vd or "nicht angemeldet")]
if rot_zuerst: v.append("- Vorrang: rote Prüfung der Nacht (Tagesroutine Schritt 1b)")
v += ["", "Reihenfolge nach den Regeln (schwer zuerst; Bugs, Features, Reihen; Bereichsfolge global, Mail, Kalender, Adressbuch, "
      "Aufgaben, Einstellungen, Chat; über 7 Tage offen eine Stufe vor, Alter aus dem ältesten Datum im Text). Ohne „Wartet auf OK“, "
      "Ablauf- und Release-Einträge, ohne Einträge, die auf Push/CI warten; von Reihen nur der nächste Schritt.", ""]
if items is None: v.append("- " + hinweis_board)
else: v += ["%d. %s (%s)" % (i + 1, x[1], x[2]) for i, x in enumerate(liste[:30])] + (["", "… und %d weitere." % (len(liste) - 30)] if len(liste) > 30 else [])
block("Vorschau Tagesroutine: offene Einträge in Regel-Reihenfolge", "\n".join(v))
if len(sys.argv) > 1 and sys.argv[1]:
    with open(sys.argv[1], "w", encoding="utf-8") as f: f.write("\n".join(B_).rstrip() + "\n")
# --- iPhone: höchstens 3 Zeilen plus Hinweis, ohne Pfade und Hashes ---
print("Du musst heute: %d Punkt%s" % (len(aufgaben), "e" if len(aufgaben) != 1 else "") if aufgaben else "Nichts nötig")
print("Nacht: " + einfach(nacht, 160))
print(einfach(aufgaben[0], 160) if aufgaben else ("Tests: " + tests if rot else "Heute: " + einfach(heute, 120)))
print("Bericht in der Sitzung neon mit /bericht öffnen")
'

ART=info; (( $#HANDELN )) && ART=handeln
AUSGABE=$BERICHTE/$HEUTE-bericht.md
[[ -n $TROCKEN ]] && AUSGABE=${HALO_MB_AUSGABE:-}
ZEILEN=(${(f)"$(MB_HEUTE=$HEUTE MB_NB=$NB MB_NACHT_ZUSTAND=$NACHT_ZUSTAND MB_HANDELN=${(F)HANDELN} MB_RF_ZEILE=$RF_ZEILE \
  MB_INFO=${(F)INFO} MB_TB=${(F)TB_LISTE} MB_KW=$KW MB_K5=$K5 MB_SOLL=$T[SOLL] MB_SOLL_TEXT=$SOLL_TEXT MB_WIN=$WIN MB_CI=$CI_ZEILE \
  MB_PAUSE=$TR_PAUSE MB_VOLLDAMPF=$TR_VD MB_BOARD=$BOARD_JSON MB_BOARD_INFO=$BOARD_INFO MB_START=$TR_START \
  MB_IM_SOLL=$(cv IM_SOLL 3) MB_SPAR_MAX=$(cv SPAR_MAX 10) MB_5H_MAX=$(cv FUENF_STUNDEN_MAX 80) \
  python3 -I -c $BERICHT_PY "$AUSGABE")"})
[[ -z $HALO_MB_BOARD && -n $BOARD_JSON ]] && rm -f $BOARD_JSON
(( $#ZEILEN )) || ZEILEN=("Morgenbrief: Bericht ließ sich nicht bauen (python3?)" "Bericht in der Sitzung neon mit /bericht öffnen")
TEXT="Morgenbrief ${HEUTE[9,10]}.${HEUTE[6,7]}.: ${(j: / :)ZEILEN}"

if [[ -n $TROCKEN ]]; then
  print "Morgenbrief – Trockenlauf (kein Netz, kein echter Push, nichts in ~/halo-nacht${HALO_MB_AUSGABE:+, Bericht nach $HALO_MB_AUSGABE})"
  print "Jetzt $T[JETZT], seit $T[SEIT], Art [$ART]; Meldung zeilenweise:"
  print -rl -- "  "${^ZEILEN}
else
  log "Bericht $AUSGABE, Brief [$ART]: $TEXT"
fi

# --- Wochenende ohne Auffälligkeit: Bericht ja, Meldung nein ---
if [[ -n $WOCHENENDE && $ART == info ]]; then
  if [[ -n $TROCKEN ]]; then print "Wochenende ($T[JETZT]), nichts Auffälliges: Bericht ja, keine Meldung"
  else log "Wochenende – nichts Auffälliges, keine Meldung (Bericht geschrieben)"; fi
  exit 0
fi
# handeln.log nur um neue Gründe ergänzen: Gründe aus handeln.log sind dort schon gezählt (Pflichtzeit-Messung)
if [[ $ART == handeln && $#HANDELN_NEU -eq 0 ]]; then
  HALO_HANDELN_LOG=/dev/null push "$TEXT" morgenbrief handeln
else
  push "$TEXT" morgenbrief $ART
fi
exit 0
