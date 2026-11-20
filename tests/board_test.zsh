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
[[ "$1 $2" == "api graphql" ]] && art=node
[[ "$1 $2" == "api graphql" && "$*" == *updateProjectV2DraftIssue* ]] && art=mut
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
if [[ $art == node ]]; then   # (Einzelabfrage per id: gh wendet --jq an, hier gleich das Ergebnis)
  i=${${(M)@:#i=*}#i=}
  jq -c --arg i $i '.items[] | select(.id == $i) | {id, archiviert: (.archiviert // false), typ, status, title, content: {id: .content.id, body: .content.body}}' $T/board.json
fi
if [[ $art == mut ]]; then   # (Titel bzw. Text eines Entwurfs ersetzen, wie die echte Mutation)
  d=${${(M)@:#d=*}#d=}; v=${${(M)@:#v=*}#v=}
  [[ "$*" == *title:* ]] && feld=title || feld=body
  jq -c --arg d $d --arg v "$v" --arg f $feld '(.items[] | select(.content.id == $d)) |= (if $f == "title" then .title = $v else .content.body = $v end)' $T/board.json > $T/board.neu && mv $T/board.neu $T/board.json
fi
exit 0
S
chmod +x $T/gh
print -r -- '{"items":[{"id":"PVTI_a","title":"Mail: Test","status":"In Progress","typ":"Bug","content":{"id":"DI_a","body":"Text A"}}]}' > $T/board.json
export GH_WDH_BEFEHL=$T/gh GH_WDH_MAX_S=0 HALO_BOARD_WARTESCHLANGE=$T/w.txt HALO_ARCHIV=$T/archiv.md
export HALO_BOARD_ZWISCHEN=$T/zw.json HALO_BOARD_ZWISCHEN_S=0   # (Zwischenspeicher in Abschnitt 6 eigens geprüft)
export HALO_IN_ARBEIT=$T/in-arbeit.tsv   # (nie die echte Datei des Leitstands)
export HALO_BOARD_AENDERUNGEN=$T/aenderungen.log   # (nie das echte Änderungsprotokoll)
B() { zsh $HIER/board.sh "$@" }
anzahl() { local n=$(grep -c "^$1 " $T/aufrufe 2>/dev/null); print ${n:-0} }

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
print 99 > $T/list.limit; print 99 > $T/node.limit
B status PVTI_a "In Progress" 2>/dev/null; rc=$?
pruefe "Board unlesbar: Status in die Warteschlange (ein Wort)" '(( rc == 0 )) && [[ $(sed -n 2p $T/w.txt | cut -f2,3) == $'"'"'status\tPVTI_a'"'"' ]] && [[ $(sed -n 2p $T/w.txt | cut -f4 | base64 -D) == arbeit ]]'
B liste >/dev/null 2>&1; rc=$?
pruefe "Board unlesbar: liste scheitert" '(( rc == 1 ))'
B notiz "Mail:" "per Muster" >/dev/null 2>&1; rc=$?
pruefe "Board unlesbar, Muster statt id: Fehler, nicht in die Warteschlange" '(( rc == 1 && $(wc -l < $T/w.txt) == 2 ))'

# 4. nächster Aufruf mit lesbarem Board trägt nach (Text unverändert), Warteschlange leer
: > $T/aufrufe; print 0 > $T/list.limit; print 0 > $T/node.limit; print 0 > $T/edit.limit
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

# 6. Zwischenspeicher: lesende Befehle laden das Board höchstens einmal je Minute, Schreibbefehle halten ihn aktuell
export HALO_BOARD_ZWISCHEN_S=60; rm -f $T/zw.json
print -r -- '{"items":[{"id":"PVTI_a","title":"Mail: Test","status":"In Progress","typ":"Bug","content":{"id":"DI_a","body":"Text A"}},{"id":"PVTI_b","title":"Kalender: Zwei","status":"Todo","typ":"Bug","content":{"id":"DI_b","body":"Text B"}}]}' > $T/board.json
: > $T/aufrufe
B liste >/dev/null 2>&1; B zeige PVTI_a >/dev/null 2>&1; B suche Mail >/dev/null 2>&1
pruefe "Zwischenspeicher: drei lesende Aufrufe, ein Laden" '(( $(anzahl list) == 1 ))'
B zeige PVTI_a PVTI_b > $T/aus 2>&1
pruefe "zeige mit mehreren Einträgen: beide ausgegeben" 'grep -q "Text A" $T/aus && grep -q "Text B" $T/aus && (( $(anzahl list) == 1 ))'
B status PVTI_b ok >/dev/null 2>&1
B liste > $T/aus 2>&1
pruefe "status ohne neues Laden, Liste danach mit neuem Status" '(( $(anzahl list) == 1 )) && grep -q "PVTI_b  Bug  Wartet auf OK" $T/aus'
B notiz PVTI_a "neu" >/dev/null 2>&1
pruefe "notiz mit id: Einzelabfrage, die Liste wird nicht geladen" '(( $(anzahl list) == 1 && $(anzahl node) == 1 ))'
B zeige PVTI_a > $T/aus 2>&1
pruefe "Notiz im Zwischenspeicher nachgeführt (ohne Laden)" '(( $(anzahl list) == 1 )) && grep -q "^neu" $T/aus'
B status PVTI_b done abc1234 >/dev/null 2>&1; B liste > $T/aus 2>&1
pruefe "Done: archiviert, aus dem Zwischenspeicher entfernt, kein Laden" '(( $(anzahl list) == 1 )) && ! grep -q PVTI_b $T/aus'
touch -t 202001010000 $T/zw.json; B liste >/dev/null 2>&1
pruefe "Zwischenspeicher älter als 60 s: neu geladen" '(( $(anzahl list) == 2 ))'
rm -f $T/zw.json; l=$(anzahl list); n=$(anzahl node)
print -r -- '{"items":[{"id":"PVTI_a","title":"Mail: Test","status":"In Progress","typ":"Bug","content":{"id":"DI_a","body":"Text A"}}]}' > $T/board.json
B status PVTI_a todo > $T/aus 2>&1; rc=$?
pruefe "status mit id ohne Zwischenspeicher: Einzelabfrage, Liste nicht geladen" '(( rc == 0 )) && (( $(anzahl list) == l )) && (( $(anzahl node) == n + 1 )) && grep -q "Status todo: Mail: Test" $T/aus'
export HALO_BOARD_ZWISCHEN_S=0

# 7. Leitstand: status arbeit merkt sich Eintrag, Titel und Prozesskette; Notiz „wartet auf Push“, todo und Done räumen
rm -f $T/in-arbeit.tsv $T/w.txt $T/*.limit $T/*.kaputt
print -r -- '{"items":[{"id":"PVTI_a","title":"Mail: Test","status":"Todo","typ":"Bug","content":{"id":"DI_a","body":"Text A"}},{"id":"PVTI_b","title":"Kalender: Zwei","status":"Todo","typ":"Bug","content":{"id":"DI_b","body":"Text B"}}]}' > $T/board.json
B status PVTI_a in_progress > $T/aus 2>&1; rc=$?
pruefe "in_progress: Status gesetzt, Zeile mit id, Titel, eigener Prozesskette" '(( rc == 0 )) && grep -q "Status arbeit: Mail: Test" $T/aus && [[ $(cut -f2,3 $T/in-arbeit.tsv) == $'"'"'PVTI_a\tMail: Test'"'"' ]] && [[ ,$(cut -f4 $T/in-arbeit.tsv), == *,$$,* ]]'
B status PVTI_b arbeit >/dev/null 2>&1; B status PVTI_a arbeit >/dev/null 2>&1
pruefe "arbeit zweimal: eine Zeile je Eintrag" '(( $(wc -l < $T/in-arbeit.tsv) == 2 )) && (( $(grep -c PVTI_a $T/in-arbeit.tsv) == 1 ))'
B notiz PVTI_a "committet abc1234, wartet auf Push/CI" >/dev/null 2>&1
pruefe "Notiz „wartet auf Push“ räumt nur diesen Eintrag" '! grep -q PVTI_a $T/in-arbeit.tsv && grep -q PVTI_b $T/in-arbeit.tsv'
B status PVTI_b todo >/dev/null 2>&1
pruefe "todo räumt" '! grep -q PVTI_b $T/in-arbeit.tsv'
B status PVTI_a arbeit >/dev/null 2>&1; B status PVTI_a done abc1234 >/dev/null 2>&1
pruefe "done räumt" '! grep -q PVTI_a $T/in-arbeit.tsv'
B status PVTI_b arbeit >/dev/null 2>&1; print 99 > $T/node.limit; print 99 > $T/list.limit
B status PVTI_b ok >/dev/null 2>&1; rm -f $T/*.limit
pruefe "Status in der Warteschlange räumt trotzdem" '! grep -q PVTI_b $T/in-arbeit.tsv'

<<<<<<< HEAD
# 8. titel und text: ersetzen, alter Wert ins Protokoll, Typ und Status bleiben, Sperren, Warteschlange, Nachtragen
rm -f $T/w.txt $T/*.limit(N) $T/*.kaputt(N) $T/aenderungen.log
print -r -- '{"items":[{"id":"PVTI_a","title":"Mail: Test","status":"Todo","typ":"Bug","content":{"id":"DI_a","body":"Zeile 1\nZeile 2"}},{"id":"PVTI_b","title":"Kalender: Zwei","status":"Todo","typ":"Bug","content":{"id":"DI_b","body":"Text B"}},{"id":"PVTI_c","title":"Kalender: Drei","status":"Todo","typ":"Bug","content":{"id":"DI_c","body":"Text C"}},{"id":"PVTI_x","title":"Alt: archiviert","status":"Todo","typ":"Bug","archiviert":true,"content":{"id":"DI_x","body":"X"}},{"id":"PVTI_d","title":"Alt: erledigt","status":"Done","typ":"Bug","content":{"id":"DI_d","body":"D"}}]}' > $T/board.json
: > $T/aufrufe
B titel PVTI_a "Mail: Neuer Titel" > $T/aus 2>&1; rc=$?
pruefe "titel mit id: ersetzt, Typ und Status unverändert, keine Feldänderung" '(( rc == 0 )) && grep -q "Titel geändert: Mail: Neuer Titel" $T/aus && [[ $(jq -r ".items[0] | .title, .typ, .status, .content.body" $T/board.json) == $'"'"'Mail: Neuer Titel\nBug\nTodo\nZeile 1\nZeile 2'"'"' ]] && (( $(anzahl edit) == 0 && $(anzahl mut) == 1 ))'
pruefe "titel: alter Wert im Protokoll" '[[ $(cut -f2-5 $T/aenderungen.log) == $'"'"'titel\tPVTI_a\tMail: Test\tMail: Neuer Titel'"'"' ]]'
B text "Mail: Neuer" $'Ganz neu\nmit Umbruch' > $T/aus 2>&1; rc=$?
pruefe "text per Muster: ganzer Text ersetzt, Titel bleibt" '(( rc == 0 )) && [[ $(jq -r ".items[0].content.body" $T/board.json) == $'"'"'Ganz neu\nmit Umbruch'"'"' ]] && [[ $(jq -r ".items[0].title" $T/board.json) == "Mail: Neuer Titel" ]]'
pruefe "text: alter Wert einzeilig im Protokoll (Umbruch als Zeichenfolge)" '[[ $(sed -n 2p $T/aenderungen.log | cut -f4) == "Zeile 1\\nZeile 2" ]] && (( $(wc -l < $T/aenderungen.log) == 2 ))'
B text PVTI_a "$(printf "%0300d" 0)" >/dev/null 2>&1
pruefe "Protokoll: neuer Wert auf 200 Zeichen gekürzt" '(( $(sed -n 3p $T/aenderungen.log | cut -f5 | tr -d "\n" | wc -c) == 200 ))'
: > $T/aufrufe; l=$(wc -l < $T/aenderungen.log)
B titel PVTI_a "Mail: Neuer Titel" > $T/aus 2>&1; rc=$?
pruefe "gleicher Wert: nichts geschrieben, kein Protokoll" '(( rc == 0 && $(anzahl mut) == 0 && $(wc -l < $T/aenderungen.log) == l )) && grep -q unverändert $T/aus'
for fall in "leerer Titel|titel PVTI_b ' '" "Titel mit Umbruch|titel PVTI_b \$'a\\nb'" "Titel über 256 Zeichen|titel PVTI_b \$(printf %0257d 0)" "leerer Text|text PVTI_b ''" "Muster mit mehreren Treffern|titel Kalender: 'Kalender: Neu'" "ohne neuen Wert|titel PVTI_b"; do
  eval "B ${fall#*|}" >/dev/null 2>&1; rc=$?
  pruefe "abgelehnt: ${fall%%|*}" '(( rc == 1 && $(anzahl mut) == 0 )) && [[ $(jq -r ".items[1].title, .items[2].title" $T/board.json) == $'"'"'Kalender: Zwei\nKalender: Drei'"'"' ]]'
done
B titel PVTI_b "$(printf %0256d 0)" >/dev/null 2>&1; rc=$?
pruefe "Titel mit genau 256 Zeichen erlaubt" '(( rc == 0 && $(anzahl mut) == 1 ))'
B titel PVTI_x "Neu" >/dev/null 2>&1; rc1=$?; B text PVTI_d "Neu" >/dev/null 2>&1; rc2=$?
pruefe "archivierter und Done-Eintrag: abgelehnt (Exitcode 3), nichts geschrieben" '(( rc1 == 3 && rc2 == 3 && $(anzahl mut) == 1 ))'
# Schreiben scheitert: Warteschlange, Exitcode 0 mit Warnung, kein eigenes Wiederholen
print 1 > $T/mut.kaputt; : > $T/aufrufe
B titel PVTI_c "Kalender: Drei neu" 2> $T/fe; rc=$?
pruefe "titel scheitert: Warteschlange, Warnung, Exitcode 0, ein Versuch" '(( rc == 0 && $(anzahl mut) == 1 )) && grep -q WARNUNG $T/fe && [[ $(cut -f2,3 $T/w.txt) == $'"'"'titel\tPVTI_c'"'"' ]]'
print 99 > $T/node.limit; print 99 > $T/list.limit
B text PVTI_c $'Neuer Text C\nzweite Zeile' 2>/dev/null; rc=$?
pruefe "Board unlesbar: text mit id in die Warteschlange" '(( rc == 0 )) && [[ $(sed -n 2p $T/w.txt | cut -f2,3) == $'"'"'text\tPVTI_c'"'"' ]]'
B titel "Kalender: Drei" "x" >/dev/null 2>&1; rc=$?
pruefe "Board unlesbar, Muster: Fehler, nicht in die Warteschlange" '(( rc == 1 && $(wc -l < $T/w.txt) == 2 ))'
rm -f $T/*.limit(N) $T/*.kaputt(N); : > $T/aufrufe
B nachtragen > $T/aus 2> $T/fe
pruefe "nachtragen: titel und text nachgetragen, Warteschlange leer" '[[ ! -e $T/w.txt ]] && grep -q "2 nachgetragen, 0 offen" $T/fe && [[ $(jq -r ".items[2].title" $T/board.json) == "Kalender: Drei neu" ]] && [[ $(jq -r ".items[2].content.body" $T/board.json) == $'"'"'Neuer Text C\nzweite Zeile'"'"' ]]'
# nachtragen idempotent: dieselben Zeilen noch einmal → nichts geschrieben
z1=$(print -rn -- "Kalender: Drei neu" | base64); print -r -- "2026-11-20 21:00:00	titel	PVTI_c	$z1	x" > $T/w.txt
: > $T/aufrufe; B nachtragen >/dev/null 2>&1
pruefe "nachtragen ein zweites Mal: Wert steht schon, keine Mutation, Zeile weg" '(( $(anzahl mut) == 0 )) && [[ ! -e $T/w.txt ]]'
# titel für einen inzwischen archivierten Eintrag: Zeile verworfen statt ewig offen
print -r -- "2026-11-20 21:00:00	titel	PVTI_x	$z1	x" > $T/w.txt
B nachtragen >/dev/null 2> $T/fe
pruefe "nachtragen: archivierter Eintrag verworfen" '[[ ! -e $T/w.txt ]] && grep -q verworfen $T/fe'
# ein späterer direkter titel löscht den älteren aus der Warteschlange (sonst überschriebe das Nachtragen ihn)
z2=$(print -rn -- "Kalender: Zwischenstand" | base64); print -r -- "2026-11-20 21:00:00	titel	PVTI_c	$z2	x" > $T/w.txt
export HALO_BOARD_ZWISCHEN_S=60; print -r -- "$(<$T/board.json)" > $T/zw.json
B titel PVTI_c "Kalender: Endstand" >/dev/null 2>&1
export HALO_BOARD_ZWISCHEN_S=0
pruefe "direkter titel räumt älteren titel derselben id aus der Warteschlange" '[[ ! -e $T/w.txt ]] && [[ $(jq -r ".items[2].title" $T/board.json) == "Kalender: Endstand" ]]'
pruefe "Aufrufhilfe nennt titel und text" 'B 2>/dev/null | grep -q "board.sh titel <id|Muster>" && B 2>/dev/null | grep -q "board.sh text <id|Muster>"'
=======
# 8. export mit Anlagedatum und Statuswechsel (Board-Eintrag „Ablauf: Alter der Einträge wirksam machen …“, 20.11.2026)
export HALO_BOARD_ALTER=$T/alter.json HALO_BOARD_ALTER_LEITSTAND=$T/leitstand.json
rm -f $T/w.txt $T/alter.json $T/leitstand.json $T/*.limit(N) $T/*.kaputt(N)
B export > $T/aus 2>&1; rc=$?
pruefe "export ohne Datumsquelle: createdAt und statusSeit null, kein Abbruch" '(( rc == 0 )) && [[ $(jq -c "[.items[] | [.createdAt, .statusSeit]] | unique" $T/aus) == "[[null,null]]" ]]'
print -r -- '[{"id":"PVTI_a","createdAt":"2026-11-01T10:00:00Z","statusSeit":"2026-11-10T09:00:00Z"}]' > $T/alter.json
: > $T/aufrufe; B export > $T/aus 2>&1
pruefe "export: Datum aus dem frischen Zwischenspeicher, keine Abfrage" '[[ $(jq -r ".items[] | select(.id == \"PVTI_a\") | \"\(.createdAt) \(.statusSeit)\"" $T/aus) == "2026-11-01T10:00:00Z 2026-11-10T09:00:00Z" ]] && ! grep -q "api graphql --paginate" $T/aufrufe'
touch -t 202001010000 $T/alter.json
print -r -- '[{"id":"PVTI_b","createdAt":"2026-11-05T10:00:00Z","fieldValueByName":{"name":"Todo","updatedAt":"2026-11-06T10:00:00Z"}}]' > $T/leitstand.json
: > $T/aufrufe; B export > $T/aus 2>&1
pruefe "export: jüngerer Leitstand-Stand zählt, keine Abfrage" '[[ $(jq -r ".items[] | select(.id == \"PVTI_b\") | \"\(.createdAt) \(.statusSeit)\"" $T/aus) == "2026-11-05T10:00:00Z 2026-11-06T10:00:00Z" ]] && ! grep -q "api graphql --paginate" $T/aufrufe'
touch -t 202001010000 $T/alter.json $T/leitstand.json
: > $T/aufrufe; B export > $T/aus 2>&1; rc=$?
pruefe "export: alter Stand → Abfrage; liefert sie nichts, bleibt der alte Stand" '(( rc == 0 )) && grep -q "api graphql --paginate" $T/aufrufe && [[ $(jq -r ".items[] | select(.id == \"PVTI_b\") | .createdAt" $T/aus) == "2026-11-05T10:00:00Z" ]]'
>>>>>>> fc8d8632 (Ablauf: Alters-Zuschlag per Skript, board.sh export liefert Anlagedatum und Statuswechsel, tests/haeufung.py gibt +0,5 Nutzenstufe je volle 7 Tage (höchstens +1,5) im Abschnitt „Alter (Skript)“ aus; Morgenbrief-Vorschau rechnet das Alter aus dem Anlagedatum)
exit $F
