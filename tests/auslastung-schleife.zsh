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
#      5-Stunden-Fenster ab FENSTER_DROSSEL (70 %): nur noch Klasse „tokenarm“ (MODELL_TOKENARM sonnet, höchstens
#      TOKENARM_MAX 1 gleichzeitig; Maintainer 18.11.2026); ab FENSTER_STOPP (90 %): kein neuer Worker. Höchstens ein Start je Takt und START_ABSTAND.
#      Windows-Rundgang (rundgang_pruefen, unten): ab RUNDGANG_5H (85 %) einmal je Tag eine Sitzung mit dem offenen
#      Bildauftrag RUNDGANG_NR aus neon-stand.md (Maintainer 18.11.2026), vor Stopp, Takt und Drossel.
#   5. Modell MODELL (opus); fable nur bei Woche mehr als FABLE_ABSTAND (20) Punkte unter Soll, 5-Stunden-Fenster
#      unter FABLE_5H (50 %) und keinem anderen Fable-Lauf.
#   6. Vorprüfung ohne Sprachmodell (passend, unten; Maintainer 19.11.2026): ein Worker nur, wenn die Aufgabenliste (höchstens
#      alle BOARD_ALTER 15 Minuten geladen) oder die Bug-Jagden einen möglichen Eintrag haben; sonst „kein passender Eintrag“
#      ins Protokoll und nächste Prüfung nach LEER_WARTEN (15) Minuten.
# Ein Worker: eigener Worktree ~/halo-worker/<name> ohne Zweig auf origin/main; den Zweig pruef/<name> legt er erst vor dem
# ersten Commit an. Ohne Commit wird der Worktree nach dem Lauf sofort entfernt (kopie_nach_lauf). claude -p mit
# denselben Flags wie die Tagesroutine (--permission-mode auto), ohne HALO_LAUF (der Zeitfenster-Hook gilt für ihn, lässt aber
# Pushes auf pruef/worker-… zu jeder Zeit durch), Auftrag tests/auslastung-auftrag.md, Ports 2874–2889 (zwei je
# Worker-Nummer), höchstens WORKER_MAX_MIN Minuten.
# Der Wächter ändert nie Regeln, Rechte oder Hooks, pusht nie, veröffentlicht nie und fasst den Checkout
# ~/halo-spaces nicht an (nur „git fetch“, „worktree add/remove“ und das Löschen leerer Worker-Zweige).
# Zum Proben: HALO_JETZT=<ISO-Zeit>, HALO_AS_WOCHE/_5H/_STATUS, HALO_AS_AKTIV, HALO_AS_FABLE, HALO_AS_NACHTLAUF=ja|nein,
# HALO_AS_LETZTER=<Unix-Sekunden des letzten Starts>, HALO_AS_CONF, HALO_PAUSEN_DATEI, HALO_VOLLDAMPF_DATEI/…_BEENDET,
# HALO_AS_BOARD=<Aufgabenliste als JSON wie board.sh export> (leer oder fehlend = nicht lesbar).
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
  K=(TAKT 10 MAX_WORKER 4 SOLL_STUNDEN 48 FENSTER_MIN 60 FENSTER_DROSSEL 70 FENSTER_RESERVE $FENSTER_RESERVE_STANDARD FENSTER_STOPP 90 MODELL opus MODELL_FABLE fable
     FABLE_ABSTAND 20 FABLE_5H 50 MODELL_TOKENARM sonnet TOKENARM_MAX 1 NACHT_BIS 0900
     RUNDGANG_NR 35 RUNDGANG_5H 85 RUNDGANG_5H_BIS 98 RUNDGANG_VON 0900 RUNDGANG_BIS 2200 MODELL_RUNDGANG sonnet RUNDGANG_MAX_MIN 120 START_ABSTAND 10 KONT_ALTER 15 PAUSE_KONT_ALTER 60 WORKER_MAX_MIN 240
     BOARD_ALTER 15 LEER_WARTEN 15 LEER_GUELTIG 720)
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
# lebende Worker der Klasse tokenarm (Feld 8 der Zustandsdatei); Probe: HALO_AS_TOKENARM
tokenarm_zahl() {
  [[ -n $HALO_AS_TOKENARM ]] && { print $HALO_AS_TOKENARM; return }
  local f z c=0
  for f in $ZUSTAND/worker-<1-8>(N); do
    z=($(<$f))
    [[ $z[8] == tokenarm ]] && kill -0 $z[1] 2>/dev/null && (( c++ ))
  done
  print $c
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
# Woche nur aus seven_day bzw. einem Wochen-Ereignis, sonst nicht lesbar (nie der 5-Stunden-Wert oder 0, 18.11.2026)
u = wo["utilization"] if "utilization" in wo else i["utilization"] if i.get("rateLimitType") == "seven_day" else None
if u is None: sys.exit(1)
print(round(100 * u), round(100 * h.get("utilization", 0)), wo.get("status", i.get("status", "?")))
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
print("%s %d %s" % (n.strftime("%H%M"), n.timestamp(), n.strftime("%Y-%m-%d")))
'
letzter_start() {
  [[ -n ${HALO_AS_LETZTER+x} ]] && { print -r -- ${HALO_AS_LETZTER:-0}; return }
  [[ -r $ZUSTAND/letzter-start ]] && print -r -- $(<$ZUSTAND/letzter-start) || print 0
}

# Windows-Rundgang bei knappem 5-Stunden-Fenster (Maintainer 18.11.2026 zum Auftrag RUNDGANG_NR in neon-stand.md: „wäre auch
# ein perfekter task für die Situation wenn wir bereits knapp am 5h-Limit sind“; auf neons Empfehlung, ihn ab 85 % automatisch
# zu starten: „ich folge allen empfehlungen von dir.“). Fällig, wenn: Auftrag noch offen in neon-stand.md (Zeile „- #<Nr> |“),
# nicht schon erledigt (Marke rundgang-<Nr>-erledigt) und heute nicht schon gestartet (Marke rundgang-<Nr>-<Datum>),
# 5-Stunden-Fenster ab RUNDGANG_5H (85) und unter RUNDGANG_5H_BIS (98, sonst scheitert die Sitzung am Limit),
# RUNDGANG_VON–RUNDGANG_BIS (09:00–22:00), kein Nachtlauf, nicht belegt (CI auf dem Runner, Testlauf, VM, Release).
# Der Auftrag wird wörtlich übergeben (nichts geändert), Rahmen tests/auslastung-rundgang.md. Probe: HALO_AS_NEON_STAND,
# HALO_AS_BELEGT (leer = frei, sonst Grund).
rundgang_auftrag() {   # gibt die Auftragszeile aus, Rückgabe 1 wenn nicht offen
  local datei=${HALO_AS_NEON_STAND:-$HOME/halo-aufgaben/neon-stand.md}
  grep -m1 -E "^- #$K[RUNDGANG_NR] \|" $datei 2>/dev/null
}
rundgang_belegt() {
  [[ -n ${HALO_AS_BELEGT+x} ]] && { [[ -n $HALO_AS_BELEGT ]] && print -r -- $HALO_AS_BELEGT; return }
  # wie tests/auslastung-test.zsh: andere Claude-Sitzungen und Ungespeichertes im Checkout zählen nicht
  ( aktive_sitzung() { return 1 }; REST_MITNEHMEN=1; belegt )
}
rundgang_pruefen() {   # <5h %> <HHMM> – Rückgabe 0 = fällig; gibt sonst den Grund aus
  local nr=$K[RUNDGANG_NR] g
  [[ $nr == <1-> ]] || { print -r -- "aus (RUNDGANG_NR 0)"; return 1 }
  [[ -e $ZUSTAND/rundgang-$nr-erledigt ]] && { print -r -- "Auftrag #$nr erledigt"; return 1 }
  rundgang_auftrag >/dev/null || { print -r -- "Auftrag #$nr nicht offen in neon-stand.md"; return 1 }
  (( $1 >= K[RUNDGANG_5H] )) || { print -r -- "5-Stunden-Fenster unter $K[RUNDGANG_5H] %"; return 1 }
  (( $1 < K[RUNDGANG_5H_BIS] )) || { print -r -- "5-Stunden-Fenster ab $K[RUNDGANG_5H_BIS] % (Limit zu nah)"; return 1 }
  (( $2 >= 10#$K[RUNDGANG_VON] && $2 < 10#$K[RUNDGANG_BIS] )) || { print -r -- "nur $K[RUNDGANG_VON]–$K[RUNDGANG_BIS]"; return 1 }
  nachtlauf_laeuft && { print -r -- "Nachtlauf läuft"; return 1 }
  [[ -e $ZUSTAND/rundgang-$nr-$HEUTE ]] && { print -r -- "heute schon gestartet"; return 1 }
  g=$(rundgang_belegt) && { print -r -- "belegt: $g"; return 1 }
  print -r -- "fällig"
}

# --- Vorprüfung ohne Sprachmodell: gibt es überhaupt einen Eintrag für einen Worker? (Maintainer 19.11.2026, „1. ja“ auf neons
# Vorschlag, Worker nur noch zu starten, wenn ein passender Eintrag in der Liste steht, und leere Läufe sofort zu beenden;
# Anlass ~/halo-berichte/2026-11-19-pruefzweige.md: 100 von 178 Starts am 17./18.11. endeten mit „nichts_passend“.)
# Kriterien nur aus tests/auslastung-auftrag.md, soweit ohne Sprachmodell erkennbar: Status Todo (nicht In Progress, Wartet auf
# OK, Done); letzte Sperr-Notiz nicht „In Arbeit:“ (sondern keine, „In Arbeit beendet:“ oder „In Arbeit aufgegeben:“); keine
# Design-Einträge (Titel „Design: …“ oder „(Design-Eintrag)“), keine Ablauf-, Release- und Store-Einträge; keine Features mit
# „GitHub #n“ (Freigabe ist nicht maschinell lesbar, im Zweifel nicht starten); nicht in einem Plan von heute (<Heute>-plan.md des
# Nachtlaufs, <Heute>-tagesroutine-plan*.tsv; volle oder kurze id, die letzten fünf Zeichen). Dazu freie Verdachtsfälle der
# Bug-Jagden („## n. …“ in bugjagd-*-JJJJ-MM-TT.md, noch nicht in auslastung-vergeben.txt; nie für Klasse tokenarm).
# Was sich nur mit Sprachmodell entscheiden lässt (Optik ohne Kennzeichen, Entscheidung des Maintainers nötig), übernimmt der
# Befund des Workers: endet ein Worker mit „nichts_passend“, merkt sich der Wächter den Fingerabdruck der Kandidaten bei seinem
# Start (leer-<Klasse>); solange die Kandidaten unverändert sind (höchstens LEER_GUELTIG Minuten), startet kein weiterer.
# Aufgabenliste höchstens alle BOARD_ALTER (15) Minuten über tests/board.sh export, dazwischen aus $ZUSTAND/board.json.
# Probe: HALO_AS_BOARD=<JSON wie board.sh export>.
PASSEND_PY='
import sys, json, re, glob, os, hashlib
board, heute, d = sys.argv[1:4]
items = json.load(open(board, encoding="utf-8"))["items"]
plan = ""
for f in [os.path.join(d, heute + "-plan.md")] + sorted(glob.glob(os.path.join(d, heute + "-tagesroutine-plan*.tsv"))):
    try: plan += open(f, encoding="utf-8").read() + "\n"
    except OSError: pass
def geplant(i):
    for k in (i, i[-5:]):
        if k and re.search(r"(?<![A-Za-z0-9_-])" + re.escape(k) + r"(?![A-Za-z0-9_-])", plan): return True
    return False
AUS = re.compile(r"^\s*(Ablauf|Release|Store|Design)\s*:|\(Design-Eintrag\)", re.I)
GH = re.compile(r"GitHub(-Issue)? #\d+")
SPERRE = re.compile(r"In Arbeit( beendet| aufgegeben)?:")
kand = []
for e in items:
    t, b, i = e.get("title") or "", e.get("body") or "", e.get("id") or ""
    if e.get("status") != "Todo" or AUS.search(t): continue
    if (e.get("typ") or "") == "Feature" and GH.search(t): continue
    s = SPERRE.findall(b)
    if s and s[-1] == "": continue
    if geplant(i): continue
    kand.append((i, t, hashlib.sha256(b.encode()).hexdigest()[:12]))
vergeben = set()
try:
    for z in open(os.path.join(d, "auslastung-vergeben.txt"), encoding="utf-8"):
        if z.split(): vergeben.add(z.split()[-1])
except OSError: pass
faelle = []
for f in sorted(glob.glob(os.path.join(d, "bugjagd-*-20[0-9][0-9]-[0-9][0-9]-[0-9][0-9].md"))):
    for n in re.findall(r"^## (\d+)\. ", open(f, encoding="utf-8").read(), re.M):
        k = os.path.basename(f) + "#" + n
        if k not in vergeben: faelle.append(k)
fp = hashlib.sha256("\n".join(sorted("|".join(k) for k in kand) + faelle).encode()).hexdigest()[:16]
print(len(kand), len(faelle), fp)
for i, t, _ in sorted(kand, key=lambda k: k[1])[:3]: print(t[:70])
'
board_datei() {   # gibt den Pfad einer lesbaren Liste aus (Zwischenspeicher bis BOARD_ALTER Minuten)
  [[ -n ${HALO_AS_BOARD+x} ]] && { [[ -r $HALO_AS_BOARD ]] && print -r -- $HALO_AS_BOARD; return }
  local f=$ZUSTAND/board.json neu
  [[ -s $f && -n $(find $f -mmin -$K[BOARD_ALTER] 2>/dev/null) ]] && { print -r -- $f; return 0 }
  if [[ $MODUS == trocken ]]; then neu=$(mktemp -t halo-as-board) || return 1   # Trockenlauf: Zwischenspeicher nicht schreiben
  else mkdir -p $ZUSTAND && neu=$f.neu; fi
  zsh $HIER/board.sh export > $neu 2>/dev/null && python3 -I -c 'import sys, json; json.load(open(sys.argv[1]))["items"]' $neu 2>/dev/null \
    || { rm -f $neu; return 1 }
  [[ $MODUS == trocken ]] && { print -r -- $neu; return 0 }
  mv -f $neu $f && print -r -- $f
}
# <Klasse> – gibt die Auskunft aus; 0 = mindestens ein Kandidat, 1 = keiner, 2 = Liste nicht lesbar.
# Schreibt den Fingerabdruck nach $ZUSTAND/liste-fp (für die Zustandsdatei des Workers), außer im Trockenlauf.
passend() {
  local kl=$1 b erg n nb fp m
  local -a z t
  b=$(board_datei) || { print -r -- "Aufgabenliste nicht lesbar"; return 2 }
  erg=$(python3 -I -c $PASSEND_PY $b $HEUTE $DIR 2>/dev/null) || { print -r -- "Aufgabenliste nicht auswertbar"; return 2 }
  z=(${(f)erg}) t=(${=z[1]})
  n=$t[1] nb=$t[2] fp=$t[3]
  [[ $MODUS == trocken ]] || print -r -- $fp > $ZUSTAND/liste-fp
  [[ $kl == tokenarm ]] && nb=0   # Bug-Jagd-Fälle nie in Klasse tokenarm (Auftrag)
  (( n + nb )) || { print -r -- "kein Todo-Eintrag ohne Sperre, Design-, Ablauf-, Release-, Store- oder Tagesplan-Bezug${${t[2]:#0}:+ (Bug-Jagd-Fälle nur für Klasse normal)}"; return 1 }
  for m in $ZUSTAND/leer-$kl(N) $ZUSTAND/leer-normal(N); do   # Klasse normal ohne Ergebnis heißt auch tokenarm ohne Ergebnis
    t=($(<$m))   # <Fingerabdruck> <Unix-Sekunden> <HH:MM>
    [[ $t[1] == $fp ]] && (( jetzt - t[2] < K[LEER_GUELTIG] * 60 )) \
      && { print -r -- "Kandidaten unverändert seit „nichts_passend“ eines Workers um $t[3] ($n Einträge, $nb Bug-Jagd-Fälle)"; return 1 }
  done
  print -r -- "$n Einträge, $nb Bug-Jagd-Fälle möglich${z[2]:+: ${(j:; :)z[2,-1]}}"
}

# Prüfung: gibt „starten <Modell> <Grund>“, „leer <Grund>“, „warten <Grund>“ oder „ende <Grund>“ aus
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
  std=$s[1] soll=$s[2] hm=$((10#$u[1])) jetzt=$u[2] HEUTE=$u[3]
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
  # Windows-Rundgang bei knappem Fenster (vor Stopp und Takt: er braucht kaum Token, nur Zeit und die VM)
  local rg
  rg=$(rundgang_pruefen $f5 $hm) && { print -r -- "rundgang $K[MODELL_RUNDGANG] Auftrag #$K[RUNDGANG_NR] (5-Stunden-Fenster $f5 % ab $K[RUNDGANG_5H] %) – $lage"; return }
  [[ $MODUS == trocken ]] && print -u2 -r -- "Rundgang: nicht fällig – $rg"
  (( f5 >= K[FENSTER_STOPP] )) && { print -r -- "warten 5-Stunden-Fenster ab $K[FENSTER_STOPP] % – $lage"; return }
  # Fenster-Takt (Maintainer 18.11.2026: „ich möchte nur vermeiden dass die produktivität bei null ist weil wir ständig in das 5h-limit hineinlaufen“):
  # neue Worker nur, solange das Fenster nicht schneller verbraucht ist als die verstrichene Zeit (+ FENSTER_RESERVE Punkte), damit es nicht nach 1 h leer ist
  # fenster_rest/fenster_takt aus lauf-hilfen.zsh (gemeinsam mit der Tagesroutine, 18.11.2026)
  local rest soll5
  rest=$(fenster_rest $DIR/kontingent.json)
  if soll5=$(fenster_takt "$rest" $K[FENSTER_RESERVE]); then
    (( f5 > soll5 )) && { print -r -- "warten Fenster-Takt (5 Stunden $f5 % über ${soll5} %, noch $(( rest / 60 )) Min. bis zum Fensterende) – $lage"; return }
  fi
  # Drossel (Maintainer 18.11.2026: „ich folge deinen empfehlungen“; bis 18.11.2026 ab FENSTER_DROSSEL höchstens ein Worker gleichzeitig)
  # und Aufgabenzuteilung nach Aufwand (Maintainer 18.11.2026: „ich folge allen empfehlungen von dir.“, Empfehlung 1;
  # docs/regelwerk-kontingent.md Abschnitt 4): ab FENSTER_DROSSEL % nur noch Klasse „tokenarm“ (Modell MODELL_TOKENARM,
  # kein Fable, Auftrag „Klasse tokenarm“: Prüfläufe, kleine Routine, nie Fehlersuche, Analyse oder größere Code-Einträge),
  # höchstens TOKENARM_MAX tokenarme Worker gleichzeitig; tokenschwere Worker beginnen erst wieder unter FENSTER_DROSSEL.
  local klasse=normal ta
  if (( f5 >= K[FENSTER_DROSSEL] )); then
    klasse=tokenarm ta=$(tokenarm_zahl)
    (( ta >= K[TOKENARM_MAX] )) && { print -r -- "warten 5-Stunden-Fenster ab $K[FENSTER_DROSSEL] % (Drossel: nur tokenarm, $ta tokenarme Worker aktiv, Grenze $K[TOKENARM_MAX]) – $lage"; return }
  fi
  if (( nacht )); then
    (( a < 0 )) || { print -r -- "warten nachts nur unter dem Soll – $lage"; return }
  else
    (( a < 0 || f5 < K[FENSTER_MIN] )) || { print -r -- "warten im Soll und 5-Stunden-Fenster ab $K[FENSTER_MIN] % – $lage"; return }
  fi
  local start vp rc
  if [[ $klasse == tokenarm ]]; then
    start="starten $K[MODELL_TOKENARM] tokenarm (5-Stunden-Fenster ab $K[FENSTER_DROSSEL] %, nur Aufträge mit wenig Token) – $lage"
  else
    fn=$(fable_zahl)
    if (( a <= -K[FABLE_ABSTAND] && f5 < K[FABLE_5H] )); then   # Maintainer 17.11.2026: im Volldampf keine Mengengrenze für Fable (kein „nur ein Fable-Lauf“)
      start="starten $K[MODELL_FABLE] Soll weit verfehlt – $lage"
    else
      start="starten $K[MODELL] $( (( a < 0 )) && print unter dem Soll || print 5-Stunden-Fenster unter $K[FENSTER_MIN] %) – $lage"
    fi
  fi
  # Vorprüfung (Maintainer 19.11.2026): ohne möglichen Eintrag kein Worker
  vp=$(passend $klasse); rc=$?
  (( rc == 2 )) && { print -r -- "warten $vp – kein Worker ohne Vorprüfung – $lage"; return }
  (( rc == 1 )) && { print -r -- "leer kein passender Eintrag ($vp) – $lage"; return }
  [[ $MODUS == trocken ]] && print -u2 -r -- "Vorprüfung: $vp"
  print -r -- $start
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
# Worktree nach dem Lauf (Maintainer 19.11.2026, leere Läufe sofort beenden): ohne Commit, ohne Änderungen und nur mit
# erzeugten ignorierten Dateien sofort entfernen, einen leeren Zweig (git switch -c ohne Commit) mit; Commits ohne Zweig
# (git switch -c vergessen) bekommen den Zweig nachträglich, damit sie nicht verloren gehen. Sonst bleibt alles stehen
# (tests/aufraeumen.sh entscheidet später). Alte Worker ohne Basis-Commit (Feld 11) werden nicht angefasst.
kopie_nach_lauf() {   # <Worktree> <Zweig> <Basis-Commit>
  local wt=$1 zw=$2 basis=$3 kopf st f
  [[ -d $wt && $basis == [0-9a-f](#c40) ]] || return 0
  kopf=$(git -C $wt rev-parse HEAD 2>/dev/null) || { log "Worktree $wt bleibt: git rev-parse scheitert"; return 0 }
  if [[ $kopf != $basis ]]; then
    if ! git -C $wt symbolic-ref -q HEAD >/dev/null; then
      if git -C $wt checkout -q -b $zw 2>>$LOG; then log "Worker-Commits ohne Zweig in $wt: Zweig $zw nachträglich angelegt"
      else log "Worker-Commits ohne Zweig in $wt: Zweig $zw nicht anlegbar – Worktree bleibt"; fi
    fi
    return 0
  fi
  st=$(git -C $wt status --porcelain 2>/dev/null) || { log "Worktree $wt bleibt: git status scheitert"; return 0 }
  [[ -n $st ]] && { log "Worktree $wt bleibt: ungespeicherte Änderungen ohne Commit ($(print -r -- $st | wc -l | tr -d ' ') Dateien)"; return 0 }
  for f in ${(f)"$(git -C $wt status --porcelain --ignored 2>/dev/null | sed -n 's/^!! //p')"}; do
    [[ $f == (dist/*|extension/theme.css|(*/|)__pycache__/*|*.xpi|*.pyc|tests/shots/*|(*/|).DS_Store|repo.conf) ]] \
      || { log "Worktree $wt bleibt: ignorierte Datei $f"; return 0 }
  done
  git -C $MAIN worktree remove $wt 2>>$LOG || { log "Worktree $wt bleibt: git worktree remove lehnt ab"; return 0 }
  # leerer Zweig (zeigt auf den Basis-Commit, also kein eigener Commit): weg
  if [[ $(git -C $MAIN rev-parse -q --verify refs/heads/$zw 2>/dev/null) == $basis ]]; then
    git -C $MAIN branch -q -D $zw 2>>$LOG && log "leerer Zweig $zw entfernt"
  fi
  log "leerer Worktree $wt entfernt (kein Commit)"
}
# beendete Worker einmal protokollieren
aufraeumen() {
  local f z e
  for f in $ZUSTAND/worker-<1-8>(N); do
    z=($(<$f))
    kill -0 $z[1] 2>/dev/null && continue
    e=$(head -1 $z[7] 2>/dev/null) || e="keine Ergebnisdatei"
    log "Worker ${f:t} beendet (Sitzung $z[2], Zweig $z[6]): $e"
    # „nichts_passend“ (außer ohne Volldampf): Kandidaten bei seinem Start merken, damit bei unveränderter Liste keiner mehr startet
    if [[ $e == nichts_passend* && $e != *Volldampf* && $z[8] == (normal|tokenarm) && $z[10] == [0-9a-f](#c16) ]]; then
      print -r -- "$z[10] $(date +%s) $(date +%H:%M)" > $ZUSTAND/leer-$z[8]
    fi
    kopie_nach_lauf $z[5] $z[6] $z[11]
    if [[ $z[8] == rundgang && $z[9] == <1-> ]]; then
      # Rundgang: Ergebnis in neon-stand.md vermerken (Stand, Auftrag bleibt), neon meldet dem Designer; erledigt → nie wieder
      [[ $e == erledigt* ]] && print -r -- "$(date '+%F %H:%M') $e" > $ZUSTAND/rundgang-$z[9]-erledigt
      zsh $HIER/neon-stand.sh notiz $z[9] "Windows-Rundgang automatisch (Auslastungswächter, 5-Stunden-Fenster knapp) beendet: $e; Bericht ~/halo-berichte/$(date +%F)-rundgang-windows.md – Designer melden" >/dev/null 2>>$LOG \
        || log "Rundgang: Notiz in neon-stand.md gescheitert"
    fi
    rm -f $f
  done
}
starte_worker() {   # <Modell> <Grund> [rundgang] (Grund beginnt mit „tokenarm“: Klasse tokenarm)
  local m=$1 klasse=normal nr name wt zweig sid p1 p2 erg aus stamp=$(date +%Y%m%d-%H%M) auftrag max=$K[WORKER_MAX_MIN] rnr=
  [[ $2 == tokenarm* ]] && klasse=tokenarm
  if [[ $3 == rundgang ]]; then
    klasse=rundgang rnr=$K[RUNDGANG_NR] max=$K[RUNDGANG_MAX_MIN]
    auftrag="$(<$HIER/auslastung-rundgang.md)

Auftrag #$rnr (wörtlich aus ${HALO_AS_NEON_STAND:-~/halo-aufgaben/neon-stand.md}, unverändert):
$(rundgang_auftrag)" || { log "Rundgang: Auftrag #$rnr nicht lesbar – kein Start"; return 1 }
  else
    auftrag=$(<$HIER/auslastung-auftrag.md)
  fi
  nr=$(freie_nummer) || { log "keine freie Worker-Nummer (1–8)"; return 1 }
  name=worker-$stamp-$nr zweig=pruef/worker-$stamp-$nr wt=$WT_BASIS/worker-$stamp-$nr
  p1=$((2874 + 2 * (nr - 1))) p2=$((2875 + 2 * (nr - 1)))
  # Datum je Start (bis 19.11.2026 nur beim Start des Wächters gesetzt: Ergebnisse vom 19.11. hießen 2026-11-18-worker-*)
  local tag=$(date +%F) basis fp=-
  erg=$DIR/$tag-worker-$nr-${stamp#*-}.erg aus=$DIR/$tag-worker-$nr-${stamp#*-}.txt
  [[ $klasse != rundgang && -r $ZUSTAND/liste-fp ]] && fp=$(<$ZUSTAND/liste-fp)
  git -C $MAIN fetch -q origin main 2>>$LOG || { log "git fetch gescheitert – kein Worker"; return 1 }
  mkdir -p $WT_BASIS $ZUSTAND
  # Worktree ohne Zweig (Maintainer 19.11.2026): den Zweig legt der Worker erst vor dem ersten Commit an (git switch -c);
  # ohne Commit räumt kopie_nach_lauf den Worktree gleich nach dem Lauf weg
  git -C $MAIN worktree add -q --detach $wt origin/main 2>>$LOG || { log "Worktree $wt nicht angelegt – kein Worker"; return 1 }
  basis=$(git -C $wt rev-parse HEAD 2>/dev/null)
  cp -p $MAIN/repo.conf $wt/ 2>/dev/null
  sid=$(uuidgen | tr A-Z a-z)
  log "Worker $nr gestartet: $m, Klasse $klasse, Sitzung $sid, Zweig $zweig (erst beim ersten Commit), Worktree $wt, Ports $p1/$p2 ($2)"
  local kopf="JETZT: Worker $nr des Auslastungswächters, Modell $m, Klasse $klasse, $(date '+%F %H:%M'). Name $name, Zweig $zweig
(noch nicht angelegt: der Worktree steht ohne Zweig auf origin/main; vor dem ersten Commit git switch -c $zweig),
Worktree $wt (nur dort arbeiten), Ports $p1 und $p2, Ergebnisdatei $erg, Bericht ~/halo-berichte/$tag-worker-$nr.md (Abschnitt anhängen).
Lage (Skript): $2${rnr:+
Höchstens $max Minuten (danach beendet dich der Wächter).}
"
  # ohne HALO_LAUF: der Zeitfenster-Hook (Push-Sperre, Tests während der CI) gilt für den Worker
  ( cd $wt && env -u HALO_LAUF HALO_WORKER=$nr claude -p --model $m --session-id $sid --permission-mode auto \
      "$kopf
$auftrag" > $aus 2>&1 ) </dev/null &!
  local pid=$!
  ( sleep $(( max * 60 )); pkill -f -- "--session-id $sid" ) </dev/null >/dev/null 2>&1 &!
  # Felder: 1 PID, 2 Sitzung, 3 Modell, 4 Start, 5 Worktree, 6 Zweig, 7 Ergebnisdatei, 8 Klasse, 9 Rundgang-Nr. (sonst -),
  # 10 Fingerabdruck der Vorprüfung (sonst -), 11 Basis-Commit des Worktrees
  print -r -- "$pid $sid $m $(date +%s) $wt $zweig $erg $klasse ${rnr:--} $fp ${basis:--}" > $ZUSTAND/worker-$nr
  date +%s > $ZUSTAND/letzter-start
  # Marke „heute gestartet“ (nur einmal je Tag und Auftrag)
  [[ -n $rnr ]] && print -r -- "$(date '+%F %H:%M') $sid" > $ZUSTAND/rundgang-$rnr-$(date +%F)
}

if [[ $MODUS == trocken ]]; then
  konf_lesen
  z=$(pruefen)
  print -r -- "Auslastungswächter – Trockenlauf (kein Worker, kein Worktree, nichts geschrieben)"
  print -r -- "Prüfung:  $z"
  [[ $z == rundgang* ]] && print -r -- "Würde:    Windows-Rundgang mit ${${z#rundgang }%% *} starten (Auftrag #$K[RUNDGANG_NR] wörtlich, Rahmen tests/auslastung-rundgang.md, höchstens $K[RUNDGANG_MAX_MIN] Min.), Marke für heute"
  [[ $z == starten* ]] && print -r -- "Würde:    Worker mit ${${z#starten }%% *} starten, Klasse $( [[ ${z#starten * } == tokenarm* ]] && print tokenarm || print normal), Worktree $WT_BASIS/worker-<Zeit>-<Nr> ohne Zweig (pruef/worker-<Zeit>-<Nr> erst beim ersten Commit), Ports ab 2874"
  [[ $z == leer* ]] && print -r -- "Würde:    keinen Worker starten (kein passender Eintrag), nächste Prüfung in $K[LEER_WARTEN] Minuten"
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
  TAG=$(date +%F) LOG=$DIR/$(date +%F)-auslastung.log   # je Takt neu (Datum wechselt um Mitternacht)
  aufraeumen
  z=$(pruefen)
  warte=$K[TAKT]
  case $z in
    ende*)    log "Ende: ${z#ende }"; break ;;
    starten*) starte_worker ${${z#starten }%% *} "${z#starten * }"; ALT= ;;
    rundgang*) log "Windows-Rundgang fällig: ${z#rundgang * }"; starte_worker ${${z#rundgang }%% *} "${z#rundgang * }" rundgang; ALT= ;;
    # Vorprüfung ohne Treffer (Maintainer 19.11.2026): kein Worker, jedes Mal mit Zeit ins Protokoll, nächste Prüfung nach LEER_WARTEN
    leer*)    log "${z#leer }; nächste Prüfung in $K[LEER_WARTEN] Minuten"; warte=$K[LEER_WARTEN]; ALT= ;;
    *)        [[ $z != $ALT ]] && log "${z#warten }"; ALT=$z ;;
  esac
  [[ $MODUS == einmal ]] && break
  sleep $(( warte * 60 ))
done
exit 0
