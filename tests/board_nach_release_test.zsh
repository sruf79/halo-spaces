#!/bin/zsh
# Prüfung von tests/board-nach-release.zsh ohne Claude, ohne Netz, im Wegwerf-Ordner: ein kleines Git-Repo mit zwei
# Release-Tags, die Aufgabenliste ist eine Attrappe für tests/board.sh ($T/board.json; notiz hängt an, status done
# entfernt den Eintrag wie das Archivieren), an_neon nur ausgegeben (HALO_PUSH_TROCKEN). Das echte Board wird nie
# aufgerufen. Aufruf: zsh tests/board_nach_release_test.zsh → je Fall eine Zeile OK/FEHLER, Exitcode 1 bei einem Fehler.
emulate -L zsh
HIER=${0:A:h}
T=$(mktemp -d) || exit 1
trap 'rm -rf $T' EXIT
FEHLER=0
ok() { print "OK      $1" }
fehler() { print "FEHLER  $1${2:+ – $2}"; FEHLER=1 }
pruefe() { local n=$1; shift; if eval "$@" >/dev/null 2>&1; then ok $n; else fehler $n; fi }

# --- Repo: v1.0.0, dann Commits, v1.1.0; ein Commit auf einem Nebenzweig, der als gleicher Patch in den Release kam ---
R=$T/repo; mkdir -p $R; cd $R
git init -q -b main . && git config user.email t@t && git config user.name t
c() { print -r -- $2 >> $1; git add $1; git commit -q -m $3; git rev-parse HEAD }
c a.txt 0 "Start" >/dev/null; git tag v1.0.0
git checkout -q -b neben; RB=$(c b.txt neben "Mail: Nebenzweig-Fix"); git checkout -q main
A=$(c a.txt 1 "Mail: Liste zeigt Fehler")
B=$(c a.txt 2 "Kalender: Termin springt (GitHub #5)")
C=$(c a.txt 3 "Mail: Codes erkennen (GitHub #7, teilweise)")
D=$(c a.txt 4 "Aufgaben: Umbau Schritt 2")
E=$(c a.txt 5 "Mail: Suche")
F=$(c a.txt 6 "Felder: Höhe")
git cherry-pick $RB >/dev/null 2>&1; RM=$(git rev-parse HEAD)
git tag v1.1.0
cd $HIER

# --- board.sh-Attrappe ---
cat > $T/board.sh <<'ENDE'
B=${0:h}/board.json
print -r -- "board $*" >> ${0:h}/board.log
case $1 in
  export) [[ -r $B ]] || { print -u2 "FEHLER: Board nicht lesbar"; exit 1 }; cat $B ;;
  notiz) print -r -- "notiz $2 $3" >> ${0:h}/folge.log
         jq --arg i $2 --arg t $3 '(.items[] | select(.id == $i) | .body) += "\n\n" + $t' $B > $B.neu && mv $B.neu $B ;;
  status) print -r -- "status $2 $3 $4" >> ${0:h}/folge.log
         jq --arg i $2 'del(.items[] | select(.id == $i))' $B > $B.neu && mv $B.neu $B ;;
  *) exit 2 ;;
esac
ENDE
k() { print -r -- ${1[1,7]} }
jq -n --arg A $(k $A) --arg D $(k $D) --arg E $(k $E) --arg F $(k $F) --arg RB $(k $RB) '{items: [
 {id: "PVTI_treffer", status: "In Progress", title: "Mail: Liste zeigt Fehler", body: "Wo: Mail\n\ncommittet, wartet auf Push/CI (\($A))"},
 {id: "PVTI_gh", status: "In Progress", title: "Kalender: Termin springt [GitHub #5]", body: "Wo: Kalender"},
 {id: "PVTI_teil", status: "In Progress", title: "Mail: Codes erkennen [GitHub #7]", body: "Wo: Mail"},
 {id: "PVTI_ok", status: "Wartet auf OK", title: "Mail: Suche", body: "committet \($E), wartet auf Push/CI"},
 {id: "PVTI_reihe", status: "In Progress", title: "Aufgaben: Umbau (2/5) – Tabelle", body: "committet, wartet auf Push/CI (\($D))"},
 {id: "PVTI_rest", status: "In Progress", title: "Mail: Suche Teil B", body: "committet \($E), wartet auf Push/CI\n\nOffen: Hervorhebung im Dunkelmodus"},
 {id: "PVTI_todo", status: "Todo", title: "Mail: Liste Teil C", body: "committet \($A), wartet auf Push/CI. Kein Fix, Status bleibt Todo"},
 {id: "PVTI_neuer", status: "In Progress", title: "Mail: Liste Teil D", body: "committet \($A), wartet auf Push/CI\n\ncommittet auf pruef/worker-1, wartet auf Prüfzweig-CI"},
 {id: "PVTI_nurerwaehnt", status: "In Progress", title: "Mail: Liste Teil E", body: "Ursache: siehe \($A) und Lauf 43788504065"},
 {id: "PVTI_rebase", status: "In Progress", title: "Mail: Nebenzweig", body: "committet auf pruef/x (\($RB)), wartet auf Push/CI"},
 {id: "PVTI_mass", status: "In Progress", title: "Felder: Höhe 30/24 px wie die Knöpfe", body: "committet \($F), wartet auf Push/CI"},
 {id: "PVTI_quer", status: "Todo", title: "Kalender: anderes", body: "gleicher Bereich wie GitHub #5"},
 {id: "PVTI_fertig", status: "Done", title: "Mail: alt", body: "committet \($A)"}
]}' > $T/board.json
cp $T/board.json $T/board.anfang.json

export HALO_REPO=$R HALO_BNR_BOARD="zsh $T/board.sh" HALO_BNR_ZWEIFEL=$T/zweifel.md HALO_BNR_LOG=$T/bnr.log HALO_PUSH_TROCKEN=1
lauf() { zsh $HIER/board-nach-release.zsh "$@" 2>&1 }
zeile() { print -r -- $aus | grep -q -- "$1" }

# --- Probelauf: zeigt, schreibt nichts ---
aus=$(lauf --probe 1.1.0); rc=$?
pruefe "Probe: Exitcode 0" '(( rc == 0 ))'
pruefe "Probe: Treffer über Hash in „committet“-Notiz" 'zeile "^würde schließen: PVTI_treffer "'
pruefe "Probe: Treffer über GitHub #n im Titel" 'zeile "^würde schließen: PVTI_gh "'
pruefe "Probe: Treffer nach Rebase (gleicher Patch)" 'zeile "^würde schließen: PVTI_rebase .*(${RM[1,7]})"'
pruefe "Probe: Maß 30/24 px ist keine Reihe" 'zeile "^würde schließen: PVTI_mass "'
pruefe "Probe: nichts ins Board geschrieben" '[[ ! -e $T/folge.log ]] && cmp -s $T/board.json $T/board.anfang.json'
pruefe "Probe: keine Zweifel-Datei" '[[ ! -e $T/zweifel.md ]]'
pruefe "Probe: Board einmal geladen" '[[ $(cat $T/board.log) == "board export" ]]'

# --- echter Lauf ---
: > $T/board.log
aus=$(lauf 1.1.0); rc=$?
pruefe "Lauf: Exitcode 0" '(( rc == 0 ))'
pruefe "Treffer: erst Notiz, dann Done mit Hash" '[[ $(grep PVTI_treffer $T/folge.log | xargs) == "notiz PVTI_treffer erledigt in v1.1.0 (${A[1,7]}), automatisch geschlossen status PVTI_treffer done ${A[1,7]}" ]]'
pruefe "GitHub #n: geschlossen" 'grep -q "^status PVTI_gh done ${B[1,7]}$" $T/folge.log'
pruefe "Rebase: geschlossen mit Hash aus dem Release" 'grep -q "^status PVTI_rebase done ${RM[1,7]}$" $T/folge.log'
pruefe "Reihe: nur Notiz Schritt 2, kein Status" 'grep -q "^notiz PVTI_reihe Schritt 2 in v1.1.0 enthalten" $T/folge.log && ! grep -q "^status PVTI_reihe" $T/folge.log'
pruefe "Wartet auf OK: unberührt" '! grep -q PVTI_ok $T/folge.log && zeile "^unberührt (Wartet auf OK): PVTI_ok "'
pruefe "Teil-Fix: nicht geschlossen, Zweifel" '! grep -q PVTI_teil $T/folge.log && grep -q "| v1.1.0 | PVTI_teil | .*Teil-Fix" $T/zweifel.md'
pruefe "offener Rest: nicht geschlossen, Zweifel" '! grep -q PVTI_rest $T/folge.log && grep -q "| PVTI_rest | .*offener Rest" $T/zweifel.md'
pruefe "Status Todo: nicht geschlossen, Zweifel" '! grep -q PVTI_todo $T/folge.log && grep -q "| PVTI_todo | .*Status Todo" $T/zweifel.md'
pruefe "neuere Arbeit danach: nicht geschlossen, Zweifel" '! grep -q PVTI_neuer $T/folge.log && grep -q "| PVTI_neuer | .*neuere Arbeit" $T/zweifel.md'
pruefe "Hash nur erwähnt (ohne „committet“): unberührt" '! grep -q PVTI_nurerwaehnt $T/folge.log $T/zweifel.md'
pruefe "Querverweis GitHub #n im Text: unberührt" '! grep -q PVTI_quer $T/folge.log $T/zweifel.md'
pruefe "Summenzeile" 'zeile "^Board nach Release v1.1.0 (v1.0.0..v1.1.0): geschlossen 4, Reihen vermerkt 1, Zweifel 4, Wartet auf OK unberührt 1$"'
pruefe "kein an_neon bei Erfolg" '! zeile "TROCKEN: an_neon"'

# --- Doppellauf: nichts mehr ---
cp $T/folge.log $T/folge.vorher; cp $T/zweifel.md $T/zweifel.vorher
aus=$(lauf 1.1.0); rc=$?
pruefe "Doppellauf: nichts geschrieben" '(( rc == 0 )) && cmp -s $T/folge.log $T/folge.vorher'
pruefe "Doppellauf: Zweifel nicht doppelt" 'cmp -s $T/zweifel.md $T/zweifel.vorher'
pruefe "Doppellauf: Summe ohne Schließen" 'zeile "geschlossen 0, Reihen vermerkt 0, Zweifel 4, Wartet auf OK unberührt 1$"'

# --- Notiz schon da, Status fehlte (z. B. Warteschlange): nur Status ---
jq --arg A ${A[1,7]} '.items += [{id: "PVTI_halb", status: "In Progress", title: "Mail: halb", body: "committet \($A), wartet auf Push/CI\n\nerledigt in v1.1.0 (\($A)), automatisch geschlossen"}]' $T/board.json > $T/x && mv $T/x $T/board.json
aus=$(lauf 1.1.0)
pruefe "Notiz schon da: keine zweite Notiz, Status Done" '! grep -q "^notiz PVTI_halb" $T/folge.log && grep -q "^status PVTI_halb done" $T/folge.log'

# --- Design-Einträge: „zur Abnahme“ (Designer) ohne „abgenommen“ ist ein Zweifel mit Frist von 7 Tagen, Vorrang vor dem Hash ---
a=${A[1,7]}
jq --arg A $a '.items += [
 {id: "PVTI_abn1", status: "In Progress", title: "Optik: eins", body: "Wo: Mail\n\ncommittet, wartet auf Push/CI (\($A)); zur Abnahme, 2026-11-16"},
 {id: "PVTI_abn2", status: "In Progress", title: "Optik: zwei", body: "committet, wartet auf Push/CI (\($A)); zur Abnahme, 2026-11-10\n\nabgenommen vom Maintainer"},
 {id: "PVTI_abn3", status: "In Progress", title: "Optik: drei", body: "committet, wartet auf Push/CI (\($A)); zur Abnahme, 2026-11-01"},
 {id: "PVTI_abn4", status: "In Progress", title: "Optik: vier", body: "committet, wartet auf Push/CI (\($A)); zur Abnahme 2026-11-16\n\nabgenommen\n\nÜberarbeitet, committet (\($A)); zur Abnahme 2026-11-17"},
 {id: "PVTI_abn5", status: "In Progress", title: "Optik: fünf", body: "committet (\($A)); ZUR ABNAHME 2026-11-01\n\nABGENOMMEN vom Designer"},
 {id: "PVTI_abn6", status: "In Progress", title: "Optik: sechs (ohne Datum)", body: "committet, wartet auf Push/CI (\($A)); zur Abnahme"},
 {id: "PVTI_abn7", status: "In Progress", title: "Optik: sieben (Datum deutsch)", body: "committet (\($A)); Zur Abnahme am 3.11.2026"}
]' $T/board.json > $T/x && mv $T/x $T/board.json
print -r -- "- 2026-11-05 10:00 | v1.0.5 | PVTI_abn6 | Optik: sechs | Abnahme steht aus (zur Abnahme seit 2026-11-05, Frist bis 2026-11-12) (abc1234)" >> $T/zweifel.md
: > $T/folge.log
aus=$(HALO_BNR_HEUTE=2026-11-18 lauf 1.1.0)
pruefe "Abnahme: zur Abnahme ohne abgenommen, Frist läuft: nicht geschlossen, Zweifel" '! grep -q PVTI_abn1 $T/folge.log && grep -q "| PVTI_abn1 | .*Abnahme steht aus (zur Abnahme seit 2026-11-16, Frist bis 2026-11-23)" $T/zweifel.md'
pruefe "Abnahme: mit abgenommen danach: normaler Treffer, geschlossen" 'grep -q "^status PVTI_abn2 done ${A[1,7]}$" $T/folge.log && ! grep -q PVTI_abn2 $T/zweifel.md'
pruefe "Abnahme: Frist abgelaufen: Zweifel „Abnahme überfällig, seit“" '! grep -q PVTI_abn3 $T/folge.log && grep -q "| PVTI_abn3 | .*Abnahme überfällig, seit 2026-11-01" $T/zweifel.md'
pruefe "Abnahme: Mischfall (abgenommen, dann erneut zur Abnahme): Zweifel, nicht geschlossen" '! grep -q PVTI_abn4 $T/folge.log && grep -q "| PVTI_abn4 | .*Abnahme steht aus (zur Abnahme seit 2026-11-17" $T/zweifel.md'
pruefe "Abnahme: Groß-/Kleinschreibung egal (ZUR ABNAHME, ABGENOMMEN)" 'grep -q "^status PVTI_abn5 done" $T/folge.log'
pruefe "Abnahme: ohne Datum in der Notiz zählt das erste Auftreten im Protokoll" '! grep -q PVTI_abn6 $T/folge.log && grep -q "| v1.1.0 | PVTI_abn6 | .*Abnahme überfällig, seit 2026-11-05" $T/zweifel.md'
pruefe "Abnahme: deutsches Datum in der Notiz (3.11.2026)" 'grep -q "| PVTI_abn7 | .*Abnahme überfällig, seit 2026-11-03" $T/zweifel.md'
: > $T/folge.log; cp $T/zweifel.md $T/zweifel.vorher
aus=$(HALO_BNR_HEUTE=2026-11-18 lauf 1.1.0)
pruefe "Abnahme: Doppellauf schreibt nichts nochmals" '[[ ! -s $T/folge.log ]] && cmp -s $T/zweifel.md $T/zweifel.vorher'
aus=$(HALO_BNR_HEUTE=2026-11-18 lauf --probe 1.1.0)
pruefe "Abnahme: Probe zeigt Zweifel, schreibt nichts" 'zeile "^Zweifel: PVTI_abn3 " && [[ ! -s $T/folge.log ]]'
jq '.items |= map(select(.id | startswith("PVTI_abn") | not))' $T/board.json > $T/x && mv $T/x $T/board.json

# --- Board nicht lesbar: nichts schließen, Meldung an neon, Exitcode 1 ---
mv $T/board.json $T/board.weg; : > $T/folge.log
aus=$(lauf 1.1.0); rc=$?
pruefe "Board nicht lesbar: Exitcode 1, nichts geschrieben" '(( rc == 1 )) && [[ ! -s $T/folge.log ]] && zeile "Board nicht lesbar"'
pruefe "Board nicht lesbar: Meldung an neon" 'zeile "^TROCKEN: an_neon \[board-nach-release\] v1.1.0: Board nicht lesbar"'
pruefe "Board nicht lesbar, Ausgabe ohne „FEHLER“ (Morgenbrief hält das Release sonst für gescheitert)" '! zeile "FEHLER"'
aus=$(lauf --probe 1.1.0); rc=$?
pruefe "Board nicht lesbar, Probe: keine Meldung an neon" '(( rc == 1 )) && ! zeile "an_neon"'
print -r -- '{"fehler": 1}' > $T/board.json
aus=$(lauf 1.1.0); rc=$?
pruefe "Export ohne items: nicht lesbar, nichts geschrieben" '(( rc == 1 )) && [[ ! -s $T/folge.log ]] && zeile "Export ohne items"'

# --- Schreiben scheitert: Status nicht ohne Notiz, Meldung an neon ---
mv $T/board.weg $T/board.json
jq --arg A ${A[1,7]} '.items += [{id: "PVTI_schreib", status: "In Progress", title: "Mail: schreib", body: "committet \($A)"}]' $T/board.json > $T/x && mv $T/x $T/board.json
sed -i '' 's/^  notiz) /  notiz) [[ $2 == PVTI_schreib ]] \&\& { print -u2 "Notiz ließ sich nicht anhängen"; exit 1 }; /' $T/board.sh
aus=$(lauf 1.1.0); rc=$?
pruefe "Schreibfehler: kein Status ohne Notiz, Exitcode 1, an neon" '(( rc == 1 )) && ! grep -q "^status PVTI_schreib" $T/folge.log && zeile "nicht geschrieben 1" && zeile "TROCKEN: an_neon .*Schreibvorgänge"'

# --- falscher Aufruf ---
aus=$(lauf 1.1); rc=$?
pruefe "Aufruf ohne x.y.z: Exitcode 2" '(( rc == 2 ))'

(( FEHLER )) && { print "board_nach_release_test: FEHLER"; exit 1 }
print "board_nach_release_test: alle Fälle grün"
