#!/bin/zsh
# Wöchentliche Prüfung der Läufe auf neon (tests/MAC-MINI.md, Abschnitt 15):
# Claude Code wertet sonntags die letzten 7 Tage aus (CI-Läufe, Nachtläufe,
# Berichte, Board), schreibt Kennzahlen und einen Bericht, korrigiert kleine
# Dinge an Prüfungen und gibt für Abläufe höchstens drei Empfehlungen ab (Empfehlungsmodus:
# keine Selbständerung von Abläufen und Regeln; was Entscheidungen des Maintainers berührt, legt
# er als „Wartet auf OK“ ins Board). Auftrag: tests/wochenpruefung-auftrag.md. Gestartet vom LaunchAgent
# at.halo-spaces.wochenpruefung sonntags um 08:00; die Datei wird wie
# nachtlauf.sh nach ~/.config/halo-spaces/ kopiert.
# Mit --doku dieselbe Prüfung für alle .md-Dateien (Doku-Prüfung, samstags
# 08:00, LaunchAgent at.halo-spaces.dokupruefung, Auftrag
# tests/dokupruefung-auftrag.md, tests/MAC-MINI.md Abschnitt 16).
#   wochenpruefung.sh [--doku] [--trocken] <Repo-Ordner>
#   --trocken    nur auswerten und Bericht schreiben: nichts committen, kein
#                Board, keine Kennzahlen-Datei
# Schreibt immer einen Bericht nach ~/halo-berichte/<datum>-wochenpruefung.md
# (bzw. -dokupruefung.md) und schickt dessen Zeile „Kurz: …“ aufs iPhone.
# Pausieren: pause_setzen (~/halo-nacht/pausen.txt, Routine wochenpruefung bzw. dokupruefung).
emulate -L zsh
setopt extendedglob

TROCKEN= DOKU=
while [[ $1 == --* ]]; do
  case $1 in
    --trocken) TROCKEN=1 ;;
    --doku) DOKU=1 ;;
    *) print -u2 "unbekannte Option: $1"; exit 2 ;;
  esac
  shift
done
# Namen je Art: Wochenprüfung (Läufe) oder Doku-Prüfung (.md-Dateien)
if [[ -n $DOKU ]]; then
  ART=doku NAME=Doku-Prüfung BERICHT_NAME=dokupruefung PAUSE_ROUTINE=dokupruefung AUFTRAG_DATEI=dokupruefung-auftrag.md
else
  ART=woche NAME=Wochenprüfung BERICHT_NAME=wochenpruefung PAUSE_ROUTINE=wochenpruefung AUFTRAG_DATEI=wochenpruefung-auftrag.md
fi
REPO=${1:-$HOME/halo-spaces}
# Falscher oder fehlender Repo-Ordner (z. B. eine Option, die diese Version
# nicht kennt): sofort abbrechen statt ohne Auftrag weiterzulaufen
if [[ ! -d $REPO/.git || ! -f $REPO/tests/$AUFTRAG_DATEI ]]; then
  print -u2 "FEHLER: kein halo.spaces-Checkout unter „$REPO“ (Aufruf: ${0:t} [--doku] [--trocken] [<Repo-Ordner>]) – abgebrochen"
  exit 2
fi
# LaunchAgents lesen ~/.zprofile nicht: claude, gh und python3 ergänzen
path=(~/.local/bin /opt/homebrew/bin /usr/local/bin /Library/Frameworks/Python.framework/Versions/Current/bin $path)
DIR=$HOME/halo-nacht
BERICHTE=$HOME/halo-berichte
TAG=$(date +%F)
mkdir -p $DIR $BERICHTE
LOG=$DIR/$TAG-$ART.log
BERICHT=$BERICHTE/$TAG-$BERICHT_NAME.md
FERTIG=$DIR/$TAG-$ART.fertig
LOCK=$DIR/$ART.lock
START=$(date +%s)
ENDE=$(( START + 6 * 3600 ))            # nach 6 Stunden nicht mehr fortsetzen
HART=$(( START + 7 * 3600 ))            # nach 7 Stunden wird claude beendet
# zeit, log, push (Zeile aufs iPhone) und belegt: gemeinsam mit den anderen Läufen
source ${0:A:h}/lauf-hilfen.zsh
# Vorprüfung der Doku-Prüfung ohne Claude: doku_geaendert(), uebersprungen()
source ${0:A:h}/vorpruefung.zsh
# Kennzahl „Tage seit der letzten vollständig grünen Runde“: ci_laeufe_holen, ci_gruen_zeile, ci_tage_seit_gruen
source ${0:A:h}/ci-runde.zsh
# Modelle (Entscheidung des Maintainers vom 6.11.2026, Sitzung global.design.comparison,
# Wortlaut: „ja, punkt 2 und 3 umsetzen.“): die Doku-Prüfung mit Sonnet und niedriger
# Reasoning-Stufe, die Wochenprüfung bleibt bei Opus (Standard der Installation); sie gibt nur Empfehlungen ab, wie es der Auftrag sagt
MODELL=(--model opus)   # Wochenprüfung ausdrücklich Opus (Entscheidung vom 9.11.2026), Effort unverändert
[[ -n $DOKU ]] && MODELL=(--model sonnet --effort low)

bericht_kurz() {
  local z=$(grep -m1 '^Kurz:' $BERICHT 2>/dev/null | sed 's/^Kurz: *//')
  [[ -z $z ]] && z=$(grep -m1 '^# ' $BERICHT 2>/dev/null | sed 's/^# *//')
  print -r -- $z
}

notbericht() {
  local titel=$1 grund=$2
  {
    print "# halo.spaces $NAME $TAG – $titel"
    print
    print "Kurz: $NAME $titel${grund:+ – $grund}"
    print
    print "$(zeit), $(hostname -s)"
    if [[ -n $3 ]]; then
      print
      print "## Ende des Protokolls ($LOG)"
      print
      print '```'
      tail -30 $LOG
      print '```'
    fi
  } > $BERICHT
}

# Pause: eine Datei, ~/halo-nacht/pausen.txt (tests/lauf-hilfen.zsh)
if pause_start $PAUSE_ROUTINE; then
  notbericht "pausiert" "Pause $PAUSE_GRUND, nichts gemacht"
  exit 0
fi

if [[ -e $LOCK ]] && kill -0 $(<$LOCK) 2>/dev/null; then
  log "eigener Lauf (PID $(<$LOCK)) läuft noch – ausgelassen"
  exit 0
fi
print $$ > $LOCK
trap 'rm -f $LOCK' EXIT

# Doku-Prüfung: Teilprüfung bei geänderten .md oder geänderten, in einer .md genannten
# Skripten, Vollprüfung am ersten Samstag im Monat bzw. mit ~/halo-nacht/DOKU-VOLL
# (Regeln in vorpruefung.zsh); sonst ohne Claude und ohne Push überspringen
DOKU_HINWEIS=
if [[ -n $DOKU && -z $TROCKEN ]]; then
  # nicht in $(…): doku_geaendert setzt DOKU_VOLL, DOKU_STAND und die Dateilisten, die in einer
  # Unter-Shell verloren gingen (Auftrag lautete immer „Teilprüfung, keine geänderten .md“)
  GRUND_DATEI=$(mktemp)
  doku_geaendert > $GRUND_DATEI; GRUND_RC=$?
  GRUND=$(<$GRUND_DATEI); rm -f $GRUND_DATEI
  if (( GRUND_RC == 0 )); then
    log "Vorprüfung: $GRUND"
    if (( DOKU_VOLL )); then
      DOKU_HINWEIS="Vollprüfung: alle .md-Dateien gründlich prüfen."
      MODELL=(--model opus --effort medium)   # Vollprüfung mit Opus (Entscheidung vom 9.11.2026, Stufe 5e)
    else
      DOKU_HINWEIS="Teilprüfung seit der letzten Prüfung (Stand ${DOKU_STAND[1,7]}). Gründlich prüfen: geänderte .md-Dateien (${(j:, :)DOKU_GEAENDERT:-keine})${DOKU_SKRIPTE:+ und die .md, die geänderte Skripte nennen (Skripte: ${(j:, :)DOKU_SKRIPTE}; .md: ${(j:, :)DOKU_BETROFFEN})}. Alle übrigen .md nur auf Widersprüche und Doppeltes zu diesen prüfen, nicht Absatz für Absatz."
    fi
  else
    uebersprungen dokupruefung "$GRUND"
    notbericht "übersprungen" "nichts zu prüfen: $GRUND"
    exit 0
  fi
  # Wächter für den Kern: harte Sperren und Pflichtbegriffe müssen in AGENTS.md stehen, keine
  # @-Importe (tests/doku_kern_check.sh); Rot geht als Hinweis in den Auftrag an Claude
  if KERN=$(zsh $REPO/tests/doku_kern_check.sh $REPO/AGENTS.md 2>&1); then
    log "Wächter AGENTS.md: ${KERN%%$'\n'*}"
  else
    log "Wächter AGENTS.md ROT: ${KERN//$'\n'/ | }"
    DOKU_HINWEIS="$DOKU_HINWEIS WÄCHTER ROT (tests/doku_kern_check.sh): ${KERN//$'\n'/ | } – fehlende Sperren oder Begriffe wiederherstellen (nicht den Wächter lockern); gehört die Regel nicht mehr in den Kern, nur mit Entscheidung des Maintainers (Eintrag „Doku: …“ mit „Wartet auf OK“)."
  fi
  # Pausen: eine Datei (tests/pausen_check.sh: Einzelfälle der Logik, keine Reste alter Pausen-Dateien)
  if PAUSEN=$(zsh $REPO/tests/pausen_check.sh $REPO 2>&1); then
    log "Wächter Pausen: ${PAUSEN%%$'\n'*}"
  else
    log "Wächter Pausen ROT: ${PAUSEN//$'\n'/ | }"
    DOKU_HINWEIS="$DOKU_HINWEIS WÄCHTER ROT (tests/pausen_check.sh): ${PAUSEN//$'\n'/ | } – Pausen-Logik bzw. Doku an die eine Datei ~/halo-nacht/pausen.txt anpassen."
  fi
  # Bilder-Eingang (tests/bilder_eingang_test.zsh: Einsortieren, Hash, Index, Sperren, ohne Claude)
  if BEIN=$(zsh $REPO/tests/bilder_eingang_test.zsh 2>&1); then
    log "Wächter Bilder-Eingang: $(print -r -- $BEIN | grep -c '^OK') Fälle grün"
  else
    log "Wächter Bilder-Eingang ROT: ${${(M)${(f)BEIN}:#FEHLER*}}"
    DOKU_HINWEIS="$DOKU_HINWEIS WÄCHTER ROT (tests/bilder_eingang_test.zsh): ${(j: | :)${(M)${(f)BEIN}:#FEHLER*}} – tests/bilder-eingang.zsh prüfen (Eintrag „Tests: …“ im Board, nicht den Test lockern)."
  fi
  # CI-Runden des Nachtlaufs (tests/ci_runde_test.zsh: Vollrunde, Kennzahl, Eintragen, ohne Netz)
  if CIR=$(zsh $REPO/tests/ci_runde_test.zsh 2>&1); then
    log "Wächter CI-Runden: ${CIR##*$'\n'}"
  else
    log "Wächter CI-Runden ROT: ${${(M)${(f)CIR}:#FEHLER*}}"
    DOKU_HINWEIS="$DOKU_HINWEIS WÄCHTER ROT (tests/ci_runde_test.zsh): ${(j: | :)${(M)${(f)CIR}:#FEHLER*}} – tests/ci-runde.zsh bzw. tests/ci-waechter.sh prüfen (Eintrag „Tests: …“ im Board, nicht den Test lockern)."
  fi
  # Issue-Abgleich (tests/issue_abgleich_test.zsh: Fix-Nummern, Teil-Fix, Revert, CI, Antwort, Schließen, ohne Netz)
  if IAT=$(zsh $REPO/tests/issue_abgleich_test.zsh 2>&1); then
    log "Wächter Issue-Abgleich: ${IAT##*$'\n'}"
  else
    log "Wächter Issue-Abgleich ROT: ${${(M)${(f)IAT}:#FEHLER*}}"
    DOKU_HINWEIS="$DOKU_HINWEIS WÄCHTER ROT (tests/issue_abgleich_test.zsh): ${(j: | :)${(M)${(f)IAT}:#FEHLER*}} – tests/issue-abgleich.sh bzw. publish.sh prüfen (Eintrag „Tests: …“ im Board, nicht den Test lockern)."
  fi
fi

# Wochenprüfung: Kennzahl „Tage seit der letzten vollständig grünen Runde“ (Entscheidung des Maintainers vom
# 7.11.2026) ohne Claude ausrechnen und in den Auftrag geben
CI_KENNZAHL=
if [[ -z $DOKU ]]; then
  CI_D=$(mktemp)
  if ci_laeufe_holen $CI_D 100; then
    read -r CI_E CI_T <<< $(ci_tage_seit_gruen $CI_D)
    [[ $CI_E == - ]] && CI_T=null CI_E=null || CI_E="\"$(TZ=Europe/Vienna date -r $CI_E +%FT%T%z)\""
    CI_KENNZAHL="CI-Kennzahl (tests/ci-runde.zsh, letzte 100 Läufe): $(ci_gruen_zeile $CI_D) – in wochen-kennzahlen.json: \"tage_seit_gruener_vollrunde\": $CI_T, \"letzte_gruene_vollrunde\": $CI_E"
  else
    CI_KENNZAHL="CI-Kennzahl: gh nicht lesbar – tage_seit_gruener_vollrunde und letzte_gruene_vollrunde null, im Bericht sagen"
  fi
  rm -f $CI_D*
  # flackernde Prüfungen (rot, in derselben Nacht ohne Reparaturcommit grün; tests/ci-waechter.sh rot()): Zeilen
  # „  flackert: …“ der letzten 7 Tage im Wächter-Protokoll
  CI_SEIT=$(date -v-7d '+%F %T')
  CI_FLACKER=$(awk -v s="$CI_SEIT" 'substr($0, 1, 19) >= s && /^[0-9-]+ [0-9:]+   flackert: /' $HOME/halo-aufgaben/ci-waechter.log 2>/dev/null | wc -l | tr -d ' ')
  CI_KENNZAHL="$CI_KENNZAHL
Flackernde Prüfungen (ci-waechter.log, letzte 7 Tage, Zeilen „flackert:“): ${CI_FLACKER:-0} – in wochen-kennzahlen.json: \"ci_flackert\": ${CI_FLACKER:-0}"
  # offene Issues mit Fix auf main (grüne CI), älter als 1 Tag, ohne „behoben“-Antwort (tests/issue-abgleich.sh,
  # Entscheidung des Maintainers vom 7.11.2026); trocken: Liste und Stand bleiben unberührt
  if IA_N=$(zsh ${0:A:h}/issue-abgleich.sh --kennzahl 2>/dev/null) && [[ $IA_N == <-> ]]; then
    CI_KENNZAHL="$CI_KENNZAHL
Behobene Issues ohne Antwort (tests/issue-abgleich.sh, Fix auf main mit grüner CI älter als 1 Tag, ohne „behoben“-Antwort): $IA_N – in wochen-kennzahlen.json: \"issue_ohne_antwort\": $IA_N"
  else
    CI_KENNZAHL="$CI_KENNZAHL
Behobene Issues ohne Antwort: Issue-Abgleich nicht möglich – in wochen-kennzahlen.json \"issue_ohne_antwort\": null, im Bericht sagen"
  fi
fi

# Um 08:00 kann der Nachtlauf noch laufen (hart beendet um 09:00): auf ihn bis
# 09:15 warten, auf einen CI-Lauf bis zu 90 Minuten, auf alles andere nicht.
# Der Trockenlauf testet nichts und darf neben allem laufen. Die Doku-Prüfung
# ändert nur .md-Dateien und testet nichts: CI, Testläufe und VM stören sie
# nicht, nur der Nachtlauf, andere Sitzungen am Repo und release/publish.
belegt_woche() {
  [[ -e $DIR/lauf.lock ]] && kill -0 $(<$DIR/lauf.lock) 2>/dev/null && { print "Nachtlauf"; return 0 }
  belegt
}
if [[ -z $TROCKEN ]]; then
  NACHT_BIS=$(date -j -v9H -v15M -v0S +%s) CI_WARTE=0
  while GRUND=$(belegt_woche); do
    if [[ $GRUND == Nachtlauf ]]; then
      (( $(date +%s) < NACHT_BIS )) || break
    elif [[ -n $DOKU && $GRUND == (CI-*|Testlauf*|Thunderbird mit Marionette|Marionette-Port*|Lauf in der Windows-VM) ]]; then
      break
    elif [[ $GRUND == CI-* ]]; then
      (( CI_WARTE++ < 18 )) || break
    else
      break
    fi
    log "warte: $GRUND"
    sleep 300
  done
  if GRUND=$(belegt_woche) && ! [[ -n $DOKU && $GRUND == (CI-*|Testlauf*|Thunderbird mit Marionette|Marionette-Port*|Lauf in der Windows-VM) ]]; then
    log "ausgelassen: $GRUND"
    notbericht "ausgelassen" "$GRUND"
    push "$NAME $TAG ausgelassen: $GRUND"
    exit 0
  fi
fi

cd $REPO || exit 2
SID=$(uuidgen | tr A-Z a-z)
log "Start, Sitzung $SID${TROCKEN:+ (trocken)}"
if [[ -n $TROCKEN ]]; then
  MODUS="TROCKENLAUF: Nur auswerten und den Bericht schreiben. Nichts ändern: keine Dateien im Repo, keine Commits, kein Push, keine Board-Einträge oder Statusänderungen, keine Testläufe, die Kennzahlen-Datei unter ~/halo-aufgaben nicht schreiben (nur lesen). Was du ändern bzw. eintragen würdest, steht im Bericht unter „Würde ändern“. Überschrift des Berichts mit „(Probelauf)“."
else
  MODUS="Normaler Lauf: Freigaben wie im Auftrag."
fi
WOCHE=$(date +%G-W%V)   # ISO-Woche des Laufs, vom Skript berechnet (nicht von Claude abgeleitet)
AUFTRAG="Heute: $TAG. Wochenschlüssel (ISO-Woche, maßgeblich): $WOCHE. Bericht: $BERICHT. Fertig-Datei: $FERTIG. Protokoll: $LOG.
$MODUS${DOKU_HINWEIS:+
$DOKU_HINWEIS}${CI_KENNZAHL:+
$CI_KENNZAHL}

$(<$REPO/tests/$AUFTRAG_DATEI)"
( while (( $(date +%s) < HART )); do sleep 60; done; pkill -f -- "--session-id $SID|--resume $SID" ) &
WACHE=$!
trap 'rm -f $LOCK; kill $WACHE 2>/dev/null' EXIT

rm -f $FERTIG
RUNDE=0 LEER=0
PROMPT=$AUFTRAG
ARGS=(--session-id $SID)
while true; do
  RUNDE=$((RUNDE + 1))
  OUT=$DIR/$TAG-$ART-runde$RUNDE.txt
  claude -p $MODELL "${ARGS[@]}" --permission-mode auto "$PROMPT" > $OUT 2>&1
  RC=$?
  log "Runde $RUNDE beendet (Exitcode $RC): $(tail -c 300 $OUT | tr '\n' ' ')"
  [[ -e $FERTIG ]] && break
  (( $(date +%s) >= ENDE )) && { log "Zeitgrenze erreicht – nicht mehr fortsetzen"; break }
  ARGS=(--resume $SID)
  if grep -qiE "usage limit|hit your limit|limit reached|resets (at )?[0-9]|rate limit|overloaded" $OUT; then
    log "Limit – Pause 30 Minuten"
    sleep 1800
    PROMPT="Weiter nach der Limit-Pause: mach dort weiter, wo du warst (Auftrag oben). Am Ende Bericht und Fertig-Datei."
  else
    LEER=$((LEER + 1))
    (( LEER > 2 )) && break
    PROMPT="Du hast aufgehört, aber $FERTIG fehlt. Wenn noch etwas offen ist, weitermachen; sonst jetzt Bericht nach $BERICHT schreiben (Vorgabe im Auftrag) und $FERTIG anlegen."
  fi
done

# fertige Doku-Prüfung (mit ihren eigenen Commits) merken: nächstes Mal nur, was danach geändert wurde
[[ -n $DOKU && -z $TROCKEN && -e $FERTIG ]] && { doku_stand_merken; rm -f $DOKU_VOLL_DATEI }
if [[ ! -s $BERICHT ]] || (( $(stat -f %m $BERICHT) < START )); then
  notbericht "ohne Abschluss" "Claude hat keinen Bericht geschrieben (Runden: $RUNDE, letzter Exitcode $RC)" mit-details
fi
log "Ende"
push "$NAME $TAG${TROCKEN:+ (Probelauf)}: $(bericht_kurz) – Bericht ~/halo-berichte/$TAG-$BERICHT_NAME.md"
exit 0
