#!/bin/zsh
# Logik-Test für nachtlauf_warten und woche_warten (tests/vorpruefung.zsh): Warten von Nachtlauf und Wochenprüfung auf Belegung mit
# gestellter Uhr (belegt, nl_jetzt und sleep ersetzt; kein Warten in Echtzeit, kein Netz).
# Je Fall eine Zeile OK/FEHLER, Exitcode 0 nur bei Erfolg.
#   zsh tests/nachtlauf_warten_test.zsh
emulate -L zsh
setopt extendedglob
T=$(mktemp -d)
trap 'rm -rf $T' EXIT
export HALO_UEBERSPRUNGEN_LOG=$T/uebersprungen.log
zeit() { print 00:00 }
log() { : }
source ${0:A:h}/vorpruefung.zsh
fehler=0
pruefe() {   # <Name> <Bedingung>
  if eval $2; then print -r -- "OK $1"; else print -r -- "FEHLER $1"; fehler=1; fi
}

# gestellte Uhr: Start 01:30 (Epoch 0 = 01:30), Grenze 03:30 = 7200 Sekunden später
UHR=$T/uhr
nl_jetzt() { print $(<$UHR) }
sleep() { print $(( $(<$UHR) + $1 )) > $UHR }
# Belegung als Liste „<bis Sekunde> <Grund>“: belegt, solange die Uhr unter <bis> steht
PLAN=()
belegt() {
  local z t=$(<$UHR)
  for z in $PLAN; do
    (( t < ${z%% *} )) && { print -r -- ${z#* }; return 0 }
  done
  return 1
}
fall() {   # <Grenze> <Belegung …> – setzt RC, AUS, ENDE (Sekunden seit Start)
  print 0 > $UHR
  local grenze=$1; shift
  PLAN=("$@")
  AUS=$(nachtlauf_warten $grenze); RC=$?
  # die Funktion lief in einer Unterschale: Ende aus ihrer Uhrdatei lesen
  ENDE=$(<$UHR)
}
G=7200

fall $G
pruefe "frei: sofort Start" '(( RC == 0 && ENDE == 0 ))'

fall $G "7200 CI-Lauf auf dem GitHub-Runner"
pruefe "CI läuft 120 Minuten, endet an der Grenze 03:30: Start" '(( RC == 0 ))'
fall $G "6900 CI-Lauf auf dem GitHub-Runner"
pruefe "CI läuft 115 Minuten, endet vor der Grenze: Start (nicht mehr nach 90 Minuten ausgelassen)" '(( RC == 0 && ENDE >= 6900 && ENDE < 7200 ))'
fall 9000 "7200 CI-Lauf auf dem GitHub-Runner"
pruefe "CI läuft 120 Minuten, Grenze später: Start nach 120 Minuten" '(( RC == 0 && ENDE == 7200 ))'
fall $G "999999 CI-Lauf auf dem GitHub-Runner"
pruefe "CI endet nie: ausgelassen an der Grenze" '(( RC == 1 && ENDE == 7200 ))'
pruefe "CI endet nie: Grund nennt CI und Grenze" '[[ $AUS == "CI-Lauf auf dem GitHub-Runner (gewartet bis "* ]]'

fall $G "1800 Testlauf (halo_test.py o. ä.)"
pruefe "Worker-Test endet nach 30 Minuten: Start" '(( RC == 0 && ENDE == 1800 ))'
fall $G "4200 Testlauf (halo_test.py o. ä.)"
pruefe "Worker-Test endet nach 70 Minuten: ausgelassen nach 60" '(( RC == 1 && ENDE == 3600 ))'
fall $G "4200 Marionette-Port 2851 belegt"
pruefe "Marionette-Port 70 Minuten: ausgelassen nach 60" '(( RC == 1 && ENDE == 3600 ))'
fall $G "1500 Thunderbird mit Marionette"
pruefe "Thunderbird mit Marionette 25 Minuten: Start" '(( RC == 0 ))'
fall 1200 "4200 Testlauf (halo_test.py o. ä.)"
pruefe "Test nie über die Grenze hinaus" '(( RC == 1 && ENDE == 1200 ))'
fall $G "3000 CI-Lauf auf dem GitHub-Runner" "5400 Testlauf (halo_test.py o. ä.)"
pruefe "nach der CI ein Test: 60 Minuten ab dessen Beginn, endet nach 40: Start" '(( RC == 0 && ENDE == 5400 ))'

fall $G "600 release.sh/publish.sh läuft"
pruefe "release.sh 10 Minuten: Start" '(( RC == 0 && ENDE == 600 ))'
fall $G "3000 release.sh/publish.sh läuft"
pruefe "release.sh 50 Minuten: ausgelassen nach 20" '(( RC == 1 && ENDE == 1200 ))'

fall $G "999999 Claude-Sitzung abcd1234 arbeitet gerade am Repo"
pruefe "andere Sitzung: sofort ausgelassen (Lauf des Maintainers geht vor)" '(( RC == 1 && ENDE == 0 ))'
pruefe "andere Sitzung: Grund unverändert" '[[ $AUS == "Claude-Sitzung abcd1234 arbeitet gerade am Repo" ]]'
fall $G "999999 Lauf in der Windows-VM"
pruefe "Windows-VM: sofort ausgelassen (unverändert)" '(( RC == 1 && ENDE == 0 ))'
fall $G "600 CI-Lauf auf dem GitHub-Runner" "999999 Claude-Sitzung abcd1234 arbeitet gerade am Repo"
pruefe "nach der CI eine andere Sitzung: dann ausgelassen" '(( RC == 1 && ENDE == 600 ))'

# Wochen- und Doku-Prüfung (woche_warten): Start 08:00 = Epoch 0, Nachtlauf-Wartegrenze 09:15 = 4500,
# CI-Grenze 10:00 = 7200. Nachtlauf läuft, solange die Uhr unter NACHT steht.
NACHT=0
nachtlauf_aktiv() { (( $(<$UHR) < NACHT )) }
wfall() {   # <Nachtlauf bis> <doku oder -> <Belegung …>
  print 0 > $UHR
  NACHT=$1; local doku=${2:#-}; shift 2
  PLAN=("$@")
  AUS=$(woche_warten 4500 7200 $doku); RC=$?
  ENDE=$(<$UHR)
}
wfall 0 -
pruefe "Woche frei: sofort Start" '(( RC == 0 && ENDE == 0 ))'
wfall 6000 -
pruefe "Woche: Nachtlauf über 09:15 hinaus: ausgelassen um 09:15" '(( RC == 1 && ENDE == 4500 )) && [[ $AUS == Nachtlauf ]]'
wfall 3000 - "6600 CI-Lauf auf dem GitHub-Runner"
pruefe "Woche: Nachtlauf bis 08:50, dann CI bis 09:50: Start" '(( RC == 0 && ENDE >= 6600 && ENDE < 7200 ))'
wfall 0 - "6000 CI-Lauf auf dem GitHub-Runner"
pruefe "Woche: CI läuft 100 Minuten: Start (nicht mehr nach 90 Minuten ausgelassen)" '(( RC == 0 && ENDE == 6000 ))'
wfall 0 - "999999 CI-Lauf auf dem GitHub-Runner"
pruefe "Woche: CI endet nie: ausgelassen um 10:00" '(( RC == 1 && ENDE == 7200 ))'
wfall 0 - "4200 Testlauf (halo_test.py o. ä.)"
pruefe "Woche: Testlauf 70 Minuten: ausgelassen nach 60" '(( RC == 1 && ENDE == 3600 ))'
wfall 0 - "600 release.sh/publish.sh läuft"
pruefe "Woche: release.sh 10 Minuten: Start" '(( RC == 0 && ENDE == 600 ))'
wfall 0 - "999999 Lauf in der Windows-VM"
pruefe "Woche: Windows-VM: sofort ausgelassen" '(( RC == 1 && ENDE == 0 ))'
wfall 0 - "999999 Claude-Sitzung abcd1234 arbeitet gerade am Repo"
pruefe "Woche: andere Sitzung: sofort ausgelassen" '(( RC == 1 && ENDE == 0 ))'
wfall 0 doku "999999 CI-Lauf auf dem GitHub-Runner"
pruefe "Doku: CI stört nicht: sofort Start (unverändert)" '(( RC == 0 && ENDE == 0 ))'
wfall 0 doku "999999 Lauf in der Windows-VM"
pruefe "Doku: Windows-VM stört nicht: sofort Start (unverändert)" '(( RC == 0 && ENDE == 0 ))'
wfall 0 doku "999999 release.sh/publish.sh läuft"
pruefe "Doku: release.sh: sofort ausgelassen (unverändert)" '(( RC == 1 && ENDE == 0 ))'
wfall 3000 doku "999999 CI-Lauf auf dem GitHub-Runner"
pruefe "Doku: nach dem Nachtlauf CI: Start nach dem Nachtlauf" '(( RC == 0 && ENDE == 3000 ))'

exit $fehler
