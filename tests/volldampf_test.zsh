# Prüfung der Volldampf-Logik (tests/lauf-hilfen.zsh) ohne Claude, ohne Netz, im Wegwerf-Ordner.
# Nicht unter tests/logik/: dort lösen Änderungen die CI aus (tests/ci-noetig.sh), Abläufe brauchen keine.
# Aufruf: zsh tests/volldampf_test.zsh   → je Fall eine Zeile OK/FEHLER, Exitcode 1 bei einem Fehler
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
  rm -rf $T/n; mkdir -p $T/n
  export HALO_VOLLDAMPF_DATEI=$T/n/volldampf.txt HALO_UEBERSPRUNGEN_LOG=$T/n/uebersprungen.log LOG=$T/lauf.log \
    HALO_KONTINGENT_JSON=$T/n/kontingent.json HALO_VOLLDAMPF_BEENDET=$T/n/volldampf-beendet.txt \
    HALO_JETZT=2026-11-17T03:00+01:00 HALO_PUSH_TROCKEN=1 HALO_HANDELN_LOG=$T/n/handeln.log
  unset HALO_VOLLDAMPF_WOCHE
  rm -f -- ${TMPDIR:-/tmp}/halo-volldampf-unlesbar.$$.*(N)      # „einmal je Lauf“ gilt je Fall neu
  : > $LOG
}
kjson() {   # <Woche 0–1> <Stand ISO> – Kontingent-Datei wie kontingent.sh
  print -r -- "{\"stand\": \"$2\", \"info\": {\"unifiedWindows\": {\"seven_day\": {\"utilization\": $1}, \"five_hour\": {\"utilization\": 0.1}}}}" > $HALO_KONTINGENT_JSON
}
source $HIER/lauf-hilfen.zsh
Z='volldampf 2026-11-17T01:00+01:00 2026-11-24T01:00+01:00 Maintainer 13.11.2026: Test'

neu
pruefe "ohne Datei: nicht aktiv, kein Status" '! volldampf_aktiv && ! volldampf_status'
print -r -- $Z > $HALO_VOLLDAMPF_DATEI
pruefe "im Fenster: aktiv mit Ende und Grund" '[[ $(volldampf_aktiv) == "bis 2026-11-24T01:00+01:00 – Maintainer 13.11.2026: Test" ]]'
pruefe "Status im Fenster nennt Ende bei Wochenlimit" '[[ $(volldampf_status) == "Volldampf aktiv bis 2026-11-24T01:00+01:00 (endet bei Wochenlimit) – Maintainer 13.11.2026: Test" ]]'
HALO_JETZT=2026-11-17T00:59+01:00 pruefe "vor dem Beginn: nicht aktiv" '! volldampf_aktiv'
HALO_JETZT=2026-11-17T00:59+01:00 pruefe "vor dem Beginn: Status „angemeldet, nicht aktiv“" \
  '[[ $(volldampf_status) == "Volldampf angemeldet (ab 2026-11-17T01:00+01:00, bis 2026-11-24T01:00+01:00), nicht aktiv" ]]'
HALO_JETZT=2026-11-17T00:00+00:00 pruefe "Zonen: 00:00 UTC = 01:00 MEZ, genau zum Beginn aktiv" 'volldampf_aktiv'
HALO_JETZT=2026-11-24T01:00+01:00 pruefe "genau zum Ende: nicht mehr aktiv" '! volldampf_aktiv'
HALO_JETZT=2026-11-24T02:00+01:00 pruefe "abgelaufen: weder aktiv noch angemeldet, kein Status" '! volldampf_aktiv && ! volldampf_status'

# Wochenlimit (Maintainer 13.11.2026: „wenn das wochenlimit erreicht wurde wird Volldampf automatisch
# deaktiviert. Nur bei erreichen des wichenlimits und nicht bei erreichen des 5 Stunden Limits“): ab 98 %
# dauerhaft beendet (Marker), kein Wiederaufnehmen nach dem Reset, nur eine neue Zeile schaltet wieder ein
pruefe "Woche 97 %: nicht beendet, aktiv" '! volldampf_wochenlimit_pruefen 97 && volldampf_aktiv'
kjson 0.97 2026-11-17T02:30:00+0100
print -r -- '{"stand": "2026-11-17T02:30:00+0100", "info": {"unifiedWindows": {"seven_day": {"utilization": 0.40}, "five_hour": {"utilization": 1.0, "status": "rejected"}}}}' > $HALO_KONTINGENT_JSON
pruefe "5-Stunden-Limit (100 %) beendet Volldampf nicht" '! volldampf_wochenlimit_pruefen && volldampf_aktiv'
kjson 0.99 2026-11-16T22:00:00+0100
pruefe "kontingent.json älter als 3 Stunden: nichts geprüft, aktiv" '! volldampf_wochenlimit_pruefen && volldampf_aktiv'
kjson 0.98 2026-11-17T02:30:00+0100
pruefe "Woche 98 % aus frischer kontingent.json: beendet" 'volldampf_wochenlimit_pruefen'
pruefe "beendet: Rückgabe 2" 'volldampf_aktiv; [[ $? == 2 ]]'
pruefe "beendet: Protokollzeile mit Wert und Uhrzeit" 'grep -q "Volldampf beendet: Wochenlimit erreicht (98 %, 03:00)" $LOG'
pruefe "beendet: Meldung aufs iPhone ([handeln], handeln.log)" 'grep -q "Volldampf beendet, Wochenlimit erreicht (98 %)" $HALO_HANDELN_LOG'
pruefe "beendet: Status nennt Uhrzeit und Wert" '[[ $(volldampf_status) == "Volldampf beendet: Wochenlimit erreicht um 17.11. 03:00 (98 %), Fenster bis 2026-11-24T01:00+01:00" ]]'
pruefe "zweite Prüfung: kein zweiter Marker, keine zweite Meldung" '! volldampf_wochenlimit_pruefen 99 && [[ $(grep -c . $HALO_VOLLDAMPF_BEENDET) == 1 && $(grep -c "Volldampf beendet" $HALO_HANDELN_LOG) == 1 ]]'
kjson 0.03 2026-11-17T04:00:00+0100
HALO_JETZT=2026-11-17T05:00+01:00 pruefe "nach dem freien Reset (3 %): bleibt beendet" 'volldampf_aktiv; [[ $? == 2 ]]'
HALO_JETZT=2026-11-24T00:30+01:00 pruefe "nach dem Wochenreset: bleibt beendet" 'volldampf_aktiv; [[ $? == 2 ]]'
print -r -- "volldampf 2026-11-17T05:00+01:00 2026-11-24T01:00+01:00 Maintainer: wieder an" >> $HALO_VOLLDAMPF_DATEI
HALO_JETZT=2026-11-17T05:30+01:00 pruefe "neue Zeile des Maintainers schaltet wieder ein" '[[ $(volldampf_aktiv) == "bis 2026-11-24T01:00+01:00 – Maintainer: wieder an" ]]'
VOLLDAMPF_WOCHE_ENDE=90 HALO_JETZT=2026-11-17T05:30+01:00 pruefe "Schwelle einstellbar (VOLLDAMPF_WOCHE_ENDE=90, Woche 92)" 'volldampf_wochenlimit_pruefen 92 && ! volldampf_aktiv'

# unlesbare Zeilen: nicht aktiv, einmal gemeldet, bleiben stehen
neu
printf '%s\n' "volldampf 2026-11-17T01:00 2026-11-24T01:00+01:00 ohne Zone" "volldampf 2026-11-24T01:00+01:00 2026-11-17T01:00+01:00 verkehrt" \
  "vollgas 2026-11-17T01:00+01:00 2026-11-24T01:00+01:00 falsches Wort" "# Kommentar" "" > $HALO_VOLLDAMPF_DATEI
pruefe "unlesbare Zeilen: nicht aktiv" '! volldampf_aktiv'
pruefe "unlesbar: Meldung im Protokoll" 'grep -q "VOLLDAMPF UNLESBAR volldampf 2026-11-17T01:00 2026-11-24" $LOG'
pruefe "unlesbar: drei Zeilen in uebersprungen.log" '[[ $(grep -c "VOLLDAMPF UNLESBAR" $HALO_UEBERSPRUNGEN_LOG) == 3 ]]'
volldampf_aktiv; volldampf_status
pruefe "unlesbar: nur einmal je Lauf gemeldet" '[[ $(grep -c "VOLLDAMPF UNLESBAR" $LOG) == 3 ]]'
print -r -- $Z >> $HALO_VOLLDAMPF_DATEI
pruefe "unlesbare neben gültiger Zeile: gültige wirkt" 'volldampf_aktiv'

# Aufräumen: nur abgelaufene Zeilen, mit Protokollzeile
neu
printf '%s\n' "volldampf 2026-11-10T01:00+01:00 2026-11-11T01:00+01:00 alt" "$Z" "kaputt" > $HALO_VOLLDAMPF_DATEI
volldampf_aufraeumen
pruefe "aufräumen: abgelaufene Zeile weg" '! grep -q " alt$" $HALO_VOLLDAMPF_DATEI'
pruefe "aufräumen: gültige und unlesbare bleiben" 'grep -q "Test$" $HALO_VOLLDAMPF_DATEI && grep -q "^kaputt$" $HALO_VOLLDAMPF_DATEI'
pruefe "aufräumen: Protokollzeile VOLLDAMPF ABGELAUFEN" 'grep -q "VOLLDAMPF ABGELAUFEN volldampf 2026-11-10" $LOG'

# Setzen
neu
pruefe "setzen: gültige Zeile wird angehängt" 'volldampf_setzen 2026-11-17T01:00+01:00 2026-11-24T01:00+01:00 Probe Grund && grep -q "^volldampf 2026-11-17T01:00+01:00 2026-11-24T01:00+01:00 Probe Grund$" $HALO_VOLLDAMPF_DATEI'
pruefe "setzen: ab nach bis abgelehnt" '! volldampf_setzen 2026-11-24T01:00+01:00 2026-11-17T01:00+01:00 x'
pruefe "setzen: Zeit ohne Zone abgelehnt" '! volldampf_setzen 2026-11-17T01:00 2026-11-24T01:00+01:00 x'
pruefe "setzen: nichts Falsches geschrieben" '[[ $(grep -c . $HALO_VOLLDAMPF_DATEI) == 1 ]]'
exit $FEHLER
