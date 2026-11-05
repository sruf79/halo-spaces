#!/bin/zsh
# Wartet auf den CI-Lauf (test.yml) für einen gepushten Commit und meldet das
# Ergebnis je Job mit Dauer, bei Rot auch die gescheiterten Prüfungen.
# Für Nachtlauf und Wochenprüfung (tests/MAC-MINI.md Abschnitte 13 und 15): ein
# Aufruf wartet höchstens <minuten>, dann wieder aufrufen, bis der Lauf fertig ist.
#   tests/ci-warten.sh [<commit>] [<minuten>]     Standard: HEAD, 9 Minuten
# Exitcode: 0 grün, 1 rot, 2 läuft noch, 3 abgebrochen, 4 kein Lauf zum Commit
emulate -L zsh
path=(/opt/homebrew/bin /usr/local/bin $path)
R=sruf79/halo-spaces
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
  [[ -z $RUN ]] && RUN=$(gh run list -R $R -w test.yml -c $SHA -e push -L 1 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null)
  if [[ -n $RUN ]]; then
    INFO=$(gh run view $RUN -R $R --json status,conclusion,createdAt,updatedAt \
      --jq '"\(.status) \(.conclusion) \((((.updatedAt | fromdate) - (.createdAt | fromdate)) / 60 | floor))"' 2>/dev/null)
    [[ ${INFO%% *} == completed ]] && break
  fi
  if (( $(date +%s) >= BIS )); then
    if [[ -z $RUN ]]; then
      print "Kein CI-Lauf für ${SHA:0:7} gefunden (gepusht? Läufe erscheinen nach einigen Sekunden)"
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
print "CI-Lauf $RUN für ${SHA:0:7}: $T nach $DAUER Min. (https://github.com/$R/actions/runs/$RUN)"
jobs_zeilen $RUN
# Fehlerkonsole: nie Rot, nur zur Kenntnis (den Bug trägt der CI-Wächter ein; AGENTS.md „Bauen und testen“)
if (( RC != 4 )); then
  KONSOLE=$(gh run view $RUN -R $R --log 2>/dev/null | grep -aE 'KONSOLE  |PROTOKOLL  ' | sed -E 's/^([^	]*)	[^	]*	[^ ]* (KONSOLE|PROTOKOLL)  (.*)$/  \1 (\2): \3/' | sort -u)
  if [[ -n $KONSOLE ]]; then
    print "Fehlerkonsole/-protokoll (nur Warnung, kein Rot – der CI-Wächter trägt sie als Bug ein):"
    print -r -- $KONSOLE | cut -c1-300 | head -80   # vollständig genug, um „Meldung nicht mehr da“ zu prüfen
  fi
fi
if (( RC == 1 )); then
  print "Gescheiterte Prüfungen (Details: gh run view $RUN -R $R --log-failed):"
  gh run view $RUN -R $R --log-failed 2>/dev/null | grep -a 'FEHLER  ' \
    | sed -E 's/^([^	]*)	[^	]*	[^ ]* FEHLER  (.*)$/  \1: \2/' | cut -c1-220 | head -20
fi
exit $RC
