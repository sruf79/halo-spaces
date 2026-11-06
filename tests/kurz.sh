#!/bin/zsh
# Führt einen Befehl aus und gibt nur die Kurzfassung aus: Exitcode, Dauer,
# Fehlerzeilen und das Ende. Die volle Ausgabe landet in einer Logdatei.
# Für neon, damit Testläufe und lange Ausgaben nicht den Kontext füllen
# (docs/neon-sitzung.md). Logs älter als 14 Tage werden gelöscht.
#   tests/kurz.sh [--name <Name>] <Befehl> [<Argumente> …]
#   z. B. tests/kurz.sh --name kalender python3 tests/halo_test.py --port 2851 --only Kalender
emulate -L zsh

LOGS=${HALO_KURZ_LOGS:-$HOME/halo-neon/logs}
name=lauf
if [[ $1 == --name ]]; then name=${2//[^A-Za-z0-9._-]/-}; shift 2; fi
(( $# )) || { print -u2 "Aufruf: tests/kurz.sh [--name <Name>] <Befehl> …"; exit 2 }
mkdir -p $LOGS
find $LOGS -name '*.log' -mtime +14 -delete 2>/dev/null
log=$LOGS/$(date +%Y%m%d-%H%M%S)-$name.log

start=$SECONDS
"$@" > $log 2>&1
code=$?
dauer=$(( SECONDS - start ))

print "Exitcode $code nach $((dauer / 60)) min $((dauer % 60)) s – volles Log: $log"
treffer=$(grep -E 'FEHLER|KONSOLE  |PROTOKOLL  |Traceback|Error:|error:' $log)
if [[ -n $treffer ]]; then
  print -r -- "--- Fehlerzeilen ($(print -r -- $treffer | wc -l | tr -d ' '), höchstens 40):"
  print -r -- $treffer | head -40
fi
print -r -- "--- Ende:"
tail -12 $log
exit $code
