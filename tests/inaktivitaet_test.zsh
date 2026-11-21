#!/bin/zsh
# Prüfung der Inaktivitätsregel (tests/inaktivitaet.sh) ohne Claude, ohne Thunderbird, ohne Netz, im
# Wegwerf-Ordner: gh ist eine Shell-Funktion (Attrappe) mit Issues und Kommentaren als Dateien; das echte
# gh wird nie aufgerufen, die Aufgabenliste ist eine Attrappe für tests/board.sh (Export aus $T/board.json). Aufruf: zsh tests/inaktivitaet_test.zsh → je Fall eine Zeile OK/FEHLER,
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
# board.sh-Attrappe: zählt Aufrufe, gibt $T/board.json aus; fehlt sie, „Board nicht lesbar“ wie board.sh (Exitcode 1)
cat > $T/board.sh <<'ENDE'
print -r -- "board $*" >> ${0:h}/board.log
if [[ $1 == (notiz|status) ]]; then   # Schreiben festhalten: seit 20.11.2026 darf das Skript das Board nie beschreiben
  print -r -- "board $1 $2 ${3}" >> ${0:h}/folge.log; exit 0
fi
[[ $1 == export && -r ${0:h}/board.json ]] || { print -u2 "FEHLER: Board nicht lesbar"; exit 1 }
cat ${0:h}/board.json
ENDE
print -r -- '{"items": []}' > $T/board.json
export HALO_INA_BOARD="zsh $T/board.sh"
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
issue 26 nutzer '[]'                 < <(k nutzer 20 "Bug"; k sruf79 9 "Thanks, we will look into it.")         # Zusage ohne Rückfrage, kein Eintrag → zusage
issue 27 nutzer '[]'                 < <(k sruf79 20 "Which version?"; k sruf79 12 $MARKE; k sruf79 9 "Fix is planned.")  # eigener Kommentar nach Markierung → nicht schließen
issue 28 nutzer '[]'                 < <(k sruf79 20 "Which version?"; k sruf79 12 $MARKE; k sruf79 9 "Any news?")        # neue Rückfrage nach Markierung → Anfrage
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
      print -r -- "close $3" >> $T/folge.log
      jq '.state = "closed"' $T/gh/issue-$3.json > $T/x && mv $T/x $T/gh/issue-$3.json ;;
    *) print -u2 "Attrappe: unbekannt $*"; return 1 ;;
  esac
}

# --- Trockenlauf: Zustand je Issue, nichts geschlossen ---
aus=$(ina_lauf --trocken); rc=$?
zeile() { print -r -- $aus | grep -q -- "$1" }
pruefe "trocken: Exitcode 0" '(( rc == 0 ))'
pruefe "Markierung 8 Tage ohne Antwort → würde schließen" 'zeile "^würde schließen #1 "'
pruefe "Markierung 6 Tage → wartet" 'zeile "^wartet #2 bis " && ! zeile "schließen #2 "'
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
pruefe "eigene Antwort ohne Rückfrage, kein Eintrag → zusage statt Anfrage" 'zeile "^zusage #26 " && ! zeile "anfrage #26"'
pruefe "eigener Kommentar nach Markierung hebt sie auf → nicht schließen" '! zeile "schließen #27" && zeile "^zusage #27 "'
pruefe "neue Rückfrage nach Markierung → Anfrage statt Schließen" '! zeile "schließen #28" && zeile "^anfrage #28 "'
pruefe "trocken: nichts geschlossen, kein Log" '[[ ! -e $T/geschlossen.txt && ! -e $HALO_INA_LOG ]]'

# --- Anfragen: nur Issues ohne Markierung, letzter Kommentar vom Maintainer-Konto, älter als 7 Tage ---
aus=$(ina_lauf --anfragen)
pruefe "anfragen: nur #8 und #28" '[[ $(print -r -- $aus | cut -d" " -f2 | xargs) == "#8 #28" ]]'
pruefe "anfragen: schließt nichts" '[[ ! -e $T/geschlossen.txt ]]'

# --- Ausführen: schließt #1 und #9 mit „not planned“ und Kommentar, Log, Summenzeile ---
aus=$(ina_lauf); rc=$?
pruefe "ausführen: Exitcode 0" '(( rc == 0 ))'
pruefe "ausführen: genau #1 und #9 geschlossen" '[[ $(cut -d" " -f1 $T/geschlossen.txt | sort -n | xargs) == "1 9" ]]'
pruefe "ausführen: Grund not planned, Kommentar inactivity/reopen" 'grep -q -- "--reason not planned --comment Closing due to inactivity.*reopen" $T/geschlossen.txt'
pruefe "ausführen: Summenzeile für den Morgenbrief" '[[ $aus == *"Inaktivität: geschlossen #1, #9"* ]]'
pruefe "ausführen: zwei Zeilen im Log" '(( $(grep -c "geschlossen #[19] wegen Inaktivität" $HALO_INA_LOG) == 2 ))'
pruefe "ausführen: Ausnahmen, PR und Wartende unberührt" '! grep -qE "^(2|3|4|5|6|7|8|26|27|28) " $T/geschlossen.txt'

# --- zweiter Lauf: nichts mehr zu schließen, kein zweiter Kommentar ---
aus=$(ina_lauf); rc=$?
pruefe "zweiter Lauf: nichts doppelt geschlossen" '(( rc == 0 && $(wc -l < $T/geschlossen.txt) == 2 )) && [[ $aus != *"Inaktivität: geschlossen"* ]]'

# --- Rennen: Issue zwischen Abruf und Schließen schon zu → übersprungen ---
issue 13 nutzer '[]' < <(k sruf79 8 $MARKE)
gh_alt=$functions[gh]
gh() { if [[ "$1 $2" == "api repos/sruf79/halo-spaces/issues/13" ]]; then print closed; else eval "$gh_alt"; fi }
aus=$(ina_lauf)
pruefe "schon geschlossen: übersprungen, kein Kommentar" '[[ $aus == *"übersprungen #13 (closed)"* ]] && ! grep -q "^13 " $T/geschlossen.txt'

# --- offener Board-Eintrag (Maintainer 18.11.2026): ausgenommen, solange wir nicht auf den Nutzer warten (keine offene
# Markierung, keine Rückfrage); mit Markierung läuft die Frist, das Issue wird geschlossen und die verlinkten Einträge
# laufen weiter (Maintainer 20.11.2026: „das issue schliesst und die einträge laufen weiter“) ---
issue 15 nutzer '[]' < <(k nutzer 12 "Bug"; k sruf79 9 "Thanks, we will fix it")  # ohne Markierung, [GitHub #15] im Titel → ausgenommen (keine Anfrage)
issue 16 nutzer '[]' < <(k nutzer 9 "still broken")                               # GitHub-Issue #16 im Text, Wartet auf OK → ausgenommen
issue 17 nutzer '[]' < <(k sruf79 8 $MARKE)   # Eintrag Done → würde schließen
issue 18 nutzer '[]' < <(k sruf79 8 $MARKE)   # nur „GitHub #180“ und „GitHub: PR #18“ → würde schließen
issue 24 nutzer '[]' < <(k nutzer 12 "Bug"; k sruf79 9 "Which version? See https://x.org/a?b=1")  # Rückfrage ohne Markierung + Eintrag → Anfrage
issue 25 nutzer '[]' < <(k nutzer 12 "Bug"; k sruf79 9 "Fix planned, see https://x.org/a?b=1")      # keine Rückfrage (? nur im Link) + Eintrag → ausgenommen
issue 29 nutzer '[]' < <(k nutzer 12 "Bug"; k sruf79 9 "Thanks, noted.")          # Aufzählung „GitHub-Issues #90, #29“ im Text → ausgenommen
issue 20 nutzer '[]' < <(k sruf79 20 "Which version?"; k sruf79 8 $MARKE)   # Rückfrage, Markierung, 8 Tage + Eintrag Todo → schließen, Eintrag bleibt
issue 21 nutzer '[]' < <(k sruf79 8 $MARKE)   # verlinkter Eintrag In Progress → schließen, Eintrag bleibt
issue 22 nutzer '[]' < <(k sruf79 8 $MARKE)   # verlinkter Eintrag mit committetem Fix → schließen, Eintrag bleibt
cat > $T/board.json <<'ENDE'
{"items": [
 {"id": "PVTI_a", "status": "Todo", "title": "Geheimer Titel A [GitHub #15]", "body": "Wo: Mail"},
 {"id": "PVTI_b", "status": "Wartet auf OK", "title": "Geheimer Titel B", "body": "Referenz: **GitHub-Issue #16** (Nutzer)"},
 {"id": "PVTI_c", "status": "Done", "title": "Geheimer Titel C [GitHub #17]", "body": ""},
 {"id": "PVTI_d", "status": "In Progress", "title": "Geheimer Titel D", "body": "siehe GitHub #180 und GitHub: PR #18"},
 {"id": "PVTI_e", "status": "Todo", "title": "Geheimer Titel E [GitHub #20]", "body": "Wo: Mail"},
 {"id": "PVTI_f", "status": "Todo", "title": "Geheimer Titel F", "body": "gleicher Bereich wie GitHub #20 (Karte E)"},
 {"id": "PVTI_g", "status": "In Progress", "title": "Geheimer Titel G (GitHub #21)", "body": ""},
 {"id": "PVTI_j", "status": "Todo", "title": "Geheimer Titel J [GitHub #24]", "body": ""},
 {"id": "PVTI_k", "status": "Todo", "title": "Geheimer Titel K [GitHub #25]", "body": ""},
 {"id": "PVTI_l", "status": "Todo", "title": "Geheimer Titel L", "body": "Notiz: zusammengelegt, betrifft GitHub-Issues #90, #29"},
 {"id": "PVTI_h", "status": "Todo", "title": "Geheimer Titel H [GitHub #22]", "body": "Notiz: committet 1a2b3c4d, wartet auf Push/CI"}
]}
ENDE
: > $T/board.log
aus=$(ina_lauf --trocken); rc=$?
pruefe "Board ohne Markierung: [GitHub #n] im Titel → ausgenommen, keine Anfrage" 'zeile "^ausgenommen #15 (Nutzer wartet auf uns, offener Board-Eintrag)$"'
pruefe "Board ohne Markierung: GitHub-Issue #n im Text, Wartet auf OK → ausgenommen" 'zeile "^ausgenommen #16 (Nutzer wartet auf uns, offener Board-Eintrag)$"'
pruefe "Board, unsere Rückfrage ohne Markierung → Anfrage statt Ausnahme" 'zeile "^anfrage #24 "'
pruefe "Board, keine Rückfrage (? nur im Link) → ausgenommen" 'zeile "^ausgenommen #25 (Nutzer wartet auf uns, offener Board-Eintrag)$"'
pruefe "Board: Aufzählung „GitHub-Issues #90, #29“ in einer Notiz → ausgenommen" 'zeile "^ausgenommen #29 (Nutzer wartet auf uns, offener Board-Eintrag)$"'
pruefe "Board: Eintrag Done → keine Ausnahme" 'zeile "^würde schließen #17 "'
pruefe "Board: #180 und PR #18 zählen nicht für #18" 'zeile "^würde schließen #18 "'
pruefe "Board mit Markierung über 7 Tage → würde schließen (keine Ausnahme)" 'zeile "^würde schließen #20 " && zeile "^würde schließen #21 "'
pruefe "trocken: würde schließen nennt weiterlaufenden Eintrag (nur mit Eintrag)" 'zeile "^würde schließen #20 (Nachfrage .*), offener Board-Eintrag läuft weiter$" && ! zeile "^würde schließen #17 .*läuft weiter"'
pruefe "Board: einmal je Lauf geladen" '(( $(wc -l < $T/board.log) == 1 )) && grep -q "^board export$" $T/board.log'
pruefe "trocken: Board nicht verändert" '! grep -q "^board " $T/folge.log'
pruefe "Board: keine Inhalte in der Ausgabe" '[[ $aus != *Geheim* && $aus != *PVTI_* ]]'
aus=$(ina_lauf); rc=$?
pruefe "ausführen: #17, #18, #20, #21, #22 geschlossen, #15/#16 nicht" '(( rc == 0 )) && (for i in 17 18 20 21 22; do grep -q "^$i " $T/geschlossen.txt || exit 1; done) && ! grep -qE "^1[56] " $T/geschlossen.txt'
pruefe "offener Eintrag allein keine Ausnahme: geschlossen, Board nie beschrieben" 'grep -q "^board export$" $T/board.log && ! grep -qE "^board (notiz|status)" $T/board.log && ! grep -q "^board " $T/folge.log'
pruefe "geschlossen mit Eintrag: Zeile weiter, ohne Board-Inhalt" '(for i in 20 21 22; do zeile "^weiter #$i (offener Board-Eintrag läuft weiter)$" || exit 1; done) && ! zeile "^weiter #1[78] "'
pruefe "keine Abräum-Meldungen mehr" '! print -r -- $aus | grep -qE "^(abgeräumt|melden) "'
pruefe "ausführen: keine Board-Inhalte in der Ausgabe" '[[ $aus != *Geheim* && $aus != *PVTI_* ]]'

# --- Aufgabenliste nicht lesbar: nie schließen, FEHLER-Zeile; trocken nur Hinweis ---
issue 19 nutzer '[]' < <(k sruf79 8 $MARKE)
mv $T/board.json $T/board.json.weg
aus=$(ina_lauf); rc=$?
pruefe "Board nicht lesbar: FEHLER, nichts geschlossen" '(( rc == 1 )) && [[ $aus == *"FEHLER Aufgabenliste nicht lesbar"* ]] && ! grep -q "^19 " $T/geschlossen.txt'
aus=$(ina_lauf --trocken); rc=$?
pruefe "Board nicht lesbar, trocken: Hinweis, Exitcode 0" '(( rc == 0 )) && zeile "^Hinweis: Aufgabenliste nicht lesbar" && zeile "^würde schließen #19 "'
print -r -- '{"fehler": 1}' > $T/board.json
aus=$(ina_lauf); rc=$?
pruefe "Board-Export ohne items: FEHLER, nichts geschlossen" '(( rc == 1 )) && [[ $aus == *"FEHLER Aufgabenliste nicht lesbar"* ]] && ! grep -q "^19 " $T/geschlossen.txt'
mv $T/board.json.weg $T/board.json

# --- ohne Ausnahmedatei: nie schließen ---
issue 14 nutzer '[]' < <(k sruf79 8 $MARKE)
rm -f $HALO_INA_AUSNAHMEN
aus=$(ina_lauf); rc=$?
pruefe "ohne Ausnahmedatei: FEHLER, nichts geschlossen" '(( rc == 1 )) && [[ $aus == *"FEHLER Ausnahmedatei"* ]] && ! grep -q "^14 " $T/geschlossen.txt'

pruefe "nie das echte gh: nur Attrappe benutzt" '[[ -s $T/gh.log ]]'
(( FEHLER )) && { print "inaktivitaet_test: FEHLER"; exit 1 }
print "inaktivitaet_test: alle Fälle grün"
