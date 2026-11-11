#!/bin/zsh
# Prüft tests/erzeugt-hook.sh ohne Thunderbird und ohne claude.
cd ${0:A:h:h}
H=tests/erzeugt-hook.sh R=$PWD
FEHL=0 ANZ=0
# fall <Name> <erwartet 0|2> <Pfad|@roh:text> [VAR=wert ...]
fall() {
  local name=$1 erw=$2 p=$3; shift 3
  local json rc
  if [[ $p == @roh:* ]]; then json=${p#@roh:}
  else json=$(python3 -I -c 'import json,sys; print(json.dumps({"tool_name":"Edit","tool_input":{"file_path":sys.argv[1]}}))' "$p"); fi
  print -r -- "$json" | env HALO_SPERRE_AUS=/nonexistent/sperre "$@" zsh $H 2>/dev/null
  rc=$?; ((ANZ++))
  if [[ $rc == $erw ]]; then print "OK      $name"; else print "FEHLER  $name (Exit $rc, erwartet $erw)"; ((FEHL++)); fi
}
fall "theme.css gesperrt" 2 $R/extension/theme.css
fall "theme.css über ../ gesperrt" 2 $R/tests/../extension/theme.css
fall "dist/ gesperrt" 2 $R/dist/halo-spaces-3.25.0.xpi
fall "dist/ Unterordner gesperrt" 2 $R/dist/x/y.txt
fall "dist/release-Marke gesperrt" 2 $R/dist/release-3.25.0.ok
fall "xpi außerhalb gesperrt" 2 /tmp/irgendwas.xpi
fall "userChrome.css erlaubt" 0 $R/chrome/userChrome.css
fall "spaces.css erlaubt" 0 $R/chrome/spaces.css
fall "extension/manifest.json erlaubt" 0 $R/extension/manifest.json
fall "extension/andere.css erlaubt" 0 $R/extension/messages.css
fall "theme.css ohne build.sh erlaubt" 0 /tmp/fremd/extension/theme.css
fall "dist ohne build.sh erlaubt" 0 /tmp/fremd/dist/a.txt
fall "Datei distx erlaubt" 0 $R/distx/a.txt
fall "leere Eingabe erlaubt" 0 "@roh:"
fall "kaputtes JSON erlaubt" 0 "@roh:{nicht json"
fall "ohne file_path erlaubt" 0 '@roh:{"tool_input":{"command":"ls"}}'
fall "SPERRE_AUS erlaubt" 0 $R/extension/theme.css HALO_SPERRE_AUS=$R/build.sh
print "$((ANZ - FEHL))/$ANZ OK"
(( FEHL == 0 ))
