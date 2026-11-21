#!/bin/zsh
# Prüfung von tests/aufraeumen-nach-release.zsh ohne Claude, ohne Netz, im Wegwerf-Ordner: kleines Git-Repo mit zwei
# Release-Tags und einem Nebenzweig, Attrappen für tests/board.sh ($T/board.json; notiz hängt an, status done entfernt den
# Eintrag wie das Archivieren), gh ($T/issues.json; issue close schließt und merkt den Kommentar) und claude (schreibt
# $T/antwort in die Ergebnisdatei aus dem Prompt, führt $T/claude-hook aus), Kontingent, Uhrzeit, „neon frei“ und
# „Abnahme läuft“ über Umgebungsvariablen, an_neon nur ausgegeben (HALO_PUSH_TROCKEN). Das echte Board, GitHub und Claude
# werden nie aufgerufen. Aufruf: zsh tests/aufraeumen_nach_release_test.zsh → je Fall OK/FEHLER, Exitcode 1 bei einem Fehler.
emulate -L zsh
HIER=${0:A:h}
T=$(mktemp -d) || exit 1
trap 'rm -rf $T' EXIT
FEHLER=0
ok() { print "OK      $1" }
fehler() { print "FEHLER  $1${2:+ – $2}"; FEHLER=1 }
pruefe() { local n=$1; shift; if eval "$@" >/dev/null 2>&1; then ok $n; else fehler $n; fi }

# --- Repo: S v1.0.0, A, B v1.1.0, X danach auf main; Y nur auf einem Nebenzweig ---
R=$T/repo; mkdir -p $R; cd $R
git init -q -b main . && git config user.email t@t && git config user.name t
c() { print -r -- $2 >> $1; git add $1; git commit -q -m $3; git rev-parse --short=7 HEAD }
S=$(c a.txt 0 "Start"); git tag v1.0.0
A=$(c a.txt 1 "Mail: Fehler A")
B=$(c b.txt 1 "Kalender: Fehler B")
git tag v1.1.0
X=$(c x.txt 1 "Mail: nach dem Release")
git checkout -q -b neben v1.1.0; Y=$(c y.txt 1 "Nebenzweig"); git checkout -q main
mkdir -p dist; print -l "version=1.1.0" "test=CI-Lauf 1 für abc grün: Linux, Mac" > dist/release-1.1.0.ok
cd $HIER

# --- Attrappen ---
cat > $T/board.sh <<'ENDE'
B=${0:h}/board.json
case $1 in
  export) [[ -r $B ]] || { print -u2 "FEHLER: Board nicht lesbar"; exit 1 }; cat $B ;;
  notiz) print -r -- "notiz $2 $3" >> ${0:h}/folge.log
         jq --arg i $2 --arg t $3 '(.items[] | select(.id == $i) | .body) += "\n\n" + $t' $B > $B.neu && mv $B.neu $B ;;
  status) print -r -- "status $2 $3 $4" >> ${0:h}/folge.log
         [[ $3 == done ]] && jq --arg i $2 'del(.items[] | select(.id == $i))' $B > $B.neu && mv $B.neu $B ;;
  *) exit 2 ;;
esac
ENDE
cat > $T/gh.sh <<'ENDE'
D=${0:h} I=${0:h}/issues.json
[[ -e $D/gh-kaputt ]] && { print -u2 "HTTP 502"; exit 1 }
case "$1 $2" in
  "issue list") print -r -- "gh $*" >> $D/gh.args; cat $I ;;
  "issue view") jq -r --argjson n $3 'if any(.[]; .number == $n) then "OPEN" else "CLOSED" end' $I ;;
  "issue close") n=$3; shift 3
         while (( $# )); do [[ $1 == --comment ]] && k=$2; [[ $1 == --reason ]] && r=$2; shift; done
         print -r -- "close #$n $r $k" >> $D/folge.log
         jq --argjson n $n 'map(select(.number != $n))' $I > $I.neu && mv $I.neu $I ;;
  *) print -u2 "unerwartet: gh $*"; print -r -- "UNERWARTET gh $*" >> $D/folge.log; exit 2 ;;
esac
ENDE
cat > $T/claude.sh <<'ENDE'
D=${0:h}
print -r -- "$*" > $D/claude.args
print -r -- "$PWD" > $D/claude.pwd
p=${@[-1]}
print -r -- $p > $D/claude.prompt
e=$(print -r -- $p | sed -n 's/^Ergebnisdatei: //p')
[[ -r $D/antwort ]] && cp $D/antwort $e
[[ -r $D/claude-hook ]] && zsh $D/claude-hook
print "fertig"
ENDE
jq -n --arg S $S --arg A $A '{items: [
 {id: "PVTI_a", status: "Todo", title: "Mail: Fehler A", body: "Wo: Mail"},
 {id: "PVTI_s", status: "In Progress", title: "Mail: früher behoben", body: "committet (\($S))"},
 {id: "PVTI_x", status: "Todo", title: "Mail: nach dem Release", body: "x"},
 {id: "PVTI_y", status: "Todo", title: "Mail: Nebenzweig", body: "y"},
 {id: "PVTI_r", status: "Todo", title: "Kalender: Reihe 2/5", body: "Schritt 2"},
 {id: "PVTI_m", status: "Todo", title: "Optik: Frage", body: "Grau?"},
 {id: "PVTI_o", status: "Todo", title: "Adressbuch: offen", body: "noch nichts"},
 {id: "PVTI_g", status: "Todo", title: "Mail: geändert", body: "vorher"},
 {id: "PVTI_abg", status: "In Progress", title: "Optik: abgenommen", body: "committet (\($A)); zur Abnahme 2026-11-18\n\nabgenommen 2026-11-20"},
 {id: "PVTI_ok", status: "Wartet auf OK", title: "Ablauf: wartet", body: "?"},
 {id: "PVTI_bew", status: "Todo", title: "Ablauf: bewusst", body: "Frage\n\nWartet bewusst bis 6.12.2026 (Maintainer)"},
 {id: "PVTI_abn", status: "In Progress", title: "Optik: Abnahme offen", body: "committet (\($A)); zur Abnahme 2026-11-18"}
]}' > $T/board.json
jq -n '[
 {number: 10, title: "Fehler B", updatedAt: "2026-11-20T10:00:00Z"},
 {number: 11, title: "Alter Fehler", updatedAt: "2026-11-01T10:00:00Z"},
 {number: 12, title: "Nach dem Release", updatedAt: "2026-11-20T10:00:00Z"},
 {number: 13, title: "Wunsch\tmit Tab", updatedAt: "2026-11-20T10:00:00Z"},
 {number: 14, title: "Nur Nebenzweig", updatedAt: "2026-11-20T10:00:00Z"},
 {number: 15, title: "Neuer Kommentar", updatedAt: "2026-11-20T10:00:00Z"},
 {number: 16, title: "Kein Commit", updatedAt: "2026-11-20T10:00:00Z"}
]' > $T/issues.json
cp $T/board.json $T/board.anfang.json; cp $T/issues.json $T/issues.anfang.json
print -l -- \
  $'erledigt\tPVTI_a\t'$A$'\tFehler A behoben in Mail, zur Abnahme kein Anlass' \
  $'erledigt\tPVTI_s\t'$S$'\tschon in 1.0.0 enthalten' \
  $'erledigt\tPVTI_x\t'$X$'\tdarf nicht schließen (nach dem Release)' \
  $'erledigt\tPVTI_y\t'$Y$'\tdarf nicht schließen (Nebenzweig)' \
  $'erledigt\tPVTI_r\t'$A$'\tdarf nicht schließen (Reihe)' \
  $'maintainer\tPVTI_m\tSoll das Grau bleiben?' \
  $'offen\tPVTI_o\tnoch keine Arbeit' \
  $'erledigt\tPVTI_g\t'$A$'\tdarf nicht schließen (geändert)' \
  $'erledigt\tPVTI_abg\t'$A$'\tabgenommen und im Release' \
  $'erledigt\tPVTI_ok\t'$A$'\tnicht verlangt' \
  $'erledigt\t#10\t'$B$'\tFix B' \
  $'erledigt\t#11\t'$S$'\talter Fix' \
  $'erledigt\t#12\t'$X$'\tnach dem Release' \
  $'maintainer\t#13\tSoll der Wunsch umgesetzt werden?' \
  $'erledigt\t#14\t'$Y$'\tNebenzweig' \
  $'erledigt\t#15\t'$B$'\tgeändert' \
  $'erledigt\t#16\tdeadbeefcafe\tkein Commit' > $T/antwort
# während der Claude-Runde: neue Notiz bei PVTI_g, neuer Kommentar bei #15
cat > $T/claude-hook <<ENDE
jq '(.items[] | select(.id == "PVTI_g") | .body) += "\n\nneue Notiz"' $T/board.json > $T/b.neu && mv $T/b.neu $T/board.json
jq 'map(if .number == 15 then .updatedAt = "2026-11-21T10:00:00Z" else . end)' $T/issues.json > $T/i.neu && mv $T/i.neu $T/issues.json
ENDE

export HALO_REPO=$R HALO_AUF_BOARD="zsh $T/board.sh" HALO_AUF_GH="zsh $T/gh.sh" HALO_AUF_CLAUDE="zsh $T/claude.sh" \
  HALO_AUF_NACHT=$T/nacht HALO_AUF_BERICHTE=$T/berichte HALO_AUF_FRAGEN=$T/fragen.md HALO_AUF_WT=$T/wt HALO_AUF_HEUTE=2026-11-21 \
  HALO_AUF_KONTINGENT="Woche 40 % (Zurücksetzen 01:00), 5 Stunden 20 %, Status allowed" HALO_AUF_SOLL=50 HALO_AUF_FREI=1 \
  HALO_AUF_ABNAHME=0 HALO_AUF_UHR=1200 HALO_AUF_TAKT=0 HALO_PUSH_TROCKEN=1 HALO_PAUSEN_DATEI=$T/pausen.txt \
  HALO_VOLLDAMPF_DATEI=$T/kein-volldampf.txt HALO_TAGESROUTINE_CONF=$T/keine.conf
lauf() { zsh $HIER/aufraeumen-nach-release.zsh "$@" 2>&1 }
zeile() { print -r -- $aus | grep -q -- "$1" }
heute=$(TZ=Europe/Vienna date +%F)

# --- Probe: zählt, ruft kein Claude, schreibt nichts ---
aus=$(lauf --probe 1.1.0); rc=$?
pruefe "Probe: Exitcode 0" '(( rc == 0 ))'
pruefe "Probe: offene Einträge und Issues" 'zeile "^würde prüfen: PVTI_a \[Todo\] Mail: Fehler A" && zeile "^würde prüfen: PVTI_abg " && zeile "^würde prüfen: Issue #10 Fehler B"'
pruefe "Probe: ohne Wartet auf OK, Wartet bewusst bis und offene Abnahme" '! zeile PVTI_ok && ! zeile PVTI_bew && ! zeile PVTI_abn'
pruefe "Probe: Summe mit Release-Bereich" 'zeile "Probe gegen v1.0.0..v1.1.0, 9 Board-Einträge und 7 offene Issues würden geprüft"'
pruefe "Probe: kein Claude, nichts geschrieben" '[[ ! -e $T/claude.args && ! -e $T/folge.log ]] && cmp -s $T/board.json $T/board.anfang.json && cmp -s $T/issues.json $T/issues.anfang.json'
pruefe "Probe: nur offene Issues, ohne Pull Requests (gh issue list --state open)" 'grep -q "issue list -R sruf79/halo-spaces --state open" $T/gh.args'

# --- echter Lauf ---
aus=$(lauf 1.1.0); rc=$?
pruefe "Lauf: Exitcode 0" '(( rc == 0 ))'
pruefe "Claude: Opus, auto, eigene Sitzung" 'grep -q -- "-p --model opus --session-id [0-9a-f-]* --permission-mode auto" $T/claude.args'
pruefe "Claude: in der Arbeitskopie am Release-Stand" '[[ $(<$T/claude.pwd) == $T/wt/v1.1.0-* && ! -e $(<$T/claude.pwd)/x.txt ]]'
pruefe "Claude: Prompt mit Bereich, CI, Einträgen, Issues und Auftrag" 'grep -q "^Release-Bereich: v1.0.0..v1.1.0" $T/claude.prompt && grep -q "^Release-CI: grün" $T/claude.prompt && grep -q "^- PVTI_a | Todo | Mail: Fehler A" $T/claude.prompt && grep -q "^- #13 | Wunsch mit Tab" $T/claude.prompt && grep -q "Auftrag „Aufräumen nach dem Release“" $T/claude.prompt'
pruefe "Board erledigt: Notiz mit Version und Beleg, dann Done mit Hash" 'grep -q "^notiz PVTI_a erledigt in v1.1.0 ($A), Aufräumen nach Release v1.1.0: Fehler A behoben in Mail, zur Ab-nahme kein Anlass" $T/folge.log && grep -q "^status PVTI_a done $A" $T/folge.log'
pruefe "Board erledigt, früheres Release: „erledigt bis“" 'grep -q "^notiz PVTI_s erledigt bis v1.1.0 (in v1.0.0) ($S)" $T/folge.log && grep -q "^status PVTI_s done $S" $T/folge.log'
pruefe "Board: abgenommener Design-Eintrag schließt" 'grep -q "^status PVTI_abg done $A" $T/folge.log'
pruefe "Board: nicht geschlossen (nach dem Release, Nebenzweig, Reihe, geändert, nicht verlangt)" '! grep -q "PVTI_x\|PVTI_y\|PVTI_r\|PVTI_g\|PVTI_ok\|PVTI_o " $T/folge.log'
pruefe "Board: nur drei Done" '[[ $(grep -c "^status .* done" $T/folge.log) == 3 ]]'
pruefe "Maintainer (Board): Zeile für den Morgenbrief und Notiz „Entscheidung fehlt seit“" 'grep -q "| v1.1.0 | PVTI_m | Optik: Frage | Soll das Grau bleiben?" $T/fragen.md && grep -q "^notiz PVTI_m Entscheidung fehlt seit $heute: Soll das Grau bleiben? (Aufräumen nach Release v1.1.0)" $T/folge.log'
pruefe "Maintainer (Issue): Zeile für den Morgenbrief, nichts auf GitHub" 'grep -q "| v1.1.0 | #13 | Wunsch mit Tab | Soll der Wunsch" $T/fragen.md && ! grep -q "#13" $T/folge.log'
pruefe "Issue erledigt: fester Text mit Version des Release" 'grep -qx "close #10 completed Fixed in 1.1.0. Thunderbird installs the update automatically. Thanks for reporting!" $T/folge.log'
pruefe "Issue erledigt, früheres Release: Fixed in 1.0.0" 'grep -q "^close #11 completed Fixed in 1.0.0\." $T/folge.log'
pruefe "Issue: nicht geschlossen (nach dem Release, Nebenzweig, neuer Kommentar, kein Commit)" '! grep -q "close #1[2456]" $T/folge.log'
pruefe "nie unerwartete gh-Aufrufe (kein Kommentar ohne Schließen, keine PRs)" '! grep -q UNERWARTET $T/folge.log'
pruefe "Summe" 'zeile "Board geschlossen 3, Issues geschlossen 2, an den Maintainer 2, offen 1, ausgelassen 0, vom Skript abgelehnt 8, ohne Ergebnis 0"'
B=$T/berichte/2026-11-21-aufraeumen-v1.1.0.md
pruefe "Bericht mit Kopf, Ergebnis und Gründen der Ablehnung" 'grep -q "^# Aufräumen nach Release v1.1.0" $B && grep -q "^## Ergebnis (Skript)" $B && grep -q "PVTI_x .*nicht auf main und im Release" $B && grep -q "PVTI_r .*Reihe n/m" $B && grep -q "PVTI_g .*seit der Prüfung geändert" $B && grep -q "#15 .*seit der Prüfung geändert" $B'
pruefe "Arbeitskopie und Sperre entfernt" '[[ $(git -C $R worktree list | wc -l) -eq 1 && ! -e $T/nacht/aufraeumen-release.lock.d ]]'
pruefe "Protokoll der geschlossenen Issues" 'grep -q "geschlossen #10 (Fixed in 1.1.0" $T/nacht/aufraeumen-issues.log'

# --- zweiter Lauf: Geschlossenes kein Kandidat, Fragen nicht doppelt (auch nach der eigenen Notiz) ---
rm -f $T/claude-hook
aus=$(lauf 1.1.0); rc=$?
pruefe "Zweitlauf: Geschlossenes nicht mehr im Prompt" '! grep -q "^- PVTI_a \|^- PVTI_s \|^- #10 \|^- #11 " $T/claude.prompt && grep -q "^- PVTI_m " $T/claude.prompt'
pruefe "Zweitlauf: Maintainer-Fragen nicht doppelt" '[[ $(grep -c PVTI_m $T/fragen.md) == 1 && $(grep -c "#13" $T/fragen.md) == 1 && $(grep -c "^notiz PVTI_m" $T/folge.log) == 1 ]]'
pruefe "Zweitlauf: Exitcode 0, nichts doppelt geschlossen" '(( rc == 0 )) && [[ $(grep -c "^close #10" $T/folge.log) == 1 ]]'

# --- Modell mindestens Opus ---
aus=$(HALO_AUF_MODELL=sonnet lauf 1.1.0)
pruefe "Modell: Sonnet wird zu Opus" 'grep -q -- "--model opus" $T/claude.args'

# --- Warten: Abnahme, Uhrzeit, Kontingent (AUF_WARTEN_MAX=0: gleich entscheiden) ---
rm -f $T/claude.args
aus=$(AUF_WARTEN_MAX=0 HALO_AUF_ABNAHME=1 lauf 1.1.0)
pruefe "Abnahme läuft noch: nicht begonnen, kein Claude" 'zeile "nicht begonnen (Abnahme nach Release läuft noch)" && [[ ! -e $T/claude.args ]]'
aus=$(AUF_WARTEN_MAX=0 HALO_AUF_UHR=0300 lauf 1.1.0)
pruefe "Nachtzeit: nicht begonnen" 'zeile "nicht begonnen (außerhalb 09:00–23:00" && [[ ! -e $T/claude.args ]]'
aus=$(HALO_AUF_KONTINGENT="Woche 99 % (Zurücksetzen 01:00), 5 Stunden 20 %, Status allowed" lauf 1.1.0); rc=$?
pruefe "Wochenlimit: aufs nächste Release verschoben, kein Claude" '(( rc == 0 )) && zeile "aufs nächste Release verschoben" && [[ ! -e $T/claude.args ]]'
aus=$(AUF_WARTEN_MAX=0 HALO_AUF_KONTINGENT="Woche 40 % (Zurücksetzen 01:00), 5 Stunden 90 %, Status allowed" lauf 1.1.0)
pruefe "5-Stunden-Fenster voll: nicht begonnen" 'zeile "nicht begonnen (Kontingent: 5-Stunden-Fenster 90 %" && [[ ! -e $T/claude.args ]]'
aus=$(AUF_WARTEN_MAX=0 HALO_AUF_SOLL=20 lauf 1.1.0)
pruefe "Woche weit über dem Soll (ohne Volldampf): nicht begonnen" 'zeile "nicht begonnen (Kontingent: Woche 40 %, Soll 20 %" && [[ ! -e $T/claude.args ]]'
aus=$(AUF_WARTEN_MAX=0 HALO_AUF_FREI="CI-Lauf auf dem GitHub-Runner" lauf 1.1.0); rc=$?
pruefe "neon dauerhaft belegt: läuft trotzdem (keine Testläufe)" '(( rc == 0 )) && [[ -e $T/claude.args ]]'

# --- Pause, Sperre ---
rm -f $T/claude.args
print -r -- "release-aufraeumen 2999-12-31T00:00+01:00 Probe" > $T/pausen.txt
aus=$(lauf 1.1.0); rc=$?
pruefe "Pause release-aufraeumen: nichts getan" '(( rc == 0 )) && zeile "pausiert" && [[ ! -e $T/claude.args ]]'
rm -f $T/pausen.txt
mkdir -p $T/nacht/aufraeumen-release.lock.d; print $$ > $T/nacht/aufraeumen-release.lock.d/pid
aus=$(lauf 1.1.0)
pruefe "Sperre eines laufenden Laufs: entfällt" 'zeile "läuft schon" && [[ ! -e $T/claude.args ]]'
print 999999 > $T/nacht/aufraeumen-release.lock.d/pid
aus=$(lauf 1.1.0)
pruefe "verwaiste Sperre: übernommen" '[[ -e $T/claude.args && ! -e $T/nacht/aufraeumen-release.lock.d ]]'

# --- Issues nicht lesbar: nur das Board ---
touch $T/gh-kaputt
aus=$(lauf --probe 1.1.0); rc=$?
pruefe "Issues nicht lesbar: Probe mit Board allein" '(( rc == 0 )) && zeile "Board-Einträge und Issues nicht lesbar würden geprüft"'
aus=$(lauf 1.1.0); rc=$?
pruefe "Issues nicht lesbar: Lauf ohne Issues im Prompt" '(( rc == 0 )) && grep -q "nicht lesbar, nur das Board prüfen" $T/claude.prompt'
rm -f $T/gh-kaputt

# --- Claude ohne Ergebnis ---
mv $T/antwort $T/antwort.weg; : > $T/folge.log
aus=$(lauf 1.1.0); rc=$?
pruefe "Claude ohne Ergebnis: Exitcode 1, nichts geschrieben, an neon" '(( rc == 1 )) && [[ ! -s $T/folge.log ]] && zeile "TROCKEN: an_neon .*Claude ohne Ergebnis"'
mv $T/antwort.weg $T/antwort

# --- Board nicht lesbar ---
rm -f $T/claude.args; mv $T/board.json $T/board.weg
aus=$(lauf 1.1.0); rc=$?
pruefe "Board nicht lesbar: Exitcode 1, kein Claude, an neon" '(( rc == 1 )) && [[ ! -e $T/claude.args ]] && zeile "TROCKEN: an_neon .*Board nicht lesbar"'
aus=$(lauf --probe 1.1.0); rc=$?
pruefe "Board nicht lesbar, Probe: keine Meldung an neon" '(( rc == 1 )) && ! zeile an_neon'
mv $T/board.weg $T/board.json

# --- Hintergrund: kehrt sofort zurück, Lauf schreibt seine Ausgabe ---
print '{"items":[]}' > $T/board.json; print '[]' > $T/issues.json
aus=$(lauf --hintergrund 1.1.0); rc=$?
pruefe "Hintergrund: Exitcode 0, sofort zurück" '(( rc == 0 )) && zeile "im Hintergrund gestartet, nach der Abnahme"'
for i in {1..50}; do grep -q "keine offenen Einträge" $T/nacht/aufraeumen-v1.1.0.out 2>/dev/null && break; sleep 0.2; done   # (Warten auf den abgekoppelten Lauf)
pruefe "Hintergrund: Lauf hat geschrieben" 'grep -q "keine offenen Einträge und Issues" $T/nacht/aufraeumen-v1.1.0.out'

# --- falscher Aufruf ---
aus=$(lauf 1.1); rc=$?
pruefe "Aufruf ohne x.y.z: Exitcode 2" '(( rc == 2 ))'

(( FEHLER )) && { print "aufraeumen_nach_release_test: FEHLER"; exit 1 }
print "aufraeumen_nach_release_test: alle Fälle grün"
