# Prüfung der automatischen CI-Wiederholung (tests/ci-wiederholen.sh) ohne Claude, ohne Thunderbird, ohne Netz,
# im Wegwerf-Ordner (gh durch eine Attrappe ersetzt).
# Aufruf: zsh tests/ci_wiederholen_test.zsh   → je Fall eine Zeile OK/FEHLER, Exitcode 1 bei einem Fehler
emulate -L zsh
setopt extendedglob
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

# --- Attrappe für gh: liest Läufe, Jobs und Protokolle aus $T/gh, merkt sich Wiederholungen in $T/aufrufe ---
mkdir -p $T/gh $T/nacht $T/aufgaben
cat > $T/gh-attrappe <<'E'
#!/bin/zsh
D=$GH_DATEN
if [[ $1 == run && $2 == list ]]; then cat $D/liste; exit 0; fi
if [[ $1 == run && $2 == rerun ]]; then print -r -- "$*" >> $D/../aufrufe; exit $(<$D/rerun-rc); fi
if [[ $1 == run && $2 == view ]]; then
  id=$3 att= art=
  while (( $# )); do
    case $1 in --attempt) shift; att=$1 ;; --log-failed) art=log ;; --json) shift; art=json; feld=$1 ;; esac
    shift
  done
  [[ -z $att ]] && att=$(<$D/versuch-$id)
  if [[ $art == log ]]; then cat $D/log-$id-$att 2>/dev/null; exit 0; fi
  [[ $feld == databaseId* ]] && { grep "^$id " $D/liste; exit 0 }
  jq --argjson a $att '. + {attempt: $a}' $D/jobs-$id-$att; exit 0
fi
exit 1
E
chmod +x $T/gh-attrappe
export GH_WDH_BEFEHL=$T/gh-attrappe GH_DATEN=$T/gh
export HALO_NACHT_DIR=$T/nacht HALO_WAECHTER_LOG=$T/aufgaben/ci-waechter.log HALO_WAECHTER_STAND=$T/aufgaben/ci-waechter.stand
FLOG=$T/nacht/flackern.log FSTAND=$T/nacht/flackern.stand
print 0 > $T/gh/rerun-rc

JETZT_ISO=2026-11-18T15:00+01:00
BEGINN=$(python3 -I -c 'import sys, datetime; print(int(datetime.datetime.fromisoformat(sys.argv[1]).timestamp()) - 1800)' $JETZT_ISO)
# lauf <ID> <status> <conclusion> <Ereignis> <Versuch> <Zweig> [<Minuten vor jetzt>]: Zeile für „gh run list“
lauf() { print -r -- "$1 $2 $3 $(( BEGINN + 1800 - ${7:-30} * 60 )) sha$1 $4 $5 $6"; print $5 > $T/gh/versuch-$1 }
# jobs <ID> <Versuch> <Job>=<Ergebnis>[:<roter Schritt>] … [teil]
jobs() {
  local id=$1 att=$2 x teil=skipped j=(); shift 2
  for x in "$@"; do
    [[ $x == teil ]] && { teil=success; continue }
    local name=${x%%=*} rest=${x#*=}
    j+=("$(jq -n --arg n $name --arg c ${rest%%:*} --arg s "${${rest#*:}:#$rest}" '{name: $n, conclusion: $c, steps: (if $s != "" then [{name: $s, conclusion: "failure"}] else [] end)}')")
  done
  print -rl -- $j | jq -s --arg t $teil '{jobs: ([{name: "changes", conclusion: "success", steps: [{name: "Nur Teil der Prüfungen", conclusion: $t}]}] + .)}' > $T/gh/jobs-$id-$att
}
# protokoll <ID> <Versuch> <Job> <Prüfung> <Text> …  (je drei Angaben eine FEHLER-Zeile)
protokoll() {
  local id=$1 att=$2; shift 2; : > $T/gh/log-$id-$att
  while (( $# >= 3 )); do print -r -- "$1	Test	2026-11-18T13:00:00.0000000Z FEHLER  $2 – $3" >> $T/gh/log-$id-$att; shift 3; done
}
los() { HALO_JETZT=${JETZT:-$JETZT_ISO} zsh $HIER/ci-wiederholen.sh "$@" 2>$T/err }
neu() { rm -f $FLOG $FSTAND $T/aufrufe $T/aufgaben/*(N) $T/gh/liste $T/gh/jobs-*(N) $T/gh/log-*(N) $T/nacht/*.lock(N); print 0 > $T/gh/rerun-rc; JETZT= }
wdh() { [[ -r $T/aufrufe ]] && wc -l < $T/aufrufe | tr -d ' ' || print 0 }
P="Today-Pane: Ein-/Ausblenden flüssig (kein Sprung)"

# 1. Linux rot auf einem Prüfzweig, erster Versuch: einmal wiederholen, Prüfung mit Messwert im Protokoll
neu
lauf 100 completed failure push 1 pruef/a > $T/gh/liste
jobs 100 1 "linux (esr)=failure:Test" "linux (beta)=success" "mac=skipped"
protokoll 100 1 "linux (esr)" $P "{'ein schmal': {'steps': 12, 'maxJump': 149, 'maxFrameMs': 77}}"
los
pruefe "Linux rot, erster Versuch: genau eine Wiederholung mit --failed" '[[ $(wdh) == 1 ]] && grep -q "run rerun 100 .*--failed" $T/aufrufe'
pruefe "Protokoll: Zeile „rot“ mit Lauf, Versuch, Zweig, Plattform, Prüfung und Messwert" \
  'awk -F"\t" -v p="$P" '"'"'$2 == "rot" && $3 == 100 && $4 == 1 && $5 == "pruef/a" && $7 == "linux (esr)" && $8 == p && $9 ~ /maxFrameMs.: 77/ { t = 1 } END { exit !t }'"'"' $FLOG'
pruefe "Protokoll: Zeile „wiederholt“, Stand „wiederholt“" 'grep -q "	wiederholt	100	2	" $FLOG && grep -qx "100 wiederholt" $FSTAND'
# 2. Wiederholung läuft noch: nichts Neues
lauf 100 in_progress - push 2 pruef/a > $T/gh/liste
los
pruefe "Wiederholung läuft: keine zweite Wiederholung, keine neue Zeile" '[[ $(wdh) == 1 ]] && [[ $(wc -l < $FLOG | tr -d " ") == 2 ]]'
# 3. Wiederholung grün: geflackert
lauf 100 completed success push 2 pruef/a > $T/gh/liste
jobs 100 2 "linux (esr)=success" "linux (beta)=success" "mac=skipped"
los
pruefe "Wiederholung grün: Zeile „flackert“ mit Prüfung und Plattform, Stand „fertig“" \
  'awk -F"\t" -v p="$P" '"'"'$2 == "flackert" && $3 == 100 && $7 == "linux (esr)" && $8 == p { t = 1 } END { exit !t }'"'"' $FLOG && grep -qx "100 fertig" $FSTAND'
pruefe "Prüfzweig: keine Zeile im Protokoll des CI-Wächters" '[[ ! -s $T/aufgaben/ci-waechter.log ]]'
los
pruefe "fertiger Lauf: kein weiterer Durchgang ändert etwas" '[[ $(wdh) == 1 ]] && [[ $(grep -c "	flackert	" $FLOG) == 1 ]]'

# 4. zweites Rot bleibt rot: keine weitere Wiederholung
neu
lauf 110 completed failure push 1 pruef/b > $T/gh/liste
jobs 110 1 "linux (esr)=failure:Test"; protokoll 110 1 "linux (esr)" $P "erster Messwert" "linux (esr)" "Andere Prüfung" "x"
los
lauf 110 completed failure push 2 pruef/b > $T/gh/liste
jobs 110 2 "linux (esr)=failure:Test"; protokoll 110 2 "linux (esr)" $P "zweiter Messwert"
los; los
pruefe "zweites Rot: „bleibt-rot“ mit dem Messwert der Wiederholung, die andere Prüfung „flackert“" \
  'grep -q "	bleibt-rot	110	2	pruef/b	sha110	linux (esr)	$P	zweiter Messwert" $FLOG && grep -q "	flackert	110	2	.*	Andere Prüfung	" $FLOG'
pruefe "zweites Rot: nur eine Wiederholung, auch nach weiteren Durchgängen" '[[ $(wdh) == 1 ]]'

# 5. schon von Hand wiederholt (Versuch 2) und rot: nicht anfassen
neu
lauf 120 completed failure push 2 pruef/c > $T/gh/liste
jobs 120 2 "linux (esr)=failure:Test"; protokoll 120 2 "linux (esr)" $P "x"
los
pruefe "Versuch 2 schon rot: keine Wiederholung, kein Protokoll" '[[ $(wdh) == 0 ]] && [[ ! -s $FLOG ]]'

# 6. viele rote Prüfungen: echter Fehler, keine Wiederholung
neu
lauf 130 completed failure push 1 pruef/d > $T/gh/liste
jobs 130 1 "linux (esr)=failure:Test"
protokoll 130 1 "linux (esr)" A a "linux (esr)" B b "linux (esr)" C c "linux (esr)" D d "linux (esr)" E e "linux (esr)" F f
los; los
pruefe "6 rote Prüfungen in einem Job: keine Wiederholung, einmal „ausgelassen“" '[[ $(wdh) == 0 ]] && [[ $(grep -c "	ausgelassen	130	" $FLOG) == 1 ]]'

# 7. roter Mac-Job: nachts nicht, ab 09:00 schon
neu
lauf 140 completed failure push 1 pruef/e > $T/gh/liste
jobs 140 1 "linux (esr)=success" "mac=failure:Test hell"; protokoll 140 1 "mac" $P "x"
JETZT=2026-11-18T00:45+01:00; BEGINN_ALT=$BEGINN
BEGINN=$(python3 -I -c 'import sys, datetime; print(int(datetime.datetime.fromisoformat(sys.argv[1]).timestamp()) - 1800)' $JETZT)
lauf 140 completed failure push 1 pruef/e > $T/gh/liste
los
pruefe "Mac rot um 00:45: keine Wiederholung, kein Stand (später erneut)" '[[ $(wdh) == 0 ]] && [[ ! -s $FSTAND ]]'
JETZT=2026-11-18T00:20+01:00
los
pruefe "Mac rot um 00:20: Wiederholung" '[[ $(wdh) == 1 ]]'
neu
JETZT=2026-11-18T03:00+01:00
lauf 141 completed failure push 1 pruef/e > $T/gh/liste
jobs 141 1 "linux (esr)=failure:Test" "mac=skipped"; protokoll 141 1 "linux (esr)" $P "x"
los
pruefe "nur Linux rot um 03:00: Wiederholung (belegt neon nicht)" '[[ $(wdh) == 1 ]]'
BEGINN=$BEGINN_ALT

# 8. Nachtlauf läuft: rote neon-Jobs bleiben ihm überlassen
neu
lauf 150 completed failure workflow_dispatch 1 main > $T/gh/liste
jobs 150 1 "windows=failure:Test Windows hell"; protokoll 150 1 "windows" "Testkonto: abgelehnte Mail" "Ausnahme: Unexpected alert dialog detected"
print 150 > $T/aufgaben/ci-waechter.stand
print $$ > $T/nacht/lauf.lock
los
pruefe "Nachtlauf läuft, Windows rot: keine Wiederholung" '[[ $(wdh) == 0 ]]'
los --lauf 150
pruefe "--lauf von Hand: Wiederholung trotz Nachtlauf, mit Protokoll" '[[ $(wdh) == 1 ]] && grep -q "	rot	150	1	main	sha150	windows	Testkonto: abgelehnte Mail	" $FLOG'

# 9. main: erst nach dem CI-Wächter; geflackert steht auch in seinem Protokoll
neu
lauf 160 completed failure push 1 main > $T/gh/liste
jobs 160 1 "linux (beta)=failure:Test" "mac=skipped"; protokoll 160 1 "linux (beta)" $P "x"
print 159 > $T/aufgaben/ci-waechter.stand
los
pruefe "main, vom CI-Wächter noch nicht ausgewertet: keine Wiederholung" '[[ $(wdh) == 0 ]] && [[ ! -s $FSTAND ]]'
print 160 > $T/aufgaben/ci-waechter.stand
los
pruefe "main, vom CI-Wächter ausgewertet: Wiederholung" '[[ $(wdh) == 1 ]]'
lauf 160 completed success push 2 main > $T/gh/liste
jobs 160 2 "linux (beta)=success" "mac=success"
los
pruefe "main geflackert: Zeile „flackert:“ im Protokoll des CI-Wächters (Wochenprüfung zählt sie)" \
  'grep -Eq "^[0-9-]+ [0-9:]+   flackert: linux \(beta\): Today-Pane" $T/aufgaben/ci-waechter.log'

# 10. nie: pull_request, Lauf mit Auswahl von Prüfungen, nur windows-github rot, älter als 6 Stunden
neu
{ lauf 170 completed failure pull_request 1 fremd; lauf 171 completed failure workflow_dispatch 1 pruef/f
  lauf 172 completed failure workflow_dispatch 1 pruef/g; lauf 173 completed failure push 1 pruef/h 400 } > $T/gh/liste
jobs 170 1 "linux (esr)=failure:Test"; protokoll 170 1 "linux (esr)" $P "x"
jobs 171 1 "linux (esr)=failure:Test" teil; protokoll 171 1 "linux (esr)" $P "x"
jobs 172 1 "windows-github=failure:Test Windows hell" "windows=success"; protokoll 172 1 "windows-github" $P "x"
jobs 173 1 "linux (esr)=failure:Test"; protokoll 173 1 "linux (esr)" $P "x"
los
pruefe "pull_request, Teil-Lauf, nur windows-github, älter als 6 Stunden: keine Wiederholung" '[[ $(wdh) == 0 ]] && ! grep -q "	rot	" $FLOG 2>/dev/null'

# 11. Job ohne FEHLER-Zeile (Pakete, Start): wiederholen; grün danach heißt geflackert
neu
lauf 180 completed failure push 1 pruef/i > $T/gh/liste
jobs 180 1 "linux (release)=failure:Pakete"; protokoll 180 1
los
pruefe "Job ohne FEHLER-Zeile: Wiederholung, Zeile nennt den roten Schritt" '[[ $(wdh) == 1 ]] && grep -q "	rot	180	1	pruef/i	sha180	linux (release)	(Job ohne FEHLER-Zeile: Pakete)" $FLOG'
lauf 180 completed success push 2 pruef/i > $T/gh/liste
jobs 180 2 "linux (release)=success"
los
pruefe "Job ohne FEHLER-Zeile, danach grün: „flackert“" 'grep -q "	flackert	180	2	.*(Job ohne FEHLER-Zeile: Pakete)" $FLOG'

# 12. Trockenlauf: nichts auslösen, nichts schreiben
neu
lauf 190 completed failure push 1 pruef/j > $T/gh/liste
jobs 190 1 "linux (esr)=failure:Test"; protokoll 190 1 "linux (esr)" $P "x"
los --trocken
pruefe "--trocken: keine Wiederholung, kein Protokoll, kein Stand; zeigt die Prüfung" '[[ $(wdh) == 0 ]] && [[ ! -e $FLOG && ! -e $FSTAND ]] && grep -q "Today-Pane" $T/err'

# 13. gh run rerun scheitert: festhalten, nicht endlos versuchen
neu
lauf 200 completed failure push 1 pruef/k > $T/gh/liste
jobs 200 1 "linux (esr)=failure:Test"; protokoll 200 1 "linux (esr)" $P "x"
print 1 > $T/gh/rerun-rc
los; RC1=$?; los
pruefe "gh run rerun scheitert: Exitcode 1, „ausgelassen“, kein weiterer Versuch" '(( RC1 == 1 )) && [[ $(wdh) == 1 ]] && grep -q "	ausgelassen	200	.*gh run rerun gescheitert" $FLOG'

print "\n$N Prüfungen, $( (( FEHLER )) && print "mit Fehlern" || print "alle OK")"
exit $FEHLER
