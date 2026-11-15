#!/bin/zsh
# Prüfung der Inaktivitätsregel (tests/inaktivitaet.sh) ohne Claude, ohne Thunderbird, ohne Netz, im
# Wegwerf-Ordner: gh ist eine Shell-Funktion (Attrappe) mit Issues und Kommentaren als Dateien; das echte
# gh wird nie aufgerufen. Aufruf: zsh tests/inaktivitaet_test.zsh → je Fall eine Zeile OK/FEHLER,
# Exitcode 1 bei einem Fehler.
emulate -L zsh
HIER=${0:A:h}
T=$(mktemp -d) || exit 1
trap 'rm -rf $T' EXIT
FEHLER=0
ok() { print "OK      $1" }
fehler() { print "FEHLER  $1${2:+ – $2}"; FEHLER=1 }
pruefe() { local n=$1; shift; if eval "$@" >/dev/null 2>&1; then ok $n; else fehler $n; fi }

export HALO_JETZT=2026-11-15T12:00+01:00 HALO_INA_AUSNAHMEN=$T/ausnahmen.txt HALO_INA_LOG=$T/inaktivitaet.log
INA_NUR_FUNKTIONEN=1 source $HIER/inaktivitaet.sh
JETZT=$(ci_jetzt)
MARKE='If we do not hear back within a week, we will close this issue due to inactivity.'
vor() { TZ=UTC date -r $(( JETZT - $1 * 86400 )) +%Y-%m-%dT%H:%M:%SZ }   # <Tage> → created_at

# --- Daten: offene Issues/PRs und Kommentare je Nummer ---
mkdir -p $T/gh
k() { jq -n --arg l $1 --arg t "$(vor $2)" --arg b $3 --argjson bot ${4:-false} '{user: {login: $l, type: (if $bot then "Bot" else "User" end)}, created_at: $t, body: $b}' }
issue() {   # <n> <autor> <labels JSON> [pr] ; Kommentare danach als JSON-Zeilen auf stdin
  jq -n --argjson n $1 --arg a $2 --argjson l $3 --argjson pr ${4:-false} \
    '{number: $n, state: "open", user: {login: $a}, labels: [$l[] | {name: .}]} + (if $pr then {pull_request: {}} else {} end)' > $T/gh/issue-$1.json
  jq -s . > $T/gh/comments-$1.json
}
issue 1 nutzer '[]'                  < <(k sruf79 20 "Which version?"; k sruf79 8 $MARKE)                       # 8 Tage → schließen
issue 2 nutzer '[]'                  < <(k sruf79 20 "Which version?"; k sruf79 6 $MARKE)                       # 6 Tage → wartet
issue 3 nutzer '[]'                  < <(k sruf79 20 "Which version?"; k sruf79 9 $MARKE; k nutzer 3 "3.27.0")  # Antwort → nein
issue 4 nutzer '["keep-open"]'       < <(k sruf79 9 $MARKE)                                                     # Label → nein
issue 5 nutzer '["waiting-on-us"]'   < <(k sruf79 10 "Thanks, fix comes later")                                 # Label → keine Anfrage
issue 6 nutzer '[]'                  < <(k sruf79 9 $MARKE)                                                     # Ausnahmedatei → nein
issue 7 nutzer '[]' true             < <(k sruf79 9 $MARKE)                                                     # PR → nein
issue 8 nutzer '[]'                  < <(k nutzer 12 "Bug"; k sruf79 9 "Which version?")                        # keine Markierung → Anfrage
issue 9 nutzer '[]'                  < <(k sruf79 8 $MARKE; k "dependabot[bot]" 2 "bump" true)                  # nur Bot danach → schließen
issue 10 nutzer '[]'                 < <(k sruf79 2 "Which version?")                                           # jünger als 7 Tage → nichts
issue 11 sruf79 '[]'                 < <(k sruf79 9 "Plan")                                                     # eigenes Issue → nichts
issue 12 nutzer '[]'                 < <(k nutzer 9 "still broken")                                             # Nutzer zuletzt → nichts
print -r -- "6 | bewusst offen (Test)" > $HALO_INA_AUSNAHMEN

# --- gh-Attrappe (Funktion, verdrängt jedes gh im PATH) ---
gh() {
  print -r -- "gh $*" >> $T/gh.log
  local jqa= a p=
  for a; do [[ $p == --jq ]] && jqa=$a; p=$a; done
  case "$1 $2" in
    "api user") print sruf79 ;;
    "api repos/sruf79/halo-spaces/issues?state=open"*)
      jq -s '[.[] | select(.state == "open")]' $T/gh/issue-*.json | jq -c "${jqa:-.}" ;;
    "api repos/sruf79/halo-spaces/issues/"*/comments*)
      a=${2#repos/sruf79/halo-spaces/issues/}; jq -c "$jqa" $T/gh/comments-${a%%/*}.json ;;
    "api repos/sruf79/halo-spaces/issues/"*)
      jq -r "$jqa" $T/gh/issue-${2##*/}.json ;;
    "issue close")
      print -r -- "$3 ${(j: :)@[4,-1]}" >> $T/geschlossen.txt
      jq '.state = "closed"' $T/gh/issue-$3.json > $T/x && mv $T/x $T/gh/issue-$3.json ;;
    *) print -u2 "Attrappe: unbekannt $*"; return 1 ;;
  esac
}

# --- Trockenlauf: Zustand je Issue, nichts geschlossen ---
aus=$(ina_lauf --trocken); rc=$?
zeile() { print -r -- $aus | grep -q -- "$1" }
pruefe "trocken: Exitcode 0" '(( rc == 0 ))'
pruefe "Markierung 8 Tage ohne Antwort → würde schließen" 'zeile "^würde schließen #1 "'
pruefe "Markierung 6 Tage → wartet" 'zeile "^wartet #2 bis " && ! zeile "schließen #2"'
pruefe "Antwort nach Markierung → nicht schließen" 'zeile "^offen #3$"'
pruefe "Label keep-open → ausgenommen" 'zeile "^ausgenommen #4 (Label keep-open)"'
pruefe "Label waiting-on-us → ausgenommen, keine Anfrage" 'zeile "^ausgenommen #5 (Label waiting-on-us)"'
pruefe "Ausnahmedatei → ausgenommen mit Grund" 'zeile "^ausgenommen #6 (bewusst offen (Test))"'
pruefe "Pull Request → nie schließen" 'zeile "^kein-issue #7$"'
pruefe "keine Markierung, 9 Tage → Anfrage" 'zeile "^anfrage #8 "'
pruefe "nur Bot nach Markierung → würde schließen" 'zeile "^würde schließen #9 "'
pruefe "Rückfrage jünger als 7 Tage → nichts" 'zeile "^offen #10$"'
pruefe "eigenes Issue → nichts" 'zeile "^eigenes #11$"'
pruefe "Nutzer zuletzt → nichts" 'zeile "^offen #12$"'
pruefe "trocken: nichts geschlossen, kein Log" '[[ ! -e $T/geschlossen.txt && ! -e $HALO_INA_LOG ]]'

# --- Anfragen: nur Issues ohne Markierung, letzter Kommentar vom Maintainer-Konto, älter als 7 Tage ---
aus=$(ina_lauf --anfragen)
pruefe "anfragen: nur #8" '[[ $aus == "anfrage #8 "* ]] && (( $(print -r -- $aus | wc -l) == 1 ))'
pruefe "anfragen: schließt nichts" '[[ ! -e $T/geschlossen.txt ]]'

# --- Ausführen: schließt #1 und #9 mit „not planned“ und Kommentar, Log, Summenzeile ---
aus=$(ina_lauf); rc=$?
pruefe "ausführen: Exitcode 0" '(( rc == 0 ))'
pruefe "ausführen: genau #1 und #9 geschlossen" '[[ $(cut -d" " -f1 $T/geschlossen.txt | sort -n | xargs) == "1 9" ]]'
pruefe "ausführen: Grund not planned, Kommentar inactivity/reopen" 'grep -q -- "--reason not planned --comment Closing due to inactivity.*reopen" $T/geschlossen.txt'
pruefe "ausführen: Summenzeile für den Morgenbrief" '[[ $aus == *"Inaktivität: geschlossen #1, #9"* ]]'
pruefe "ausführen: zwei Zeilen im Log" '(( $(grep -c "geschlossen #[19] wegen Inaktivität" $HALO_INA_LOG) == 2 ))'
pruefe "ausführen: Ausnahmen, PR und Wartende unberührt" '! grep -qE "^(2|3|4|5|6|7|8) " $T/geschlossen.txt'

# --- zweiter Lauf: nichts mehr zu schließen, kein zweiter Kommentar ---
aus=$(ina_lauf); rc=$?
pruefe "zweiter Lauf: nichts doppelt geschlossen" '(( rc == 0 && $(wc -l < $T/geschlossen.txt) == 2 )) && [[ $aus != *"Inaktivität: geschlossen"* ]]'

# --- Rennen: Issue zwischen Abruf und Schließen schon zu → übersprungen ---
issue 13 nutzer '[]' < <(k sruf79 8 $MARKE)
gh_alt=$functions[gh]
gh() { if [[ "$1 $2" == "api repos/sruf79/halo-spaces/issues/13" ]]; then print closed; else eval "$gh_alt"; fi }
aus=$(ina_lauf)
pruefe "schon geschlossen: übersprungen, kein Kommentar" '[[ $aus == *"übersprungen #13 (closed)"* ]] && ! grep -q "^13 " $T/geschlossen.txt'

# --- ohne Ausnahmedatei: nie schließen ---
issue 14 nutzer '[]' < <(k sruf79 8 $MARKE)
rm -f $HALO_INA_AUSNAHMEN
aus=$(ina_lauf); rc=$?
pruefe "ohne Ausnahmedatei: FEHLER, nichts geschlossen" '(( rc == 1 )) && [[ $aus == *"FEHLER Ausnahmedatei"* ]] && ! grep -q "^14 " $T/geschlossen.txt'

pruefe "nie das echte gh: nur Attrappe benutzt" '[[ -s $T/gh.log ]]'
(( FEHLER )) && { print "inaktivitaet_test: FEHLER"; exit 1 }
print "inaktivitaet_test: alle Fälle grün"
