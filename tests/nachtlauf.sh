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
#   nachtlauf.sh --trocken [<Repo>]     nur Zweig-Aufräumen und CI-Abschluss proben (tests/ci-runde.zsh): zeigt, was er
#                                       löschen, eintragen bzw. starten würde – kein Push, kein workflow run, kein Board
# Nach Claudes Arbeit (auch wenn die Vorprüfung nichts fand) der CI-Abschluss aus tests/ci-runde.zsh
# (Entscheidung des Maintainers vom 7.11.2026): rote Prüfungen der CI-Läufe dieser Nacht ins Board,
# Vollrunde (ziel=alle), wenn seit 24 Stunden keine lief und der Lauf nichts CI-Auslösendes gepusht hat,
# Zeile „Letzte vollständig grüne Runde“ im Bericht. Fehler dort brechen nichts ab (VOLLRUNDE-FEHLER,
# EINTRAG-FEHLER in Protokoll und uebersprungen.log).
# Schreibt immer einen Bericht nach ~/halo-berichte/<datum>-nachtlauf.md – auch
# wenn ausgelassen, pausiert, nichts zu tun oder die Tests rot – und schickt
# eine Zeile davon aufs iPhone (Push der Claude-App über die Sitzung
# „github.comm.routine“, die Remote Control hat).
# Pausieren: nur über ~/halo-nacht/pausen.txt (pause_setzen in tests/lauf-hilfen.zsh, mit Ablaufzeit).
# HALO_NACHT_AB=JJJJ-MM-TT: vorher kein Lauf (Standard 2026-11-04).
emulate -L zsh
setopt extendedglob

PUSH_TEST= TROCKEN=
[[ $1 == --push-test ]] && { PUSH_TEST=$2; set -- }
[[ $1 == --trocken ]] && { TROCKEN=1; shift }
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
# CI-Abschluss: ci_nacht_abschluss, ci_laeufe_holen, ci_vollrunde_24h
source ${0:A:h}/ci-runde.zsh
# ungespeicherte Reste im Checkout sind kein Grund auszulassen: der Auftrag nimmt sie mit
REST_MITNEHMEN=1

bericht_kurz() {
  # erste Zeile „Kurz: …“ des Berichts, sonst seine Überschrift
  local z=$(grep -m1 '^Kurz:' $BERICHT 2>/dev/null | sed 's/^Kurz: *//')
  [[ -z $z ]] && z=$(grep -m1 '^# ' $BERICHT 2>/dev/null | sed 's/^# *//')
  print -r -- $z
}

# CI-Abschluss nach der lokalen Arbeit; hängt seine Zeilen an den Bericht. Nie ein Abbruch.
ci_abschluss() {
  local zeilen
  log "Start CI-Abschluss"
  zeilen=$(ci_nacht_abschluss $START $HART 2>/dev/null)
  log "CI-Abschluss: ${zeilen//$'\n'/ | }"
  { print; print "## CI-Runde der Nacht (nachtlauf.sh)"; print; print -r -- $zeilen } >> $BERICHT
}

# Verwaiste Zweige claude/… auf GitHub löschen (Entscheidung des Maintainers vom 7.11.2026, Board
# „Ablauf: Nachtlauf räumt verwaiste claude/-Zweige auf GitHub auf“): Cloud-Sitzungen lassen ihren
# Zweig nach dem Push nach main stehen (die Cloud-Prüfung verlangt ihn, Löschen aus der Cloud scheitert
# teils mit 403). Gelöscht wird nur, wenn 1. der Name mit claude/ beginnt (nie rest/… o. a.), 2. der Zweig
# keine Commits über origin/main hinaus hat (umgeschriebene Commits nach einem Rebase zählen als eigene:
# im Zweifel bleibt er) und 3. kein offener Pull Request ihn nutzt. Je Zweig eine Zeile; nie ein Abbruch.
#   zweige_aufraeumen <Repo> [trocken]
zweige_aufraeumen() {
  local repo=$1 trocken=$2 b offen n=0
  if ! git -C $repo fetch -q --prune origin 2>/dev/null; then
    print "- git fetch fehlgeschlagen, nichts gelöscht"
    return 0
  fi
  if ! offen=$(gh pr list -R sruf79/halo-spaces --state open -L 200 --json headRefName --jq '.[].headRefName' 2>/dev/null); then
    print "- offene Pull Requests nicht lesbar, nichts gelöscht"
    return 0
  fi
  for b in $(git -C $repo for-each-ref --format='%(refname:strip=3)' 'refs/remotes/origin/claude/'); do
    n=$((n + 1))
    if [[ -n $(git -C $repo rev-list -n 1 origin/main..origin/$b 2>/dev/null) ]]; then
      print -r -- "- bleibt: $b (eigene Commits über main hinaus)"
    elif print -r -- $offen | grep -qxF -- $b; then
      print -r -- "- bleibt: $b (offener Pull Request)"
    elif [[ -n $trocken ]]; then
      print -r -- "- würde löschen: $b"
    elif git -C $repo push -q origin --delete $b 2>/dev/null; then
      print -r -- "- gelöscht: $b"
    else
      print -r -- "- Löschen fehlgeschlagen: $b"
    fi
  done
  (( n )) || print "- keine Zweige claude/… auf GitHub"
}

# hängt die Zeilen an den Bericht. Nie ein Abbruch.
zweige_abschluss() {
  local zeilen
  zeilen=$(zweige_aufraeumen $REPO)
  log "Zweige: ${zeilen//$'\n'/ | }"
  { print; print "## Verwaiste Zweige claude/… (nachtlauf.sh)"; print; print -r -- $zeilen } >> $BERICHT
}

if [[ -n $TROCKEN ]]; then
  # Probelauf: Protokoll in eine Wegwerf-Datei (die echte würde der CI-Wächter als Nachtfenster lesen),
  # Beginn der Nacht = heute 01:30
  LOG=$(mktemp) CI_TROCKEN=1
  print "Zweige (Probelauf, nichts gelöscht):"
  zweige_aufraeumen $REPO trocken
  print "CI-Abschluss (Probelauf, $(zeit)):"
  ci_nacht_abschluss $(date -j -v1H -v30M -v0S +%s) $HART
  print "Protokoll: $(<$LOG)"
  rm -f $LOG
  exit 0
fi

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

# --- Pause (eine Datei: ~/halo-nacht/pausen.txt, tests/lauf-hilfen.zsh); abgelaufene Zeilen
# räumt der Nachtlauf an seinem Ende auf, auch hier bei einer Pause ---
if pause_start nachtlauf; then
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
  zweige_abschluss
  ci_abschluss
  log "Ende"
  exit 0
fi

# --- Arbeit: claude -p, bei Limit nach 30 Minuten fortsetzen ---
cd $REPO || exit 2
SID=$(uuidgen | tr A-Z a-z)
log "Start, Sitzung $SID"
# Vollrunde fällig? Dann soll ein CI-auslösender Push dunkel testen ([dunkel]) – seine Runde ist dann die Vollrunde
CI_HINWEIS="CI-Vollrunde: unbekannt (gh nicht lesbar) – wie fällig behandeln"
CI_D=$(mktemp)
if ci_laeufe_holen $CI_D; then
  if V=$(ci_vollrunde_24h $CI_D); then
    CI_HINWEIS="CI-Vollrunde: in den letzten 24 Stunden gelaufen (Lauf $V) – nichts zu tun"
  else
    CI_HINWEIS="CI-Vollrunde: fällig (seit 24 Stunden keine vollständige Runde auf main)"
  fi
fi
rm -f $CI_D*
AUFTRAG="Heute: $TAG. Bericht: $BERICHT. Fertig-Datei: $FERTIG. Protokoll: $LOG.
Thunderbird auf neon vor dem Lauf: $TB_INFO
$CI_HINWEIS

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

# --- Bericht sicherstellen, CI-Abschluss anhängen und aufs iPhone ---
if [[ ! -s $BERICHT ]] || (( $(stat -f %m $BERICHT) < START )); then
  notbericht "ohne Abschluss" "Claude hat keinen Bericht geschrieben (Runden: $RUNDE, letzter Exitcode $RC)" mit-details
fi
kill $WACHE 2>/dev/null                   # Claude ist fertig; der CI-Abschluss hält selbst die 09:00 ein
zweige_abschluss
ci_abschluss
log "Ende"
push "Nachtlauf $TAG: $(bericht_kurz) – Bericht ~/halo-berichte/$TAG-nachtlauf.md"
exit 0
