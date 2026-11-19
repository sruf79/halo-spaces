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
  print -r -- "$json" | env HALO_SPERRE_AUS=/nonexistent/sperre HALO_RUNNER=nein HALO_CI_NOETIG=nein HALO_ZR_FAELLIG=/nonexistent/zf.txt "$@" zsh $H 2>/dev/null
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
# Regel 3: Vorrang für ein fälliges Zwischen-Release (Marke zwischen-faellig.txt, neon-Auftrag #48)
ZT=$(mktemp -d); MK=$ZT/zf.txt JZ=2000000000
print -r -- "$((JZ - 600)) - fc2701d0000 pruef/sammel-fehler-1119 11:54" > $MK
T1="python3 tests/halo_test.py --port 2851 --only Kalender"
fall "Marke frisch: Testlauf gesperrt" 2 $T1 HALO_JETZT=1300 HALO_ZR_FAELLIG=$MK HALO_ZR_JETZT=$JZ
fall "Marke frisch: Testlauf der Tagesroutine (HALO_LAUF) gesperrt" 2 $T1 HALO_JETZT=1300 HALO_ZR_FAELLIG=$MK HALO_ZR_JETZT=$JZ HALO_LAUF=tagesroutine
fall "Marke frisch: update_test gesperrt" 2 "python3 tests/update_test.py" HALO_JETZT=1300 HALO_ZR_FAELLIG=$MK HALO_ZR_JETZT=$JZ
fall "Marke frisch: Wächter selbst (HALO_LAUF=zwischen-release) erlaubt" 0 $T1 HALO_JETZT=1300 HALO_ZR_FAELLIG=$MK HALO_ZR_JETZT=$JZ HALO_LAUF=zwischen-release
fall "Marke frisch: Nachtlauf erlaubt" 0 $T1 HALO_JETZT=1300 HALO_ZR_FAELLIG=$MK HALO_ZR_JETZT=$JZ HALO_LAUF=nachtlauf
fall "Marke frisch: release-unter-tage.sh erlaubt (kein Testlauf)" 0 "zsh tests/release-unter-tage.sh --volldampf 3.33.0 n.md" HALO_JETZT=1300 HALO_ZR_FAELLIG=$MK HALO_ZR_JETZT=$JZ
fall "Marke frisch: release.sh/publish.sh erlaubt" 0 "NUR_CI=1 ./release.sh 3.33.0 && ./publish.sh 3.33.0 n.md" HALO_JETZT=1300 HALO_ZR_FAELLIG=$MK HALO_ZR_JETZT=$JZ
fall "Marke frisch: grep nach halo_test.py erlaubt" 0 "grep halo_test.py README.md" HALO_JETZT=1300 HALO_ZR_FAELLIG=$MK HALO_ZR_JETZT=$JZ
fall "Marke älter als 60 Min.: Testlauf erlaubt" 0 $T1 HALO_JETZT=1300 HALO_ZR_FAELLIG=$MK HALO_ZR_JETZT=$((JZ + 3000))
fall "keine Marke: Testlauf erlaubt" 0 $T1 HALO_JETZT=1300 HALO_ZR_FAELLIG=$ZT/keine.txt HALO_ZR_JETZT=$JZ
print -r -- "$((JZ - 600)) 999999 fc2701d0000 pruef/x 11:54" > $ZT/tot.txt
fall "Marke eines beendeten Wächters (PID tot): Testlauf erlaubt" 0 $T1 HALO_JETZT=1300 HALO_ZR_FAELLIG=$ZT/tot.txt HALO_ZR_JETZT=$JZ
print -r -- "$((JZ - 600)) $$ fc2701d0000 pruef/x 11:54" > $ZT/lebt.txt
fall "Marke eines lebenden Wächters: Testlauf gesperrt" 2 $T1 HALO_JETZT=1300 HALO_ZR_FAELLIG=$ZT/lebt.txt HALO_ZR_JETZT=$JZ
print -r -- "kaputt" > $ZT/kaputt.txt
fall "kaputte Marke: Testlauf erlaubt (fail open)" 0 $T1 HALO_JETZT=1300 HALO_ZR_FAELLIG=$ZT/kaputt.txt HALO_ZR_JETZT=$JZ
fall "Marke frisch: Push nicht berührt (13:00 erlaubt)" 0 $P HALO_JETZT=1300 HALO_ZR_FAELLIG=$MK HALO_ZR_JETZT=$JZ
fall "Marke frisch, HALO_LAUF=tagesroutine: Push 02:00 bleibt frei wie bisher" 0 $P HALO_JETZT=0200 HALO_ZR_FAELLIG=$MK HALO_ZR_JETZT=$JZ HALO_LAUF=tagesroutine
fall "Marke frisch, ohne HALO_LAUF: Push 02:00 bleibt gesperrt" 2 $P HALO_JETZT=0200 HALO_ZR_FAELLIG=$MK HALO_ZR_JETZT=$JZ
M=$(print -r -- '{"tool_input":{"command":"python3 tests/halo_test.py"}}' | env HALO_SPERRE_AUS=/nonexistent HALO_RUNNER=nein HALO_JETZT=1300 HALO_ZR_FAELLIG=$MK HALO_ZR_JETZT=$JZ zsh $H 2>&1 >/dev/null)
((ANZ++)); if [[ $M == *"Zwischen-Release fällig, bitte warten"*fc2701d* ]]; then print "OK      Meldung „Zwischen-Release fällig, bitte warten“ mit Stand"; else print "FEHLER  Meldung: $M"; ((FEHL++)); fi
rm -rf $ZT
print "Fälle: $ANZ, FEHLER: $FEHL"
(( FEHL == 0 ))
