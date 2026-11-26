#!/bin/zsh
# Logik-Test für verwaiste_tb_beenden (tests/lauf-hilfen.zsh): beendet nur verwaiste Test-Thunderbird (Profil …/halo-test-…,
# -marionette, Elternprozess 1, alt genug) und löscht nur alte, unbenutzte halo-test-Profile. Statt Thunderbird laufen
# harmlose zsh-Prozesse mit passender Befehlszeile (exec -a), alle mit Pfaden in einem eigenen temporären Ordner; Muster
# für Profil, Testlauf und CI sind auf diesen Ordner eingeengt, echte Prozesse und Profile fasst der Test nicht an.
# Nur macOS (neon). Je Fall eine Zeile OK/FEHLER, Exitcode 0 nur bei Erfolg.
#   zsh tests/verwaiste_tb_test.zsh
emulate -L zsh
setopt extendedglob
S=$(mktemp -d)
S=${S:A}
PIDS=()
trap 'for p in $PIDS; do kill -KILL $p 2>/dev/null; done; rm -rf $S' EXIT
source ${0:A:h}/lauf-hilfen.zsh
mkdir -p $S/T $S/bin $S/Library/Thunderbird/Profiles/abc.default-release
export VERWAIST_TMP=$S/T VERWAIST_LOG=$S/aufraeumen.log VERWAIST_PROFIL_ALTER=3600
export VERWAIST_PROFIL_MUSTER="${S}/[^ ]*halo-test-[A-Za-z0-9_-]+"
export VERWAIST_CI_MUSTER="$S/ci-probe/Runner\.Worker"
BELEGT_TEST_MUSTER_ECHT=$BELEGT_TEST_MUSTER
BELEGT_TEST_MUSTER="$S/probe/tests/halo_test\.py"
LOG=$S/aufrufer.log
fehler=0
pruefe() {   # <Name> <Bedingung>
  if eval $2; then print -r -- "OK $1"; else print -r -- "FEHLER $1"; fehler=1; fi
}
# Prozess mit Befehlszeile „<argv0> -fc … <Argumente>“; „waise“: Elternprozess 1 (Unterschale endet sofort),
# „kind“: Kind dieses Skripts. Nicht in $(…) aufrufen (dort wäre auch das Kind nach Ende der Unterschale verwaist)
starte() {   # <Variable> <waise|kind> <argv0> <Argumente …> – PID in der Variablen und in $PIDS
  local var=$1 art=$2 a0=$3; shift 3
  local f=$S/pid.$RANDOM
  if [[ $art == waise ]]; then
    ( exec -a $a0 zsh -fc 'zmodload zsh/zselect; zselect -t 360000' "$@" </dev/null >/dev/null 2>&1 & print $! > $f ) &
    wait $!
  else
    ( exec -a $a0 zsh -fc 'zmodload zsh/zselect; zselect -t 360000' "$@" </dev/null >/dev/null 2>&1 ) &!
    print $! > $f
  fi
  while [[ ! -s $f ]]; do sleep 0.1; done
  typeset -g $var=$(<$f)
  PIDS+=$(<$f)
}
lebt() { kill -0 $1 2>/dev/null }
alt_machen() { touch -t $(date -v-2d +%Y%m%d%H%M) $1 }

# Profile im temporären Ordner
mkdir $S/T/halo-test-alt $S/T/halo-test-neu $S/T/halo-test-benutzt $S/T/anderes-alt
print x > $S/T/halo-test-datei
for d in halo-test-alt halo-test-benutzt anderes-alt halo-test-datei; do alt_machen $S/T/$d; done

# Prozesse
starte WAISE waise $S/bin/thunderbird -profile $S/T/halo-test-waise1 -no-remote -marionette
starte WAISE_BIN waise $S/bin/thunderbird-bin -profile $S/T/halo-test-vergleich-w2 -marionette
starte NUTZER waise $S/bin/thunderbird -profile $S/Library/Thunderbird/Profiles/abc.default-release -marionette
starte NUTZER2 waise $S/bin/thunderbird -profile $S/Profiles/halo-test-ich.default -marionette
starte OHNE_M waise $S/bin/thunderbird -profile $S/T/halo-test-ohne-m -no-remote
starte FREMD waise $S/bin/firefox -profile $S/T/halo-test-fremd -marionette
starte KIND kind $S/bin/thunderbird -profile $S/T/halo-test-benutzt -marionette
sleep 2

pruefe "Waise hat Elternprozess 1" '[[ ${$(ps -o ppid= -p $WAISE)//[[:space:]]/} == 1 ]]'
pruefe "Kind hat nicht Elternprozess 1" '[[ ${$(ps -o ppid= -p $KIND)//[[:space:]]/} != 1 ]]'

# 1. zu jung (Standard 3 Stunden; Profile hier noch nicht alt genug): nichts beendet
AUS=$(VERWAIST_PROFIL_ALTER=999999 verwaiste_tb_beenden)
pruefe "zu jung: Ausgabe 0" '[[ $AUS == "Verwaiste Testprozesse beendet: 0" ]]'
pruefe "zu jung: Waise lebt" 'lebt $WAISE'

# 2. Testlauf läuft: nichts angefasst, auch keine Profile
starte PROBE kind python3 $S/probe/tests/halo_test.py --port 2999
AUS=$(VERWAIST_ALTER=1 verwaiste_tb_beenden)
pruefe "Testlauf: Ausgabe 0" '[[ $AUS == "Verwaiste Testprozesse beendet: 0" ]]'
pruefe "Testlauf: Waise lebt" 'lebt $WAISE'
pruefe "Testlauf: altes Profil bleibt" '[[ -d $S/T/halo-test-alt ]]'
pruefe "Testlauf: Grund im Protokoll" 'grep -q "nichts angefasst: Testlauf läuft" $S/aufraeumen.log'
kill $PROBE

# 2b. Rundgang: ui_tour.py zählt als Testlauf (Auflage Fable zu Satz P2, 25.11.2026: läuft auch um 00:45 aus dem
# CI-Wächter und tut nichts, solange ein Testlauf läuft); das echte Muster erkennt die Befehlszeile (nur Text, kein Prozess)
pruefe "echtes Muster erkennt ui_tour.py" '[[ "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3 -u /Users/x/halo-spaces/tests/ui_tour.py --port 2850" =~ $BELEGT_TEST_MUSTER_ECHT ]]'
pruefe "echtes Muster erkennt halo_test.py" '[[ "python3 tests/halo_test.py --port 2851 --only x" =~ $BELEGT_TEST_MUSTER_ECHT ]]'
pruefe "echtes Muster: Auftragstext einer Sitzung zählt nicht" '! [[ "claude -p Prüfe mit python3 tests/halo_test.py" =~ $BELEGT_TEST_MUSTER_ECHT ]]'
BELEGT_TEST_MUSTER="$S/probe/tests/(halo_test|ui_tour)\.py"
starte TOUR kind python3 $S/probe/tests/ui_tour.py --port 2998
AUS=$(VERWAIST_ALTER=1 verwaiste_tb_beenden)
pruefe "Rundgang (ui_tour.py): Ausgabe 0" '[[ $AUS == "Verwaiste Testprozesse beendet: 0" ]]'
pruefe "Rundgang (ui_tour.py): Waise lebt" 'lebt $WAISE'
kill $TOUR
BELEGT_TEST_MUSTER="$S/probe/tests/halo_test\.py"

# 3. CI läuft: nichts angefasst
starte CI kind $S/ci-probe/Runner.Worker spawnclient
AUS=$(VERWAIST_ALTER=1 verwaiste_tb_beenden)
pruefe "CI: Waise lebt" 'lebt $WAISE'
pruefe "CI: Grund im Protokoll" 'grep -q "nichts angefasst: CI-Lauf läuft" $S/aufraeumen.log'
kill $CI
sleep 0.5

# 4. frei, alt genug: nur die beiden Waisen mit halo-test-Profil
AUS=$(VERWAIST_ALTER=1 verwaiste_tb_beenden)
pruefe "Ausgabe: 2 beendet" '[[ $AUS == "Verwaiste Testprozesse beendet: 2" ]]'
pruefe "Waise thunderbird beendet" '! lebt $WAISE'
pruefe "Waise thunderbird-bin (Vergleichsprofil) beendet" '! lebt $WAISE_BIN'
pruefe "Nutzerprofil bleibt" 'lebt $NUTZER'
pruefe "Nutzerprofil mit halo-test im Namen bleibt" 'lebt $NUTZER2'
pruefe "ohne -marionette bleibt" 'lebt $OHNE_M'
pruefe "anderes Programm bleibt" 'lebt $FREMD'
pruefe "Test-Thunderbird mit lebendem Elternprozess bleibt" 'lebt $KIND'
pruefe "altes Profil gelöscht" '[[ ! -e $S/T/halo-test-alt ]]'
pruefe "neues Profil bleibt" '[[ -d $S/T/halo-test-neu ]]'
pruefe "benutztes Profil bleibt" '[[ -d $S/T/halo-test-benutzt ]]'
pruefe "anderer Ordner bleibt" '[[ -d $S/T/anderes-alt ]]'
pruefe "Datei halo-test-* bleibt" '[[ -f $S/T/halo-test-datei ]]'
pruefe "Protokoll: PID und Alter" 'grep -q "beendet PID $WAISE, Alter [0-9]* s, Eltern 1: $S/bin/thunderbird " $S/aufraeumen.log'
pruefe "Protokoll: Profil gelöscht" 'grep -q "Profil gelöscht: $S/T/halo-test-alt$" $S/aufraeumen.log'
pruefe "Protokoll des Aufrufers" 'grep -q "Verwaiste Testprozesse beendet: 2, alte Testprofile gelöscht: 1$" $LOG'
pruefe "Protokoll ohne Nutzerprofil" '! grep -q "default" $S/aufraeumen.log'

# 5. zweiter Aufruf: nichts mehr zu tun
AUS=$(VERWAIST_ALTER=1 verwaiste_tb_beenden)
pruefe "zweiter Aufruf: 0" '[[ $AUS == "Verwaiste Testprozesse beendet: 0" ]]'

# 6. Aufrufer ohne extendedglob (vm-frisch.sh, release-unter-tage.sh): altes Profil wird trotzdem erkannt
mkdir $S/T/halo-test-alt2; alt_machen $S/T/halo-test-alt2
AUS=$(unsetopt extendedglob; VERWAIST_ALTER=1 verwaiste_tb_beenden)
pruefe "ohne extendedglob: altes Profil gelöscht" '[[ ! -e $S/T/halo-test-alt2 ]]'
pruefe "ohne extendedglob: Nutzerprofil lebt weiter" 'lebt $NUTZER && lebt $NUTZER2'

print
(( fehler )) && print "FEHLER: verwaiste_tb_beenden" || print "alle Prüfungen OK"
exit $fehler
