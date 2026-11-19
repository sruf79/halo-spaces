#!/bin/zsh
# Prüft tests/zeitfenster-hook.sh ohne Thunderbird und ohne claude (Zeit, Runner und ci-noetig simuliert).
cd ${0:A:h:h}
H=tests/zeitfenster-hook.sh
FEHL=0 ANZ=0
# fall <Name> <erwartet 0|2> <Befehl|@roh:text> [VAR=wert ...]
fall() {
  local name=$1 erw=$2 cmd=$3; shift 3
  local json rc
  if [[ $cmd == @roh:* ]]; then json=${cmd#@roh:}
  else json=$(python3 -c 'import json,sys; print(json.dumps({"tool_input":{"command":sys.argv[1]}}))' "$cmd"); fi
  print -r -- "$json" | env HALO_SPERRE_AUS=/nonexistent/sperre HALO_RUNNER=nein HALO_CI_NOETIG=nein "$@" zsh $H 2>/dev/null
  rc=$?; ((ANZ++))
  if [[ $rc == $erw ]]; then print "OK      $name"; else print "FEHLER  $name (Exit $rc, erwartet $erw)"; ((FEHL++)); fi
}
P='git push origin main'
fall "23:59 Push erlaubt" 0 $P HALO_JETZT=2359
fall "00:10 Push mit Codeänderung gesperrt" 2 $P HALO_JETZT=0010 HALO_CI_NOETIG=ja
fall "00:10 Push nur Doku erlaubt" 0 $P HALO_JETZT=0010 HALO_CI_NOETIG=nein
fall "01:29 Push mit Codeänderung gesperrt" 2 $P HALO_JETZT=0129 HALO_CI_NOETIG=ja
fall "01:30 Push gesperrt" 2 $P HALO_JETZT=0130
fall "02:00 Push gesperrt" 2 $P HALO_JETZT=0200
fall "02:00 git -C Push gesperrt" 2 "git -C ~/halo-spaces push origin HEAD:main" HALO_JETZT=0200
fall "02:00 Push in Kette gesperrt" 2 "cd x && git push" HALO_JETZT=0200
fall "02:00 Push mit HALO_LAUF erlaubt" 0 $P HALO_JETZT=0200 HALO_LAUF=nachtlauf
fall "08:59 Push gesperrt" 2 $P HALO_JETZT=0859
fall "09:00 Push erlaubt" 0 $P HALO_JETZT=0900
fall "02:00 push --delete erlaubt" 0 "git push origin --delete x" HALO_JETZT=0200
fall "02:00 Push von Tags allein erlaubt" 0 "git push origin --tags" HALO_JETZT=0200
fall "02:00 git status erlaubt" 0 "git status" HALO_JETZT=0200
fall "02:00 gh pr list erlaubt" 0 "gh pr list" HALO_JETZT=0200
fall "kaputtes JSON erlaubt" 0 "@roh:{kaputt" HALO_JETZT=0200
fall "leere Eingabe erlaubt" 0 "@roh:" HALO_JETZT=0200
fall "ungültige Zeit erlaubt (fail open)" 0 $P HALO_JETZT=abcd
fall "Testlauf mit Runner.Worker gesperrt" 2 "python3 tests/halo_test.py --port 2851" HALO_JETZT=1200 HALO_RUNNER=ja
fall "update_test mit Runner.Worker gesperrt" 2 "python3 tests/update_test.py" HALO_JETZT=1200 HALO_RUNNER=ja
fall "Testlauf ohne Runner.Worker erlaubt" 0 "python3 tests/halo_test.py" HALO_JETZT=1200 HALO_RUNNER=nein
fall "Testlauf mit Runner und HALO_LAUF erlaubt" 0 "python3 tests/ui_tour.py" HALO_JETZT=1200 HALO_RUNNER=ja HALO_LAUF=rundgang
fall "grep nach halo_test.py erlaubt" 0 "grep halo_test.py README.md" HALO_JETZT=1200 HALO_RUNNER=ja
fall "SPERRE_AUS vorhanden erlaubt" 0 $P HALO_JETZT=0200 HALO_SPERRE_AUS=/etc/hosts
# Worker des Auslastungswächters: Push auf den eigenen Prüfzweig zu jeder Zeit (Maintainer 19.11.2026, „1. ja“)
WP='git push -u origin HEAD:pruef/worker-20261119-0210-1'
fall "Worker 02:00 Push auf pruef/worker-… erlaubt" 0 "$WP" HALO_JETZT=0200 HALO_WORKER=1
fall "Worker 00:10 Push mit Codeänderung auf pruef/worker-… erlaubt" 0 "$WP" HALO_JETZT=0010 HALO_CI_NOETIG=ja HALO_WORKER=1
fall "ohne HALO_WORKER 02:00 Push auf pruef/worker-… gesperrt" 2 "$WP" HALO_JETZT=0200
fall "Worker 02:00 Push nach main gesperrt" 2 "git push origin HEAD:main" HALO_JETZT=0200 HALO_WORKER=1
fall "Worker 02:00 zweiter Push in der Kette gesperrt" 2 "$WP && git push origin HEAD" HALO_JETZT=0200 HALO_WORKER=1
fall "Worker 02:00 Push auf anderen Prüfzweig gesperrt" 2 "git push origin HEAD:pruef/lokal-1119" HALO_JETZT=0200 HALO_WORKER=1
fall "Worker 02:00 pruef/worker-… mit main im Befehl gesperrt" 2 "git push origin main:pruef/worker-x" HALO_JETZT=0200 HALO_WORKER=1
print "Fälle: $ANZ, FEHLER: $FEHL"
(( FEHL == 0 ))
