#!/bin/zsh
# Prüfung von tests/abnahme-nach-release.zsh ohne Claude, ohne Netz, im Wegwerf-Ordner: kleines Git-Repo mit zwei
# Release-Tags, Attrappen für tests/board.sh ($T/board.json; notiz hängt an, status todo ändert den Status, status done
# entfernt den Eintrag wie das Archivieren) und für claude (schreibt $T/antwort in die Ergebnisdatei aus dem Prompt),
# Kontingent, Uhrzeit und „neon frei“ über Umgebungsvariablen, an_neon nur ausgegeben (HALO_PUSH_TROCKEN). Das echte
# Board und Claude werden nie aufgerufen. Aufruf: zsh tests/abnahme_nach_release_test.zsh → je Fall OK/FEHLER, Exitcode 1
# bei einem Fehler.
emulate -L zsh
HIER=${0:A:h}
T=$(mktemp -d) || exit 1
trap 'rm -rf $T' EXIT
FEHLER=0
ok() { print "OK      $1" }
fehler() { print "FEHLER  $1${2:+ – $2}"; FEHLER=1 }
pruefe() { local n=$1; shift; if eval "$@" >/dev/null 2>&1; then ok $n; else fehler $n; fi }

# --- Repo: v1.0.0 (S), A, B, C, v1.1.0, danach X (nicht im Release) ---
R=$T/repo; mkdir -p $R; cd $R
git init -q -b main . && git config user.email t@t && git config user.name t
c() { print -r -- $2 >> $1; git add $1; git commit -q -m $3; git rev-parse --short=7 HEAD }
S=$(c a.txt 0 "Start"); git tag v1.0.0
A=$(c a.txt 1 "Optik: Knopf")
B=$(c b.txt 1 "Optik: Leiste")
C=$(c c.txt 1 "Optik: Farbe")
git tag v1.1.0
X=$(c x.txt 1 "Optik: nach dem Release")
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
         if [[ $3 == done ]]; then jq --arg i $2 'del(.items[] | select(.id == $i))' $B > $B.neu
         else jq --arg i $2 '(.items[] | select(.id == $i) | .status) = "Todo"' $B > $B.neu; fi
         mv $B.neu $B ;;
  *) exit 2 ;;
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
print "fertig"
ENDE
jq -n --arg S $S --arg A $A --arg B $B --arg C $C --arg X $X '{items: [
 {id: "PVTI_k1", status: "In Progress", title: "Optik: Knopf", body: "Wo: Mail\n\ncommittet, wartet auf Push/CI (\($A)); zur Abnahme 2026-11-18"},
 {id: "PVTI_k2", status: "In Progress", title: "Optik: Leiste", body: "committet, wartet auf Push/CI (\($B)); zur Abnahme 2026-11-18"},
 {id: "PVTI_k3", status: "In Progress", title: "Optik: Farbe", body: "committet (\($C)); zur Abnahme 2026-11-18"},
 {id: "PVTI_k4", status: "In Progress", title: "Optik: vier", body: "committet (\($A)); zur Abnahme 2026-11-18"},
 {id: "PVTI_k5", status: "In Progress", title: "Optik: fünf", body: "committet (\($A)); zur Abnahme 2026-11-18"},
 {id: "PVTI_frueh", status: "In Progress", title: "Optik: früher", body: "committet (\($S)); zur Abnahme 2026-11-10"},
 {id: "PVTI_x", status: "In Progress", title: "Optik: nach dem Release", body: "committet (\($X)); zur Abnahme 2026-11-19"},
 {id: "PVTI_xa", status: "In Progress", title: "Optik: halb nach dem Release", body: "committet (\($A)); zur Abnahme 2026-11-18\n\nÜberarbeitet, committet (\($X)); zur Abnahme 2026-11-19"},
 {id: "PVTI_abg", status: "In Progress", title: "Optik: schon abgenommen", body: "committet (\($A)); zur Abnahme 2026-11-18\n\nabgenommen vom Maintainer"},
 {id: "PVTI_alt", status: "Todo", title: "Optik: Mangel alt", body: "committet (\($A)); zur Abnahme 2026-11-18\n\nAbnahme: Mangel – Radius 6 statt 7 px"},
 {id: "PVTI_ok", status: "Wartet auf OK", title: "Optik: wartet", body: "committet (\($A)); zur Abnahme 2026-11-18"},
 {id: "PVTI_ohne", status: "In Progress", title: "Mail: kein Design", body: "committet (\($A)), wartet auf Push/CI"}
]}' > $T/board.json
cp $T/board.json $T/board.anfang.json
print -l -- \
  $'abgenommen\tPVTI_k1\tHöhe 28 px wie Vorlage 28 px, zur Abnahme vorgelegt war alles' \
  $'mangel\tPVTI_k2\tRadius 6 px statt 7 px (Abschnitt 4), nicht abgenommen' \
  $'maintainer\tPVTI_k3\tSoll das Grau so blass bleiben wie in der Vorlage?' \
  $'ausgelassen\tPVTI_k4\tVorlage fehlt' \
  $'abgenommen\tPVTI_frueh\tAbstand 8 px wie Vorlage' \
  $'abgenommen\tPVTI_x\tdarf nicht geschrieben werden' > $T/antwort

export HALO_REPO=$R HALO_ABN_BOARD="zsh $T/board.sh" HALO_ABN_CLAUDE="zsh $T/claude.sh" HALO_ABN_NACHT=$T/nacht \
  HALO_ABN_BERICHTE=$T/berichte HALO_ABN_FRAGEN=$T/fragen.md HALO_ABN_WT=$T/wt HALO_ABN_HEUTE=2026-11-20 \
  HALO_ABN_KONTINGENT="Woche 40 % (Zurücksetzen 01:00), 5 Stunden 20 %, Status allowed" HALO_ABN_SOLL=50 HALO_ABN_FREI=1 \
  HALO_ABN_UHR=1200 HALO_ABN_TAKT=0 HALO_PUSH_TROCKEN=1 HALO_PAUSEN_DATEI=$T/pausen.txt HALO_VOLLDAMPF_DATEI=$T/kein-volldampf.txt \
  HALO_TAGESROUTINE_CONF=$T/keine.conf HALO_BNR_ZWEIFEL=$T/zweifel.md HALO_BNR_LOG=$T/bnr.log
lauf() { zsh $HIER/abnahme-nach-release.zsh "$@" 2>&1 }
zeile() { print -r -- $aus | grep -q -- "$1" }
heute=$(TZ=Europe/Vienna date +%F)

# --- Probe: zeigt, ruft kein Claude, schreibt nichts ---
aus=$(lauf --probe 1.1.0); rc=$?
pruefe "Probe: Exitcode 0" '(( rc == 0 ))'
pruefe "Probe: Kandidaten mit Commit im Release" 'zeile "^würde prüfen: PVTI_k1 " && zeile "^würde prüfen: PVTI_k5 "'
pruefe "Probe: Commit aus früherem Release zählt" 'zeile "^würde prüfen: PVTI_frueh "'
pruefe "Probe: keine Kandidaten ohne Release-Commit, abgenommen, mit Mangel, Wartet auf OK, ohne Markierung" '! zeile "PVTI_x " && ! zeile PVTI_xa && ! zeile PVTI_abg && ! zeile PVTI_alt && ! zeile PVTI_ok && ! zeile PVTI_ohne'
pruefe "Probe: Summe" 'zeile "Probe, 6 Einträge würden geprüft"'
pruefe "Probe: kein Claude, nichts geschrieben" '[[ ! -e $T/claude.args && ! -e $T/folge.log ]] && cmp -s $T/board.json $T/board.anfang.json'

# --- echter Lauf ---
aus=$(lauf 1.1.0); rc=$?
pruefe "Lauf: Exitcode 0" '(( rc == 0 ))'
pruefe "Claude: Opus, auto, eigene Sitzung" 'grep -q -- "-p --model opus --session-id [0-9a-f-]* --permission-mode auto" $T/claude.args'
pruefe "Claude: in der Arbeitskopie am Release-Stand (ohne Commit danach)" '[[ $(<$T/claude.pwd) == $T/wt/v1.1.0-* && ! -e $(<$T/claude.pwd)/x.txt ]]'
pruefe "Claude: Prompt nennt grüne Release-CI, Einträge und Auftrag" 'grep -q "^Release-CI: grün (CI-Lauf 1" $T/claude.prompt && grep -q "^- PVTI_k1 | Optik: Knopf | $A" $T/claude.prompt && grep -q "^Testläufe: erlaubt" $T/claude.prompt && grep -q "Auftrag „Abnahme“" $T/claude.prompt'
pruefe "abgenommen: Notiz mit Datum, Version und Begründung (ohne „zur Abnahme“)" 'grep -q "^notiz PVTI_k1 abgenommen $heute (automatische Abnahme v1.1.0): Höhe 28 px wie Vorlage 28 px, zur Ab-nahme" $T/folge.log'
pruefe "abgenommen: gleich danach geschlossen (board-nach-release --nur-abgenommen)" 'grep -q "^status PVTI_k1 done $A" $T/folge.log'
pruefe "abgenommen, früheres Release: geschlossen mit „erledigt bis“" 'grep -q "^notiz PVTI_frueh erledigt bis v1.1.0 ($S, nach Abnahme)" $T/folge.log && grep -q "^status PVTI_frueh done $S" $T/folge.log'
pruefe "Mangel: Notiz und Status todo, „abgenommen“ im Text entschärft" 'grep -q "^notiz PVTI_k2 Abnahme: Mangel – Radius 6 px statt 7 px (Abschnitt 4), nicht ab-genommen (automatische Abnahme v1.1.0, $heute)" $T/folge.log && grep -q "^status PVTI_k2 todo" $T/folge.log && ! grep -q "^status PVTI_k2 done" $T/folge.log'
pruefe "Maintainer: Zeile für den Morgenbrief, nichts im Board" 'grep -q "| v1.1.0 | PVTI_k3 | Optik: Farbe | Soll das Grau so blass bleiben" $T/fragen.md && ! grep -q PVTI_k3 $T/folge.log'
pruefe "ausgelassen und ohne Ergebnis: nichts im Board" '! grep -q "PVTI_k4\|PVTI_k5" $T/folge.log'
pruefe "nicht verlangter Eintrag aus der Ergebnisdatei: übergangen" '! grep -q PVTI_x $T/folge.log'
pruefe "nie Done ohne Abnahme (von Hand abgenommener Eintrag schließt mit)" '[[ $(grep "^status .* done" $T/folge.log | cut -d" " -f2 | sort | xargs) == "PVTI_abg PVTI_frueh PVTI_k1" ]]'
pruefe "keine Zweifel-Zeilen aus dem zweiten Board-Lauf" '[[ ! -s $T/zweifel.md ]]'
pruefe "Summe" 'zeile "abgenommen 2, Mangel 1, an den Maintainer 1, ausgelassen 1, ohne Ergebnis 1; Board nach Abnahme, Release v1.1.0 .*geschlossen 3,"'
pruefe "Bericht mit Kopf und Ergebnis" 'grep -q "^# Automatische Abnahme v1.1.0" $T/berichte/2026-11-20-abnahme-v1.1.0.md && grep -q "^## Ergebnis (Skript)" $T/berichte/2026-11-20-abnahme-v1.1.0.md'
pruefe "Arbeitskopie und Sperre entfernt" '[[ $(git -C $R worktree list | wc -l) -eq 1 && ! -e $T/nacht/abnahme.lock.d ]]'
pruefe "Protokoll nennt die Sitzung (aktive_sitzung übergeht sie)" 'grep -q "Start Claude (opus), Sitzung " $T/nacht/abnahme-nach-release.log'

# --- zweiter Lauf: nur noch Offenes, Maintainer-Frage nicht nochmals ---
aus=$(lauf 1.1.0); rc=$?
pruefe "Zweitlauf: nur ausgelassene und unbeantwortete Einträge" 'grep -q "^- PVTI_k4 " $T/claude.prompt && grep -q "^- PVTI_k5 " $T/claude.prompt && ! grep -q "^- PVTI_k[123] \|^- PVTI_frueh " $T/claude.prompt'
pruefe "Zweitlauf: Maintainer-Frage nicht doppelt" '[[ $(grep -c PVTI_k3 $T/fragen.md) == 1 ]]'

# --- Modell mindestens Opus ---
rm -f $T/claude.args
aus=$(HALO_ABN_MODELL=sonnet lauf 1.1.0)
pruefe "Modell: Sonnet wird zu Opus" 'grep -q -- "--model opus" $T/claude.args'

# --- Warten und Kontingent (ABN_WARTEN_MAX=0: gleich entscheiden) ---
rm -f $T/claude.args
aus=$(HALO_ABN_KONTINGENT="Woche 99 % (Zurücksetzen 01:00), 5 Stunden 20 %, Status allowed" lauf 1.1.0); rc=$?
pruefe "Wochenlimit: aufs nächste Release verschoben, kein Claude" '(( rc == 0 )) && zeile "aufs nächste Release verschoben" && [[ ! -e $T/claude.args ]]'
aus=$(ABN_WARTEN_MAX=0 HALO_ABN_KONTINGENT="Woche 40 % (Zurücksetzen 01:00), 5 Stunden 90 %, Status allowed" lauf 1.1.0)
pruefe "5-Stunden-Fenster voll: nicht begonnen, kein Claude" 'zeile "nicht begonnen (Kontingent: 5-Stunden-Fenster 90 %" && [[ ! -e $T/claude.args ]]'
aus=$(ABN_WARTEN_MAX=0 HALO_ABN_SOLL=20 lauf 1.1.0)
pruefe "Woche weit über dem Soll (ohne Volldampf): nicht begonnen" 'zeile "nicht begonnen (Kontingent: Woche 40 %, Soll 20 %" && [[ ! -e $T/claude.args ]]'
aus=$(ABN_WARTEN_MAX=0 HALO_ABN_UHR=0300 lauf 1.1.0)
pruefe "Nachtzeit: nicht begonnen" 'zeile "nicht begonnen (außerhalb 09:00–23:00" && [[ ! -e $T/claude.args ]]'
aus=$(HALO_ABN_KONTINGENT="nicht lesbar" lauf 1.1.0); rc=$?
pruefe "Kontingent nicht lesbar: läuft trotzdem (fail-open)" '(( rc == 0 )) && [[ -e $T/claude.args ]]'
rm -f $T/claude.args
aus=$(ABN_WARTEN_MAX=0 HALO_ABN_FREI="CI-Lauf auf dem GitHub-Runner" lauf 1.1.0)
pruefe "neon dauerhaft belegt: Abnahme ohne eigene Testläufe" '[[ -e $T/claude.args ]] && grep -q "^Testläufe: nicht erlaubt" $T/claude.prompt'

# --- Pause, Sperre ---
rm -f $T/claude.args
print -r -- "abnahme 2999-12-31T00:00+01:00 Probe" > $T/pausen.txt
aus=$(lauf 1.1.0); rc=$?
pruefe "Pause abnahme: nichts getan" '(( rc == 0 )) && zeile "pausiert" && [[ ! -e $T/claude.args ]]'
rm -f $T/pausen.txt
mkdir -p $T/nacht/abnahme.lock.d; print $$ > $T/nacht/abnahme.lock.d/pid
aus=$(lauf 1.1.0)
pruefe "Sperre eines laufenden Laufs: entfällt" 'zeile "läuft schon" && [[ ! -e $T/claude.args ]]'
print 999999 > $T/nacht/abnahme.lock.d/pid
aus=$(lauf 1.1.0)
pruefe "verwaiste Sperre: übernommen" '[[ -e $T/claude.args ]] && [[ ! -e $T/nacht/abnahme.lock.d ]]'

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
jq '.items |= map(select(.id != "PVTI_k4" and .id != "PVTI_k5"))' $T/board.json > $T/x && mv $T/x $T/board.json
aus=$(lauf --hintergrund 1.1.0); rc=$?
pruefe "Hintergrund: Exitcode 0, sofort zurück" '(( rc == 0 )) && zeile "im Hintergrund gestartet"'
for i in {1..50}; do grep -q "keine offenen Einträge" $T/nacht/abnahme-v1.1.0.out 2>/dev/null && break; sleep 0.2; done   # (Warten auf den abgekoppelten Lauf)
pruefe "Hintergrund: Lauf hat geschrieben" 'grep -q "keine offenen Einträge zur Abnahme" $T/nacht/abnahme-v1.1.0.out'

# --- falscher Aufruf ---
aus=$(lauf 1.1); rc=$?
pruefe "Aufruf ohne x.y.z: Exitcode 2" '(( rc == 2 ))'

(( FEHLER )) && { print "abnahme_nach_release_test: FEHLER"; exit 1 }
print "abnahme_nach_release_test: alle Fälle grün"
