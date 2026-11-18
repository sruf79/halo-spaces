#!/bin/zsh
# Prüft den Auslastungswächter tests/auslastung-schleife.zsh (Volldampf, Maintainer 17.11.2026) ohne Claude, ohne
# Thunderbird, ohne Netz: Entscheidung im Trockenlauf (Sollkurve 48 h, Schwellen, Tag/Nacht, Pausen, Doppelstart,
# Ende), feste Regeln im Skript und im Auftrag.
#   zsh tests/auslastung_schleife_test.zsh   eine Zeile OK/FEHLER je Fall, Exitcode 1 bei einem Fehler
emulate -L zsh
HIER=${0:A:h}
SKRIPT=$HIER/auslastung-schleife.zsh
T=$(mktemp -d) || exit 1
trap 'rm -rf $T' EXIT
FEHLER=0
pruefe() {   # <Name> <Ausgabe> <Muster …> (grep -E, alle müssen vorkommen)
  local name=$1 aus=$2 m; shift 2
  for m in "$@"; do
    if ! print -r -- "$aus" | grep -qE -- "$m"; then
      print -r -- "FEHLER  $name – fehlt: $m"; FEHLER=1
      print -r -- "$aus" | sed 's/^/    /'; return
    fi
  done
  print -r -- "OK      $name"
}
print -r -- "volldampf 2026-11-17T01:00+01:00 2026-11-24T01:00+01:00 Probe" > $T/vd.txt
: > $T/leer.conf
# W [VAR=Wert …]: Trockenlauf; Standard Di 17.11. 15:00 (14 h nach dem Reset, Soll 29,2 %), Woche 27 %, 5 Stunden 40 %,
# 1 Arbeits-Sitzung, kein Fable, kein Nachtlauf, letzter Start lange her
W() {
  env HALO_VOLLDAMPF_DATEI=$T/vd.txt HALO_VOLLDAMPF_BEENDET=$T/vd-beendet.txt HALO_JETZT=2026-11-17T15:00+01:00 \
    HALO_PAUSEN_DATEI=$T/pausen.txt HALO_AS_CONF=$T/leer.conf HALO_AS_DIR=$T/nacht HALO_AS_WT=$T/wt \
    HALO_AS_WOCHE=27 HALO_AS_5H=40 HALO_AS_STATUS=allowed HALO_AS_AKTIV=1 HALO_AS_FABLE=0 HALO_AS_NACHTLAUF=nein \
    HALO_AS_LETZTER=0 HALO_WOCHENANKER=$T/anker.txt HALO_WOCHENSTAND=$T/stand.txt "$@" zsh $SKRIPT --trocken 2>&1
}

# Sollkurve (48 h ab Di 00:00 UTC = 01:00 Wiener Zeit)
pruefe "Soll 15:00 Di: 14 h seit Reset, 29,2 %" "$(W)" 'Soll 29\.2 % \(14\.0 h seit Reset\)'
pruefe "Soll Mi 13:00: 36 h, 75 %" "$(W HALO_JETZT=2026-11-18T13:00+01:00)" 'Soll 75\.0 % \(36\.0 h'
pruefe "Soll Do 01:00 (48 h): 100 %, danach gedeckelt" "$(W HALO_JETZT=2026-11-20T12:00+01:00 HALO_AS_WOCHE=90)" 'Soll 100\.0 %'
print -r -- "volldampf 2026-11-10T01:00+01:00 2026-11-24T01:00+01:00 Probe" > $T/vd2.txt
pruefe "Reset Di 00:59 Wiener Zeit gehört zur Vorwoche (168,0 h, Soll 100 %)" "$(W HALO_VOLLDAMPF_DATEI=$T/vd2.txt HALO_JETZT=2026-11-17T00:59+01:00 HALO_AS_WOCHE=50)" 'Soll 100\.0 % \(168\.0 h'
pruefe "Reset Di 01:00 Wiener Zeit: 0 h" "$(W HALO_JETZT=2026-11-17T01:00+01:00 HALO_AS_WOCHE=0 HALO_AS_5H=0 HALO_AS_AKTIV=0)" '0\.0 h seit Reset'

# Tag: Schwellen
pruefe "Tag, unter Soll: Worker mit opus" "$(W)" '^Prüfung:  starten opus unter dem Soll' 'Würde:    Worker mit opus'
pruefe "Tag, über Soll, 5 Stunden 40 %: Worker (Fenster unter 60 %)" "$(W HALO_AS_WOCHE=35)" 'starten opus 5-Stunden-Fenster unter 60'
pruefe "Tag, über Soll, 5 Stunden 60 %: warten" "$(W HALO_AS_WOCHE=35 HALO_AS_5H=60)" 'warten im Soll und 5-Stunden-Fenster ab 60'
pruefe "Tag, unter Soll, 5 Stunden 90 %: warten (FENSTER_STOPP)" "$(W HALO_AS_5H=90)" 'warten 5-Stunden-Fenster ab 90'
pruefe "Tag, unter Soll, 5 Stunden 70 %, ein Worker läuft: warten (FENSTER_DROSSEL)" "$(W HALO_AS_5H=70)" 'warten 5-Stunden-Fenster ab 70 % \(Drossel'
pruefe "Tag, unter Soll, 5 Stunden 70 %, kein Worker läuft: starten" "$(W HALO_AS_5H=70 HALO_AS_AKTIV=0)" 'starten opus'
pruefe "Fenster-Takt: 40 % nach 19 Min. (Reserve 25): warten" "$(W HALO_AS_5H=40 HALO_FENSTER_REST=16860)" 'warten Fenster-Takt'
pruefe "Fenster-Takt: 20 % nach 19 Min.: starten" "$(W HALO_AS_5H=20 HALO_FENSTER_REST=16860)" 'starten opus'
pruefe "Fenster-Takt: 60 % nach 3 h (Soll 60+25): starten" "$(W HALO_AS_5H=60 HALO_FENSTER_REST=7200)" 'starten opus'
pruefe "Fenster-Takt: gemeinsame Rechnung fenster_takt aus lauf-hilfen.zsh (auch Tagesroutine)" \
  "$(source $HIER/lauf-hilfen.zsh 2>/dev/null; fenster_takt 16860 25; fenster_takt 7200 25; fenster_takt 20000 25 || print unbekannt; fenster_takt '' || print leer)" '^31
85
unbekannt
leer$'
pruefe "Fenster-Takt: Wächter rechnet nicht selbst" "$(grep -vE '^[[:space:]]*#' $SKRIPT | grep -cE 'fenster_takt "\$rest"|18000')" '^1$'
pruefe "Fable: 20 Punkte unter Soll, 5 Stunden 40 %, kein Fable-Lauf" "$(W HALO_AS_WOCHE=9)" 'starten fable Soll weit verfehlt'
pruefe "Fable auch bei laufendem Fable-Lauf (keine Mengengrenze im Volldampf, 17.11.2026)" "$(W HALO_AS_WOCHE=9 HALO_AS_FABLE=1)" 'starten fable'
pruefe "kein Fable bei 5 Stunden 50 %" "$(W HALO_AS_WOCHE=9 HALO_AS_5H=50)" 'starten opus'
pruefe "kein Fable bei nur 19 Punkten unter Soll" "$(W HALO_AS_WOCHE=11)" 'starten opus'

# Grenze der Arbeits-Sitzungen
pruefe "4 Arbeits-Sitzungen aktiv: warten (Standard 4)" "$(W HALO_AS_AKTIV=4)" 'warten 4 Arbeits-Sitzungen aktiv \(Grenze 4\)'
pruefe "3 aktiv: noch ein Worker" "$(W HALO_AS_AKTIV=3)" 'starten'
print -r -- "MAX_WORKER=6   # Probe" > $T/sechs.conf
pruefe "MAX_WORKER=6 aus der Datei: 5 aktiv → starten" "$(W HALO_AS_CONF=$T/sechs.conf HALO_AS_AKTIV=5)" 'starten'
print -r -- "MAX_WORKER=20" > $T/zwanzig.conf
pruefe "MAX_WORKER=20 auf 8 begrenzt" "$(W HALO_AS_CONF=$T/zwanzig.conf HALO_AS_AKTIV=8)" 'Grenze 8\)'
print -l "UNBEKANNT=1" "MODELL=sonnet" > $T/modell.conf
pruefe "MODELL aus der Datei, unbekannte Schlüssel übergangen" "$(W HALO_AS_CONF=$T/modell.conf)" 'starten sonnet'

# Nacht (00:00–09:00 oder Nachtlauf läuft): Grenze MAX_WORKER − 1, nur unter Soll
pruefe "Nacht 03:00, unter Soll, 2 aktiv: starten" "$(W HALO_JETZT=2026-11-18T03:00+01:00 HALO_AS_WOCHE=40 HALO_AS_AKTIV=2)" 'starten opus unter dem Soll .*nachts'
pruefe "Nacht 03:00, 4 aktiv: warten (Grenze 4, keine Nachtabsenkung)" "$(W HALO_JETZT=2026-11-18T03:00+01:00 HALO_AS_WOCHE=40 HALO_AS_AKTIV=4)" 'warten 4 Arbeits-Sitzungen aktiv \(Grenze 4\)'
pruefe "Nacht 03:00, über Soll, 5 Stunden 10 %: warten (nachts nur unter Soll)" "$(W HALO_JETZT=2026-11-18T03:00+01:00 HALO_AS_WOCHE=70 HALO_AS_5H=10)" 'warten nachts nur unter dem Soll'
pruefe "08:59 noch Nacht, 09:00 Tag" "$(W HALO_JETZT=2026-11-18T08:59+01:00 HALO_AS_WOCHE=70 HALO_AS_5H=10)" 'nachts nur'
pruefe "09:00 Tag: über Soll, 5 Stunden 10 % → starten" "$(W HALO_JETZT=2026-11-18T09:00+01:00 HALO_AS_WOCHE=70 HALO_AS_5H=10)" 'starten opus 5-Stunden-Fenster'
pruefe "Nachtlauf läuft um 10:00 (lauf.lock): gleiche Grenze wie tagsüber" "$(W HALO_AS_NACHTLAUF=ja HALO_AS_AKTIV=4)" 'Grenze 4\)'
pruefe "23:30: kein Zeitende, Tagregeln" "$(W HALO_JETZT=2026-11-17T23:30+01:00 HALO_AS_WOCHE=40)" 'starten'

# Doppelstart, Pausen, Ende
pruefe "letzter Start vor 5 Minuten: warten" "$(W HALO_AS_LETZTER=$(( $(date -j -f %Y-%m-%dT%H:%M%z 2026-11-17T14:55+0100 +%s) )))" 'warten letzter Worker vor weniger als 10 Minuten'
pruefe "letzter Start vor 11 Minuten: starten" "$(W HALO_AS_LETZTER=$(( $(date -j -f %Y-%m-%dT%H:%M%z 2026-11-17T14:49+0100 +%s) )))" 'starten'
print -r -- "auslastung 2099-01-01T00:00+01:00 Probe" > $T/pausen.txt
pruefe "Pause auslastung: warten" "$(W)" 'warten Pause bis 2099'
print -r -- "alle 2099-01-01T00:00+01:00 Probe" > $T/pausen.txt
pruefe "Pause alle: warten" "$(W)" 'warten Pause'
print -r -- "auslastung 2026-11-17T14:00+01:00 abgelaufen" > $T/pausen.txt
pruefe "abgelaufene Pause zählt nicht" "$(W)" 'starten'
rm -f $T/pausen.txt
pruefe "ohne Volldampf: Ende" "$(W HALO_VOLLDAMPF_DATEI=$T/keine.txt)" 'ende Volldampf nicht aktiv'
pruefe "nach dem Volldampf-Fenster: Ende" "$(W HALO_JETZT=2026-11-24T02:00+01:00)" 'ende Volldampf nicht aktiv'
print -r -- "2026-11-17T01:00+01:00 2026-11-24T01:00+01:00 2026-11-18T08:00+01:00 98" > $T/vd-beendet.txt
# Wochenlimit pausiert nur (Maintainer 18.11.2026): warten statt Ende, nach dem freien Reset (Anker) von selbst weiter
pruefe "Volldampf pausiert (Marke): warten, kein Ende" "$(W)" 'warten Volldampf pausiert \(Wochenlimit erreicht, wartet auf den freien Reset\) – Woche 27'
print -r -- "anker 2026-11-18T09:00+01:00 98 2" > $T/anker.txt
pruefe "Marke vor dem freien Reset (Anker): Volldampf läuft weiter, Worker" "$(W HALO_JETZT=2026-11-18T10:00+01:00 HALO_AS_WOCHE=2)" 'starten'
rm -f $T/vd-beendet.txt
pruefe "Status rejected: warten (Wochenlimit), kein Ende" "$(W HALO_AS_STATUS=rejected)" 'warten Wochenlimit \(Status rejected'
pruefe "Status allowed_warning: weiter" "$(W HALO_AS_STATUS=allowed_warning)" 'starten'
pruefe "Woche 98 %: warten, Volldampf pausiert bis zum freien Reset" "$(W HALO_AS_WOCHE=98 HALO_JETZT=2026-11-19T12:00+01:00)" 'warten Wochenlimit erreicht \(Woche 98 %\) – Volldampf pausiert bis zum freien Reset'
# Sollkurve nach dem freien Reset: Anker Fr 20.11. 10:00, jetzt Sa 10:00 → 24 h / 87 h = 27,6 % (statt 48-h-Kurve 100 %)
print -r -- "anker 2026-11-20T10:00+01:00 98 2" > $T/anker.txt
pruefe "Soll nach Anker: bis nächster Reset 27,6 %" "$(W HALO_JETZT=2026-11-21T10:00+01:00 HALO_AS_WOCHE=20)" 'Soll 27\.6 % \(bis nächster Reset, 24\.0 h seit freiem Reset\)' 'starten opus unter dem Soll'
pruefe "nach Anker über dem Soll, 5 Stunden 60 %: warten" "$(W HALO_JETZT=2026-11-21T10:00+01:00 HALO_AS_WOCHE=30 HALO_AS_5H=60)" 'warten im Soll'
pruefe "Übergang Di 24.11. 01:00: Volldampf-Fenster vorbei, Wächter endet" "$(W HALO_JETZT=2026-11-24T01:00+01:00)" 'ende Volldampf nicht aktiv'
rm -f $T/anker.txt
pruefe "Grenze erreicht: Kontingent wird nicht gemessen (warten vor Messung)" "$(W HALO_AS_AKTIV=4 HALO_AS_WOCHE=)" 'warten 4 Arbeits-Sitzungen'

# Doppelstart des Wächters: zweite Instanz endet sofort
mkdir -p $T/nacht; sleep 30 & SP=$!; print $SP > $T/nacht/auslastung-schleife.lock
pruefe "zweiter Wächter bei lebender Sperre: Ende mit Meldung" \
  "$(env HALO_AS_DIR=$T/nacht HALO_VOLLDAMPF_DATEI=$T/vd.txt zsh $SKRIPT --einmal 2>&1; print rc=$?)" 'läuft schon \(PID' 'rc=1'
kill $SP 2>/dev/null

# feste Regeln im Skript
S=$(grep -vE '^[[:space:]]*#' $SKRIPT)
pruefe "kein push, kein release.sh/publish.sh, keine Regeln/Hooks" \
  "$(print -r -- $S | grep -cE 'git [^|;]*push|release\.sh|publish\.sh|settings\.json|zeitfenster-hook|volldampf_setzen|pause_setzen')" '^0$'
pruefe "Checkout: nur fetch und worktree add" \
  "$(print -r -- $S | grep -oE 'git -C \$MAIN [a-z-]+' | sort -u | tr '\n' ' ')" '^git -C \$MAIN fetch git -C \$MAIN worktree $'
pruefe "Worker ohne HALO_LAUF, gleiche Flags wie die Tagesroutine" "$S" \
  'env -u HALO_LAUF HALO_WORKER=\$nr claude -p --model \$m --session-id \$sid --permission-mode auto'
pruefe "Sitzungs-ID im Protokoll (belegt() übergeht eigene Läufe)" "$S" 'log "Worker \$nr gestartet: \$m, Sitzung \$sid'
pruefe "Ports 2874–2889, zwei je Nummer, höchstens 8 Nummern" "$S" '2874 \+ 2 \* \(nr - 1\)' 'for i in \{1\.\.8\}' 'MAX_WORKER\] > 8'
pruefe "Pause-Name auslastung steht in PAUSEN_ROUTINEN" "$(source $HIER/lauf-hilfen.zsh 2>/dev/null; print ${PAUSEN_ROUTINEN[(Ie)auslastung]})" '^[1-9]'
A=$(<$HIER/auslastung-auftrag.md)
pruefe "Auftrag: Board-Sperre, Push nur Prüfzweig ab 09:00, Testlauf über auslastung-test.zsh" "$A" \
  'board\.sh status <id> arbeit' 'In Arbeit: worker-<Nr>' 'HEAD:<Zweig aus JETZT>' '00:00–09:00 nicht pushen' 'zsh tests/auslastung-test\.zsh'
pruefe "Auftrag: keine Design-Einträge, keine geplanten Einträge von Nachtlauf/Tagesroutine, Gedächtnis" "$A" \
  'Design- und Optik-Einträge' '<Heute>-plan\.md' 'tagesroutine-plan' 'worker-gedaechtnis\.md' 'Rückblick'
pruefe "Nacht- und Tagesauftrag übergehen Worker-Einträge" \
  "$(grep -c 'In Arbeit: worker-<Nr>' $HIER/nachtlauf-auftrag.md $HIER/tagesroutine-auftrag.md)" 'nachtlauf-auftrag\.md:1' 'tagesroutine-auftrag\.md:1'
pruefe "Testhilfe: Ports 2874–2889, Sperre bilder.lock, belegt()" "$(<$HIER/auslastung-test.zsh)" '<2874-2889>' 'lockf -t 3600 \$HOME/halo-nacht/bilder\.lock' 'g=\$\(nachtschutz .*\|\| belegt\)'
# freie Worker-Nummer: lebende Worker behalten ihre Nummer (bis 17.11.2026 bekam jeder Worker Nummer 1)
mkdir -p $T/zustand
FN=$(sed -n '/^freie_nummer() {/,/^}/p' $SKRIPT)
print -r -- "$$ sid opus 1 /wt pruef/x /erg" > $T/zustand/worker-1
print -r -- "999999 sid opus 1 /wt pruef/y /erg" > $T/zustand/worker-2
pruefe "freie Nummer: Worker 1 lebt, Worker 2 beendet → 2" "$(ZUSTAND=$T/zustand; eval $FN; freie_nummer)" '^2$'
print -r -- "$$ sid opus 1 /wt pruef/y /erg" > $T/zustand/worker-2
pruefe "freie Nummer: 1 und 2 leben → 3" "$(ZUSTAND=$T/zustand; eval $FN; freie_nummer)" '^3$'
# belegt(): nur echte Programmaufrufe, nicht Auftragstexte von claude -p (hielt Testsperre und Nachtlauf an)
M=$(source $HIER/lauf-hilfen.zsh 2>/dev/null; print -r -- "$BELEGT_TEST_MUSTER"; print -r -- "$BELEGT_RELEASE_MUSTER"; print -r -- "$BELEGT_TB_MUSTER")
MT=${${(f)M}[1]} MR=${${(f)M}[2]} MB=${${(f)M}[3]}
CL='claude -p --model opus --session-id x --permission-mode auto JETZT: … tests/halo_test.py kein release.sh/publish.sh ./release.sh 3 /Applications/Thunderbird.app/Contents/MacOS/thunderbird -marionette'
pruefe "belegt: Auftragstext von claude -p zählt nicht" "$(print -r -- $CL | grep -cE -- $MT; print -r -- $CL | grep -cE -- $MR; print -r -- $CL | grep -cE -- $MB)" '^0$' '^0
0
0$'
pruefe "belegt: echte Läufe zählen" "$(print -r -- 'python3 /x/tests/halo_test.py --port 2874' | grep -cE -- $MT; print -r -- '/bin/zsh ./release.sh 3.31.0' | grep -cE -- $MR; print -r -- '/Applications/Thunderbird Beta.app/Contents/MacOS/thunderbird -profile /p -no-remote -marionette' | grep -cE -- $MB)" '^1
1
1$'
# Nachtlauf-Schutz der Testhilfe: 01:10–01:45 beginnt kein Testlauf
NS=$(grep '^nachtschutz()' $HIER/auslastung-test.zsh)
pruefe "Testhilfe: Nachtlauf-Schutz 01:10–01:45" "$(eval $NS; for h in 0100 0110 0130 0144 0145 2300; do HALO_AS_TEST_HM=$h nachtschutz && print "$h ja" || print "$h nein"; done)" \
  '0100 nein' '0110 ja' '0130 ja' '0144 ja' '0145 nein' '2300 nein'
pruefe "Auftrag: ohne Volldampf kein neuer Eintrag (Regel 6)" "$A" 'nichts_passend Volldampf nicht aktiv'
exit $FEHLER
