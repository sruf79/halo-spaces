#!/bin/zsh
# Wächter für die Pausen (eine Datei: ~/halo-nacht/pausen.txt): läuft tests/pausen_test.zsh und sucht in
# Skripten und Doku nach Anweisungen oder Abfragen der alten Pausen-Dateien (touch/rm/-e … PAUSE, PAUSE-WOCHE,
# PAUSE-DOKU, ~/halo-tour/PAUSE). Erlaubt sind nur die Übernahme in tests/lauf-hilfen.zsh, der Test selbst und
# ENTSCHEIDUNGEN.md. Je Problem eine Zeile „FEHLER …“, Exitcode 1; sonst „OK …“. Läuft in der
# Doku-Prüfung (tests/wochenpruefung.sh --doku) und von Hand: zsh tests/pausen_check.sh
repo=${1:-${0:A:h:h}}
fehler=0
erg=$(zsh $repo/tests/pausen_test.zsh 2>&1); rc=$?
if (( rc )); then
  print "FEHLER pausen_test.zsh: ${(j: | :)${(f)$(print -r -- $erg | grep -a '^FEHLER')}}"; fehler=1
fi
reste=$(cd $repo && grep -rnE '(touch|rm|-e|-r|-s|test) +[^ ]*(halo-nacht|halo-tour|DIR|TOUR)?[^ ]*PAUSE([-" `]|$)' \
  --include='*.md' --include='*.sh' --include='*.zsh' --include='*.py' --include='*.yml' . 2>/dev/null \
  | grep -vE '^\./(tests/lauf-hilfen\.zsh|tests/pausen_test\.zsh|tests/pausen_check\.sh|tests/neon-neustart\.sh|ENTSCHEIDUNGEN\.md|\.git/)' || true)
if [[ -n $reste ]]; then
  print "FEHLER Reste alter Pausen-Dateien: ${(j: | :)${(f)reste}}"; fehler=1
fi
(( fehler )) && exit 1
print "OK Pausen: ${$(print -r -- $erg | grep -ac '^OK')} Fälle grün, keine Reste alter Pausen-Dateien"
