#!/bin/zsh
# Wartet auf den CI-Lauf (test.yml) für einen gepushten Commit und meldet das
# Ergebnis je Job mit Dauer, bei Rot auch die gescheiterten Prüfungen.
# Für Nachtlauf und Wochenprüfung (tests/MAC-MINI.md Abschnitte 13 und 15): ein
# Aufruf wartet höchstens <minuten>, dann wieder aufrufen, bis der Lauf fertig ist.
#   tests/ci-warten.sh [<commit>] [<minuten>]     Standard: HEAD, 9 Minuten
#   tests/ci-warten.sh --windows [<commit>] [<minuten>]
#     wartet statt auf den Push-Lauf auf den letzten Lauf von Hand zum Commit (der Nachtlauf startet
#     ihn mit `gh workflow run test.yml -f ziel=windows --ref main`, Job windows läuft nicht mehr bei
#     Push); das Ergebnis richtet sich nur nach dem Job windows (windows-github zählt nicht)
# Exitcode: 0 grün (oder kein Lauf nötig, tests/ci-noetig.sh), 1 rot, 2 läuft noch, 3 abgebrochen, 4 kein Lauf zum Commit
emulate -L zsh
path=(/opt/homebrew/bin /usr/local/bin $path)
R=sruf79/halo-spaces
EVENT=push WINDOWS=
[[ $1 == --windows ]] && { WINDOWS=1 EVENT=workflow_dispatch; shift }
SHA=$(git -C ${0:A:h:h} rev-parse ${1:-HEAD} 2>/dev/null) || { print -u2 "Unbekannter Commit: $1"; exit 4 }
MIN=${2:-9}
BIS=$(( $(date +%s) + MIN * 60 ))

# Jobs mit Ergebnis und Dauer (Minuten), z. B. „  mac: success, 32 Min.“
jobs_zeilen() {
  gh run view $1 -R $R --json jobs --jq '.jobs[] | "  \(.name): \(if .status == "completed" then .conclusion else .status end)" +
    (if .status == "completed" and .startedAt and .completedAt then ", \((((.completedAt | fromdate) - (.startedAt | fromdate)) / 60 | floor)) Min." else "" end)'
}

RUN=
while true; do
  [[ -z $RUN ]] && RUN=$(gh run list -R $R -w test.yml -c $SHA -e $EVENT -L 1 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null)
  if [[ -n $RUN ]]; then
    INFO=$(gh run view $RUN -R $R --json status,conclusion,createdAt,updatedAt \
      --jq '"\(.status) \(.conclusion) \((((.updatedAt | fromdate) - (.createdAt | fromdate)) / 60 | floor))"' 2>/dev/null)
    [[ ${INFO%% *} == completed ]] && break
  fi
  if [[ -z $RUN && -z $WINDOWS ]]; then
    # Kein Lauf, weil seit dem letzten grün getesteten Stand nichts Thunderbird direkt
    # betrifft (paths in test.yml, tests/ci-noetig.sh)? Dann gibt es nichts abzuwarten.
    BASIS=""
    for B in $(gh run list -R $R -w test.yml -b main -e push -s success -L 30 --json headSha --jq '.[].headSha' 2>/dev/null); do
      [[ $B != $SHA ]] && git -C ${0:A:h:h} merge-base --is-ancestor $B $SHA 2>/dev/null && { BASIS=$B; break }
    done
    if [[ -n $BASIS ]] && ! $(dirname $0)/ci-noetig.sh $BASIS $SHA; then
      print "Kein CI-Lauf nötig für ${SHA:0:7}: seit ${BASIS:0:7} nichts geändert, was Thunderbird direkt betrifft"
      exit 0
    fi
  fi
  if (( $(date +%s) >= BIS )); then
    if [[ -z $RUN ]]; then
      if [[ -n $WINDOWS ]]; then
        print "Kein Windows-Lauf von Hand für ${SHA:0:7} gefunden (gh workflow run test.yml -f ziel=windows --ref main gestartet? Läufe erscheinen nach einigen Sekunden)"
      else
        print "Kein CI-Lauf für ${SHA:0:7} gefunden (gepusht? Läufe erscheinen nach einigen Sekunden)"
      fi
      exit 4
    fi
    print "CI-Lauf $RUN für ${SHA:0:7} läuft noch (https://github.com/$R/actions/runs/$RUN):"
    jobs_zeilen $RUN
    exit 2
  fi
  sleep 60
done

read -r _ ERGEBNIS DAUER <<< $INFO
case $ERGEBNIS in
  success)   T=grün RC=0 ;;
  failure)   T=rot RC=1 ;;
  cancelled) T=abgebrochen RC=3 ;;
  *)         T=$ERGEBNIS RC=1 ;;
esac
if [[ -n $WINDOWS ]]; then
  # nur der Job windows zählt; ohne ihn (anderes ziel, nur Teil der Prüfungen) kein Grün
  W=$(gh run view $RUN -R $R --json jobs --jq '(if any(.jobs[]; .name == "changes" and any(.steps[]?; .name == "Nur Teil der Prüfungen" and .conclusion == "success")) then "teil" else ([.jobs[] | select(.name == "windows") | .conclusion][0] // "fehlt") end)' 2>/dev/null)
  case $W in
    success)   T=grün RC=0 ;;
    cancelled) T=abgebrochen RC=3 ;;
    teil)      T="nicht vollständig (nur Teil der Prüfungen)" RC=1 ;;
    *)         T="rot (Job windows: $W)" RC=1 ;;
  esac
  print -n "Windows-"
fi
print "CI-Lauf $RUN für ${SHA:0:7}: $T nach $DAUER Min. (https://github.com/$R/actions/runs/$RUN)"
jobs_zeilen $RUN
# Fehlerkonsole/-protokoll: nie Rot, nur zur Kenntnis (den Bug trägt der CI-Wächter ein; AGENTS.md „Bauen und testen“).
# Vollständig und eindeutig, weil der Nachtlauf daran „behoben“ prüft: je Meldung einmal mit allen Jobs, ausdrücklich
# „keine Meldungen“ bzw. „nicht lesbar“, und ob mac dunkel lief
if (( RC != 4 )); then
  DUNKEL=$(gh run view $RUN -R $R --json jobs --jq '[.jobs[] | select(.name == "mac") | .steps[]? | select(.name == "Test dunkel") | .conclusion][0] // "kein Job mac"' 2>/dev/null)
  if KLOG=$(gh run view $RUN -R $R --log 2>/dev/null); then
    KONSOLE=$(print -r -- $KLOG | grep -aE 'KONSOLE  |PROTOKOLL  ' \
      | sed -E 's/^([^	]*)	[^	]*	[^ ]* (KONSOLE|PROTOKOLL)  (.*)$/\2  \3	\1/' \
      | awk -F'\t' '{ if (!($1 in j)) { o[++n] = $1; j[$1] = $2 } else if (index(", " j[$1] ", ", ", " $2 ", ") == 0) j[$1] = j[$1] ", " $2 }
                     END { for (i = 1; i <= n; i++) print "  " o[i] "  [" j[o[i]] "]" }')
    if [[ -n $KONSOLE ]]; then
      print "Fehlerkonsole/-protokoll (nur Warnung, kein Rot – der CI-Wächter trägt sie als Bug ein; mac dunkel: $DUNKEL):"
      print -r -- $KONSOLE
    else
      print "Fehlerkonsole/-protokoll: keine Meldungen (mac dunkel: $DUNKEL)"
    fi
  else
    print "Fehlerkonsole/-protokoll: Protokoll des Laufs nicht lesbar – „behoben“ lässt sich damit nicht prüfen"
  fi
fi
if (( RC == 1 )); then
  print "Gescheiterte Prüfungen (Details: gh run view $RUN -R $R --log-failed):"
  gh run view $RUN -R $R --log-failed 2>/dev/null | grep -a 'FEHLER  ' \
    | sed -E 's/^([^	]*)	[^	]*	[^ ]* FEHLER  (.*)$/  \1: \2/' | cut -c1-220 | head -20
fi
exit $RC
