#!/bin/zsh
# Prüfung von tests/board-nummern.zsh ohne Netz, im Wegwerf-Ordner: tests/board.sh ist eine Attrappe (Export aus
# $T/board.json), das echte gh und das echte Board werden nie aufgerufen. Das Erkennen der Verweise im Einzelnen prüft
# tests/inaktivitaet_test.zsh (Abschnitt „offener Board-Eintrag“). Aufruf: zsh tests/board_nummern_test.zsh → je Fall
# eine Zeile OK/FEHLER, Exitcode 1 bei einem Fehler.
emulate -L zsh
HIER=${0:A:h}
T=$(mktemp -d) || exit 1
trap 'rm -rf $T' EXIT
FEHLER=0
ok() { print "OK      $1" }
fehler() { print "FEHLER  $1"; FEHLER=1 }
pruefe() { local n=$1; shift; if eval "$@" >/dev/null 2>&1; then ok $n; else fehler $n; fi }

cat > $T/board.sh <<'ENDE'
print -r -- "board $*" >> ${0:h}/board.log
[[ $1 == export && -r ${0:h}/board.json ]] || { print -u2 "FEHLER: Board nicht lesbar"; exit 1 }
cat ${0:h}/board.json
ENDE
export HALO_AUFGABEN=$T/a HALO_BN_BOARD="zsh $T/board.sh"
D=$T/a/board-issue-nummern.json
lauf() { HALO_BN_ZEIT=${1:-2026-11-28T10:00:00Z} zsh $HIER/board-nummern.zsh }

# --- Board lesbar: Datei mit Zeit und Nummern, sonst nichts ---
cat > $T/board.json <<'ENDE'
{"items": [
 {"id": "PVTI_a", "status": "Todo", "title": "Geheimer Titel A [GitHub #15]", "body": "Wo: Mail"},
 {"id": "PVTI_b", "status": "Wartet auf OK", "title": "Geheimer Titel B", "body": "Referenz: GitHub-Issue #7 und #103"},
 {"id": "PVTI_c", "status": "Done", "title": "Geheimer Titel C [GitHub #17]", "body": ""},
 {"id": "PVTI_d", "status": "Pausiert", "title": "Geheimer Titel D", "body": "GitHub: PR #18, GitHub #15"}
]}
ENDE
aus=$(lauf 2>&1); rc=$?
pruefe "lesbar: Exitcode 0, Datei unter HALO_AUFGABEN" '(( rc == 0 )) && [[ -s $D ]]'
pruefe "lesbar: genau Zeit und Nummern (aufsteigend, ohne Done, ohne PR)" '[[ $(jq -c . $D) == "{\"zeit\":\"2026-11-28T10:00:00Z\",\"nummern\":[7,15,103]}" ]]'
pruefe "lesbar: keine Board-Inhalte in Datei und Ausgabe" '! grep -qE "Geheim|PVTI_|Mail" $D && [[ $aus != *Geheim* && $aus != *PVTI_* ]]'
pruefe "lesbar: Board genau einmal geladen (export)" '[[ $(<$T/board.log) == "board export" ]]'
pruefe "lesbar: keine Zwischendatei übrig" '[[ ! -e $D.neu ]]'
pruefe "Zeit ohne HALO_BN_ZEIT: UTC im Format für jq fromdate" 'HALO_BN_DATEI=$T/uhr.json zsh $HIER/board-nummern.zsh && jq -e ".zeit | fromdate" $T/uhr.json'

# --- Board nicht lesbar: alte Datei bleibt, Exitcode 1, Fehlertext maskiert ---
cp -p $D $T/vorher.json
mv $T/board.json $T/board.json.weg
aus=$(lauf 2026-11-28T16:00:00Z 2>&1); rc=$?
pruefe "nicht lesbar: Exitcode 1, FEHLER-Zeile" '(( rc == 1 )) && [[ $aus == "FEHLER Aufgabenliste nicht lesbar: FEHLER: Board nicht lesbar" ]]'
pruefe "nicht lesbar: alte Datei unverändert" 'cmp -s $D $T/vorher.json'
print -r -- '{"fehler": 1}' > $T/board.json
aus=$(lauf 2026-11-28T16:00:00Z 2>&1); rc=$?
pruefe "Export ohne items: Exitcode 1, alte Datei unverändert" '(( rc == 1 )) && [[ $aus == *"Export ohne Einträge"* ]] && cmp -s $D $T/vorher.json'
print -r -- 'kein json' > $T/board.json
aus=$(lauf 2026-11-28T16:00:00Z 2>&1); rc=$?
pruefe "Export kein JSON: Exitcode 1, alte Datei unverändert" '(( rc == 1 )) && cmp -s $D $T/vorher.json'
cat > $T/board.sh <<'ENDE'
print -u2 "FEHLER: Zugriff verweigert GH_TOKEN=ghp_abc123SECRET Authorization: Bearer github_pat_XYZ"
print -u2 "${(l:400::x:)}"
exit 1
ENDE
aus=$(lauf 2>&1); rc=$?
pruefe "Fehlertext: Token maskiert, höchstens 300 Zeichen" '(( rc == 1 )) && [[ $aus == "FEHLER Aufgabenliste nicht lesbar: FEHLER: Zugriff verweigert ***"* ]] && [[ $aus != *(ghp_|github_pat_|GH_TOKEN|Authorization|SECRET)* ]] && (( ${#${aus#FEHLER Aufgabenliste nicht lesbar: }} <= 300 ))'
pruefe "Fehler: alte Datei unverändert" 'cmp -s $D $T/vorher.json'

# --- leere Liste: gültige Datei mit leerer Nummernliste ---
print -r -- '{"items": []}' > $T/board.json.weg
cat > $T/board.sh <<'ENDE'
cat ${0:h}/board.json.weg
ENDE
aus=$(lauf 2026-11-28T17:00:00Z 2>&1); rc=$?
pruefe "leere Liste: Datei mit leerer Nummernliste und neuer Zeit" '(( rc == 0 )) && [[ $(jq -c . $D) == "{\"zeit\":\"2026-11-28T17:00:00Z\",\"nummern\":[]}" ]]'

# --- Aufruf aus tests/bilder-eingang.zsh: nur wenn die Datei älter als 6 Stunden ist, Fehler stören den Eingang nicht ---
# (Umgebung wie tests/bilder_eingang_test.zsh: ohne Claude, ohne Push, eigener Wegwerf-Ordner)
B=$T/b
mkdir -p $B/eingang $B/apple $B/bilder $T/nacht $T/tour
eingang() {   # Lauf des Bilder-Eingangs mit Board-Attrappe; Rückgabe dessen Exitcode
  HALO_AUFGABEN=$B HALO_BILDER_LOG=$T/be.log HALO_UEBERSPRUNGEN_LOG=$T/ue.log HALO_BILDER_CLAUDE=trocken \
    HALO_BILDER_PUSH=aus HALO_BILDER_WARTE=0 HALO_PAUSEN_DATEI=$T/pausen.txt HALO_NACHT_DIR=$T/nacht \
    HALO_TOUR_DIR=$T/tour HALO_BN_BOARD="zsh $T/board.sh" HALO_BN_MAX=${BN_MAX:-300} zsh $HIER/bilder-eingang.zsh $T/repo
}
cat > $T/board.sh <<'ENDE'
print -r -- "board $*" >> ${0:h}/board.log
[[ $1 == export && -r ${0:h}/board.json ]] || { print -u2 "FEHLER: Board nicht lesbar"; exit 1 }
cat ${0:h}/board.json
ENDE
print -r -- '{"items": [{"status": "Todo", "title": "X [GitHub #42]", "body": ""}]}' > $T/board.json
: > $T/board.log
eingang; rc=$?
pruefe "Eingang, Datei fehlt: legt sie an, Exitcode 0" '(( rc == 0 )) && [[ $(jq -c .nummern $B/board-issue-nummern.json) == "[42]" ]] && grep -q "Board-Nummern: 1 Issue" $T/be.log'
: > $T/board.log
eingang; rc=$?
pruefe "Eingang, Datei frisch: Board nicht gefragt" '(( rc == 0 )) && [[ ! -s $T/board.log ]]'
touch -t 202601010000 $B/board-issue-nummern.json $B/.board-nummern.versuch
print -r -- '{"items": [{"status": "Todo", "title": "X [GitHub #43]", "body": ""}]}' > $T/board.json
eingang; rc=$?
pruefe "Eingang, Datei älter als 6 Stunden: neu geschrieben" '(( rc == 0 )) && [[ $(jq -c .nummern $B/board-issue-nummern.json) == "[43]" ]] && [[ $(<$T/board.log) == "board export" ]]'
# Board nicht lesbar: alte Datei bleibt, Fehler im Protokoll, Bild trotzdem einsortiert; neuer Versuch erst nach 1 Stunde
touch -t 202601010000 $B/board-issue-nummern.json $B/.board-nummern.versuch
cp -p $B/board-issue-nummern.json $T/vorher2.json
rm -f $T/board.json; : > $T/board.log
print -r -- probe > $B/eingang/kaputt.png
eingang; rc=$?
pruefe "Eingang, Board nicht lesbar: Exitcode 0, alte Datei bleibt" '(( rc == 0 )) && cmp -s $B/board-issue-nummern.json $T/vorher2.json'
pruefe "Eingang, Board nicht lesbar: Grund im Protokoll" 'grep -q "Board-Nummern: FEHLER Aufgabenliste nicht lesbar: FEHLER: Board nicht lesbar, alte Datei bleibt" $T/be.log'
pruefe "Eingang, Board nicht lesbar: Eingang läuft weiter" 'grep -q "FEHLER kaputt.png – kein lesbares Bild" $T/be.log'
: > $T/board.log
eingang; rc=$?
pruefe "Eingang, letzter Versuch jünger als 1 Stunde: kein neuer Versuch" '(( rc == 0 )) && [[ ! -s $T/board.log ]]'
# hängt board.sh: Abbruch nach HALO_BN_MAX Sekunden, Eingang läuft weiter
cat > $T/board.sh <<'ENDE'
print -r -- "board $*" >> ${0:h}/board.log
sleep 31.7
ENDE
touch -t 202601010000 $B/.board-nummern.versuch
BN_MAX=2 eingang; rc=$?
pruefe "Eingang, Board hängt: nach Frist abgebrochen, Exitcode 0, alte Datei bleibt" '(( rc == 0 )) && grep -q "Board-Nummern: FEHLER nach 2 s abgebrochen" $T/be.log && cmp -s $B/board-issue-nummern.json $T/vorher2.json'
pruefe "Eingang, Board hängt: kein Prozess der Attrappe übrig" 'sleep 0.3; ! pgrep -f "$T/board.sh" && ! pgrep -f "sleep 31.7"'
# ohne Attrappe fragt ein Proben-Lauf (HALO_AUFGABEN gesetzt) das Board nie
touch -t 202601010000 $B/board-issue-nummern.json $B/.board-nummern.versuch
HALO_AUFGABEN=$B HALO_BILDER_LOG=$T/be2.log HALO_UEBERSPRUNGEN_LOG=$T/ue.log HALO_BILDER_CLAUDE=trocken HALO_BILDER_PUSH=aus \
  HALO_BILDER_WARTE=0 HALO_PAUSEN_DATEI=$T/pausen.txt HALO_NACHT_DIR=$T/nacht HALO_TOUR_DIR=$T/tour HALO_BN_BOARD= \
  zsh $HIER/bilder-eingang.zsh $T/repo
pruefe "Probe ohne HALO_BN_BOARD: Board-Nummern nicht aufgerufen" '! grep -qs "Board-Nummern" $T/be2.log && [[ $(stat -f %Sm -t %Y%m%d $B/.board-nummern.versuch) == 20260101 ]]'

(( FEHLER )) && { print "board_nummern_test: FEHLER"; exit 1 }
print "board_nummern_test: alle Fälle grün"
