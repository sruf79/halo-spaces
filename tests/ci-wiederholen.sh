#!/bin/zsh
# CI-Wiederholung (ohne Claude, nur gh): wiederholt die fehlgeschlagenen Jobs eines roten Laufs von test.yml
# EINMAL automatisch (gh run rerun --failed) und schreibt jede rote Prüfung und das Ergebnis der Wiederholung
# nach ~/halo-nacht/flackern.log – damit niemand von Hand wiederholen muss und Flackern trotzdem gezählt wird
# (Anlass: Maintainer 18.11.2026 „das problem mit dem flackern kostet uns extrem viel zeit“). Ein zweites Rot
# bleibt rot: nie mehr als eine Wiederholung je Lauf, die Prüfungen selbst bleiben unverändert streng.
# Regeln:
#   - nur Läufe aus Push oder Start von Hand (nie pull_request), abgeschlossen, rot, erster Versuch, höchstens
#     CI_WDH_STUNDEN (6) alt; Läufe mit Auswahl von Prüfungen (Schritt „Nur Teil der Prüfungen“) nicht
#   - mehr als CI_WDH_MAX_ROT (5) rote Prüfungen in einem Job gelten als echter Fehler: keine Wiederholung
#   - rote Jobs auf neon (mac, windows) nur zwischen 09:00 und 00:00 Wiener Zeit (gemeinsame Startgrenze mit dem
#     Zwischen-Release-Wächter, neon 18.11.2026: eine Wiederholung dauert bis 50 Min., um 01:30 darf nichts mehr laufen,
#     bis 09:00 gilt die Push-Sperre) und nicht, solange Nachtlauf oder Wochenprüfung laufen – die warten selbst
#     auf ihre CI; Linux-Jobs laufen bei GitHub und belegen neon nicht
#   - Läufe auf main erst, wenn der CI-Wächter sie ausgewertet hat (Stand ~/halo-aufgaben/ci-waechter.stand): sein
#     Eintrag „Tests: CI rot …“ entsteht wie bisher aus dem roten Versuch, nichts geht verloren
#   - windows-github (continue-on-error) zählt nicht
#   - veralteter Stand (Fable-Agent im Auftrag des Maintainers, 21.11.2026): steckt origin/main nicht im Commit des
#     Laufs und hat main seit dem gemeinsamen Vorfahren etwas an den Prüfungen oder am Thunderbird-Code geändert
#     (ALT_PFADE: tests/halo_test.py, chrome, extension), dann fehlen dem Lauf evtl. Fixes von main. Wiederholt wird
#     wie immer (der Zweig braucht seinen grünen Stand), aber ein Grün in der Wiederholung heißt dann „flackert-alt“:
#     es zählt nicht für „zum zweiten Mal in 7 Tagen“ und löst keine Meldung an neon aus. Anlass: der Zweig der
#     Tagesroutine lag am 21.11.2026 22 Commits hinter main, vier Läufe meldeten Flackern einer Prüfung, die auf main
#     schon behoben war. Lässt sich der Stand nicht bestimmen (kein Repo, Commit unbekannt), zählt der Lauf wie bisher.
# Die Testmarke bleibt, wie sie ist: release.sh verlangt einen vollständig grünen Lauf zum Stand – ein Lauf, der
# in der Wiederholung grün wird, zählte schon bisher (Wiederholung von Hand). Geflackert heißt nicht repariert:
# der Eintrag des Wächters bleibt offen, die Zeile „flackert:“ steht zusätzlich in seinem Protokoll (Kennzahl
# ci_flackert der Wochenprüfung).
#   ci-wiederholen.sh                 neue rote Läufe wiederholen, wiederholte auswerten
#   ci-wiederholen.sh --trocken       nur anzeigen: keine Wiederholung, kein Protokoll, Stand bleibt
#   ci-wiederholen.sh --lauf ID       genau diesen Lauf (auch nachts von Hand statt „gh run rerun“: mit Protokoll;
#                                     Alter, Uhrzeit, Nachtlauf und Wächter-Stand werden dann nicht geprüft)
# Protokoll ~/halo-nacht/flackern.log, eine Zeile je Ereignis, Tabulator-getrennt:
#   Zeit  Ereignis  Lauf  Versuch  Zweig  Commit  Job  Prüfung  Fehlerzeile/Messwert
#   Ereignisse: rot (Prüfung im ersten Versuch rot), wiederholt (Wiederholung gestartet), flackert (in der
#   Wiederholung grün), flackert-alt (ebenso, aber auf einem Stand ohne die Änderungen von main: zählt nicht),
#   bleibt-rot (auch in der Wiederholung rot), ausgelassen (keine Wiederholung, mit Grund), zweimal (an neon gemeldet)
# Stand ~/halo-nacht/flackern.stand: „<Lauf> wiederholt|fertig“ je Zeile.
# Exitcode: 0, 1 wenn gh nicht lesbar war.
emulate -L zsh
setopt extendedglob pipefail

TROCKEN= NUR=
while (( $# )); do
  case $1 in
    --trocken) TROCKEN=1 ;;
    --lauf) shift; NUR=$1 ;;
    -h|--help) sed -n '2,39p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) print -u2 "Unbekannte Option: $1"; exit 2 ;;
  esac
  shift
done

path=(~/.local/bin /opt/homebrew/bin /usr/local/bin $path)
export LC_CTYPE=${LC_CTYPE:-en_US.UTF-8} LANG=${LANG:-en_US.UTF-8}
R=sruf79/halo-spaces
NACHT=${HALO_NACHT_DIR:-$HOME/halo-nacht}
FLOG=${HALO_FLACKERN_LOG:-$NACHT/flackern.log}
FSTAND=${HALO_FLACKERN_STAND:-$NACHT/flackern.stand}
WLOG=${HALO_WAECHTER_LOG:-$HOME/halo-aufgaben/ci-waechter.log}
WSTAND=${HALO_WAECHTER_STAND:-$HOME/halo-aufgaben/ci-waechter.stand}
STUNDEN=${CI_WDH_STUNDEN:-6}
MAX_ROT=${CI_WDH_MAX_ROT:-5}
NEON_JOBS=(mac windows)
REPO=${HALO_REPO:-$HOME/halo-spaces}        # nur lesend (git fetch, merge-base, diff) für veraltet()
ALT_PFADE=(tests/halo_test.py chrome extension)
HIER=${0:A:h}
source $HIER/gh-wdh.zsh 2>/dev/null || gh_wdh() { gh "$@" }
mkdir -p $NACHT

jetzt() {   # Epoch; HALO_JETZT (ISO mit Zone) ersetzt die Uhr (Tests)
  if [[ -n $HALO_JETZT ]]; then
    python3 -I -c 'import sys, datetime; print(int(datetime.datetime.fromisoformat(sys.argv[1]).timestamp()))' $HALO_JETZT
  else
    date +%s
  fi
}
JETZT=$(jetzt)
zeit() { date -r $JETZT '+%F %T' }
# Minuten seit Mitternacht in Wien
WIEN=$(( 10#$(TZ=Europe/Vienna date -r $JETZT +%H) * 60 + 10#$(TZ=Europe/Vienna date -r $JETZT +%M) ))

# eine Zeile ins Protokoll (Tabulatoren und Zeilenumbrüche in den Feldern werden zu Leerzeichen)
schreibe() {   # <Ereignis> <Lauf> <Versuch> <Zweig> <Commit> <Job> <Prüfung> <Text>
  local f z=() x
  for x in "$@"; do z+=("${${x//$'\t'/ }//$'\n'/ }"); done
  print -ru2 -- "  ${(j: | :)z[1,7]}${z[8]:+ | ${z[8][1,160]}}"
  [[ -n $TROCKEN ]] && return 0
  print -r -- "$(zeit)	${(j:	:)z}" >> $FLOG
}
stand_von() { [[ -r $FSTAND ]] && awk -v r=$1 '$1 == r { s = $2 } END { print s }' $FSTAND }
stand_setzen() {   # <Lauf> <wiederholt|fertig>
  [[ -n $TROCKEN ]] && return 0
  print -r -- "$1 $2" >> $FSTAND
  # höchstens 400 Zeilen behalten
  (( $(wc -l < $FSTAND) > 400 )) && { tail -n 300 $FSTAND > $FSTAND.neu && mv $FSTAND.neu $FSTAND }
  return 0
}

# Nachtlauf oder Wochenprüfung laufen gerade (sie warten selbst auf ihre CI)
nacht_laeuft() {
  local l
  for l in $NACHT/lauf.lock $NACHT/woche.lock; do
    [[ -e $l ]] && kill -0 $(<$l) 2>/dev/null && return 0
  done
  return 1
}

# rote Prüfungen eines Versuchs: „Job<Tab>Prüfung<Tab>Fehlerzeile“ je Zeile; für rote Jobs ohne FEHLER-Zeile
# (Pakete, Start von Thunderbird, Zeitüberschreitung) eine Zeile „Job<Tab>(Job ohne FEHLER-Zeile: <Schritt>)<Tab>“
rote_pruefungen() {   # <Lauf> <Versuch> <JSON der Jobs>
  local run=$1 att=$2 jobs=$3 flog j
  flog=$(gh_wdh run view $run -R $R --attempt $att --log-failed 2>/dev/null) || return 1
  # Zeilen „<Job><Tab><Schritt><Tab><Zeit> FEHLER  <Prüfung> – <Text>“
  print -r -- $flog | grep -a 'FEHLER  ' | awk -F'\t' '{
    job = $1; z = $3; sub(/^.*FEHLER  /, "", z); n = z; t = ""
    i = index(z, " – "); if (i) { n = substr(z, 1, i - 1); t = substr(z, i + length(" – ")) }
    if (job != "windows-github") print job "\t" n "\t" substr(t, 1, 300) }'
  for j in ${(f)"$(jq -r '.jobs[] | select(.conclusion == "failure" and .name != "windows-github") | .name' <<< $jobs)"}; do
    [[ -z $j ]] && continue
    # (ein awk statt zweier grep: mit pipefail scheitert die Kette, wenn grep -q früh aufhört)
    awk -F'\t' -v j=$j '$1 == j && /FEHLER  / { t = 1 } END { exit !t }' <<< $flog && continue
    print -r -- "$j	(Job ohne FEHLER-Zeile: $(jq -r --arg j $j '[.jobs[] | select(.name == $j) | .steps[]? | select(.conclusion == "failure") | .name] | join(", ")' <<< $jobs))	"
  done
  return 0
}

# Veralteter Stand: origin/main steckt nicht im Commit des Laufs, und main hat seit dem gemeinsamen Vorfahren etwas an
# ALT_PFADE geändert. Setzt ALT_GRUND (Text fürs Protokoll) und gibt 0 zurück; 1 heißt „zählt wie bisher“ – auch immer
# dann, wenn es sich nicht belegen lässt (kein Repo, kein Netz, Commit unbekannt): nie ohne Beleg ausnehmen.
ALT_GRUND= ALT_GEHOLT=
veraltet() {   # <Zweig> <Commit>
  local br=$1 sha=$2 basis kopf n rc
  ALT_GRUND=
  [[ $br == main ]] && return 1
  git -C $REPO rev-parse -q --verify HEAD >/dev/null 2>&1 || return 1
  if [[ -z $ALT_GEHOLT ]]; then ALT_GEHOLT=1; git -C $REPO fetch -q origin main 2>/dev/null; fi
  git -C $REPO rev-parse -q --verify "$sha^{commit}" >/dev/null 2>&1 \
    || git -C $REPO fetch -q origin "$br" 2>/dev/null
  git -C $REPO rev-parse -q --verify "$sha^{commit}" >/dev/null 2>&1 || return 1
  kopf=$(git -C $REPO rev-parse -q --verify origin/main 2>/dev/null) || return 1
  basis=$(git -C $REPO merge-base $sha $kopf 2>/dev/null) || return 1
  [[ $basis == $kopf ]] && return 1            # main steckt ganz im Lauf
  git -C $REPO diff --quiet $basis $kopf -- $ALT_PFADE 2>/dev/null; rc=$?
  (( rc == 1 )) || return 1                    # 0: main hat dort nichts geändert, >1: nicht lesbar
  n=$(git -C $REPO rev-list --count $basis..$kopf -- $ALT_PFADE 2>/dev/null)
  ALT_GRUND="Stand ohne ${n:-?} Commit(s) von main an Prüfungen bzw. Thunderbird-Code (gemeinsamer Vorfahr ${basis[1,8]}, main ${kopf[1,8]})"
  return 0
}

# Zum zweiten Mal in 7 Tagen nur durch Wiederholung grün (neon 18.11.2026: „sofort Hinweis an neon, nicht erst im
# Wochentakt“): dieselbe Prüfung (Name, gleich auf welcher Plattform) hat schon eine Zeile „flackert“ aus einem
# anderen Lauf, nicht älter als 7 Tage. Sammelt je Lauf in ZWEIT, auswerten() meldet einmal an neon.
ZWEIT=()
zweit() {   # <Lauf> <Job> <Prüfung>
  local frueher ab=$(date -r $(( JETZT - 7 * 86400 )) '+%F %T')
  frueher=$(awk -F'\t' -v r=$1 -v n="$3" -v ab="$ab" '$2 == "flackert" && $8 == n && $3 != r && $1 >= ab { print "Lauf " $3 " (" substr($1, 1, 16) ", " $7 ")" }' $FLOG 2>/dev/null | tail -3 | paste -sd ';' -)
  [[ -n $frueher ]] && ZWEIT+=("$2: $3 – vorher nur durch Wiederholung grün: ${frueher//;/; }")
  return 0
}
# Meldung an die Sitzung neon (an_neon aus lauf-hilfen.zsh, Zustellweg wie push(), ohne „PUSH:“); erreicht sie neon
# nicht, einmal push() aufs iPhone. Eigene Subshell: lauf-hilfen.zsh bringt eigene zeit()/log() mit.
neon_melden() {   # <Text>
  ( LOG=$NACHT/$(date +%F)-ci-wiederholen.log; source $HIER/lauf-hilfen.zsh 2>/dev/null || exit 1
    an_neon "$1" ci-wiederholen || push "CI-Wiederholung konnte neon nicht erreichen (Prüfung zum zweiten Mal in 7 Tagen nur durch Wiederholung grün)" ci-wiederholen )
}
# Wiederholung auswerten: was im ersten Versuch rot war, ist jetzt grün (flackert) oder wieder rot (bleibt-rot)
auswerten() {   # <Lauf> <Zweig> <Commit>
  local run=$1 br=$2 sha=$3 jobs rot2 job name text n=0 f=0 z erg=flackert gruen="in der Wiederholung grün"
  ZWEIT=()
  # veralteter Stand: Grün in der Wiederholung zählt nicht als Flackern der Prüfung (kein zweit(), keine Meldung)
  veraltet $br $sha && { erg=flackert-alt; gruen+="; zählt nicht: $ALT_GRUND" }
  jobs=$(gh_wdh run view $run -R $R --json jobs,attempt 2>/dev/null) || return 1
  if jq -e 'any(.jobs[]; .conclusion == "failure" and .name != "windows-github")' <<< $jobs >/dev/null; then
    rot2=$(rote_pruefungen $run $(jq -r .attempt <<< $jobs) $jobs) || return 1
  fi
  while IFS=$'\t' read -r job name text; do
    [[ -z $job ]] && continue
    n=$((n + 1))
    if [[ $name == "(Job ohne FEHLER-Zeile"* ]]; then
      # Job ohne Prüfungszeile: geflackert, wenn der Job in der Wiederholung grün ist
      if jq -e --arg j $job 'any(.jobs[]; .name == $j and .conclusion == "success")' <<< $jobs >/dev/null; then
        [[ $erg == flackert ]] && zweit $run $job $name
        schreibe $erg $run 2 $br $sha $job $name $gruen; f=$((f + 1)); wlog $run $sha $job $name
      else
        schreibe bleibt-rot $run 2 $br $sha $job $name "Job auch in der Wiederholung rot"
      fi
    elif print -r -- $rot2 | awk -F'\t' -v j=$job -v n=$name '$1 == j && $2 == n { t = 1 } END { exit !t }'; then
      schreibe bleibt-rot $run 2 $br $sha $job $name "$(print -r -- $rot2 | awk -F'\t' -v j=$job -v n=$name '$1 == j && $2 == n { print $3; exit }')"
    else
      [[ $erg == flackert ]] && zweit $run $job $name
      schreibe $erg $run 2 $br $sha $job $name $gruen; f=$((f + 1)); wlog $run $sha $job $name
    fi
  done < <(awk -F'\t' -v r=$run '$2 == "rot" && $3 == r && $4 == 1 { print $7 "\t" $8 "\t" $9 }' $FLOG 2>/dev/null)
  print -u2 -- "Lauf $run ($br, $sha): Wiederholung fertig – $f von $n geflackert${ALT_GRUND:+ (zählt nicht: $ALT_GRUND)}"
  if (( $#ZWEIT )); then
    for z in $ZWEIT; do schreibe zweimal $run 2 $br $sha "${z%%: *}" "${${z#*: }%% – vorher*}" "zum zweiten Mal in 7 Tagen nur durch Wiederholung grün, an neon gemeldet"; done
    local -a zz=("- "${^ZWEIT})
    [[ -z $TROCKEN ]] && neon_melden "[flackern] Prüfung zum zweiten Mal in 7 Tagen nur durch Wiederholung grün (Lauf $run, Zweig $br, Commit $sha):
${(F)zz}
Wiederholung: ja (ci-wiederholen.sh, erste Wiederholung grün). Bitte Board-Eintrag „Tests: … flackert“ anlegen bzw. ergänzen; neon kümmert sich."
  fi
  stand_setzen $run fertig
}
# Zeile im Protokoll des CI-Wächters (nur Läufe auf main; die Wochenprüfung zählt „flackert:“)
WLOG_ZWEIG=
wlog() {   # <Lauf> <Commit> <Job> <Prüfung>
  [[ -n $TROCKEN || $WLOG_ZWEIG != main ]] && return 0
  print -r -- "$(zeit)   flackert: $3: ${4[1,150]} (rot: Lauf $1, grün: Lauf $1 in der automatischen Wiederholung, gleicher Commit $2)" >> $WLOG
}

LISTE=$(gh_wdh run list -R $R -w test.yml -L ${CI_WDH_LISTE:-60} --json databaseId,status,conclusion,createdAt,headSha,headBranch,event,attempt \
  --jq 'sort_by(.databaseId) | .[] | "\(.databaseId) \(.status) \(.conclusion // "-") \(.createdAt | fromdate) \(.headSha[:7]) \(.event) \(.attempt) \(.headBranch)"') \
  || { print -u2 "FEHLER: gh run list gescheitert"; exit 1 }
if [[ -n $NUR ]] && ! print -r -- $LISTE | grep -q "^$NUR "; then
  LISTE=$(gh_wdh run view $NUR -R $R --json databaseId,status,conclusion,createdAt,headSha,headBranch,event,attempt \
    --jq '"\(.databaseId) \(.status) \(.conclusion // "-") \(.createdAt | fromdate) \(.headSha[:7]) \(.event) \(.attempt) \(.headBranch)"') || exit 1
fi
WSTAND_ID=0; [[ -s $WSTAND ]] && WSTAND_ID=$(<$WSTAND)
RC=0
print -r -- $LISTE | while read -r run st erg beginn sha ev att br; do
  [[ -z $run ]] && continue
  [[ -n $NUR && $run != $NUR ]] && continue
  WLOG_ZWEIG=$br
  zustand=$(stand_von $run)
  [[ $zustand == fertig ]] && continue
  if [[ $zustand == wiederholt ]]; then
    [[ $st == completed ]] || continue          # Wiederholung läuft noch
    [[ -n $TROCKEN ]] && { print -u2 -- "(trocken) Lauf $run: Wiederholung fertig ($erg), würde auswerten"; continue }
    auswerten $run $br $sha || RC=1
    continue
  fi
  [[ $st == completed && $erg == failure ]] || continue
  [[ $ev == push || $ev == workflow_dispatch ]] || continue
  (( att == 1 )) || continue                    # schon einmal wiederholt (von Hand): ein zweites Rot bleibt rot
  if [[ -z $NUR ]]; then
    (( JETZT - beginn > STUNDEN * 3600 )) && continue
    [[ $br == main ]] && (( run > WSTAND_ID )) && continue   # erst der CI-Wächter (trägt das Rot ein)
  fi
  jobs=$(gh_wdh run view $run -R $R --attempt 1 --json jobs 2>/dev/null) || { RC=1; continue }
  jq -e 'any(.jobs[]; .conclusion == "failure" and .name != "windows-github")' <<< $jobs >/dev/null || continue
  if jq -e 'any(.jobs[]; .name == "changes" and any(.steps[]?; .name == "Nur Teil der Prüfungen" and .conclusion == "success"))' <<< $jobs >/dev/null; then
    stand_setzen $run fertig; continue          # Lauf mit Auswahl von Prüfungen (Fehlersuche von Hand)
  fi
  rot=$(rote_pruefungen $run 1 $jobs) || { RC=1; continue }
  [[ -z $rot ]] && continue
  # mehr als MAX_ROT rote Prüfungen in einem Job: echter Fehler
  viele=$(print -r -- $rot | awk -F'\t' -v m=$MAX_ROT '{ n[$1]++ } END { for (j in n) if (n[j] > m) { print j ": " n[j]; exit } }')
  neon=; for j in $NEON_JOBS; do awk -F'\t' -v j=$j '$1 == j { t = 1 } END { exit !t }' <<< $rot && neon=1; done
  grund=
  if [[ -n $viele ]]; then
    grund="mehr als $MAX_ROT rote Prüfungen in einem Job ($viele) – kein Flackern, sondern ein Fehler"
  elif [[ -n $neon && -z $NUR ]] && nacht_laeuft; then
    grund="Nachtlauf/Wochenprüfung läuft – wartet selbst auf die CI"
  elif [[ -n $neon && -z $NUR ]] && (( WIEN < 540 )); then
    grund="rote Jobs auf neon, zwischen 00:00 und 09:00 keine Wiederholung"
  fi
  if [[ -n $grund ]]; then
    # Zeitgründe: später erneut versuchen (kein Stand, keine Zeile); echter Fehler: einmal festhalten
    if [[ -n $viele ]]; then
      schreibe ausgelassen $run 1 $br $sha "-" "-" $grund
      stand_setzen $run fertig
    else
      print -u2 -- "Lauf $run ($br, $sha): jetzt keine Wiederholung – $grund"
    fi
    continue
  fi
  print -u2 -- "Lauf $run ($br, $sha): rot im ersten Versuch – wird einmal wiederholt"
  while IFS=$'\t' read -r job name text; do
    [[ -n $job ]] && schreibe rot $run 1 $br $sha $job $name $text
  done <<< $rot
  if [[ -z $TROCKEN ]]; then
    if gh_wdh run rerun $run -R $R --failed >/dev/null 2>&1; then
      schreibe wiederholt $run 2 $br $sha "-" "-" "gh run rerun --failed"
      stand_setzen $run wiederholt
    else
      schreibe ausgelassen $run 1 $br $sha "-" "-" "gh run rerun gescheitert"
      stand_setzen $run fertig; RC=1
    fi
  fi
done
exit $RC
