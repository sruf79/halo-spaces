#!/bin/zsh
# Automatische Abnahme nach dem Release (Maintainer 20.11.2026, neon-Sitzung: „Nein wir brauchen hier eine automatische
# abnahme nach jedem release. Kümmer dich darum und beauftrage alle tasks auf der liste zu prüfen und abzunehmen was
# offen ist“). Bisher blieben Design-Einträge mit „zur Abnahme“ offen, bis der Designer oder der Maintainer von Hand
# „abgenommen“ schrieb (tests/board-nach-release.zsh: Zweifel, nach 7 Tagen „Abnahme überfällig“ im Morgenbrief).
# publish.sh startet dieses Skript nach board-nach-release.zsh im Hintergrund (--hintergrund, publish.sh wartet nicht);
# Fehler halten das Release nie auf. Läuft nur auf neon.
#
#   tests/abnahme-nach-release.zsh [--probe|--hintergrund] <version>
#     --probe        zeigt nur die Einträge, die abgenommen würden (liest das Board, kein Claude, schreibt nichts)
#     --hintergrund  startet sich selbst abgekoppelt (eigene Sitzung, Ausgabe ~/halo-nacht/abnahme-v<version>.out)
#
# Einträge (ohne Claude ausgewählt): nicht Done, nicht „Wartet auf OK“, mit „zur Abnahme“ in einer Notiz und danach
# weder „abgenommen“ noch „Abnahme: Mangel“; alle Commit-Hashes der „committet“-Absätze stecken in v<version> oder früher
# (Vorfahr des Tags oder derselbe Patch), mindestens einer. Schon an den Maintainer gegebene Fragen (gleiche Notiz)
# werden nicht nochmals gestellt (~/halo-nacht/abnahme-gefragt.txt).
# Ablauf: Pause „abnahme“ (pausen.txt) beachten; warten, bis 09:00–23:00 ist (der Nachtlauf hat Vorrang, um 01:30 läuft
# nichts mehr), neon frei ist (CI, Testlauf, Thunderbird mit Marionette, Release) und das Kontingent es erlaubt
# (tests/kontingent.sh höchstens einmal je Stunde: Woche ab VOLLDAMPF_WOCHE_ENDE → aufs nächste Release verschoben;
# 5-Stunden-Fenster ab FUENF_STUNDEN_MAX, im Volldampf Drosselstufe 3, sonst Woche mehr als SPAR_MAX über dem Soll →
# warten); höchstens ABN_WARTEN_MAX Stunden, ist dann nur neon belegt, urteilt Claude ohne eigene Testläufe.
# Dann Arbeitskopie (git worktree, Stand v<version>) und claude -p --model opus mit tests/abnahme-auftrag.md
# (Maßstab des Designers), höchstens ABN_DAUER Minuten. Claude schreibt nur die Ergebnisdatei und den Bericht; das
# Skript schreibt ins Board (Board vorher neu gelesen, nur Einträge, die noch offen sind):
#   abgenommen  → Notiz „abgenommen <Datum> (automatische Abnahme v<version>): <Begründung>“
#   mangel      → Notiz „Abnahme: Mangel – <…> (automatische Abnahme v<version>, <Datum>)“ und Status todo
#   maintainer  → kein Board, Zeile in ~/halo-aufgaben/abnahme-maintainer.md (Morgenbrief, [handeln])
#   ausgelassen → nichts (nächstes Release versucht es erneut)
# Nie Done (das macht board-nach-release.zsh --nur-abgenommen gleich danach), nie Code, nie Push.
# Board nicht lesbar: nichts tun, Meldung an neon. Idempotent: abgenommene und bemängelte Einträge sind keine Kandidaten
# mehr; ein Lauf je Zeit (Sperre ~/halo-nacht/abnahme.lock.d). Protokoll ~/halo-nacht/abnahme-nach-release.log, Bericht
# ~/halo-berichte/<datum>-abnahme-v<version>.md.
# Zum Proben: HALO_REPO, HALO_ABN_BOARD (statt „zsh tests/board.sh“), HALO_ABN_CLAUDE (statt „claude“), HALO_ABN_NACHT,
# HALO_ABN_BERICHTE, HALO_ABN_FRAGEN, HALO_ABN_WT (Ordner der Arbeitskopien), HALO_ABN_KONTINGENT (Zeile wie
# kontingent.sh), HALO_ABN_SOLL (Soll %), HALO_ABN_FREI (1 frei, sonst Grund), HALO_ABN_UHR (HHMM), HALO_ABN_TAKT
# (Sekunden je Warterunde), ABN_WARTEN_MAX (Stunden), HALO_ABN_HEUTE, HALO_PUSH_TROCKEN=1.
# Test: zsh tests/abnahme_nach_release_test.zsh.
emulate -L zsh
setopt pipe_fail extendedglob
HIER=${0:A:h}
REPO=${HALO_REPO:-${HIER:h}}
BOARD_CMD=(${=${HALO_ABN_BOARD:-zsh $HIER/board.sh}})
CLAUDE_CMD=(${=${HALO_ABN_CLAUDE:-claude}})
NACHT=${HALO_ABN_NACHT:-$HOME/halo-nacht}
BERICHTE=${HALO_ABN_BERICHTE:-$HOME/halo-berichte}
FRAGEN=${HALO_ABN_FRAGEN:-$HOME/halo-aufgaben/abnahme-maintainer.md}
GEFRAGT=$NACHT/abnahme-gefragt.txt
GEDAECHTNIS=$NACHT/abnahme-gedaechtnis.md
WT_BASIS=${HALO_ABN_WT:-$HOME/halo-abnahme}
LOG=$NACHT/abnahme-nach-release.log
mkdir -p $NACHT 2>/dev/null || LOG=/dev/null
source $HIER/lauf-hilfen.zsh   # log, an_neon, pause_aktiv, drossel_stufe, volldampf_aktiv, wochen_soll
export HALO_LAUF=abnahme
KONF=${HALO_TAGESROUTINE_CONF:-$HOME/.config/halo-spaces/tagesroutine.conf}
konf() { local v=$(sed -n "s/^$1=\([0-9]*\).*/\1/p" $KONF 2>/dev/null | head -1); print -r -- ${v:-$2} }
FUENF_MAX=$(konf FUENF_STUNDEN_MAX 80) SPAR_MAX=$(konf SPAR_MAX 10)
ABN_WARTEN_MAX=${ABN_WARTEN_MAX:-18}   # Stunden
ABN_DAUER=${ABN_DAUER:-120}            # Minuten für die Claude-Runde
MODELL=${HALO_ABN_MODELL:-opus}
[[ $MODELL == *(haiku|sonnet)* ]] && MODELL=opus   # mindestens Opus

MODUS=
[[ $1 == --(probe|hintergrund) ]] && { MODUS=${1#--}; shift }
VERSION=$1
[[ $VERSION == <->.<->.<-> ]] || { print -u2 "Aufruf: ${0:t} [--probe|--hintergrund] <version>"; exit 2 }

if [[ $MODUS == hintergrund ]]; then
  # abgekoppelt (fork, setsid): überlebt das Ende von publish.sh und der aufrufenden Sitzung
  AUS=$NACHT/abnahme-v$VERSION.out
  python3 -I -c '
import os, sys
if os.fork(): sys.exit(0)
os.setsid()
fd = os.open(sys.argv[1], os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
os.dup2(fd, 1); os.dup2(fd, 2); os.dup2(os.open(os.devnull, os.O_RDONLY), 0)
os.execvp("zsh", ["zsh"] + sys.argv[2:])' $AUS ${0:A} $VERSION \
    && print -r -- "Abnahme nach Release v$VERSION: im Hintergrund gestartet (Protokoll ~/halo-nacht/${LOG:t})" \
    || print -r -- "Abnahme nach Release v$VERSION: nicht gestartet (Hintergrundstart gescheitert), von Hand: zsh tests/abnahme-nach-release.zsh $VERSION"
  exit 0
fi

ende() {   # <Text> [<Exitcode>]
  print -r -- "Abnahme nach Release v$VERSION: $1"
  log "v$VERSION $1"
  exit ${2:-0}
}
cd $REPO || ende "kein Checkout unter $REPO, nichts getan" 1
if [[ -z $MODUS ]] && g=$(pause_aktiv abnahme); then ende "pausiert $g, nichts getan"; fi

# --- Sperre: ein Lauf zur Zeit (nicht beim Proben) ---
SPERRE=$NACHT/abnahme.lock.d
if [[ -z $MODUS ]]; then
  if ! mkdir $SPERRE 2>/dev/null; then
    p=$(<$SPERRE/pid 2>/dev/null)
    if [[ -n $p ]] && kill -0 $p 2>/dev/null; then ende "läuft schon (PID $p), dieser Lauf entfällt; das nächste Release nimmt Übriges mit"; fi
    rm -rf $SPERRE; mkdir $SPERRE 2>/dev/null || ende "Sperre $SPERRE nicht anlegbar, nichts getan" 1
  fi
  print $$ > $SPERRE/pid
fi
T=$(mktemp -d) || ende "kein Zwischenordner, nichts getan" 1
WT= WACHE=
aufraeumen() {
  [[ -n $WACHE ]] && { pkill -P $WACHE sleep 2>/dev/null; kill $WACHE 2>/dev/null }
  [[ -n $WT && -d $WT ]] && { git -C $REPO worktree remove --force $WT 2>/dev/null; git -C $REPO worktree prune 2>/dev/null }
  rm -rf $T
  [[ -z $MODUS ]] && rm -rf $SPERRE
}
trap aufraeumen EXIT
trap 'exit 1' INT TERM

git fetch -q --tags origin 2>/dev/null || true
BIS=v$VERSION
git rev-parse -q --verify "$BIS^{commit}" >/dev/null || BIS=HEAD
BIS_SHA=$(git rev-parse "$BIS^{commit}") || ende "Stand $BIS nicht lesbar, nichts getan" 1

melde_board() {   # Board nicht lesbar: nichts tun, an neon
  [[ -z $MODUS ]] && { an_neon "[abnahme-nach-release] v$VERSION: Board nicht lesbar ($1). Nichts abgenommen; bitte nachholen mit: zsh tests/abnahme-nach-release.zsh $VERSION (erst --probe)." abnahme \
    || log "an neon nicht zugestellt" }
  ende "Board nicht lesbar ($1), nichts getan" 1
}
# Kandidaten: <id> \t <Titel> \t <Hashes> \t <Schlüssel der Notiz>
kandidaten() {   # <Ausgabe>
  "${BOARD_CMD[@]}" export > $T/board.json 2>$T/board.err || melde_board "$(head -c 200 $T/board.err | tr '\n' ' ' | sed 's/FEHLER: *//g')"
  jq -e '.items | type == "array"' $T/board.json >/dev/null 2>&1 || melde_board "Export ohne items"
  python3 -I - $T/board.json $BIS_SHA $GEFRAGT > $1 <<'PY' || ende "Auswertung gescheitert, nichts getan" 1
import hashlib, json, re, subprocess, sys
board, bis, gefragt_f = sys.argv[1:4]
items = json.load(open(board, encoding="utf-8"))["items"]
try: gefragt = set(open(gefragt_f, encoding="utf-8").read().split("\n"))
except OSError: gefragt = set()
def git(*a, eingabe=None):
    r = subprocess.run(["git", *a], capture_output=True, text=True, input=eingabe)
    return r.returncode, r.stdout.strip()
patch = None
def patch_ids():   # Patches der letzten 500 Commits bis zum Release (gleicher Patch nach Rebase oder Cherry-Pick)
    global patch
    if patch is None:
        out = git("log", "-p", "--no-merges", "-500", bis)[1]
        patch = {z.split()[0] for z in git("patch-id", "--stable", eingabe=out + "\n")[1].splitlines() if z.strip()}
    return patch
cache = {}
def im_release(tok):   # True | False (Commit, aber nicht im Release) | None (kein Commit)
    if tok in cache: return cache[tok]
    rc, sha = git("rev-parse", "-q", "--verify", tok + "^{commit}")
    erg = None
    if rc == 0 and sha:
        erg = git("merge-base", "--is-ancestor", sha, bis)[0] == 0
        if not erg:
            p = git("patch-id", "--stable", eingabe=git("show", sha)[1] + "\n")[1].split()
            erg = bool(p) and p[0] in patch_ids()
    cache[tok] = erg
    return erg
ABN = re.compile(r"zur\s+Abnahme", re.I)
ZU = re.compile(r"abgenommen|Abnahme:\s*Mangel", re.I)
HEX = re.compile(r"(?<![0-9A-Za-z#])[0-9a-f]{7,40}(?![0-9A-Za-z])")
PUSH = re.compile(r"\bgepusht(?:\s+(?:bis|als|mit|auf))?\s*\(?\s*([0-9a-f]{7,40})(?![0-9A-Za-z])", re.I)
PICK = re.compile(r"\bcherry[- ]pick(?:ed)?(?:\s+(?:von|from|aus))?\s*\(?\s*([0-9a-f]{7,40})(?![0-9A-Za-z])", re.I)
for it in items:
    st = it.get("status") or ""
    if st in ("Done", "Wartet auf OK", "Pausiert"): continue   # (Pausiert, 22.11.2026: nicht vorlegen)
    iid, titel, body = it.get("id", ""), it.get("title") or "", it.get("body") or ""
    abs_ = re.split(r"\n\s*\n", body)
    za = [i for i, a in enumerate(abs_) if ABN.search(a)]
    if not za or any(ZU.search(a) for a in abs_[za[-1] + 1:]): continue
    hashes, fremd = [], False
    for a in abs_:
        if not re.search(r"committet", a, re.I): continue
        weg = {m.start(1) for m in PUSH.finditer(a)} | {m.start(1) for m in PICK.finditer(a)}
        for m in HEX.finditer(a):
            if m.start() in weg or m.group(0).isdigit(): continue
            r = im_release(m.group(0))
            if r is None: continue
            if r: hashes.append(m.group(0))
            else: fremd = True
    if fremd or not hashes: continue
    schl = hashlib.sha1(abs_[za[-1]].encode("utf-8")).hexdigest()[:12]
    if "%s %s" % (iid, schl) in gefragt: continue
    print("\t".join(x.replace("\t", " ").replace("\n", " ") for x in (iid, titel, ",".join(dict.fromkeys(hashes)), schl)))
PY
}
kandidaten $T/kand
typeset -i N=$(grep -c . $T/kand)
(( N )) || ende "keine offenen Einträge zur Abnahme (Commit bis v$VERSION)"
if [[ $MODUS == probe ]]; then
  while IFS=$'\t' read -r id titel hashes schl; do print -r -- "würde prüfen: $id $titel ($hashes)"; done < $T/kand
  ende "Probe, $N Einträge würden geprüft"
fi
log "v$VERSION $N Einträge zur Abnahme: $(cut -f1 $T/kand | tr '\n' ' ')"

# --- Warten: Uhrzeit, neon frei, Kontingent ---
neon_belegt() {   # gibt den Grund aus (Rückgabe 0 = belegt); ohne aktive_sitzung (Gesprächssitzungen laufen oft stundenlang)
  if [[ -n ${HALO_ABN_FREI+x} ]]; then [[ $HALO_ABN_FREI == 1 ]] && return 1; print -r -- $HALO_ABN_FREI; return 0; fi
  pgrep -f 'actions-runner/bin[^/ ]*/Runner\.Worker' >/dev/null && { print "CI-Lauf auf dem GitHub-Runner"; return 0 }
  pgrep -f "$BELEGT_TEST_MUSTER" >/dev/null && { print "Testlauf (halo_test.py o. ä.)"; return 0 }
  pgrep -f -- "$BELEGT_TB_MUSTER" >/dev/null && { print "Thunderbird mit Marionette"; return 0 }
  pgrep -f "$BELEGT_RELEASE_MUSTER" >/dev/null && { print "release.sh/publish.sh läuft"; return 0 }
  return 1
}
kontingent_pruefen() {   # Rückgabe 0 = los, 1 = warten (KGRUND), 2 = aufs nächste Release verschieben
  local z w h soll st
  z=${HALO_ABN_KONTINGENT:-$(zsh $HIER/kontingent.sh 2>/dev/null)}
  [[ $z == Woche* ]] || { log "Kontingent nicht lesbar, Abnahme läuft trotzdem (wie die Drossel: fail-open)"; return 0 }
  w=${${z#Woche }%% *} h=${${z#*5 Stunden }%% *}
  [[ $w == <-> ]] || return 0
  (( w >= ${VOLLDAMPF_WOCHE_ENDE:-98} )) && { KGRUND="Woche $w % (Wochenlimit)"; return 2 }
  [[ $h == <-> ]] && (( h >= FUENF_MAX )) && { KGRUND="5-Stunden-Fenster $h % (ab $FUENF_MAX % nichts Neues)"; return 1 }
  if volldampf_aktiv >/dev/null 2>&1; then
    st=$(drossel_stufe $w); [[ ${st%% *} == 3 ]] && { KGRUND="Drosselstufe 3 (${st#* })"; return 1 }
  else
    soll=${HALO_ABN_SOLL:-$(wochen_soll 168 | awk '{print $2}')}; soll=${soll%%.*}
    [[ $soll == <-> ]] && (( w - soll > SPAR_MAX )) && { KGRUND="Woche $w %, Soll $soll % (mehr als $SPAR_MAX Punkte darüber)"; return 1 }
  fi
  return 0
}
TAKT=${HALO_ABN_TAKT:-300}
BIS_WARTEN=$(( $(date +%s) + ABN_WARTEN_MAX * 3600 ))
K_NEU=0 KFREI= KGRUND= OHNE_TEST= GRUND= letzter=
kontingent_runde() {   # liest das Kontingent höchstens einmal je Stunde; setzt KFREI; verschiebt bei Rückgabe 2
  (( $(date +%s) < K_NEU )) && return
  K_NEU=$(( $(date +%s) + 3600 ))
  kontingent_pruefen
  case $? in
    0) KFREI=1 ;;
    2) ende "Kontingent: $KGRUND – aufs nächste Release verschoben ($N Einträge offen)" ;;
    *) KFREI= ;;
  esac
}
while true; do
  GRUND= uhr=${HALO_ABN_UHR:-$(date +%H%M)}
  if (( 10#$uhr < 900 || 10#$uhr >= 2300 )); then GRUND="außerhalb 09:00–23:00 (Nachtlauf hat Vorrang)"
  elif g=$(pause_aktiv abnahme); then ende "pausiert $g, nichts getan"
  elif b=$(neon_belegt); then GRUND="neon belegt: $b"
  else kontingent_runde; [[ -n $KFREI ]] || GRUND="Kontingent: $KGRUND"
  fi
  [[ -z $GRUND ]] && break
  [[ $GRUND != $letzter ]] && log "v$VERSION wartet: $GRUND"; letzter=$GRUND
  if (( $(date +%s) >= BIS_WARTEN )); then
    # nur neon belegt (Uhrzeit und Kontingent frei): ohne eigene Testläufe urteilen
    if [[ $GRUND == neon\ belegt* ]]; then
      K_NEU=0; kontingent_runde
      [[ -n $KFREI ]] && { OHNE_TEST=1; log "v$VERSION neon nach $ABN_WARTEN_MAX h noch belegt – Abnahme ohne eigene Testläufe"; break }
      GRUND="Kontingent: $KGRUND"
    fi
    ende "nach $ABN_WARTEN_MAX h Warten nicht begonnen ($GRUND), $N Einträge bleiben offen fürs nächste Release"
  fi
  sleep $TAKT
done

# --- Arbeitskopie am Release-Stand ---
mkdir -p $WT_BASIS
WT=$WT_BASIS/v$VERSION-$$
git -C $REPO worktree add -q --detach $WT $BIS_SHA 2>$T/wt.err || { WT=; ende "Arbeitskopie nicht anlegbar ($(head -c 150 $T/wt.err | tr '\n' ' ')), nichts getan" 1 }

# --- Claude ---
TAG=${HALO_ABN_HEUTE:-$(TZ=Europe/Vienna date +%F)}
BERICHT=$BERICHTE/$TAG-abnahme-v$VERSION.md
ERGEBNIS=$NACHT/abnahme-v$VERSION.ergebnis
BILDER=$HOME/halo-aufgaben/abnahme/$TAG-v$VERSION
mkdir -p $BERICHTE ${FRAGEN:h}
rm -f $ERGEBNIS
MARKE=$REPO/dist/release-$VERSION.ok
CI_ZEILE=$(sed -n 's/^test=//p' $MARKE 2>/dev/null | grep -m1 '^CI-Lauf .* grün')
if [[ -n $CI_ZEILE ]]; then CI_TEXT="grün ($CI_ZEILE)"; else CI_TEXT="nicht belegt (keine grüne CI in $MARKE) – betroffene Prüfungen mit --only selbst laufen lassen, falls Testläufe erlaubt"; fi
{
  print -r -- "# Automatische Abnahme v$VERSION ($TAG)"
  print
  print -r -- "Gestartet $(TZ=Europe/Vienna date '+%d.%m.%Y %H:%M') von tests/abnahme-nach-release.zsh, Modell $MODELL, $N Einträge, Release-CI: ${CI_ZEILE:+grün}${CI_ZEILE:-nicht belegt}${OHNE_TEST:+, ohne eigene Testläufe (neon belegt)}."
  print
} >> $BERICHT
PROMPT="JETZT: automatische Abnahme nach Release v$VERSION, $(TZ=Europe/Vienna date '+%F %H:%M').
Repo: $REPO. Arbeitskopie (Stand v$VERSION, ${BIS_SHA[1,9]}, nur lesen und testen): $WT
Release-CI: $CI_TEXT
Testläufe: ${OHNE_TEST:+nicht erlaubt (neon seit $ABN_WARTEN_MAX h belegt) – ohne eigene Bilder urteilen, nur aus Code, CI-Prüfungen und vorhandenen Bildern}${OHNE_TEST:-erlaubt, Port 2860 (bei Belegung 2861–2864)}
Bilderordner: $BILDER
Ergebnisdatei: $ERGEBNIS
Bericht (anhängen): $BERICHT
Gedächtnis: $GEDAECHTNIS
Einträge (id, Titel, Commits):
$(while IFS=$'\t' read -r id titel hashes schl; do print -r -- "- $id | $titel | $hashes"; done < $T/kand)

$(<$HIER/abnahme-auftrag.md)"
SID=$(uuidgen | tr A-Z a-z)
log "v$VERSION Start Claude ($MODELL), Sitzung $SID, Arbeitskopie $WT${OHNE_TEST:+, ohne Testläufe}"
( typeset -i t=0; while (( t < ABN_DAUER * 60 )); do sleep 30; t+=30; done; pkill -f -- "--session-id $SID" ) </dev/null >/dev/null 2>&1 &
WACHE=$!
( cd $WT && "${CLAUDE_CMD[@]}" -p --model $MODELL --session-id $SID --permission-mode auto "$PROMPT" ) > $T/claude.out 2>&1
RC=$?
pkill -P $WACHE sleep 2>/dev/null; kill $WACHE 2>/dev/null; WACHE=
log "v$VERSION Claude beendet (Exitcode $RC): $(tail -c 300 $T/claude.out | tr '\n' ' ')"
if [[ ! -s $ERGEBNIS ]]; then
  an_neon "[abnahme-nach-release] v$VERSION: Claude ohne Ergebnis (Exitcode $RC). Nichts abgenommen; die Einträge bleiben offen, nächstes Release versucht es erneut. Protokoll: ~/halo-nacht/${LOG:t}" abnahme || log "an neon nicht zugestellt"
  print -l -- "## Ergebnis (Skript)" "" "Claude ohne Ergebnis (Exitcode $RC), nichts geschrieben." >> $BERICHT
  ende "Claude ohne Ergebnis (Exitcode $RC), nichts geschrieben" 1
fi

# --- Ergebnis ins Board (Board neu lesen: nur Einträge, die noch offen sind) ---
kandidaten $T/kand2
typeset -A OFFEN TITEL SCHL
while IFS=$'\t' read -r id titel hashes schl; do OFFEN[$id]=1 TITEL[$id]=$titel SCHL[$id]=$schl; done < $T/kand2
typeset -i ABG=0 MAN=0 FRA=0 AUSG=0 FEHL=0 BEANTWORTET=0
typeset -a FEHLTEXT ZEILEN
typeset -A ERLEDIGT
schreibe() {
  local err
  err=$("${BOARD_CMD[@]}" "$@" 2>&1 >/dev/null) || { FEHL+=1; FEHLTEXT+=("$1 $2: ${${err//$'\n'/ }[1,120]}"); return 1 }
  return 0
}
saeubern() {   # <Text> <Höchstlänge>: einzeilig, ohne Markierungswörter
  local s=${1//[$'\t\n\r']/ }
  s=${s//(#i)zur Abnahme/zur Ab-nahme}
  print -r -- ${s[1,$2]}
}
DATUM=$(TZ=Europe/Vienna date +%F) JETZT=$(TZ=Europe/Vienna date '+%F %H:%M')
while IFS=$'\t' read -r art id text; do
  [[ -n $art ]] || continue
  if [[ -z $OFFEN[$id] ]]; then log "v$VERSION übergangen (nicht mehr offen oder nicht verlangt): $art $id"; continue; fi
  [[ -n $ERLEDIGT[$id] ]] && continue
  ERLEDIGT[$id]=1 BEANTWORTET+=1
  case $art in
    abgenommen)
      text=$(saeubern "$text" 400)
      schreibe notiz $id "abgenommen $DATUM (automatische Abnahme v$VERSION): $text" && { ABG+=1; ZEILEN+=("abgenommen: $TITEL[$id]") } ;;
    mangel)
      text=$(saeubern "${text//(#i)abgenommen/ab-genommen}" 400)
      schreibe notiz $id "Abnahme: Mangel – $text (automatische Abnahme v$VERSION, $DATUM)" && schreibe status $id todo \
        && { MAN+=1; ZEILEN+=("Mangel: $TITEL[$id] – $text") } ;;
    maintainer)
      text=$(saeubern "$text" 300)
      print -r -- "- $JETZT | v$VERSION | $id | $TITEL[$id] | $text" >> $FRAGEN
      print -r -- "$id $SCHL[$id]" >> $GEFRAGT
      FRA+=1; ZEILEN+=("an den Maintainer: $TITEL[$id] – $text") ;;
    ausgelassen) AUSG+=1; ZEILEN+=("ausgelassen: $TITEL[$id] – $(saeubern "$text" 200)") ;;
    *) ERLEDIGT[$id]= BEANTWORTET+=-1; log "v$VERSION unbekannte Ergebniszeile: $art $id" ;;
  esac
done < $ERGEBNIS
typeset -i OHNE=$(( ${#OFFEN} - BEANTWORTET ))

# abgenommene gleich schließen statt erst beim nächsten Release
BNR=
if (( ABG )); then
  [[ -n $HALO_ABN_BOARD ]] && export HALO_BNR_BOARD=$HALO_ABN_BOARD   # Proben: dieselbe Attrappe
  BNR=$(HALO_REPO=$REPO zsh $HIER/board-nach-release.zsh --nur-abgenommen $VERSION 2>&1 | tail -1)
  log "v$VERSION $BNR"
fi
SUMME="abgenommen $ABG, Mangel $MAN, an den Maintainer $FRA, ausgelassen $AUSG, ohne Ergebnis $OHNE"
(( FEHL )) && SUMME+=", nicht geschrieben $FEHL"
{
  print -r -- "## Ergebnis (Skript)"
  print
  for z in "${ZEILEN[@]}"; do print -r -- "- $z"; done
  print -r -- "- $SUMME"
  [[ -n $BNR ]] && print -r -- "- ${BNR//FEHLER/Fehler}"
} >> $BERICHT
if (( FEHL )); then
  an_neon "[abnahme-nach-release] v$VERSION: $FEHL Schreibvorgänge im Board gescheitert: ${(j:; :)FEHLTEXT}. Ergebnisdatei: $ERGEBNIS (bitte von Hand nachtragen)." abnahme \
    || log "an neon nicht zugestellt"
  ende "$SUMME" 1
fi
ende "$SUMME${BNR:+; $BNR}"
