#!/bin/zsh
export HALO_LAUF=morgenbrief
# Morgenbrief auf neon (Auftrag stufe-6 Übergabe Punkt 1, 10.11.2026; geladen 11.11.2026): täglich 08:30
# eine einzige iPhone-Meldung, am Wochenende nur bei Auffälligkeiten ([handeln]), sonst nichts; ohne Sprachmodell zusammengestellt (nur die Zustellung über push() nutzt den
# kurzen Haiku-Aufruf aus lauf-hilfen.zsh). Ersetzt die geplante Laptop-Aufgabe „halo-morgenblock“.
# Gestartet vom LaunchAgent at.halo-spaces.morgenbrief (Interpreter /bin/zsh), die Datei liegt wie
# nachtlauf.sh als Kopie in ~/.config/halo-spaces/.
#   morgenbrief.sh [<Repo-Ordner>]
#   morgenbrief.sh --trocken [<Repo>]   kein Netz (kein gh, kein kontingent.sh), kein echter Push,
#                                       nichts nach ~/halo-berichte oder ~/halo-nacht geschrieben
# Gelesen (seit dem letzten Brief = voriger Werktag 08:30; Sa/So: gestern 08:30):
#   ~/halo-berichte/<heute>-nachtlauf.md (Zeile „Kurz:“), ~/halo-nacht/<heute>.fertig, lauf.lock
#   ~/halo-berichte/<voriger Werktag>-tagesroutine.md (Zeile „Kurz:“)
#   ~/halo-berichte/<Datum>-halo.spaces-<Version>.md (FEHLER von publish.sh)
#   gh release list, gh run list (test.yml auf main; workflow_dispatch = Windows-Lauf der Nacht)
#   ~/halo-nacht/handeln.log (ohne eigene Zeilen „morgenbrief“), ~/halo-nacht/pausen.txt
#   Kontingent: tests/kontingent.sh; Soll = Stunden seit Reset (Di 00:00 UTC) / 168 × 100 %
# Geschrieben (nur echter Lauf): ~/halo-berichte/<heute>-morgenbrief.md, ~/halo-nacht/<heute>-morgenbrief.log,
#   ~/halo-nacht/kontingent-tage.tsv (eine Zeile je Tag, Grundlage für vergleich-6-12.sh)
# Meldung: erste Zeile „Du musst heute: …“ oder „Nichts nötig“, danach höchstens 8 Zeilen.
# [handeln], wenn der Maintainer etwas tun muss, sonst [info]. push() macht aus Zeilenumbrüchen
# Leerzeichen; die Zeilen werden darum mit „ / “ verbunden, der Bericht behält sie einzeln.
# Zum Proben (auch ohne --trocken): HALO_JETZT=<ISO-Zeit mit Zone>; HALO_MB_BERICHTE, HALO_MB_NACHT
# (Ordner), HALO_MB_HANDELN (handeln.log zum Lesen), HALO_PAUSEN_DATEI; HALO_KONTINGENT_WOCHE /
# HALO_KONTINGENT_5H (Prozent); HALO_MB_RELEASES und HALO_MB_CI (JSON-Dateien wie `gh release list
# --json tagName,publishedAt` bzw. `gh run list --json databaseId,headSha,status,conclusion,event,createdAt`);
# HALO_MB_WINDOWS=success|failure|cancelled|läuft|keiner (Ergebnis des Jobs „windows“).
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
MAX_ZEILEN=8
KONT_NICHTS_NEUES=2      # wie tagesroutine.conf NICHTS_NEUES_UEBER
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
HEUTE=$T[HEUTE]
WOCHENENDE=; (( T[WT] > 5 )) && WOCHENENDE=1   # Sa/So: Meldung nur bei [handeln]
if [[ -z $TROCKEN ]] && g=$(pause_aktiv morgenbrief); then log "ÜBERSPRUNGEN morgenbrief pausiert $g"; exit 0; fi

typeset -a HANDELN INFO      # HANDELN: kurze Gründe für die erste Zeile; INFO: Zeilen danach
typeset -a HANDELN_NEU       # Gründe, die noch nicht in handeln.log stehen (nur die zählen neu)
kurz() { local s=${1//$'\n'/ }; (( ${#s} > ${2:-150} )) && s="${s[1,${2:-150}-1]}…"; print -r -- $s }

# --- 1. handeln.log seit dem letzten Brief (eigene Zeilen „morgenbrief“ zählen nicht) ---
if [[ -r $HANDELN_LESEN ]]; then
  while IFS=$'\t' read -r q t; do
    HANDELN+=("$q: $(kurz $t 70)")
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
elif [[ -e $NACHT/lauf.lock ]] && kill -0 $(<$NACHT/lauf.lock) 2>/dev/null; then
  INFO+=("Nacht: läuft noch (Bericht folgt)")
else
  g=$(grep -m1 '^Grund:' $NACHT/$HEUTE.fertig 2>/dev/null)
  HANDELN+=("Nachtlauf ohne Bericht${g:+ (${g#Grund: })} – ~/halo-nacht/$HEUTE.log ansehen")
  HANDELN_NEU+=(nachtlauf)
fi

# --- 4. Tagesroutine des vorigen Werktags ---
TB=$BERICHTE/$T[VORTAG]-tagesroutine.md
if [[ -r $TB ]]; then
  k=$(grep -m1 '^Kurz:' $TB); INFO+=("Tag ${T[VORTAG][9,10]}.${T[VORTAG][6,7]}.: $(kurz ${${k#Kurz: }:-ohne Kurzzeile} 120)")
fi   # kein Bericht: Tagesroutine aus oder pausiert, keine Zeile

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
  INFO+=("${c%%$'\n'*}")
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
fi
if [[ -n $KW ]]; then
  ab=$(python3 -I -c 'import sys; print("%+.1f" % (float(sys.argv[1]) - float(sys.argv[2])))' $KW $T[SOLL])
  zeile="Kontingent: Woche $KW % (Soll $T[SOLL] %, $ab), 5 h $K5 %"
  if (( KW >= KONT_KNAPP && T[BIS_RESET_H] > 24 )); then
    HANDELN+=("Kontingent $KW % bei $T[BIS_RESET_H] h bis Reset: Empfehlung Tagesroutine pausieren (pause_setzen tagesroutine <bis> …)")
    HANDELN_NEU+=(kontingent)
  elif (( ${ab%.*} > KONT_NICHTS_NEUES )); then
    zeile+=" – über Soll, Tagesroutine beginnt nichts Neues (Empfehlung: nichts tun)"
  fi
  INFO+=("$zeile")
  # Tageswert für die Vier-Wochen-Messung (vergleich-6-12.sh): Datum, Woche %, Soll %, 5 h %
  [[ -z $TROCKEN ]] && print -r -- "$HEUTE	$KW	$T[SOLL]	$K5" >> $NACHT/kontingent-tage.tsv
else
  INFO+=("Kontingent: nicht gelesen${TROCKEN:+ (trocken)}")
fi

# --- Meldung bauen: erste Zeile + höchstens 8 Zeilen ---
typeset -a ZEILEN
if (( $#HANDELN )); then
  ART=handeln
  ZEILEN=("Du musst heute: $#HANDELN Punkt$( (( $#HANDELN > 1 )) && print e )")
  ZEILEN+=("- "${^HANDELN})
else
  ART=info
  ZEILEN=("Nichts nötig")
fi
ZEILEN+=($INFO)
if (( $#ZEILEN > MAX_ZEILEN + 1 )); then
  rest=$(( $#ZEILEN - MAX_ZEILEN ))
  ZEILEN=(${ZEILEN[1,MAX_ZEILEN]} "(+$rest weitere im Bericht ~/halo-berichte/$HEUTE-morgenbrief.md)")
fi
TEXT="Morgenbrief ${HEUTE[9,10]}.${HEUTE[6,7]}.: ${(j: / :)ZEILEN}"

# --- Wochenende ohne Auffälligkeit: kein Brief, kein Push (Kontingent-Zeile oben ist geschrieben) ---
if [[ -n $WOCHENENDE && $ART == info ]]; then
  if [[ -n $TROCKEN ]]; then print "Morgenbrief – Trockenlauf: Wochenende ($T[JETZT]), nichts Auffälliges, kein Brief"
  else log "Wochenende – nichts Auffälliges, kein Brief"; fi
  exit 0
fi

# --- Bericht und Push ---
if [[ -n $TROCKEN ]]; then
  print "Morgenbrief – Trockenlauf (kein Netz, kein echter Push, nichts in ~/halo-berichte/~/halo-nacht)"
  print "Jetzt $T[JETZT], seit $T[SEIT], Art [$ART]; Meldung zeilenweise:"
  print -rl -- "  "${^ZEILEN}
else
  { print "# Morgenbrief $HEUTE"; print; print -rl -- $ZEILEN; (( $#INFO + $#HANDELN > MAX_ZEILEN )) && { print; print "## Alle Zeilen"; print -rl -- "- "${^HANDELN} "- "${^INFO} } } > $BERICHTE/$HEUTE-morgenbrief.md
  log "Brief [$ART]: $TEXT"
fi
# handeln.log nur um neue Gründe ergänzen: Gründe aus handeln.log sind dort schon gezählt (Pflichtzeit-Messung)
if [[ $ART == handeln && $#HANDELN_NEU -eq 0 ]]; then
  HALO_HANDELN_LOG=/dev/null push "$TEXT" morgenbrief handeln
else
  push "$TEXT" morgenbrief $ART
fi
exit 0
