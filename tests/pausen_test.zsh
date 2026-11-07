# Prüfung der Pausen-Logik (tests/lauf-hilfen.zsh) ohne Claude, ohne Netz, im Wegwerf-Ordner.
# Aufruf: zsh tests/pausen_test.zsh   → je Fall eine Zeile OK/FEHLER, Exitcode 1 bei einem Fehler
emulate -L zsh
HIER=${0:A:h}
T=$(mktemp -d) || exit 1
trap 'rm -rf $T' EXIT
FEHLER=0
ok() { print "OK      $1" }
fehler() { print "FEHLER  $1"; FEHLER=1 }
pruefe() { # <Name> <Befehl …>: Erfolg = Exitcode 0
  local n=$1; shift
  if eval "$@" >/dev/null 2>&1; then ok $n; else fehler $n; fi
}
neu() {   # frische Umgebung je Fall
  rm -rf $T/n $T/t; mkdir -p $T/n $T/t
  export HALO_NACHT_DIR=$T/n HALO_TOUR_DIR=$T/t HALO_PAUSEN_DATEI=$T/n/pausen.txt \
    HALO_UEBERSPRUNGEN_LOG=$T/n/uebersprungen.log LOG=$T/lauf.log HALO_JETZT=2026-11-07T12:00+01:00
  unset HALO_PAUSE_EINMAL HALO_PAUSE_TROCKEN
  rm -f -- ${TMPDIR:-/tmp}/halo-pausen-unlesbar.$$.*(N)      # „einmal je Lauf“ gilt je Fall neu
  : > $LOG
}
source $HIER/lauf-hilfen.zsh

neu
print -r -- "nachtlauf 2026-11-07T14:05+01:00 Test" > $HALO_PAUSEN_DATEI
pruefe "aktiv: Zeile vor Ablauf pausiert" 'pause_aktiv nachtlauf'
pruefe "aktiv: andere Routine läuft" '! pause_aktiv rundgang'
HALO_JETZT=2026-11-07T14:05+01:00 pruefe "abgelaufen: genau zum Ablauf nicht mehr pausiert" '! pause_aktiv nachtlauf'
HALO_JETZT=2026-11-07T13:30+00:00 pruefe "Zonen: 13:30 UTC liegt nach 14:05 MEZ" '! pause_aktiv nachtlauf'
HALO_JETZT=2026-11-07T13:00+00:00 pruefe "Zonen: 13:00 UTC liegt vor 14:05 MEZ" 'pause_aktiv nachtlauf'

neu
print -r -- "alle 2026-11-07T14:00+01:00 wegen Wartung" > $HALO_PAUSEN_DATEI
for r in $PAUSEN_ROUTINEN; do pruefe "alle: gilt für $r" "pause_aktiv $r"; done

neu
printf '%s\n' "nachtlauf 2026-11-07T13:00+01:00 kurz" "nachtlauf 2026-11-09T09:00+01:00 lang" > $HALO_PAUSEN_DATEI
pruefe "mehrere Zeilen: spätester Ablauf gilt" '[[ $(pause_aktiv nachtlauf) == "bis 2026-11-09T09:00+01:00 – lang" ]]'

# Sommerzeit-Umstellung 2027-03-28 (MEZ → MESZ): 01:45 MEZ = 00:45 UTC, Ablauf 03:30 MESZ = 01:30 UTC
neu
print -r -- "nachtlauf 2027-03-28T03:30+02:00 Umstellung" > $HALO_PAUSEN_DATEI
HALO_JETZT=2027-03-28T01:45+01:00 pruefe "Sommerzeit: vor dem Ablauf aktiv" 'pause_aktiv nachtlauf'
HALO_JETZT=2027-03-28T03:45+02:00 pruefe "Sommerzeit: nach dem Ablauf frei" '! pause_aktiv nachtlauf'

neu
printf '%s\n' "# Kommentar" "" "nachtlauf morgen Tippfehler" "nachtlaufx 2026-11-08T00:00+01:00 falsche Routine" "rundgang 2026-11-08T00:00+01:00 gut" > $HALO_PAUSEN_DATEI
pruefe "unlesbar: Zeit mit Tippfehler pausiert nicht" '! pause_aktiv nachtlauf'
pruefe "unlesbar: gute Zeile daneben gilt" 'pause_aktiv rundgang'
pruefe "unlesbar: genau zwei Meldungen, Kommentar und Leerzeile nicht" '[[ $(grep -c "PAUSE UNLESBAR" $HALO_UEBERSPRUNGEN_LOG) == 2 ]]'
pause_aktiv nachtlauf >/dev/null; pause_aktiv rundgang >/dev/null
pruefe "unlesbar: je Lauf nur einmal gemeldet" '[[ $(grep -c "PAUSE UNLESBAR" $HALO_UEBERSPRUNGEN_LOG) == 2 ]]'
pausen_aufraeumen
pruefe "unlesbar: Aufräumen löscht die Zeilen nicht" '[[ $(grep -c "Tippfehler\|falsche Routine" $HALO_PAUSEN_DATEI) == 2 ]]'

neu
printf '%s\n' "# Kopf" "nachtlauf 2026-11-07T11:00+01:00 alt" "rundgang 2026-11-09T00:00+01:00 neu" "alle 2026-11-06T00:00+01:00 alt2" > $HALO_PAUSEN_DATEI
pausen_aufraeumen
pruefe "Aufräumen: abgelaufene weg, Kopf und gültige bleiben" '[[ $(<$HALO_PAUSEN_DATEI) == "# Kopf"$'"'"'\n'"'"'"rundgang 2026-11-09T00:00+01:00 neu" ]]'
pruefe "Aufräumen: je abgelaufene Zeile eine Meldung" '[[ $(grep -c "PAUSE ABGELAUFEN" $HALO_UEBERSPRUNGEN_LOG) == 2 ]]'

neu
for e in n/PAUSE:nachtlauf n/PAUSE-WOCHE:wochenpruefung n/PAUSE-DOKU:dokupruefung t/PAUSE:rundgang; do : > $T/${e%%:*}; done
pause_start github-komm
pruefe "Migration: alte Dateien sind weg" '[[ ! -e $T/n/PAUSE && ! -e $T/n/PAUSE-WOCHE && ! -e $T/n/PAUSE-DOKU && ! -e $T/t/PAUSE ]]'
for r in nachtlauf wochenpruefung dokupruefung rundgang; do pruefe "Migration: $r pausiert" "pause_aktiv $r"; done
pruefe "Migration: Meldung je Datei" '[[ $(grep -c "PAUSE MIGRIERT" $HALO_UEBERSPRUNGEN_LOG) == 4 ]]'
pruefe "Migration: github-komm unberührt" '! pause_aktiv github-komm'

neu
: > $T/n/PAUSE
HALO_PAUSE_TROCKEN=1 pause_start nachtlauf
pruefe "Trockenlauf: alte Datei bleibt, nichts geschrieben" '[[ -e $T/n/PAUSE && ! -s $HALO_PAUSEN_DATEI ]]'

neu
print -r -- "nachtlauf 2026-11-08T00:00+01:00 Grund" > $HALO_PAUSEN_DATEI
pruefe "pause_start: pausiert und merkt den Grund" 'pause_start nachtlauf && [[ $PAUSE_GRUND == "bis 2026-11-08T00:00+01:00 – Grund" ]]'
pruefe "pause_start: Zeile im Protokoll und in uebersprungen.log" 'grep -q "ÜBERSPRUNGEN nachtlauf pausiert bis" $LOG && grep -q "ÜBERSPRUNGEN nachtlauf pausiert bis" $HALO_UEBERSPRUNGEN_LOG'
pruefe "pause_start: andere Routine nicht pausiert" '! pause_start rundgang'
pause_start nachtlauf; pause_start nachtlauf
pruefe "pause_start: ohne EINMAL jede Zeile" '[[ $(grep -c "ÜBERSPRUNGEN nachtlauf" $HALO_UEBERSPRUNGEN_LOG) == 3 ]]'
neu
print -r -- "ci-waechter 2026-11-08T00:00+01:00 Grund" > $HALO_PAUSEN_DATEI
export HALO_PAUSE_EINMAL=1
for i in 1 2 3 4; do pause_start ci-waechter; done
pruefe "ci-waechter: 4 Läufe, eine Zeile" '[[ $(grep -c "ÜBERSPRUNGEN ci-waechter" $HALO_UEBERSPRUNGEN_LOG) == 1 ]]'
print -r -- "ci-waechter 2026-11-09T00:00+01:00 neuer Grund" >> $HALO_PAUSEN_DATEI
pause_start ci-waechter
pruefe "ci-waechter: neuer Grund wird wieder gemeldet" '[[ $(grep -c "ÜBERSPRUNGEN ci-waechter" $HALO_UEBERSPRUNGEN_LOG) == 2 ]]'
unset HALO_PAUSE_EINMAL

neu
pruefe "pause_setzen: gültige Zeile" 'pause_setzen ci-waechter 2026-11-08T00:00+01:00 Wartung'
pruefe "pause_setzen: Zeile steht in der Datei" 'grep -q "^ci-waechter 2026-11-08T00:00+01:00 Wartung$" $HALO_PAUSEN_DATEI'
pruefe "pause_setzen: falsche Routine abgelehnt" '! pause_setzen nachtlaufx 2026-11-08T00:00+01:00 x'
pruefe "pause_setzen: Zeit ohne Zone/Format abgelehnt" '! pause_setzen nachtlauf morgen x'
pruefe "pause_setzen: nach den Ablehnungen eine Zeile" '[[ $(wc -l < $HALO_PAUSEN_DATEI) -eq 1 ]]'

# Skripte: jede Routine fragt über pause_start und kennt nur Namen aus PAUSEN_ROUTINEN
neu
for s in nachtlauf.sh rundgang-woche.sh wochenpruefung.sh github-vorpruefung.sh ci-waechter.sh; do
  pruefe "Skript $s ruft pause_start" "grep -q 'pause_start' $HIER/$s"
  pruefe "Skript $s ohne alte Pausen-Datei" "! grep -qE '\-e [^]]*PAUSE([^_A-Za-z]|\$)' $HIER/$s"
done
for r in $(grep -hv '^ *#' $HIER/*.sh | grep -o 'pause_start [a-z-]\+' | awk '{print $2}' | sort -u); do
  pruefe "Name $r steht in PAUSEN_ROUTINEN" "(( \${PAUSEN_ROUTINEN[(Ie)$r]} ))"
done
exit $FEHLER
