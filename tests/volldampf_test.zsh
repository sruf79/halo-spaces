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
    HALO_JETZT=2026-11-17T03:00+01:00 HALO_PUSH_TROCKEN=1 HALO_HANDELN_LOG=$T/n/handeln.log \
    HALO_WOCHENANKER=$T/n/wochenanker.txt HALO_WOCHENSTAND=$T/n/wochenstand.txt
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
pruefe "Status im Fenster nennt Pause beim Wochenlimit" '[[ $(volldampf_status) == "Volldampf aktiv bis 2026-11-24T01:00+01:00 (pausiert beim Wochenlimit bis zum freien Reset) – Maintainer 13.11.2026: Test" ]]'
HALO_JETZT=2026-11-17T00:59+01:00 pruefe "vor dem Beginn: nicht aktiv" '! volldampf_aktiv'
HALO_JETZT=2026-11-17T00:59+01:00 pruefe "vor dem Beginn: Status „angemeldet, nicht aktiv“" \
  '[[ $(volldampf_status) == "Volldampf angemeldet (ab 2026-11-17T01:00+01:00, bis 2026-11-24T01:00+01:00), nicht aktiv" ]]'
HALO_JETZT=2026-11-17T00:00+00:00 pruefe "Zonen: 00:00 UTC = 01:00 MEZ, genau zum Beginn aktiv" 'volldampf_aktiv'
HALO_JETZT=2026-11-24T01:00+01:00 pruefe "genau zum Ende: nicht mehr aktiv" '! volldampf_aktiv'
HALO_JETZT=2026-11-24T02:00+01:00 pruefe "abgelaufen: weder aktiv noch angemeldet, kein Status" '! volldampf_aktiv && ! volldampf_status'

# Wochenlimit (Maintainer 13.11.2026, abgelöst 18.11.2026: „… ab dem manuellen weekly limit reset weiterhin permanent den
# verbrauch an die vorhandenen token knüpfen …“): ab 98 % nur PAUSIERT (Marke) bis zum freien Reset (Anker) bzw. zum
# automatischen Reset; danach läuft Volldampf von selbst weiter. Das 5-Stunden-Limit pausiert nicht.
pruefe "Woche 97 %: nicht pausiert, aktiv" '! volldampf_wochenlimit_pruefen 97 && volldampf_aktiv'
print -r -- '{"stand": "2026-11-17T02:30:00+0100", "info": {"unifiedWindows": {"seven_day": {"utilization": 0.97}, "five_hour": {"utilization": 1.0, "status": "rejected"}}}}' > $HALO_KONTINGENT_JSON
pruefe "5-Stunden-Limit (100 %) pausiert Volldampf nicht" '! volldampf_wochenlimit_pruefen && volldampf_aktiv'
print -r -- '{"stand": "2026-11-17T02:30:00+0100", "info": {"rateLimitType": "five_hour", "utilization": 0.4, "unifiedWindows": {"five_hour": {"utilization": 0.4}}}}' > $HALO_KONTINGENT_JSON
pruefe "ohne Wochenwert (nur 5 Stunden): kein Wert statt 5-Stunden-Wert oder 0, kein Stand geschrieben" 'st=$(cat $HALO_WOCHENSTAND 2>/dev/null); ! volldampf_woche_gespeichert && ! volldampf_wochenlimit_pruefen && [[ $(cat $HALO_WOCHENSTAND 2>/dev/null) == $st ]]'
KP=$(sed -n "/^KONT_PY='/,/^'/p" $HIER/auslastung-schleife.zsh); eval $KP
pruefe "Auslastungswächter: ohne Wochenwert nicht lesbar" '! python3 -I -c $KONT_PY $HALO_KONTINGENT_JSON 999999'
kjson 0.99 2026-11-16T22:00:00+0100
pruefe "kontingent.json älter als 3 Stunden: nichts geprüft, aktiv" '! volldampf_wochenlimit_pruefen && volldampf_aktiv'
kjson 0.98 2026-11-17T02:30:00+0100
pruefe "Woche 98 % aus frischer kontingent.json: pausiert" 'volldampf_wochenlimit_pruefen'
pruefe "pausiert: Rückgabe 2" 'volldampf_aktiv; [[ $? == 2 ]]'
pruefe "pausiert: Protokollzeile mit Wert und Uhrzeit" 'grep -q "Volldampf pausiert: Wochenlimit erreicht (98 %, 03:00)" $LOG'
pruefe "pausiert: Meldung aufs iPhone ([handeln], läuft nach dem freien Reset weiter)" 'grep -q "Volldampf pausiert, Wochenlimit erreicht (98 %).*danach läuft Volldampf von selbst weiter" $HALO_HANDELN_LOG'
pruefe "pausiert: Status nennt Uhrzeit, Wert und freien Reset" '[[ $(volldampf_status) == "Volldampf pausiert: Wochenlimit erreicht um 17.11. 03:00 (98 %), wartet auf den freien Reset, Fenster bis 2026-11-24T01:00+01:00" ]]'
pruefe "zweite Prüfung: keine zweite Marke, keine zweite Meldung" '! volldampf_wochenlimit_pruefen 99 && [[ $(grep -c . $HALO_VOLLDAMPF_BEENDET) == 1 && $(grep -c "Volldampf pausiert" $HALO_HANDELN_LOG) == 1 ]]'
pruefe "Woche sinkt nur wenig (99 → 85 %): kein freier Reset, bleibt pausiert" 'HALO_JETZT=2026-11-17T04:00+01:00 volldampf_wochenlimit_pruefen 85; HALO_JETZT=2026-11-17T04:00+01:00 volldampf_aktiv; [[ $? == 2 && ! -s $HALO_WOCHENANKER ]]'
# freier Reset: Sturz um ≥ 20 Punkte ohne automatischen Reset dazwischen → Anker, Pause aufgehoben
pruefe "freier Reset (85 → 3 %): Anker erkannt" 'HALO_JETZT=2026-11-17T05:00+01:00 volldampf_wochenlimit_pruefen 3; grep -qx "anker 2026-11-17T05:00+01:00 85 3" $HALO_WOCHENANKER'
pruefe "freier Reset: Protokoll und [info]-Meldung" 'grep -q "Freier Reset erkannt: Woche 85 % → 3 %" $LOG && grep -q "Freier Reset erkannt" $HALO_UEBERSPRUNGEN_LOG'
HALO_JETZT=2026-11-17T05:30+01:00 pruefe "nach dem freien Reset: Volldampf von selbst wieder aktiv" '[[ $(volldampf_aktiv) == "bis 2026-11-24T01:00+01:00 – Maintainer 13.11.2026: Test" ]]'
HALO_JETZT=2026-11-17T04:30+01:00 pruefe "vor dem Anker (Uhr 04:30): noch pausiert" 'volldampf_aktiv; [[ $? == 2 ]]'
HALO_JETZT=2026-11-20T12:00+01:00 pruefe "nach dem freien Reset wieder 98 %: erneut pausiert (neue Marke)" 'volldampf_wochenlimit_pruefen 98 && { volldampf_aktiv; [[ $? == 2 ]] } && [[ $(grep -c . $HALO_VOLLDAMPF_BEENDET) == 2 ]]'
HALO_JETZT=2026-11-20T14:00+01:00 pruefe "zweiter freier Reset hebt auch die zweite Pause auf" 'volldampf_wochenlimit_pruefen 1; volldampf_aktiv'
VOLLDAMPF_WOCHE_ENDE=90 HALO_JETZT=2026-11-20T15:00+01:00 pruefe "Schwelle einstellbar (VOLLDAMPF_WOCHE_ENDE=90, Woche 92)" 'volldampf_wochenlimit_pruefen 92 && ! volldampf_aktiv'
# kein freier Reset, wenn der automatische Reset (Di 00:00 UTC) zwischen den Werten lag
neu
print -r -- "2026-11-23T23:00+01:00 97" > $HALO_WOCHENSTAND
pruefe "Sturz über den automatischen Reset hinweg: kein Anker" '! HALO_JETZT=2026-11-24T02:00+01:00 wochen_reset_erkennen 1 && [[ ! -s $HALO_WOCHENANKER && $(<$HALO_WOCHENSTAND) == "2026-11-24T02:00+01:00 1" ]]'
pruefe "Trockenlauf (HALO_PAUSE_TROCKEN) schreibt weder Stand noch Anker" '! HALO_PAUSE_TROCKEN=1 HALO_JETZT=2026-11-24T03:00+01:00 wochen_reset_erkennen 0 && [[ $(<$HALO_WOCHENSTAND) == "2026-11-24T02:00+01:00 1" ]]'
print -r -- $Z > $HALO_VOLLDAMPF_DATEI
print -r -- "2026-11-17T01:00+01:00 2026-11-24T01:00+01:00 2026-11-23T20:00+01:00 98" > $HALO_VOLLDAMPF_BEENDET
print -r -- "volldampf 2026-11-24T01:00+01:00 2026-12-01T01:00+01:00 Folgewoche" >> $HALO_VOLLDAMPF_DATEI
HALO_JETZT=2026-11-24T02:00+01:00 pruefe "Folgewoche: alte Pausenmarke wirkt nicht" 'volldampf_aktiv'

# Sollkurve (wochen_soll): ohne Anker ab dem Reset, nach dem freien Reset bis zum nächsten automatischen Reset
neu
HALO_JETZT=2026-11-18T13:00+01:00 pruefe "Soll ohne Anker, 48 h: Mi 13:00 = 36 h, 75 %" '[[ $(wochen_soll 48) == "36.0 75.0 reset 2026-11-24T01:00+01:00 2026-11-17T01:00+01:00" ]]'
HALO_JETZT=2026-11-18T13:00+01:00 pruefe "Soll ohne Anker, 168 h: 21,4 %" '[[ $(wochen_soll 168) == "36.0 21.4 reset "* ]]'
print -r -- "anker 2026-11-20T10:00+01:00 98 2" > $HALO_WOCHENANKER
HALO_JETZT=2026-11-21T10:00+01:00 pruefe "Soll nach Anker Fr 10:00, jetzt Sa 10:00: 24 / 87 h = 27,6 %" '[[ $(wochen_soll 48) == "24.0 27.6 anker 2026-11-24T01:00+01:00 2026-11-20T10:00+01:00" ]]'
HALO_JETZT=2026-11-24T00:30+01:00 pruefe "Soll kurz vor dem automatischen Reset: fast 100 %" '[[ $(wochen_soll 48) == "86.5 99.4 anker "* ]]'
HALO_JETZT=2026-11-19T10:00+01:00 pruefe "Anker in der Zukunft zählt nicht (48-h-Kurve)" '[[ $(wochen_soll 48) == *" reset "* ]]'
HALO_JETZT=2026-11-25T10:00+01:00 pruefe "Anker der Vorwoche zählt nicht" '[[ $(wochen_soll 48) == "33.0 68.8 reset "* ]]'
# Übergang am automatischen Reset Di 24.11. (Maintainer 18.11.2026: „nach dem nächsten automatischen weekly limit reset
# kommenden dienstag um 01:30 soll wieder der reguläre modus laufen“): Volldampf endet 01:00, Anker verfällt, ab dann
# 168-h-Kurve ab dem automatischen Reset (Alltagsmodus), auch um 01:30 beim Nachtlauf
print -r -- $Z > $HALO_VOLLDAMPF_DATEI
HALO_JETZT=2026-11-24T00:59+01:00 pruefe "Übergang: 00:59 noch Volldampf mit Anker-Soll" 'volldampf_aktiv && [[ $(wochen_soll 168) == *" anker "* ]]'
HALO_JETZT=2026-11-24T01:00+01:00 pruefe "Übergang: 01:00 Volldampf aus, kein Status, Anker verfallen" '! volldampf_aktiv && ! volldampf_status && [[ $(wochen_soll 168) == "0.0 0.0 reset 2026-12-01T01:00+01:00 2026-11-24T01:00+01:00" ]]'
HALO_JETZT=2026-11-24T01:30+01:00 pruefe "Übergang: 01:30 (Nachtlauf) normale 168-h-Kurve" '[[ $(wochen_soll 168) == "0.5 0.3 reset "* ]]'
print -r -- $Z > $HALO_VOLLDAMPF_DATEI
HALO_JETZT=2026-11-21T10:00+01:00 pruefe "Status nach Anker: freier Reset genannt, kein „Soll bis nächster Reset“ (Volldampf rechnet mit der Kalenderwoche, 20.11.2026)" '[[ $(volldampf_status) == "Volldampf aktiv bis 2026-11-24T01:00+01:00 (pausiert beim Wochenlimit bis zum freien Reset; freier Reset 20.11. 10:00) – Maintainer 13.11.2026: Test" ]]'

# Erinnerung an den freien Reset ab 90 %: einmal je Fenster, nach dem Reset wieder möglich
neu
export HALO_VOLLDAMPF_ERINNERT=$T/n/erinnert.txt
print -r -- $Z > $HALO_VOLLDAMPF_DATEI
pruefe "Erinnerung: 89 % keine Meldung" '! volldampf_reset_erinnern 89 && [[ ! -s $HALO_HANDELN_LOG ]]'
pruefe "Erinnerung: 90 % meldet" 'volldampf_reset_erinnern 90 && grep -q "Volldampf: Woche 90 % – Erinnerung" $LOG'
pruefe "Erinnerung: 95 % meldet nicht noch einmal" '! volldampf_reset_erinnern 95 && [[ $(grep -c "Erinnerung an den freien Reset" $LOG) == 1 ]]'
pruefe "Erinnerung: nach dem Reset (10 %) wieder scharf" '! volldampf_reset_erinnern 10 && volldampf_reset_erinnern 91'
pruefe "Erinnerung: ohne aktives Fenster nie" 'HALO_JETZT=2026-11-16T12:00+01:00 ; ! HALO_JETZT=2026-11-16T12:00+01:00 volldampf_reset_erinnern 95'
unset HALO_VOLLDAMPF_ERINNERT

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
# Ein-/Ausschalter (tests/volldampf.sh), ohne Prozesse zu starten
neu
export HALO_VD_KEINE_WAECHTER=1 HALO_NACHT_DIR=$T
pruefe "schalter: an schreibt eine aktive Zeile" 'zsh $HIER/volldampf.sh an >/dev/null && volldampf_aktiv >/dev/null'
pruefe "schalter: bis ist ein Dienstag 01:00" 'grep -q "T01:00+0[12]:00 " $HALO_VOLLDAMPF_DATEI && [[ $(date -j -f "%Y-%m-%dT%H:%M" "$(awk "{print substr(\$3,1,16)}" $HALO_VOLLDAMPF_DATEI)" +%u) == 2 ]]'
NR=$(sed -n '/^naechster_reset() {/,/^}/p' $HIER/volldampf.sh)
pruefe "schalter: bis = nächster Reset Di 00:00 UTC, im Winter 01:00, im Sommer 02:00 Wiener Zeit" \
  '[[ $(eval $NR; TZ=Europe/Vienna HALO_JETZT=2026-11-18T10:00+01:00 naechster_reset) == 2026-11-24T01:00+01:00 &&
     $(eval $NR; TZ=Europe/Vienna HALO_JETZT=2027-06-16T10:00+02:00 naechster_reset) == 2027-06-22T02:00+02:00 &&
     $(eval $NR; TZ=Europe/Vienna HALO_JETZT=2026-11-24T00:59+01:00 naechster_reset) == 2026-11-24T01:00+01:00 &&
     $(eval $NR; TZ=Europe/Vienna HALO_JETZT=2026-11-24T01:00+01:00 naechster_reset) == 2026-12-01T01:00+01:00 ]]'
pruefe "schalter: zweites an ändert nichts" '[[ $(zsh $HIER/volldampf.sh an | head -1) == "Volldampf ist schon an." && $(grep -c . $HALO_VOLLDAMPF_DATEI) == 1 ]]'
pruefe "schalter: sicher startet bei aktiver Regel fehlende Wächter (Selbstheilung nach Neustart), ohne Regel nichts" \
  '[[ $(HALO_VD_KEINE_WAECHTER=1 zsh $HIER/volldampf.sh sicher | grep -c "starte ihn") == 2 ]] && { mv $HALO_VOLLDAMPF_DATEI $HALO_VOLLDAMPF_DATEI.sich; [[ -z $(HALO_VD_KEINE_WAECHTER=1 zsh $HIER/volldampf.sh sicher) ]]; r=$?; mv $HALO_VOLLDAMPF_DATEI.sich $HALO_VOLLDAMPF_DATEI; (( r == 0 )) }'
pruefe "schalter: aus entfernt die Zeile, Verlauf bleibt" 'zsh $HIER/volldampf.sh aus >/dev/null && ! volldampf_aktiv >/dev/null && ls $T/volldampf-aus-*.txt >/dev/null'
pruefe "schalter: nach aus gilt Volldampf nicht mehr" '! volldampf_status >/dev/null'
unset HALO_VD_KEINE_WAECHTER HALO_NACHT_DIR
exit $FEHLER
