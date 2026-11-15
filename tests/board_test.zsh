# Prüfung von board.sh und gh-wdh.zsh mit gefälschtem gh, ohne Netz:   zsh tests/board_test.zsh
# Abfragelimit → warten und wiederholen; Notiz/Status, die nicht ankommen → Warteschlange, nächster Aufruf trägt nach
emulate -L zsh
HIER=${0:A:h}; T=$(mktemp -d); trap 'rm -rf $T' EXIT; F=0
pruefe() { if eval "$2" >/dev/null 2>&1; then print "OK      $1"; else print "FEHLER  $1"; F=1; fi }
# gh-Fälschung: Zähler-Dateien <art>.limit (so oft Abfragelimit), <art>.kaputt (so oft anderer Fehler)
cat > $T/gh <<'S'
#!/bin/zsh
T=${0:h}
art=other
[[ "$1 $2" == "project item-list" ]] && art=list
[[ "$1 $2" == "project item-edit" ]] && art=edit
[[ "$1 $2" == "api rate_limit" ]] && { print $(( $(date +%s) + 2 )); exit 0 }
print -r -- "$art ${(j: :)@}" >> $T/aufrufe
for f in limit kaputt; do
  if [[ -s $T/$art.$f ]] && (( $(<$T/$art.$f) > 0 )); then
    print $(( $(<$T/$art.$f) - 1 )) > $T/$art.$f
    [[ $f == limit ]] && print -u2 "GraphQL: API rate limit exceeded for user ID 1." || print -u2 "HTTP 502"
    exit 1
  fi
done
[[ $art == list ]] && cat $T/board.json
exit 0
S
chmod +x $T/gh
print -r -- '{"items":[{"id":"PVTI_a","title":"Mail: Test","status":"In Progress","typ":"Bug","content":{"id":"DI_a","body":"Text A"}}]}' > $T/board.json
export GH_WDH_BEFEHL=$T/gh GH_WDH_MAX_S=0 HALO_BOARD_WARTESCHLANGE=$T/w.txt HALO_ARCHIV=$T/archiv.md
B() { zsh $HIER/board.sh "$@" }
anzahl() { grep -c "^$1 " $T/aufrufe 2>/dev/null || print 0 }

# 1. Limit zweimal, dann frei: Notiz kommt an, keine Warteschlange
: > $T/aufrufe; print 2 > $T/edit.limit
B notiz PVTI_a "committet abc1234, wartet auf Push/CI" > $T/aus 2> $T/fe; rc=$?
pruefe "Limit 2×: Notiz nach Wiederholen angekommen" '(( rc == 0 )) && (( $(anzahl edit) == 3 )) && [[ ! -e $T/w.txt ]] && grep -q "Notiz ergänzt" $T/aus'
pruefe "Limit 2×: Hinweis „warte“ in der Fehlerausgabe" 'grep -q "Abfragelimit (graphql) – Versuch 1 von 3" $T/fe'

# 2. anderer Fehler: kein Wiederholen
: > $T/aufrufe; print 1 > $T/edit.kaputt
B notiz PVTI_a "x" 2> $T/fe; rc=$?
pruefe "anderer Fehler: nur ein Versuch" '(( $(anzahl edit) == 1 ))'
pruefe "anderer Fehler: Notiz in der Warteschlange, Exitcode 0 mit Warnung" '(( rc == 0 )) && grep -q WARNUNG $T/fe && (( $(wc -l < $T/w.txt) == 1 ))'
rm -f $T/w.txt

# 3. Limit hält an: nach 3 Versuchen in die Warteschlange (mit Zeilenumbruch und Tab im Text)
: > $T/aufrufe; print 9 > $T/edit.limit
B notiz PVTI_a $'Zeile 1\n\tZeile 2' 2> $T/fe; rc=$?
pruefe "Limit hält an: 3 Versuche, dann Warteschlange" '(( rc == 0 && $(anzahl edit) == 3 )) && (( $(wc -l < $T/w.txt) == 1 )) && [[ $(cut -f2,3 $T/w.txt) == $'"'"'notiz\tPVTI_a'"'"' ]]'
# Board ganz unlesbar: Notiz und Status mit id direkt in die Warteschlange, Liste scheitert
print 99 > $T/list.limit
B status PVTI_a "In Progress" 2>/dev/null; rc=$?
pruefe "Board unlesbar: Status in die Warteschlange (ein Wort)" '(( rc == 0 )) && [[ $(sed -n 2p $T/w.txt | cut -f2,3) == $'"'"'status\tPVTI_a'"'"' ]] && [[ $(sed -n 2p $T/w.txt | cut -f4 | base64 -D) == arbeit ]]'
B liste >/dev/null 2>&1; rc=$?
pruefe "Board unlesbar: liste scheitert" '(( rc == 1 ))'
B notiz "Mail:" "per Muster" >/dev/null 2>&1; rc=$?
pruefe "Board unlesbar, Muster statt id: Fehler, nicht in die Warteschlange" '(( rc == 1 && $(wc -l < $T/w.txt) == 2 ))'

# 4. nächster Aufruf mit lesbarem Board trägt nach (Text unverändert), Warteschlange leer
: > $T/aufrufe; print 0 > $T/list.limit; print 0 > $T/edit.limit
B liste > $T/aus 2> $T/fe; rc=$?
pruefe "Nachtragen: Notiz und Status nachgetragen, Warteschlange leer" '(( rc == 0 )) && [[ ! -e $T/w.txt ]] && grep -q "2 nachgetragen, 0 offen" $T/fe'
pruefe "Nachtragen: Notiztext mit Umbruch und Tab erhalten" 'grep -q "Text A" $T/aufrufe && grep -q "	Zeile 2" $T/aufrufe'
pruefe "Nachtragen: Status In Progress gesetzt" 'grep -q "single-select-option-id 47fc9ee4" $T/aufrufe'
pruefe "Nachtragen: danach die Liste ausgegeben" 'grep -q "PVTI_a  Bug  In Progress  Mail: Test" $T/aus'

# 5. Nachtragen scheitert erneut: Zeile bleibt (nicht doppelt)
print 9 > $T/edit.kaputt
B notiz PVTI_a "y" 2>/dev/null; print 0 > $T/edit.kaputt; print 1 > $T/edit.kaputt
B liste >/dev/null 2>&1
pruefe "Nachtragen scheitert: Zeile bleibt einmal stehen" '(( $(wc -l < $T/w.txt) == 1 ))'
print 0 > $T/edit.kaputt
pruefe "board.sh nachtragen: trägt nach, dann leer" '[[ $(B nachtragen 2>/dev/null) == "Warteschlange leer" ]] && [[ ! -e $T/w.txt ]]'
exit $F
