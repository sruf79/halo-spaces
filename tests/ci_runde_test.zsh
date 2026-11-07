# Prüfung der CI-Runden des Nachtlaufs (tests/ci-runde.zsh, Eintragen über tests/ci-waechter.sh) ohne
# Claude, ohne Thunderbird, ohne Netz, im Wegwerf-Ordner (gh durch Attrappen ersetzt).
# Aufruf: zsh tests/ci_runde_test.zsh          → je Fall eine Zeile OK/FEHLER, Exitcode 1 bei einem Fehler
#         zsh tests/ci_runde_test.zsh --echt   → zusätzlich nur lesend gegen GitHub: letzte Läufe auf main
#                                                einstufen, Kennzahl und Entscheidung zeigen (kein workflow run,
#                                                kein Board)
emulate -L zsh
setopt extendedglob
ECHT=; [[ $1 == --echt ]] && ECHT=1
HIER=${0:A:h}
T=$(mktemp -d) || exit 1
trap 'rm -rf $T' EXIT
FEHLER=0 N=0
ok() { print "OK      $1"; N=$((N + 1)) }
fehler() { print "FEHLER  $1${2:+ – $2}"; FEHLER=1; N=$((N + 1)) }
pruefe() { # <Name> <Befehl …>: Erfolg = Exitcode 0
  local n=$1; shift
  if eval "$@" >/dev/null 2>&1; then ok $n; else fehler $n; fi
}
export LOG=$T/lauf.log HALO_UEBERSPRUNGEN_LOG=$T/uebersprungen.log HALO_NACHT_DIR=$T/nacht HALO_CI_CACHE=$T/cache
mkdir -p $T/nacht
: > $LOG
source $HIER/lauf-hilfen.zsh
source $HIER/ci-runde.zsh

# --- Läufe als Testdaten: lauf <ID> <Stunden vor jetzt> <Art> [<Ereignis>] ---
# Arten: gruen, macrot, linuxrot (mac/windows übersprungen), release (alle Testjobs übersprungen, success),
# gezielt, wgrot (alles grün, nur windows-github rot), laeuft
JETZT_ISO=2026-11-07T03:00+01:00          # 02:00 UTC
export HALO_JETZT=$JETZT_ISO
JETZT=$(ci_jetzt)
START=$(( JETZT - 5400 ))                 # Nachtlauf seit 01:30
lauf() {
  local id=$1 h=$2 art=$3 ev=${4:-push} t
  t=$(TZ=UTC date -r $(( JETZT - h * 3600 )) +%Y-%m-%dT%H:%M:%SZ)
  jq -n --argjson id $id --arg t $t --arg art $art --arg ev $ev '
    def j($n; $c): {name: $n, conclusion: $c, status: (if $c == "" then "in_progress" else "completed" end), steps: []};
    def testjobs($l; $m; $w): [j("linux (release)"; $l), j("linux (beta)"; $l), j("linux (esr)"; $l), j("mac"; $m), j("windows"; $w)];
    ({gruen: testjobs("success"; "success"; "success"), macrot: testjobs("success"; "failure"; "success"),
      linuxrot: [j("linux (release)"; "success"), j("linux (beta)"; "failure"), j("linux (esr)"; "success"), j("mac"; "skipped"), j("windows"; "skipped")],
      release: testjobs("skipped"; "skipped"; "skipped"), gezielt: testjobs("skipped"; "success"; "skipped"),
      wgrot: testjobs("success"; "success"; "success"), laeuft: testjobs("success"; ""; "")}[$art]) as $tj
    | {databaseId: $id, createdAt: $t, updatedAt: $t, status: (if $art == "laeuft" then "in_progress" else "completed" end),
       conclusion: ({gruen: "success", macrot: "failure", linuxrot: "failure", release: "success", gezielt: "success", wgrot: "success", laeuft: ""}[$art]),
       event: $ev, headSha: "sha\($id)", displayTitle: "Lauf \($id) \($art)",
       jobs: ([{name: "changes", conclusion: "success", status: "completed",
                steps: (if $art == "gezielt" then [{name: "Gezielter Lauf", conclusion: "success"}] else [{name: "Gezielter Lauf", conclusion: "skipped"}] end)}]
              + $tj + [j("windows-github"; (if $art == "wgrot" then "failure" else "success" end))])}'
}
daten() { jq -s . > $T/d.json }          # stdin: Läufe → Datei

# 1. heute (vor 3 Stunden) eine grüne Vollrunde
lauf 10 3 gruen | daten
pruefe "heute CI gelaufen: keine Vollrunde starten" '! vollrunde_entscheiden $T/d.json $START'
pruefe "heute CI gelaufen: Tage seit grün 0" '[[ $(ci_tage_seit_gruen $T/d.json | cut -d" " -f2) == 0 ]]'
pruefe "Bericht-Zeile in Wiener Zeit" '[[ $(ci_gruen_zeile $T/d.json) == "Letzte vollständig grüne Runde: 07.11.2026 00:00 (vor 0 Tagen)" ]]'

# 2. gestern, innerhalb von 24 Stunden (vor 23 Stunden), rot – lief aber vollständig
lauf 11 23 macrot | daten
pruefe "gestern (23 h) rot vollständig: keine Vollrunde starten" '! vollrunde_entscheiden $T/d.json $START'

# 3. vor 25 Stunden
lauf 12 25 gruen | daten
pruefe "vor 25 Stunden: Vollrunde starten" 'vollrunde_entscheiden $T/d.json $START'
pruefe "vor 25 Stunden: Tage seit grün 1" '[[ $(ci_tage_seit_gruen $T/d.json | cut -d" " -f2) == 1 ]]'

# 4. nur Release-Commit (success, alle Testjobs übersprungen) – zählt weder als Vollrunde noch als grün
{ lauf 13 2 release; lauf 12 25 gruen } | daten
pruefe "nur Release-Commit: Vollrunde starten" 'vollrunde_entscheiden $T/d.json $START'
pruefe "Release-Commit eingestuft als übersprungen" '[[ $(ci_einstufen $T/d.json | grep "^13 ") == "13 übersprungen"* ]]'
pruefe "Release-Commit zählt nicht als grün (letzte grüne vor 25 h)" '[[ $(ci_tage_seit_gruen $T/d.json | cut -d" " -f2) == 1 ]]'
lauf 13 2 release | daten
pruefe "nur Release-Commit (success) in den Daten: keine grüne Runde" '! ci_tage_seit_gruen $T/d.json'

# 5. nur ein gezielter Lauf
{ lauf 14 2 gezielt workflow_dispatch; lauf 12 25 gruen } | daten
pruefe "nur gezielter Lauf: Vollrunde starten" 'vollrunde_entscheiden $T/d.json $START'
pruefe "gezielter Lauf eingestuft als gezielt" '[[ $(ci_einstufen $T/d.json | grep "^14 ") == "14 gezielt"* ]]'
# der vom Nachtlauf gestartete Lauf (ziel=alle, workflow_dispatch, nicht gezielt) zählt
lauf 15 2 gruen workflow_dispatch | daten
pruefe "ziel=alle von Hand zählt als Vollrunde" '! vollrunde_entscheiden $T/d.json $START'

# 6. rot/grün gemischt: grün vor 3 Tagen, danach rot (mac), Linux rot in der Nacht
{ lauf 20 74 gruen; lauf 21 30 macrot; lauf 22 1 linuxrot } | daten
pruefe "gemischt: Tage seit grün 3" '[[ $(ci_tage_seit_gruen $T/d.json | cut -d" " -f2) == 3 ]]'
pruefe "gemischt: Linux rot (mac/windows übersprungen) ist keine Vollrunde" '! ci_vollrunde_24h $T/d.json'
pruefe "gemischt: rote Läufe der Nacht = nur 22" '[[ $(ci_rote_laeufe $T/d.json $START) == 22 ]]'

# 7. windows-github rot wird übergangen
lauf 30 2 wgrot | daten
pruefe "windows-github rot: Lauf gilt als grün" 'ci_tage_seit_gruen $T/d.json'
pruefe "windows-github rot: kein roter Lauf" '[[ -z $(ci_rote_laeufe $T/d.json $START) ]]'

# 9. nach 04:30 nicht neu starten (Grenze in Wiener Zeit)
lauf 12 26 gruen | daten
HALO_JETZT=2026-11-07T04:31+01:00 pruefe "04:31: keine Vollrunde mehr" '! vollrunde_entscheiden $T/d.json $START'
HALO_JETZT=2026-11-07T04:29+01:00 pruefe "04:29: Vollrunde starten" 'vollrunde_entscheiden $T/d.json $START'
HALO_JETZT=2026-11-07T03:31+00:00 pruefe "03:31 UTC = 04:31 Wien: keine Vollrunde" '! vollrunde_entscheiden $T/d.json $START'

# 10. Nachtlauf wartet schon auf seinen Push-Lauf (läuft) → nicht starten; reiner Release-Push zählt nicht
{ lauf 40 0 laeuft; lauf 12 26 gruen } | daten
pruefe "eigener Push-Lauf läuft: keine Vollrunde" '! vollrunde_entscheiden $T/d.json $START'
pruefe "eigener Push-Lauf: Grund nennt den Lauf" '[[ $(vollrunde_entscheiden $T/d.json $START) == *"Lauf 40"* ]]'
{ lauf 41 0 release; lauf 12 26 gruen } | daten
pruefe "eigener Release-Push ohne Tests: Vollrunde starten" 'vollrunde_entscheiden $T/d.json $START'
{ lauf 42 1 linuxrot; lauf 12 26 gruen } | daten
pruefe "eigener Push-Lauf rot (Linux): kein zusätzlicher Dispatch" '! vollrunde_entscheiden $T/d.json $START'

# 11. Lauf-ID des gestarteten Laufs: genau ein Treffer auf dem SHA
TR='[{"databaseId":1,"headSha":"aaa"},{"databaseId":2,"headSha":"bbb"},{"databaseId":3,"headSha":"bbb"}]'
pruefe "Lauf-ID: genau ein Treffer" '[[ $(ci_lauf_aus_treffern $TR aaa) == 1 ]]'
pruefe "Lauf-ID: kein Treffer → 1" 'ci_lauf_aus_treffern $TR ccc; (( $? == 1 ))'
pruefe "Lauf-ID: mehrere Treffer → 2" 'ci_lauf_aus_treffern $TR bbb; (( $? == 2 ))'

# --- Daten holen und Abschluss mit gh-Attrappe (Funktion überdeckt das Programm) ---
FIX=$T/fix; mkdir -p $FIX
{ lauf 50 1 macrot; lauf 51 30 gruen } | jq -s . > $FIX/alle.json
GH_FEHLER=
gh() {   # Attrappe: Läufe aus $FIX/alle.json; workflow run vermerkt den Start in $FIX/dispatch
  local f= out
  (( ${@[(I)--jq]} )) && f=${@[${@[(i)--jq]}+1]}
  [[ -n $GH_FEHLER ]] && return 1
  case "$1 $2" in
    "run list") if [[ $* == *workflow_dispatch* ]]; then out='[{"databaseId":99,"headSha":"main1"}]'
                else out=$(jq 'map(del(.jobs))' $FIX/alle.json); fi ;;
    "run view") if [[ $* == *"--json status"* ]]; then out='{"status":"completed"}'
                else out=$(jq --argjson i $3 '.[] | select(.databaseId == $i) | {jobs}' $FIX/alle.json); fi ;;
    "api "*) out='{"sha":"main1"}' ;;
    "workflow run") print 1 >> $FIX/dispatch; (( ${GH_DISPATCH_RC:-0} )) && return 1
                    [[ -s $FIX/neu.json ]] && cp $FIX/neu.json $FIX/alle.json; return 0 ;;
    *) return 1 ;;
  esac
  if [[ -n $f ]]; then print -r -- $out | jq -r $f; else print -r -- $out; fi
}
pruefe "Daten holen: Jobs je Lauf zusammengeführt" 'ci_laeufe_holen $T/h.json && [[ $(jq "[.[] | .jobs | length] | min" $T/h.json) -ge 6 ]]'
pruefe "Daten holen: abgeschlossene Läufe zwischengespeichert" '[[ -s $HALO_CI_CACHE/50.json ]]'
pruefe "Daten holen: gh nicht lesbar → Rückgabe 1" 'GH_FEHLER=1 ci_laeufe_holen $T/h2.json; (( $? == 1 ))'

# 8. Eintragen über den CI-Wächter: Fehler bricht nicht ab, Liste der eingetragenen Läufe
mkdir -p $T/w
print 'exit ${WAECHTER_RC:-0}' > $T/w/ci-waechter.sh
CI_HIER_ALT=$CI_HIER CI_HIER=$T/w
: > $HALO_UEBERSPRUNGEN_LOG
WAECHTER_RC=3 ci_rot_eintragen 50 51 >/dev/null 2>&1
pruefe "Eintrag scheitert: zwei EINTRAG-FEHLER-Zeilen, weiter" '[[ $(grep -c "EINTRAG-FEHLER nachtlauf Lauf 5[01]" $HALO_UEBERSPRUNGEN_LOG) == 2 ]]'
WAECHTER_RC=0 ci_rot_eintragen 50 >/dev/null 2>&1
pruefe "Eintrag gelingt: Lauf in <datum>.ci-eingetragen" 'grep -qx 50 $T/nacht/*.ci-eingetragen'

# 12. Abschluss: Fehler im neuen Teil brechen nichts ab
: > $HALO_UEBERSPRUNGEN_LOG
A=$(GH_FEHLER=1 ci_nacht_abschluss $START $(( JETZT + 21600 )) 2>/dev/null); RC=$?
pruefe "Abschluss ohne gh: Rückgabe 0" '(( RC == 0 ))'
pruefe "Abschluss ohne gh: VOLLRUNDE-FEHLER im uebersprungen.log" 'grep -q "VOLLRUNDE-FEHLER nachtlauf gh" $HALO_UEBERSPRUNGEN_LOG'
# rot in der Nacht, letzte Vollrunde vor 30 h, kein eigener Push … Lauf 50 ist aber ein eigener Push-Lauf (rot) → kein Dispatch
A=$(ci_nacht_abschluss $START $(( JETZT + 21600 )) 2>/dev/null)
pruefe "Abschluss: roter Lauf der Nacht wird eingetragen" '[[ $A == *"Rote CI-Läufe der Nacht: 50"* ]]'
pruefe "Abschluss: eigener Push-Lauf → kein Dispatch" '[[ ! -e $FIX/dispatch ]] && [[ $A == *"Vollrunde: der Nachtlauf hat CI-auslösend gepusht"* ]]'
pruefe "Abschluss: Bericht-Zeile vorhanden" '[[ $A == *"Letzte vollständig grüne Runde: "*"(vor 1 Tag)"* ]]'
# keine Nachtläufe, letzte Vollrunde vor 30 h → Dispatch; gestarteter Lauf 99 über SHA gefunden
lauf 51 30 gruen | jq -s . > $FIX/alle.json
jq '. + [{databaseId: 99, createdAt: "2026-11-07T02:00:00Z", updatedAt: "2026-11-07T02:00:00Z", status: "completed", conclusion: "success", event: "workflow_dispatch", headSha: "main1", displayTitle: "Vollrunde", jobs: .[0].jobs}]' $FIX/alle.json > $FIX/neu.json
A=$(HALO_CI_VERSUCHE=1 HALO_CI_PAUSE=0 HALO_CI_POLL=0 ci_nacht_abschluss $START $(( JETZT + 21600 )) 2>/dev/null)
pruefe "Abschluss: Vollrunde gestartet und Lauf 99 gefunden" '[[ $A == *"Vollrunde: Lauf 99"* ]]'
pruefe "Abschluss: genau ein Dispatch" '[[ $(wc -l < $FIX/dispatch) -eq 1 ]]'
lauf 51 30 gruen | jq -s . > $FIX/alle.json; rm -f $FIX/neu.json $FIX/dispatch
: > $HALO_UEBERSPRUNGEN_LOG
A=$(GH_DISPATCH_RC=1 ci_nacht_abschluss $START $(( JETZT + 21600 )) 2>/dev/null); RC=$?
pruefe "Dispatch scheitert: VOLLRUNDE-FEHLER, Rückgabe 0, Bericht-Zeile trotzdem" '(( RC == 0 )) && grep -q "VOLLRUNDE-FEHLER nachtlauf gh workflow run" $HALO_UEBERSPRUNGEN_LOG && [[ $A == *"Letzte vollständig grüne Runde"* ]]'
CI_HIER=$CI_HIER_ALT

# 8b. CI-Wächter: offener Eintrag zur selben Prüfung wird ergänzt (keine Dublette), sonst neu; Board nicht lesbar → Exitcode 3
W=$T/home; mkdir -p $W/.local/bin $W/halo-aufgaben $W/halo-nacht
cat > $W/.local/bin/gh <<'EOF'
#!/bin/zsh
f=; (( ${@[(I)--jq]} )) && f=${@[${@[(i)--jq]}+1]}
case "$1 $2" in
  "run list") out='[{"databaseId":7,"status":"completed","conclusion":"failure","createdAt":"2026-11-07T01:00:00Z","headSha":"abcdef1234"}]' ;;
  "run view")
    if (( ${@[(I)--log-failed]} )); then print "mac	Test hell	2026-11-07T01:00:00Z FEHLER  Kalender: Scrollen ruckelt – 5 Bilder"; exit 0; fi
    (( ${@[(I)--log]} )) && exit 0
    out='{"headSha":"abcdef1234","displayTitle":"Test","url":"https://example.invalid/7","jobs":[{"name":"changes","conclusion":"success","steps":[]},{"name":"mac","conclusion":"failure","steps":[{"name":"Test hell","conclusion":"failure"}]},{"name":"windows-github","conclusion":"failure","steps":[]}]}' ;;
  "api "*) out='{"content":"'$(printf 'jobs:\n  windows-github:\n    continue-on-error: true\n' | base64)'"}' ;;
  "project item-list") [[ -n $BOARD_KAPUTT ]] && exit 1; out=$(<$BOARD_DATEI) ;;
  "project item-edit"|"project item-create") print -r -- "$*" >> $AUFRUFE; [[ $2 == item-create ]] && out='{"id":"NEU"}' || exit 0 ;;
  *) exit 1 ;;
esac
if [[ -n $f ]]; then print -r -- $out | jq -r $f; else print -r -- $out; fi
EOF
print 'print "nicht gesendet: Test"' > $W/.local/bin/claude
chmod 755 $W/.local/bin/gh $W/.local/bin/claude
waechter() { HOME=$W AUFRUFE=$T/aufrufe HALO_UEBERSPRUNGEN_LOG=$T/w-ue.log zsh $HIER/ci-waechter.sh --lauf 7 >/dev/null 2>&1 }
print '{"items":[{"id":"PI_1","status":"Todo","title":"Tests: CI rot – mac: Kalender: Scrollen ruckelt","content":{"id":"DI_1","body":"alt"}}]}' > $T/board1.json
: > $T/aufrufe
BOARD_DATEI=$T/board1.json waechter; RC=$?
pruefe "Wächter --lauf: offener Eintrag wird ergänzt" '(( RC == 0 )) && grep -q "item-edit --id DI_1" $T/aufrufe && ! grep -q item-create $T/aufrufe'
print '{"items":[{"id":"PI_2","status":"Done","title":"Tests: CI rot – mac: Kalender: Scrollen ruckelt","content":{"id":"DI_2","body":"alt"}}]}' > $T/board2.json
: > $T/aufrufe
BOARD_DATEI=$T/board2.json waechter; RC=$?
pruefe "Wächter --lauf: ohne offenen Eintrag neu angelegt" '(( RC == 0 )) && grep -q "item-create.*Tests: CI rot – mac: Kalender: Scrollen ruckelt" $T/aufrufe'
pruefe "Wächter --lauf: windows-github rot ohne Eintrag" '! grep -q windows-github $T/aufrufe'
: > $T/aufrufe
BOARD_KAPUTT=1 BOARD_DATEI=$T/board1.json waechter; RC=$?
pruefe "Wächter --lauf: Board nicht lesbar → Exitcode 3, nichts angelegt" '(( RC == 3 )) && [[ ! -s $T/aufrufe ]]'

# --- nur lesend gegen GitHub (--echt) ---
if [[ -n $ECHT ]]; then
  unfunction gh; unset HALO_JETZT
  export HALO_CI_CACHE=$T/echt-cache
  if ci_laeufe_holen $T/echt.json 15; then
    print "Läufe auf main (lesend):"; ci_einstufen $T/echt.json | sed 's/^/  /'
    pruefe "echt: jeder Lauf eingestuft" '[[ $(ci_einstufen $T/echt.json | wc -l) -eq $(jq length $T/echt.json) ]]'
    pruefe "echt: Release-Commit (Titel halo.spaces x.y.z, fertig) nie grün" '! ci_einstufen $T/echt.json | grep -E "^[0-9]+ grün halo\.spaces [0-9]"'
    Z=$(ci_gruen_zeile $T/echt.json); print "  $Z"
    pruefe "echt: Kennzahl plausibel" '[[ $Z == "Letzte vollständig grüne Runde: "* ]]'
    print "  Vollrunde jetzt (Start 01:30): $(vollrunde_entscheiden $T/echt.json $(date -j -v1H -v30M -v0S +%s))"
  else
    fehler "echt: gh run list/view nicht lesbar"
  fi
fi

(( FEHLER )) && exit 1
print "OK CI-Runden: $N Fälle grün"
