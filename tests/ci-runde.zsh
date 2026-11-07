# CI-Runden des Nachtlaufs (Entscheidung des Maintainers vom 7.11.2026, Wortlaut in ENTSCHEIDUNGEN.md;
# tests/MAC-MINI.md Abschnitte 13 und 15): rote Prüfungen aus den CI-Läufen der Nacht ins Board
# (über tests/ci-waechter.sh --lauf, dieselbe Dublettenprüfung wie der Wächter), mindestens eine
# vollständige CI-Runde je 24 Stunden (ziel=alle von Hand, nur wenn der Nachtlauf nichts CI-Auslösendes
# pusht) und die Kennzahl „Tage seit der letzten vollständig grünen Runde“.
# nachtlauf.sh und wochenpruefung.sh laden diese Datei mit `source` (nach lauf-hilfen.zsh); wie
# vorpruefung.zsh wird sie nach ~/.config/halo-spaces/ kopiert (tests/mac-mini-setup.sh, SK_PAARE).
# Kein Claude, nur gh, jq, python3. Test ohne Netz: zsh tests/ci_runde_test.zsh.
#
# Begriffe (über die Job-Ergebnisse, nie über die Gesamt-Conclusion – ein Lauf mit lauter
# übersprungenen Jobs, z. B. reiner Release-Commit, endet auch mit „success“):
#   Testjobs     linux (release), linux (beta), linux (esr), mac, windows (windows-github nicht:
#                Versuchsjob mit continue-on-error)
#   gezielt      Schritt „Gezielter Lauf“ im Job changes (only/ziel von Hand) – zählt nie; der vom
#                Nachtlauf gestartete Lauf mit ziel=alle ist nicht gezielt und zählt
#   Vollrunde    abgeschlossen, nicht gezielt, alle Testjobs gelaufen (success oder failure)
#   grün         Vollrunde und alle Testjobs success (dunkel nur, wenn der Lauf es testete: laut
#                tests/farben-betroffen.sh bzw. immer bei ziel=alle von Hand; sonst ist „Test dunkel“
#                übersprungen und der Job trotzdem success)
# Uhr: HALO_JETZT=<ISO-Zeit mit Zone> ersetzt sie (Proben); Zeiten nach außen in Wiener Zeit.

CI_R=sruf79/halo-spaces
CI_HIER=${0:A:h}
CI_CACHE=${HALO_CI_CACHE:-$HOME/halo-nacht/ci-jobs}
CI_GRENZE=${HALO_CI_GRENZE:-0430}          # nach 04:30 (Wiener Zeit) keine Vollrunde neu beginnen
CI_TROCKEN=${CI_TROCKEN:-}

CI_JQ='
def testjobs: ["linux (release)", "linux (beta)", "linux (esr)", "mac", "windows"];
def job($n): [.jobs[]? | select(.name == $n)][0];
def gezielt: any(.jobs[]?; .name == "changes" and any(.steps[]?; .name == "Gezielter Lauf" and .conclusion == "success"));
def gelaufen: . as $l | [testjobs[] | . as $n | $l | job($n) | (. != null and (.conclusion == "success" or .conclusion == "failure"))] | all;
def alle_uebersprungen: . as $l | [testjobs[] | . as $n | $l | job($n) | (. == null or .conclusion == "skipped")] | all;
def vollrunde: .status == "completed" and (gezielt | not) and gelaufen;
def gruen: vollrunde and (. as $l | [testjobs[] | . as $n | $l | job($n) | .conclusion == "success"] | all);
def rot: .status == "completed" and (gezielt | not) and any(.jobs[]?; .conclusion == "failure" and .name != "windows-github");
def zeit: (.createdAt | fromdate);
def ende: ((.updatedAt // .createdAt) | fromdate);
'

ci_jetzt() {   # Epoch; HALO_JETZT ersetzt die Uhr
  if [[ -n $HALO_JETZT ]]; then
    python3 -I -c 'import sys, datetime; print(int(datetime.datetime.fromisoformat(sys.argv[1]).timestamp()))' $HALO_JETZT
  else
    date +%s
  fi
}
ci_wien() { TZ=Europe/Vienna date -r $1 "+${2:-%d.%m.%Y %H:%M}" }

# Fehler im neuen Teil brechen nichts ab: eine Zeile in Protokoll und uebersprungen.log (Wochenprüfung zählt sie)
ci_fehler() {   # <VOLLRUNDE-FEHLER|EINTRAG-FEHLER> <Grund>
  local z="$1 nachtlauf $2"
  [[ -n $LOG ]] && log $z
  print -r -- "$(zeit) $z" >> ${HALO_UEBERSPRUNGEN_LOG:-$HOME/halo-nacht/uebersprungen.log}
  print -ru2 -- $z
}

# Läufe von test.yml auf main mit ihren Jobs als JSON-Liste in <Datei>; Jobs abgeschlossener Läufe aus dem
# Zwischenspeicher (ändern sich nicht mehr). Rückgabe 1, wenn gh nicht lesbar ist.
ci_laeufe_holen() {   # <Datei> [<Anzahl>, Standard 40]
  local datei=$1 n=${2:-40} liste id st jobs
  liste=$(gh run list -R $CI_R -w test.yml -b main -L $n \
    --json databaseId,createdAt,updatedAt,status,conclusion,event,headSha,displayTitle 2>/dev/null) || return 1
  [[ -n $liste ]] || return 1
  mkdir -p $CI_CACHE
  print -r -- '[]' > $datei.jobs
  for id st in $(print -r -- $liste | jq -r '.[] | "\(.databaseId) \(.status)"'); do
    if [[ $st == completed && -s $CI_CACHE/$id.json ]]; then
      jobs=$(<$CI_CACHE/$id.json)
    else
      jobs=$(gh run view $id -R $CI_R --json jobs --jq '.jobs | map({name, conclusion, status, steps: [.steps[]? | {name, conclusion}]})' 2>/dev/null) || return 1
      [[ $st == completed ]] && print -r -- $jobs > $CI_CACHE/$id.json
    fi
    jq --argjson i $id --argjson j "$jobs" '. + [{id: $i, jobs: $j}]' $datei.jobs > $datei.tmp && mv $datei.tmp $datei.jobs
  done
  print -r -- $liste | jq --slurpfile j $datei.jobs \
    '[.[] | . as $l | . + {jobs: ([$j[0][] | select(.id == $l.databaseId) | .jobs][0] // [])}]' > $datei || return 1
  rm -f $datei.jobs
}

# Einstufung je Lauf (Probe und Bericht): „<ID> <grün|rot|vollrunde|übersprungen|gezielt|läuft|abgebrochen|teilweise> <Titel>“
ci_einstufen() {   # <Datei>
  jq -r "$CI_JQ"' .[] | "\(.databaseId) \(if .status != "completed" then "läuft" elif gezielt then "gezielt"
    elif gruen then "grün" elif alle_uebersprungen then "übersprungen" elif rot then "rot" elif vollrunde then "vollrunde"
    elif .conclusion == "cancelled" then "abgebrochen" else "teilweise" end) \(.displayTitle[:60])"' $1
}

# Vollrunde in den letzten 24 Stunden? Gibt die ID aus (Rückgabe 0), sonst Rückgabe 1
ci_vollrunde_24h() {   # <Datei>
  local id
  id=$(jq -r --argjson jetzt $(ci_jetzt) "$CI_JQ"' [.[] | select(vollrunde and zeit >= $jetzt - 86400)] | sort_by(zeit) | last | .databaseId // empty' $1)
  [[ -n $id ]] && { print $id; return 0 }
  return 1
}

# Lauf aus einem Push seit <Start>, der CI auslöst (läuft noch oder hat Testjobs gestartet; ein reiner
# Release-Commit mit lauter übersprungenen Testjobs zählt nicht). Gibt die ID aus.
ci_eigener_push_lauf() {   # <Datei> <Start-Epoch>
  local id
  id=$(jq -r --argjson s $2 "$CI_JQ"' [.[] | select(.event == "push" and zeit >= $s and (gezielt | not)
    and (.status != "completed" or (alle_uebersprungen | not)))] | sort_by(zeit) | last | .databaseId // empty' $1)
  [[ -n $id ]] && { print $id; return 0 }
  return 1
}

# Vollrunde von Hand starten? „starten: <Grund>“ (0) oder „nicht: <Grund>“ (1)
vollrunde_entscheiden() {   # <Datei> <Start-Epoch des Nachtlaufs>
  local id jetzt=$(ci_jetzt) hm
  if id=$(ci_eigener_push_lauf $1 $2); then
    print "nicht: der Nachtlauf hat CI-auslösend gepusht (Lauf $id zählt als Runde der Nacht)"; return 1
  fi
  hm=$(ci_wien $jetzt %H%M)
  if [[ $hm > $CI_GRENZE || $hm == $CI_GRENZE ]] && [[ $hm < 1200 ]]; then
    print "nicht: $(ci_wien $jetzt %H:%M) Uhr – nach ${CI_GRENZE[1,2]}:${CI_GRENZE[3,4]} keine neue Vollrunde"; return 1
  fi
  if id=$(ci_vollrunde_24h $1); then
    print "nicht: Vollrunde in den letzten 24 Stunden (Lauf $id)"; return 1
  fi
  print "starten: seit 24 Stunden keine vollständige CI-Runde auf main"
  return 0
}

# Rote Läufe der Nacht (seit <Start>, nicht gezielt, windows-github zählt nicht): eine ID je Zeile
ci_rote_laeufe() {   # <Datei> <Start-Epoch>
  jq -r --argjson s $2 "$CI_JQ"' [.[] | select(zeit >= $s and rot)] | sort_by(zeit) | .[].databaseId' $1
}
# noch laufende Läufe seit <Start>
ci_laufende() {   # <Datei> <Start-Epoch>
  jq -r --argjson s $2 "$CI_JQ"' .[] | select(zeit >= $s and .status != "completed") | .databaseId' $1
}

# letzte vollständig grüne Runde: „<Ende-Epoch> <Tage>“ (Rückgabe 0) bzw. „- <älteste Epoch>“ (1, keine in den Daten)
ci_tage_seit_gruen() {   # <Datei>
  local z jetzt=$(ci_jetzt)
  z=$(jq -r "$CI_JQ"' [.[] | select(gruen)] | sort_by(ende) | last | if . then ende else empty end' $1)
  if [[ -n $z ]]; then
    print "$z $(( (jetzt - z) / 86400 ))"; return 0
  fi
  print -r -- "- $(jq -r "$CI_JQ"' [.[] | zeit] | min // empty' $1)"
  return 1
}
ci_gruen_zeile() {   # <Datei> → „Letzte vollständig grüne Runde: <Datum, Wiener Zeit> (vor N Tagen)“
  local e t
  if read -r e t <<< $(ci_tage_seit_gruen $1); then
    print "Letzte vollständig grüne Runde: $(ci_wien $e) (vor $t Tag$( (( t == 1 )) || print -n en))"
  elif [[ -n $t ]]; then
    print "Letzte vollständig grüne Runde: keine seit $(ci_wien $t) (älteste gelesene Runde, vor mehr als $(( ($(ci_jetzt) - t) / 86400 )) Tagen)"
  else
    print "Letzte vollständig grüne Runde: unbekannt (keine Läufe gelesen)"
  fi
}

# die per workflow_dispatch gestartete Runde unter den Treffern finden: genau ein Lauf auf <SHA>
# (gh workflow run liefert keine ID). Gibt die ID aus; 1 = keiner, 2 = mehrere (IDs auf stderr)
ci_lauf_aus_treffern() {   # <JSON von gh run list> <SHA>
  local ids
  ids=(${(f)"$(print -r -- $1 | jq -r --arg s $2 '.[] | select(.headSha == $s) | .databaseId')"})
  (( ${#ids} == 1 )) && { print $ids; return 0 }
  (( ${#ids} == 0 )) && return 1
  print -u2 "mehrere Läufe: ${(j:, :)ids}"
  return 2
}
ci_lauf_finden() {   # <Start ISO UTC> <SHA>; wiederholt (HALO_CI_VERSUCHE, Standard 9 × 20 s)
  local i treffer rc=1
  for i in {1..${HALO_CI_VERSUCHE:-9}}; do
    treffer=$(gh run list -R $CI_R --workflow test.yml --event workflow_dispatch --created ">=$1" \
      --json databaseId,headSha,createdAt 2>/dev/null) || treffer='[]'
    ci_lauf_aus_treffern "$treffer" $2; rc=$?
    (( rc == 1 )) || return $rc
    sleep ${HALO_CI_PAUSE:-20}
  done
  return 1
}

# warten, bis ein Lauf abgeschlossen ist, längstens bis <bis-Epoch>; 0 fertig, 2 läuft noch, 1 nicht lesbar
ci_lauf_abwarten() {   # <ID> <bis-Epoch>
  local st
  while true; do
    st=$(gh run view $1 -R $CI_R --json status --jq .status 2>/dev/null) || return 1
    [[ $st == completed ]] && return 0
    (( $(ci_jetzt) + ${HALO_CI_POLL:-300} > $2 )) && return 2
    sleep ${HALO_CI_POLL:-300}
  done
}

# rote Läufe über den CI-Wächter eintragen (gleiche Dublettenprüfung); eingetragene IDs nach
# ~/halo-nacht/<datum>.ci-eingetragen (der Wächter holt nur Läufe nach, die dort fehlen)
ci_rot_eintragen() {   # <Lauf-ID …>
  local id liste=${HALO_NACHT_DIR:-$HOME/halo-nacht}/$(date +%F).ci-eingetragen
  for id in $@; do
    if [[ -n $CI_TROCKEN ]]; then
      print "(trocken) würde eintragen: ci-waechter.sh --lauf $id"
      continue
    fi
    if zsh $CI_HIER/ci-waechter.sh --lauf $id 2>/dev/null; then
      print $id >> $liste
      [[ -n $LOG ]] && log "CI rot eingetragen: Lauf $id"
    else
      ci_fehler EINTRAG-FEHLER "Lauf $id: ci-waechter.sh --lauf scheiterte (Board oder Lauf nicht lesbar) – der CI-Wächter holt ihn nach"
    fi
  done
}

# Abschluss des Nachtlaufs (nach Claudes lokaler Arbeit): Läufe der Nacht abwarten, Rotes eintragen, bei Bedarf
# Vollrunde starten und abwarten, Zeilen für den Bericht auf stdout. Bricht nie ab (Rückgabe immer 0).
ci_nacht_abschluss() {   # <Start-Epoch> <spätestes Ende Epoch, z. B. 09:00>
  local start=$1 hart=$2 d=${TMPDIR:-/tmp}/halo-ci-runde.$$ ent id sha t0 bis laufend rote
  if ! ci_laeufe_holen $d.json; then
    ci_fehler VOLLRUNDE-FEHLER "gh run list/view nicht lesbar – keine Auswertung der Nacht"
    print -r -- "- CI-Abschluss: gh nicht lesbar (VOLLRUNDE-FEHLER)"
    rm -f $d.json*; return 0
  fi
  # noch laufende Läufe der Nacht abwarten (höchstens 90 Minuten, nicht über das Ende hinaus)
  laufend=(${(f)"$(ci_laufende $d.json $start)"})
  if (( ${#laufend} )) && [[ -z $CI_TROCKEN ]]; then
    bis=$(( $(ci_jetzt) + 5400 )); (( bis > hart )) && bis=$hart
    for id in $laufend; do ci_lauf_abwarten $id $bis; done
    ci_laeufe_holen $d.json || ci_fehler VOLLRUNDE-FEHLER "gh nach dem Warten nicht lesbar"
  elif (( ${#laufend} )); then
    print "(trocken) würde abwarten: ${(j:, :)laufend}"
  fi
  rote=(${(f)"$(ci_rote_laeufe $d.json $start)"})
  (( ${#rote} )) && ci_rot_eintragen $rote
  print -r -- "- Rote CI-Läufe der Nacht: ${${(j:, :)rote}:-keine}$( (( ${#rote} )) && print -n " (ins Board über ci-waechter.sh --lauf)")"
  ent=$(vollrunde_entscheiden $d.json $start)
  if [[ $? == 0 ]]; then
    if [[ -n $CI_TROCKEN ]]; then
      print "(trocken) würde starten: gh workflow run test.yml -R $CI_R -f ziel=alle, dann abwarten (bis 90 Minuten, längstens $(ci_wien $hart %H:%M))"
      print -r -- "- Vollrunde: ${ent#starten: } – Probelauf, nicht gestartet"
    else
      sha=$(gh api repos/$CI_R/commits/main --jq .sha 2>/dev/null)
      t0=$(TZ=UTC date -r $(( $(date +%s) - 60 )) +%Y-%m-%dT%H:%M:%SZ)
      if [[ -z $sha ]] || ! gh workflow run test.yml -R $CI_R -f ziel=alle >/dev/null 2>&1; then
        ci_fehler VOLLRUNDE-FEHLER "gh workflow run test.yml -f ziel=alle scheiterte"
        print -r -- "- Vollrunde: Start scheiterte (VOLLRUNDE-FEHLER)"
      elif ! id=$(ci_lauf_finden $t0 $sha 2>&1); then
        ci_fehler VOLLRUNDE-FEHLER "gestarteter Lauf nicht eindeutig gefunden (${${id:-kein Treffer}//$'\n'/ })"
        print -r -- "- Vollrunde: gestartet, Lauf nicht eindeutig gefunden (VOLLRUNDE-FEHLER)"
      else
        [[ -n $LOG ]] && log "Vollrunde gestartet: Lauf $id (${sha[1,7]}, ziel=alle)"
        bis=$(( $(date +%s) + 5400 )); (( bis > hart )) && bis=$hart
        ci_lauf_abwarten $id $bis
        case $? in
          0) ci_laeufe_holen $d.json || ci_fehler VOLLRUNDE-FEHLER "gh nach der Vollrunde nicht lesbar"
             if [[ -n $(jq -r --argjson i $id "$CI_JQ"' .[] | select(.databaseId == $i and rot) | .databaseId' $d.json) ]]; then
               ci_rot_eintragen $id
               print -r -- "- Vollrunde: Lauf $id (${sha[1,7]}, ziel=alle) rot – Prüfungen im Board"
             else
               print -r -- "- Vollrunde: Lauf $id (${sha[1,7]}, ziel=alle) $(ci_einstufen $d.json | awk -v i=$id '$1 == i { print $2 }')"
             fi ;;
          2) ci_fehler VOLLRUNDE-FEHLER "Lauf $id bis $(ci_wien $bis %H:%M) nicht fertig – der CI-Wächter wertet ihn aus"
             print -r -- "- Vollrunde: Lauf $id läuft noch (der CI-Wächter wertet ihn aus)" ;;
          *) ci_fehler VOLLRUNDE-FEHLER "Lauf $id nicht lesbar"
             print -r -- "- Vollrunde: Lauf $id nicht lesbar (VOLLRUNDE-FEHLER)" ;;
        esac
      fi
    fi
  else
    print -r -- "- Vollrunde: ${ent#nicht: }"
  fi
  ci_gruen_zeile $d.json
  rm -f $d.json*
  return 0
}
